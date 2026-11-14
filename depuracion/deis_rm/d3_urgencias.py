"""Urgencias RM por establecimiento, día y causa (DEIS AtencionesUrgencia<AÑO>.zip).
- 2008-2022 no traen región/comuna: se asignan por IdEstablecimiento (mapa_establecimiento_comuna.csv).
- 2023+ usan CodigoRegion/CodigoComuna del archivo; si vienen vacíos, se usa el mapa.
- Cada fila se asigna por su fecha (no por el año del archivo).
- Se elimina la fila repetida cuando la llave y todas las cifras coinciden (solo cambia el nombre).
Uso: d3_urgencias.py DESCARGAS CATALOGO TMP STAGE DEPURADO FECHA_FIN"""
import duckdb, sys, os, subprocess, pandas as pd
DL, CAT, TMP, ST, OUT, FIN = sys.argv[1:7]
os.makedirs(TMP, exist_ok=True); os.makedirs(f"{ST}/urg_rm", exist_ok=True)
CAUSAS = (1, 2, 7, 12, 22, 25)
con = duckdb.connect(); con.execute("SET memory_limit='6GB'"); con.execute(f"SET temp_directory='{TMP}/duck'")

# 1) mapa IdEstablecimiento -> comuna. Prioridad: archivo de urgencias más antiguo con comuna (2023+), catálogo, asignación manual.
con.execute(f"create view cat as select * from read_csv('{CAT}', delim=';', header=true, all_varchar=true)")
con.execute(f"""create table m_urg as select trim(IdEstablecimiento) id, arg_min(lpad(comuna,5,'0'), y) comuna, min(y) y
   from (select *, cast(regexp_extract(filename,'estab_(\\d+)',1) as int) y from read_parquet('{ST}/urg/estab_*.parquet', filename=true, union_by_name=true))
   where comuna is not null group by 1""")
con.execute("""create table m_cat as
   select EstablecimientoCodigoAntiguo id, lpad(ComunaCodigo,5,'0') comuna, EstablecimientoGlosa nombre from cat where EstablecimientoCodigoAntiguo is not null
   union all select EstablecimientoCodigo, lpad(ComunaCodigo,5,'0'), EstablecimientoGlosa from cat""")
con.execute("""create table mapa as
   select id, comuna, 'archivo urgencias ' || y fuente, NULL nota from m_urg
   union all select id, comuna, 'catalogo establecimientos', NULL from m_cat where id not in (select id from m_urg)
   union all select '10-852', '13124', 'manual por nombre', 'SAPU Dr. Gustavo Molina = 10-906 SAPU Dr. Gustavo Molina (Pudahuel) en el catálogo; aprobado por el usuario'
   union all select '04-801', '03102', 'manual por nombre', 'SAPU Rosario Corvalán = SAR Rosario Corvalán-Caldera (04-904, Caldera); fuera de la RM'
   union all select '04-821', '03101', 'manual por nombre', 'SAPU Dr. Bernardo Mellibovsky = 04-901 (Copiapó); fuera de la RM'""")
con.execute(f"COPY (select * from mapa order by id) TO '{OUT}/mapa_establecimiento_comuna.csv' (HEADER)")

stats = []
for y in range(2008, 2027):
    csv = f"{TMP}/AtencionesUrgencia{y}.csv"
    subprocess.run(["unzip", "-o", "-q", f"{DL}/AtencionesUrgencia{y}.zip", f"AtencionesUrgencia{y}.csv", "-d", TMP], check=True)
    con.execute(f"create or replace view u as select * from read_csv('{csv}', delim=';', header=true, all_varchar=true, encoding='latin-1')")
    cols = [r[0] for r in con.sql("describe u").fetchall()]
    hasc = "CodigoComuna" in cols
    reg = "nullif(trim(CodigoRegion),'')" if hasc else "NULL"; com = "lpad(nullif(trim(CodigoComuna),''),5,'0')" if hasc else "NULL"
    con.execute(f"""create or replace table c as
      select trim(u.IdEstablecimiento) id, try_strptime(fecha,'%d/%m/%Y')::date f, try_cast(IdCausa as int) idcausa, trim(GlosaCausa) glosa,
             try_cast(Total as bigint) total, try_cast(Menores_1 as bigint) m1, try_cast(De_1_a_4 as bigint) a1, try_cast(De_5_a_14 as bigint) a5,
             try_cast(De_15_a_64 as bigint) a15, try_cast(De_65_y_mas as bigint) de65, {reg} region_arch, {com} comuna_arch,
             coalesce({com}, m.comuna) comuna, CASE WHEN {com} IS NOT NULL THEN 'archivo' WHEN m.comuna IS NOT NULL THEN m.fuente END fuente_comuna
      from u left join mapa m on m.id = trim(u.IdEstablecimiento)""")
    con.execute(f"""create or replace table c2 as select *,
        CASE WHEN f IS NULL THEN 'sin_fecha'
             WHEN idcausa IS NULL OR idcausa NOT IN {CAUSAS} THEN 'otra_causa'
             WHEN f < DATE '2010-01-01' OR f > DATE '{FIN}' THEN 'fuera_periodo'
             WHEN comuna IS NULL THEN 'sin_comuna'
             WHEN NOT (try_cast(comuna AS INT) BETWEEN 13101 AND 13605) THEN 'fuera_rm'
             ELSE 'rm' END motivo from c""")
    if hasc:  # coherencia: región del archivo vs comuna
        bad = con.sql("select count(*) from c2 where region_arch is not null and comuna_arch is not null and left(comuna_arch,2)::int <> region_arch::int").fetchone()[0]
    else: bad = 0
    # duplicados exactos (misma llave y mismas cifras) dentro del año
    con.execute("""create or replace table rm as select id, f fecha, idcausa, any_value(glosa) glosa, total, m1, a1, a5, a15, de65, comuna, any_value(fuente_comuna) fuente_comuna, count(*) n
                   from c2 where motivo='rm' group by id, f, idcausa, total, m1, a1, a5, a15, de65, comuna""")
    dup_exact = con.sql("select coalesce(sum(n-1),0) from rm").fetchone()[0]
    conflict = con.sql("select count(*) from (select id, fecha, idcausa from rm group by all having count(*)>1)").fetchone()[0]
    con.execute(f"COPY (select *, {y} ano_archivo from rm) TO '{ST}/urg_rm/rm_{y}.parquet'")
    s = con.sql("select motivo, count(*) n from c2 group by 1").df().set_index("motivo")["n"].to_dict()
    s.update(ano_archivo=y, filas_leidas=int(con.sql("select count(*) from c2").fetchone()[0]), columnas=len(cols),
             duplicados_exactos=int(dup_exact), llaves_en_conflicto=int(conflict), region_incoherente=int(bad),
             filas_rm_por_mapa=int(con.sql("select count(*) from c2 where motivo='rm' and fuente_comuna<>'archivo'").fetchone()[0]),
             fecha_min=str(con.sql("select min(f) from c2").fetchone()[0]), fecha_max=str(con.sql("select max(f) from c2").fetchone()[0]),
             glosas=" | ".join(f"{r[0]}={r[1]}" for r in con.sql(f"select idcausa, string_agg(distinct glosa, ' / ') from c2 where idcausa in {CAUSAS} group by 1 order by 1").fetchall()))
    s['ids_sin_comuna'] = " ".join(r[0] for r in con.sql("select distinct id from c2 where motivo='sin_comuna' order by 1").fetchall())
    stats.append(s); os.remove(csv)
    print(y, {k: s.get(k) for k in ['filas_leidas','rm','fuera_rm','sin_comuna','fuera_periodo','duplicados_exactos','llaves_en_conflicto','region_incoherente']}, flush=True)
pd.DataFrame(stats).fillna(0).to_csv(f"{ST}/urg_stats.csv", index=False)
