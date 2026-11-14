"""Egresos hospitalarios (DEIS, datos abiertos): tabla ANUAL por comuna de residencia RM × año × grupo de edad,
con conteos por causa sensible al calor (DIAG1). Los datos abiertos no traen fecha de ingreso/egreso: solo año.
Cada CSV se transcodifica latin-1 -> UTF-8 al extraerlo (la codificación del origen es mixta) y se borra al terminar.
Uso: d7_egresos.py DESCARGAS TMP STAGE DEPURADO AÑO..."""
import duckdb, sys, os, subprocess, glob, pandas as pd
DL, TMP, ST, OUT = sys.argv[1:5]; YEARS = [int(a) for a in sys.argv[5:]]
os.makedirs(TMP, exist_ok=True); os.makedirs(ST, exist_ok=True)
CAUSAS = {  # nombre -> condición SQL sobre d3 (3 primeros caracteres de DIAG1)
  "egr_total": "TRUE",
  "egr_renal": "d3 BETWEEN 'N17' AND 'N19'",
  "egr_diabetes": "d3 BETWEEN 'E10' AND 'E14'",
  "egr_deshidratacion": "d3 = 'E86'",
  "egr_calor": "d3 = 'T67'",
  "egr_insuf_cardiaca": "d3 = 'I50'",
  "egr_isquemica": "d3 BETWEEN 'I20' AND 'I25'",
  "egr_cerebrovascular": "d3 BETWEEN 'I60' AND 'I69'",
  "egr_circulatorio": "d3 BETWEEN 'I00' AND 'I99'",
  "egr_respiratorio": "d3 BETWEEN 'J00' AND 'J99'",
}
EDAD = """CASE WHEN GRUPO_EDAD IS NULL OR trim(GRUPO_EDAD) IN ('', '*') THEN 'desconocida'
  WHEN regexp_matches(upper(GRUPO_EDAD), 'DIA|MES|MENOR') THEN '0_59'
  WHEN try_cast(regexp_extract(GRUPO_EDAD, '^\\s*(\\d+)', 1) AS INT) < 60 THEN '0_59'
  WHEN try_cast(regexp_extract(GRUPO_EDAD, '^\\s*(\\d+)', 1) AS INT) < 70 THEN '60_69'
  WHEN try_cast(regexp_extract(GRUPO_EDAD, '^\\s*(\\d+)', 1) AS INT) < 80 THEN '70_79'
  WHEN try_cast(regexp_extract(GRUPO_EDAD, '^\\s*(\\d+)', 1) AS INT) >= 80 THEN '80_mas' END"""
con = duckdb.connect(); stats, edades = [], []
for y in YEARS:
    z = sorted(glob.glob(f"{DL}/EGRESOS_{y}*.zip"))[0]
    csv = [l for l in subprocess.run(["unzip", "-Z1", z], capture_output=True, text=True).stdout.split("\n") if l.lower().endswith(".csv")][0]
    subprocess.run(f'unzip -p "{z}" "{csv}" | iconv -f latin1 -t utf-8 > "{TMP}/egr.csv"', shell=True, check=True)
    con.execute(f"create or replace view e as select * from read_csv('{TMP}/egr.csv', delim=';', header=true, all_varchar=true, null_padding=true)")
    ncol = len(con.sql("describe e").fetchall())
    con.execute(f"""create or replace table c as select trim(COMUNA_RESIDENCIA) com, trim(REGION_RESIDENCIA) reg, trim(ANO_EGRESO) ano_arch, GRUPO_EDAD,
        {EDAD} g_edad, upper(left(trim(DIAG1), 3)) d3, trim(CONDICION_EGRESO) cond, try_cast(DIAS_ESTADA AS BIGINT) dias,
        CASE WHEN try_cast(COMUNA_RESIDENCIA AS INT) BETWEEN 13101 AND 13605 THEN 'rm'
             WHEN try_cast(REGION_RESIDENCIA AS INT) = 13 THEN 'rm_sin_comuna'
             WHEN try_cast(COMUNA_RESIDENCIA AS INT) IS NULL AND try_cast(REGION_RESIDENCIA AS INT) IS NULL THEN 'sin_comuna_ni_region'
             ELSE 'fuera_rm' END motivo from e""")
    sel = ",\n ".join(f"count(*) FILTER (WHERE {cond})::INTEGER {n}" for n, cond in CAUSAS.items())
    con.execute(f"""COPY (select {y} ano, lpad(com, 5, '0') cod_comuna, g_edad grupo_edad, {sel},
        count(*) FILTER (WHERE cond = '2')::INTEGER egr_fallecidos, sum(dias)::BIGINT dias_estada
        from c where motivo = 'rm' group by all) TO '{ST}/egr_{y}.parquet'""")
    s = con.sql("select motivo, count(*) from c group by 1").df().set_index("motivo")["count_star()"].to_dict()
    s.update(ano=y, archivo=os.path.basename(z), columnas=ncol, leidas=int(con.sql("select count(*) from c").fetchone()[0]),
             rm_ano_oculto=int(con.sql(f"select count(*) from c where motivo='rm' and ano_arch <> '{y}'").fetchone()[0]),
             rm_ano_distinto=int(con.sql(f"select count(*) from c where motivo='rm' and ano_arch not in ('{y}', '*')").fetchone()[0]),
             rm_sin_diag=int(con.sql("select count(*) from c where motivo='rm' and (d3 is null or d3 in ('', '*'))").fetchone()[0]),
             rm_edad_desconocida=int(con.sql("select count(*) from c where motivo='rm' and g_edad='desconocida'").fetchone()[0]),
             rm_edad_sin_mapear=int(con.sql("select count(*) from c where motivo='rm' and g_edad is null").fetchone()[0]),
             rm_dias_nulo=int(con.sql("select count(*) from c where motivo='rm' and dias is null").fetchone()[0]))
    edades += [dict(ano=y, grupo_original=g, grupo_edad=m, n=int(n)) for g, m, n in con.sql("select GRUPO_EDAD, g_edad, count(*) from c where motivo='rm' group by all").fetchall()]
    for n, cond in CAUSAS.items():  # registros nacionales con comuna y región ocultas, por causa
        s[f"oculto_{n}"] = int(con.sql(f"select count(*) from c where motivo='sin_comuna_ni_region' and {cond}").fetchone()[0])
        s[f"nacional_{n}"] = int(con.sql(f"select count(*) from c where {cond}").fetchone()[0])
    s["oculto_edad"] = " ".join(f"{g}:{n}" for g, n in con.sql("select g_edad, count(*) from c where motivo='sin_comuna_ni_region' group by 1 order by 1").fetchall())
    stats.append(s); os.remove(f"{TMP}/egr.csv")
    print(y, {k: s.get(k) for k in ["leidas", "rm", "rm_sin_comuna", "fuera_rm", "sin_comuna_ni_region", "rm_ano_oculto", "rm_ano_distinto", "rm_sin_diag", "rm_edad_desconocida", "rm_edad_sin_mapear"]}, flush=True)
pd.DataFrame(stats).fillna(0).to_csv(f"{ST}/egr_stats.csv", index=False)
pd.DataFrame(edades).to_csv(f"{ST}/egr_edades.csv", index=False)
# grilla completa: años × 52 comunas × 5 grupos de edad; combinación sin egresos = 0 (conteo de registros)
cols = list(CAUSAS) + ["egr_fallecidos", "dias_estada"]
lst = ",".join(f"'{ST}/egr_{y}.parquet'" for y in YEARS)
con.execute(f"create table comunas as select distinct cod_comuna from '{ST}/def_comuna_dia.parquet'")
con.execute(f"""create table t as select a.ano, c.cod_comuna, g.grupo_edad, {", ".join(f"coalesce(x.{k}, 0)::{'BIGINT' if k=='dias_estada' else 'INTEGER'} {k}" for k in cols)}
  from (select unnest({YEARS}) ano) a cross join comunas c cross join (select unnest(['0_59','60_69','70_79','80_mas','desconocida']) grupo_edad) g
  left join read_parquet([{lst}]) x on x.ano=a.ano and x.cod_comuna=c.cod_comuna and x.grupo_edad=g.grupo_edad order by 1,2,3""")
extra = con.sql(f"select count(*) from read_parquet([{lst}]) where cod_comuna not in (select cod_comuna from comunas)").fetchone()[0]
con.execute(f"COPY t TO '{OUT}/egresos_comuna_anio.csv' (HEADER)")
print("filas", con.sql("select count(*) from t").fetchone(), "comunas fuera de las 52:", extra)
print(con.sql("select ano, sum(egr_total), sum(egr_circulatorio), sum(egr_renal), sum(egr_calor), sum(egr_fallecidos) from t group by 1 order by 1").df().to_string())
