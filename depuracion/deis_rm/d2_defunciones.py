"""Defunciones RM por comuna de residencia y día (DEIS). Lee los CSV desde el zip extrayéndolos
de a uno a una carpeta temporal; DuckDB los procesa fuera de memoria. Uso: d2_defunciones.py DESCARGAS TMP SALIDA_STAGE"""
import duckdb, sys, os, subprocess, json
DL, TMP, ST = sys.argv[1:4]
os.makedirs(TMP, exist_ok=True); os.makedirs(ST, exist_ok=True)
FUENTES = ["DEFUNCIONES_FUENTE_DEIS_1990_2023_CIFRAS_OFICIALES", "DEFUNCIONES_FUENTE_DEIS_2024_2026_10112026"]
con = duckdb.connect(); con.execute("SET memory_limit='4GB'")
stats, partes = [], []
for f in FUENTES:
    subprocess.run(["unzip", "-o", "-q", f"{DL}/{f}.zip", f"{f}.csv", "-d", TMP], check=True)
    con.execute(f"""CREATE OR REPLACE VIEW d AS SELECT AÑO ano, try_cast(FECHA_DEF AS DATE) fecha, EDAD_TIPO, EDAD_CANT,
        COD_COMUNA, CAPITULO_DIAG1, LUGAR_DEFUNCION FROM read_csv('{TMP}/{f}.csv', delim=';', header=true, all_varchar=true, encoding='latin-1')""")
    con.execute("""CREATE OR REPLACE TABLE c AS SELECT *,
        CASE WHEN fecha IS NULL THEN 'sin_fecha'
             WHEN fecha < DATE '2010-01-01' THEN 'antes_2010'
             WHEN COD_COMUNA IS NULL OR trim(COD_COMUNA) IN ('', '99999') THEN 'sin_comuna'
             WHEN NOT (try_cast(COD_COMUNA AS INT) BETWEEN 13101 AND 13605) THEN 'fuera_rm'
             ELSE 'conservada' END motivo FROM d""")
    st = con.sql(f"""SELECT '{f}' fuente, CASE WHEN try_cast(ano AS INT) < 2010 THEN '1990-2009' ELSE ano END ano, motivo, count(*) n
                     FROM c GROUP BY ALL""").df()
    stats.append(st)
    # residentes RM sin fecha o con comuna desconocida (para informe)
    con.execute(f"""COPY (SELECT fecha, lpad(trim(COD_COMUNA),5,'0') cod_comuna,
          CASE WHEN EDAD_TIPO='1' THEN try_cast(EDAD_CANT AS INT) ELSE 0 END edad, EDAD_TIPO,
          CAPITULO_DIAG1, LUGAR_DEFUNCION FROM c WHERE motivo='conservada') TO '{ST}/def_{f[:30]}.parquet'""")
    partes.append(f"{ST}/def_{f[:30]}.parquet")
    print(f, con.sql("select count(*) from c").fetchone(), flush=True)
    os.remove(f"{TMP}/{f}.csv")
import pandas as pd
pd.concat(stats).to_csv(f"{ST}/def_stats.csv", index=False)
lst = ",".join(f"'{p}'" for p in partes)
con.execute(f"""COPY (SELECT fecha, cod_comuna,
      count(*) def_total,
      count(*) FILTER (WHERE edad < 65) def_0_64,
      count(*) FILTER (WHERE edad BETWEEN 65 AND 79) def_65_79,
      count(*) FILTER (WHERE edad >= 80) def_80_mas,
      count(*) FILTER (WHERE CAPITULO_DIAG1 = 'I00-I99') def_circulatorio,
      count(*) FILTER (WHERE CAPITULO_DIAG1 = 'J00-J99') def_respiratorio,
      count(*) FILTER (WHERE LUGAR_DEFUNCION = 'Casa habitación') def_en_casa,
      count(*) FILTER (WHERE EDAD_TIPO IS DISTINCT FROM '1') edad_no_anios,
      count(*) FILTER (WHERE edad IS NULL) edad_nula
    FROM read_parquet([{lst}]) GROUP BY ALL) TO '{ST}/def_comuna_dia.parquet'""")
print(con.sql(f"select year(fecha) y, sum(def_total) from '{ST}/def_comuna_dia.parquet' group by 1 order by 1").fetchall())
print("edad nula (EDAD_TIPO=1 sin EDAD_CANT):", con.sql(f"select sum(edad_nula), sum(edad_no_anios) from '{ST}/def_comuna_dia.parquet'").fetchall())
