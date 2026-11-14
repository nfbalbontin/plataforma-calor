"""REM Serie P (P3 y P5) NACIONAL: dependencia severa, oxígeno dependientes y funcionalidad de personas mayores.

Mismas reglas que d4_rem.py (RM), sin el filtro de región. El mapeo de columnas por código y año es el ya
leído de los diccionarios y guardado en depurado/rem_mapeo_columnas.csv (idéntico en 2024, 2025 y 2026).
Uso: n2_rem_nacional.py DESCARGAS MAPEO_CSV TMP SALIDA AÑO...
"""
import os
import re
import subprocess
import sys

import duckdb
import pandas as pd

DL, MAPEO, TMP, OUT = sys.argv[1:5]
YEARS = [int(a) for a in sys.argv[5:]]
os.makedirs(TMP, exist_ok=True)
os.makedirs(OUT, exist_ok=True)
con = duckdb.connect()
con.execute("SET memory_limit='6GB'")
con.execute(f"SET temp_directory='{TMP}/duck'")
mapeo = pd.read_csv(MAPEO)
CODES = tuple(sorted(mapeo["codigo"].unique()))
assert len(CODES) == 12
partes, stats = [], []
for y in YEARS:
    d = f"{TMP}/rem{y}"
    os.makedirs(d, exist_ok=True)
    subprocess.run(["unzip", "-o", "-q", f"{DL}/SERIE_REM_{y}.zip", f"Datos/SerieP{y}.csv", "-d", d], check=True)
    con.execute(f"create or replace view p as select * from read_csv('{d}/Datos/SerieP{y}.csv', delim=';', header=true, all_varchar=true, encoding='latin-1')")
    m = mapeo[mapeo["ano"] == y]
    assert len(m) == 12, (y, len(m))
    con.execute("create or replace table mp (codigo varchar, glosa varchar, col_total varchar, cols varchar[])")
    con.executemany("insert into mp values (?,?,?,?)", [(r.codigo, r.glosa, r.col_total, str(r.cols_65_mas).split()) for r in m.itertuples()])
    colnames = [c for c in [r[0] for r in con.sql("describe p").fetchall()] if re.match(r"^Col\d\d$", c)]
    con.execute(f"""create or replace table base as
        select Ano, Mes, IdEstablecimiento, IdComuna, IdRegion, CodigoPrestacion, {', '.join(colnames)}
        from p where trim(CodigoPrestacion) in {CODES}""")
    con.execute(f"""create or replace table l as
        select Ano, Mes, IdEstablecimiento, CodigoPrestacion, upper(col) col, try_cast(val as bigint) val
        from (unpivot base on {', '.join(colnames)} into name col value val)""")
    con.execute("""create or replace table agg as
        select l.Ano, l.Mes, l.IdEstablecimiento, l.CodigoPrestacion,
               max(l.val) filter (where l.col = mp.col_total) n_total,
               sum(l.val) filter (where list_contains(mp.cols, l.col)) n_65_mas
        from l join mp on mp.codigo = trim(l.CodigoPrestacion) group by all""")
    con.execute("""create or replace table r as
        select try_cast(b.Ano as int) ano, try_cast(b.Mes as int) mes, trim(b.IdEstablecimiento) id_establecimiento,
               lpad(trim(b.IdComuna),5,'0') cod_comuna, trim(b.CodigoPrestacion) codigo, mp.glosa,
               a.n_total::BIGINT n_total, a.n_65_mas::BIGINT n_65_mas, lpad(trim(b.IdRegion),2,'0') cod_region
        from base b join mp on mp.codigo = trim(b.CodigoPrestacion)
        left join agg a on a.Ano=b.Ano and a.Mes=b.Mes and a.IdEstablecimiento=b.IdEstablecimiento and a.CodigoPrestacion=b.CodigoPrestacion""")
    p_out = f"{TMP}/rem_{y}.parquet"
    con.execute(f"COPY r TO '{p_out}'")
    partes.append(p_out)
    s = con.sql(f"""select {y} ano, (select count(*) from p) filas_leidas, count(*) conservadas,
        count(*) filter (where n_total is null) n_total_nulo, count(*) filter (where n_65_mas is null) n_65_nulo,
        count(*) filter (where n_65_mas > n_total) n65_mayor_total, count(*) - count(distinct (ano, mes, id_establecimiento, codigo)) llaves_duplicadas,
        count(*) filter (where ano<>{y}) ano_distinto, string_agg(distinct mes::varchar, ',' order by mes::varchar) meses,
        count(distinct id_establecimiento) establecimientos, count(distinct cod_comuna) comunas, count(distinct cod_region) regiones,
        count(*) filter (where cod_region is null or cod_comuna is null) sin_territorio,
        count(*) filter (where left(cod_comuna,2) <> cod_region) region_incoherente from r""").df()
    stats.append(s)
    print(s.to_dict("records"), flush=True)
    subprocess.run(["rm", "-rf", d])
pd.concat(stats).to_csv(f"{OUT}/rem_stats.csv", index=False)
lst = ",".join(f"'{p}'" for p in partes)
con.execute(f"""COPY (select ano, mes, id_establecimiento, cod_comuna, codigo, glosa, n_total, n_65_mas
                     from read_parquet([{lst}]) order by ano, mes, cod_comuna, id_establecimiento, codigo)
                TO '{OUT}/rem_dependencia.csv' (HEADER)""")
print(con.sql(f"select ano, mes, count(*) filas, count(distinct cod_comuna) comunas, count(distinct id_establecimiento) centros from read_parquet([{lst}]) group by all order by all").df().to_string())
