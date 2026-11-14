"""Tabla maestra NACIONAL comuna_dia.parquet: 346 comunas x días (2010-01-01 .. FIN), defunciones y urgencias del DEIS.

Mismas reglas que la depuración de la RM (d2, d3 y d5), sin el filtro de región:
- Defunciones por comuna de residencia y fecha de defunción. Orden de descarte: sin fecha, antes de 2010,
  sin comuna (vacía o 99999), comuna que no existe en el Censo 2024.
- Urgencias por comuna del establecimiento. 2008-2022 no traen comuna: se asigna por IdEstablecimiento con
  depurado/mapa_establecimiento_comuna.csv (el mismo mapa aprobado para la RM); 2023+ usan la comuna del archivo
  y, si viene vacía, el mapa. Cada fila se asigna por su fecha. Se elimina la fila repetida cuando la llave y
  todas las cifras coinciden.
- Se agregan los tramos de edad del documento de requerimientos (65-74, 75-84, 85 o más) además de los de la RM.
Los originales no se modifican: cada CSV se extrae a una carpeta temporal y se borra.

Uso: n1_nacional.py DESCARGAS MAPA_CSV CENSO_COMUNA_PARQUET TMP STAGE SALIDA FECHA_FIN [--solo-maestra]
"""
import json
import os
import subprocess
import sys

import duckdb
import pandas as pd

DL, MAPA, CENSO, TMP, ST, OUT, FIN = sys.argv[1:8]
SOLO_MAESTRA = "--solo-maestra" in sys.argv
for d in (TMP, ST, f"{ST}/urg", OUT):
    os.makedirs(d, exist_ok=True)
FUENTES = ["DEFUNCIONES_FUENTE_DEIS_1990_2023_CIFRAS_OFICIALES", "DEFUNCIONES_FUENTE_DEIS_2024_2026_10112026"]
CAUSAS = (1, 2, 7, 12, 22, 25)
con = duckdb.connect()
con.execute("SET memory_limit='6GB'")
con.execute(f"SET temp_directory='{TMP}/duck'")
con.execute(f"create table comunas as select cod_comuna from '{CENSO}'")
assert con.sql("select count(*) from comunas").fetchone()[0] == 346

if not SOLO_MAESTRA:
    # ---------------- Defunciones ----------------
    stats, partes = [], []
    for f in FUENTES:
        subprocess.run(["unzip", "-o", "-q", f"{DL}/{f}.zip", f"{f}.csv", "-d", TMP], check=True)
        con.execute(f"""CREATE OR REPLACE VIEW d AS SELECT AÑO ano, try_cast(FECHA_DEF AS DATE) fecha, EDAD_TIPO, EDAD_CANT,
            COD_COMUNA, CAPITULO_DIAG1, LUGAR_DEFUNCION FROM read_csv('{TMP}/{f}.csv', delim=';', header=true, all_varchar=true, encoding='latin-1')""")
        con.execute("""CREATE OR REPLACE TABLE c AS SELECT *, lpad(trim(COD_COMUNA),5,'0') cod,
            CASE WHEN fecha IS NULL THEN 'sin_fecha'
                 WHEN fecha < DATE '2010-01-01' THEN 'antes_2010'
                 WHEN COD_COMUNA IS NULL OR trim(COD_COMUNA) IN ('', '99999') THEN 'sin_comuna'
                 WHEN lpad(trim(COD_COMUNA),5,'0') NOT IN (select cod_comuna from comunas) THEN 'comuna_desconocida'
                 ELSE 'conservada' END motivo FROM d""")
        stats.append(con.sql(f"""SELECT '{f}' fuente, CASE WHEN try_cast(ano AS INT) < 2010 THEN '1990-2009' ELSE ano END ano, motivo, count(*) n
                                 FROM c GROUP BY ALL""").df())
        desc = con.sql("select cod, count(*) n from c where motivo='comuna_desconocida' group by 1 order by 2 desc").fetchall()
        if desc:
            print("  códigos de comuna desconocidos:", desc, flush=True)
        p = f"{ST}/def_{f[:30]}.parquet"
        con.execute(f"""COPY (SELECT fecha, cod cod_comuna,
              CASE WHEN EDAD_TIPO='1' THEN try_cast(EDAD_CANT AS INT) ELSE 0 END edad, EDAD_TIPO,
              CAPITULO_DIAG1, LUGAR_DEFUNCION FROM c WHERE motivo='conservada') TO '{p}'""")
        partes.append(p)
        print(f, con.sql("select count(*) from c").fetchone(), flush=True)
        os.remove(f"{TMP}/{f}.csv")
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
          count(*) FILTER (WHERE edad BETWEEN 65 AND 74) def_65_74,
          count(*) FILTER (WHERE edad BETWEEN 75 AND 84) def_75_84,
          count(*) FILTER (WHERE edad >= 85) def_85_mas,
          count(*) FILTER (WHERE EDAD_TIPO IS DISTINCT FROM '1') edad_no_anios,
          count(*) FILTER (WHERE edad IS NULL) edad_nula
        FROM read_parquet([{lst}]) GROUP BY ALL) TO '{ST}/def_comuna_dia.parquet'""")
    print("defunciones por año:", con.sql(f"select year(fecha) y, sum(def_total) from '{ST}/def_comuna_dia.parquet' group by 1 order by 1").fetchall(), flush=True)

    # ---------------- Urgencias ----------------
    con.execute(f"create table mapa as select trim(id) id, lpad(trim(comuna),5,'0') comuna, fuente from read_csv('{MAPA}', header=true, all_varchar=true)")
    stats = []
    for y in range(2008, 2027):
        csv = f"{TMP}/AtencionesUrgencia{y}.csv"
        subprocess.run(["unzip", "-o", "-q", f"{DL}/AtencionesUrgencia{y}.zip", f"AtencionesUrgencia{y}.csv", "-d", TMP], check=True)
        con.execute(f"create or replace view u as select * from read_csv('{csv}', delim=';', header=true, all_varchar=true, encoding='latin-1')")
        cols = [r[0] for r in con.sql("describe u").fetchall()]
        hasc = "CodigoComuna" in cols
        com = "lpad(nullif(trim(CodigoComuna),''),5,'0')" if hasc else "NULL"
        leidas, sin_fecha, otra = con.sql(f"""select count(*), count(*) filter (where try_strptime(fecha,'%d/%m/%Y') is null),
            count(*) filter (where try_strptime(fecha,'%d/%m/%Y') is not null and (try_cast(IdCausa as int) is null or try_cast(IdCausa as int) not in {CAUSAS}))
            from u""").fetchone()
        con.execute(f"""create or replace table c2 as
          with c as (
            select trim(u.IdEstablecimiento) id, try_strptime(fecha,'%d/%m/%Y')::date f, try_cast(IdCausa as int) idcausa,
                   try_cast(Total as bigint) total, try_cast(Menores_1 as bigint) m1, try_cast(De_1_a_4 as bigint) a1, try_cast(De_5_a_14 as bigint) a5,
                   try_cast(De_15_a_64 as bigint) a15, try_cast(De_65_y_mas as bigint) de65,
                   coalesce({com}, m.comuna) comuna, CASE WHEN {com} IS NOT NULL THEN 'archivo' WHEN m.comuna IS NOT NULL THEN m.fuente END fuente_comuna
            from u left join mapa m on m.id = trim(u.IdEstablecimiento)
            where try_cast(IdCausa as int) in {CAUSAS} and try_strptime(fecha,'%d/%m/%Y') is not null)
          select *, CASE WHEN f < DATE '2010-01-01' OR f > DATE '{FIN}' THEN 'fuera_periodo'
                         WHEN comuna IS NULL THEN 'sin_comuna'
                         WHEN comuna NOT IN (select cod_comuna from comunas) THEN 'comuna_desconocida'
                         ELSE 'ok' END motivo from c""")
        con.execute("""create or replace table ok as select id, f fecha, idcausa, total, m1, a1, a5, a15, de65, comuna,
                       any_value(fuente_comuna) fuente_comuna, count(*) n
                       from c2 where motivo='ok' group by id, f, idcausa, total, m1, a1, a5, a15, de65, comuna""")
        dup = con.sql("select coalesce(sum(n-1),0) from ok").fetchone()[0]
        conflicto = con.sql("select count(*) from (select id, fecha, idcausa from ok group by all having count(*)>1)").fetchone()[0]
        con.execute(f"COPY (select *, {y} ano_archivo from ok) TO '{ST}/urg/ok_{y}.parquet'")
        s = con.sql("select motivo, count(*) n from c2 group by 1").df().set_index("motivo")["n"].to_dict()
        s.update(ano_archivo=y, columnas=len(cols), filas_leidas=int(leidas), sin_fecha=int(sin_fecha), otra_causa=int(otra),
                 duplicados_exactos=int(dup), llaves_en_conflicto=int(conflicto),
                 filas_por_mapa=int(con.sql("select count(*) from c2 where motivo='ok' and fuente_comuna<>'archivo'").fetchone()[0]),
                 ids_sin_comuna=" ".join(r[0] for r in con.sql("select distinct id from c2 where motivo='sin_comuna' order by 1").fetchall()),
                 codigos_desconocidos=" ".join(r[0] for r in con.sql("select distinct comuna from c2 where motivo='comuna_desconocida' order by 1").fetchall()))
        stats.append(s)
        os.remove(csv)
        print(y, {k: s.get(k) for k in ["filas_leidas", "ok", "otra_causa", "fuera_periodo", "sin_comuna", "comuna_desconocida", "duplicados_exactos", "llaves_en_conflicto", "ids_sin_comuna", "codigos_desconocidos"]}, flush=True)
    pd.DataFrame(stats).fillna(0).to_csv(f"{ST}/urg_stats.csv", index=False)

# ---------------- Tabla maestra ----------------
DEF_FIN = con.sql(f"select max(fecha) from '{ST}/def_comuna_dia.parquet'").fetchone()[0]
con.execute(f"create table fechas as select unnest(generate_series(DATE '2010-01-01', DATE '{FIN}', INTERVAL 1 DAY))::date fecha")
con.execute(f"""create table urg as select fecha, comuna cod_comuna,
    count(distinct id) urg_n_establecimientos,
    sum(total) filter (where idcausa=1) urg_total, sum(de65) filter (where idcausa=1) urg_65_mas,
    sum(total) filter (where idcausa=2) urg_respiratorio, sum(total) filter (where idcausa=12) urg_circulatorio,
    sum(total) filter (where idcausa=25) hosp_total, sum(total) filter (where idcausa=7) hosp_respiratorio, sum(total) filter (where idcausa=22) hosp_circulatorio
    from read_parquet('{ST}/urg/ok_*.parquet') group by all""")
D = ["def_total", "def_0_64", "def_65_79", "def_80_mas", "def_circulatorio", "def_respiratorio", "def_en_casa"]
D2 = ["def_65_74", "def_75_84", "def_85_mas"]
U = ["urg_total", "urg_65_mas", "urg_respiratorio", "urg_circulatorio", "hosp_total", "hosp_respiratorio", "hosp_circulatorio"]
defcol = lambda c: f"CASE WHEN f.fecha <= DATE '{DEF_FIN}' THEN coalesce(d.{c},0) END::INTEGER {c}"
con.execute(f"""create table m as select strftime(f.fecha, '%Y-%m-%d') fecha, c.cod_comuna,
    {', '.join(defcol(c) for c in D)},
    (f.fecha >= DATE '2024-01-01') def_provisional,
    {', '.join(f'u.{c}::INTEGER {c}' for c in U)},
    coalesce(u.urg_n_establecimientos,0)::INTEGER urg_n_establecimientos,
    {', '.join(defcol(c) for c in D2)}
  from fechas f cross join comunas c
  left join '{ST}/def_comuna_dia.parquet' d on d.fecha=f.fecha and d.cod_comuna=c.cod_comuna
  left join urg u on u.fecha=f.fecha and u.cod_comuna=c.cod_comuna
  order by f.fecha, c.cod_comuna""")
con.execute(f"COPY m TO '{OUT}/comuna_dia.parquet' (FORMAT parquet, COMPRESSION zstd)")
R = {"def_fin": str(DEF_FIN), "fin": FIN,
     "filas": con.sql("select count(*) from m").fetchone()[0], "columnas": len(con.sql("describe m").fetchall()),
     "fechas": con.sql("select count(distinct fecha) from m").fetchone()[0]}
R["def_por_ano"] = con.sql("select left(fecha,4)::int y, sum(def_total) from m group by 1 order by 1").fetchall()
R["def_sin_perdida"] = int(con.sql(f"select (select sum(def_total) from m) - (select sum(def_total) from '{ST}/def_comuna_dia.parquet' where fecha<=DATE '{FIN}')").fetchone()[0])
R["tramos_rm_malos"] = int(con.sql("select count(*) from m where def_total is not null and def_0_64+def_65_79+def_80_mas<>def_total").fetchone()[0])
R["tramos_doc_malos"] = int(con.sql("select count(*) from m where def_total is not null and def_0_64+def_65_74+def_75_84+def_85_mas<>def_total").fetchone()[0])
R["llaves_duplicadas"] = int(con.sql("select count(*) - count(distinct (fecha, cod_comuna)) from m").fetchone()[0])
R["urg_sin_perdida"] = int(con.sql(f"select (select sum(urg_total) from m) - (select sum(total) from read_parquet('{ST}/urg/ok_*.parquet') where idcausa=1)").fetchone()[0])
R["urg_por_ano"] = [dict(ano=int(y), comunas=int(c), establecimientos=int(e), dias=int(d)) for y, c, e, d in con.sql(
    f"select year(fecha), count(distinct comuna), count(distinct id), count(distinct fecha) from read_parquet('{ST}/urg/ok_*.parquet') group by 1 order by 1").fetchall()]
R["comunas_sin_urgencias"] = [r[0] for r in con.sql("select cod_comuna from m group by 1 having max(urg_n_establecimientos)=0 order by 1").fetchall()]
R["comunas_sin_defunciones"] = [r[0] for r in con.sql("select cod_comuna from m group by 1 having sum(def_total)=0 order by 1").fetchall()]
R["def_ultimos"] = con.sql(f"select fecha, sum(def_total) from m where fecha between strftime(DATE '{DEF_FIN}' - 9, '%Y-%m-%d') and '{DEF_FIN}' group by 1 order by 1").fetchall()
R["urg_ultimos"] = con.sql(f"select fecha, sum(urg_n_establecimientos), sum(urg_total) from m where fecha >= strftime(DATE '{FIN}' - 9, '%Y-%m-%d') group by 1 order by 1").fetchall()
json.dump(R, open(f"{ST}/controles_maestra.json", "w"), default=str, ensure_ascii=False, indent=1)
print(json.dumps({k: v for k, v in R.items() if k not in ("urg_por_ano", "def_ultimos", "urg_ultimos")}, default=str, indent=1))
