"""Tabla maestra comuna_dia.parquet: grilla 52 comunas x días (2010-01-01 .. FIN) + controles. Uso: d5_maestra.py STAGE DEPURADO FIN"""
import duckdb, sys, json
ST, OUT, FIN = sys.argv[1:4]
con = duckdb.connect()
DEF_FIN = con.sql(f"select max(fecha) from '{ST}/def_comuna_dia.parquet'").fetchone()[0]
con.execute(f"create table comunas as select distinct cod_comuna from '{ST}/def_comuna_dia.parquet'")
con.execute(f"create table fechas as select unnest(generate_series(DATE '2010-01-01', DATE '{FIN}', INTERVAL 1 DAY))::date fecha")
con.execute(f"""create table urg as select fecha, comuna cod_comuna,
    count(distinct id) urg_n_establecimientos,
    sum(total) filter (where idcausa=1) urg_total, sum(de65) filter (where idcausa=1) urg_65_mas,
    sum(total) filter (where idcausa=2) urg_respiratorio, sum(total) filter (where idcausa=12) urg_circulatorio,
    sum(total) filter (where idcausa=25) hosp_total, sum(total) filter (where idcausa=7) hosp_respiratorio, sum(total) filter (where idcausa=22) hosp_circulatorio
    from read_parquet('{ST}/urg_rm/rm_*.parquet') group by all""")
D = ["def_total","def_0_64","def_65_79","def_80_mas","def_circulatorio","def_respiratorio","def_en_casa"]
defcols = ",\n    ".join(f"CASE WHEN f.fecha <= DATE '{DEF_FIN}' THEN coalesce(d.{c},0) END::INTEGER {c}" for c in D)
U = ["urg_total","urg_65_mas","urg_respiratorio","urg_circulatorio","hosp_total","hosp_respiratorio","hosp_circulatorio"]
urgcols = ",\n    ".join(f"u.{c}::INTEGER {c}" for c in U)
con.execute(f"""create table m as select strftime(f.fecha, '%Y-%m-%d') fecha, c.cod_comuna,
    {defcols},
    (f.fecha >= DATE '2024-01-01') def_provisional,
    {urgcols},
    coalesce(u.urg_n_establecimientos,0)::INTEGER urg_n_establecimientos
  from fechas f cross join comunas c
  left join '{ST}/def_comuna_dia.parquet' d on d.fecha=f.fecha and d.cod_comuna=c.cod_comuna
  left join urg u on u.fecha=f.fecha and u.cod_comuna=c.cod_comuna
  order by f.fecha, c.cod_comuna""")
con.execute(f"COPY m TO '{OUT}/comuna_dia.parquet' (FORMAT parquet, COMPRESSION zstd)")
R = {"def_fin": str(DEF_FIN)}
esperado = {2010:36934, 2015:39084, 2019:41866, 2020:51600, 2023:44633, 2024:46872, 2025:46548}
R["c1"] = [dict(ano=y, maestra=int(n), esperado=esperado.get(y)) for y, n in con.sql("select left(fecha,4)::int y, sum(def_total) from m group by 1 order by 1").fetchall()]
R["c1_ok"] = all(r["maestra"] == r["esperado"] for r in R["c1"] if r["esperado"])
R["c1_sin_perdida"] = int(con.sql(f"select (select sum(def_total) from m) - (select sum(def_total) from '{ST}/def_comuna_dia.parquet' where fecha<=DATE '{FIN}')").fetchone()[0])
R["c2_filas_malas"] = int(con.sql("select count(*) from m where def_total is not null and def_0_64+def_65_79+def_80_mas<>def_total").fetchone()[0])
R["c3"] = con.sql("select min(n), max(n), count(*) from (select fecha, count(*) n from m group by 1)").fetchone()
R["c3_dup"] = int(con.sql("select count(*) - count(distinct (fecha, cod_comuna)) from m").fetchone()[0])
R["c4"] = [dict(ano=int(y), comunas=int(c), establecimientos=int(e), dias=int(d)) for y, c, e, d in con.sql(f"""select year(fecha), count(distinct comuna), count(distinct id), count(distinct fecha)
      from read_parquet('{ST}/urg_rm/rm_*.parquet') where fecha between DATE '2010-01-01' and DATE '{FIN}' group by 1 order by 1""").fetchall()]
R["urg_sin_perdida"] = int(con.sql(f"select (select sum(urg_total) from m) - (select sum(total) from read_parquet('{ST}/urg_rm/rm_*.parquet') where idcausa=1)").fetchone()[0])
R["filas"], R["columnas"] = con.sql("select count(*) from m").fetchone()[0], len(con.sql("describe m").fetchall())
R["nulos"] = {c: int(v) for c, v in zip([r[0] for r in con.sql("describe m").fetchall()], con.sql("select " + ", ".join(f"count(*) - count({r[0]})" for r in con.sql("describe m").fetchall()) + " from m").fetchone())}
R["comunas_nunca_urg"] = [r[0] for r in con.sql("select cod_comuna from m group by 1 having max(urg_n_establecimientos)=0").fetchall()]
R["comunas_urg_dias"] = con.sql("select cod_comuna, count(*) filter (where urg_n_establecimientos>0) dias_con, min(fecha) filter (where urg_n_establecimientos>0) desde from m group by 1 order by 2").df().to_dict("records")
# anomalías: días RM con caída o salto del total de urgencias o del n° de establecimientos (vs mediana móvil de 28 días)
R["saltos"] = con.sql("""with d as (select fecha, sum(urg_total) t, sum(urg_n_establecimientos) e from m group by 1),
   r as (select *, median(t) over w mt, median(e) over w me from d window w as (order by fecha rows between 28 preceding and 1 preceding))
   select fecha, t urg_total_rm, round(mt) mediana_28d, e establecimientos, me mediana_est from r
   where fecha > '2010-01-29' and (t is null or t < 0.5*mt or t > 1.8*mt or e < 0.8*me) order by fecha""").df().to_dict("records")
R["def_ultimos"] = con.sql(f"select fecha, sum(def_total) from m where fecha between strftime(DATE '{DEF_FIN}' - 9, '%Y-%m-%d') and '{DEF_FIN}' group by 1 order by 1").fetchall()
R["urg_ultimos"] = con.sql(f"select fecha, sum(urg_n_establecimientos), sum(urg_total) from m where fecha >= strftime(DATE '{FIN}' - 9, '%Y-%m-%d') group by 1 order by 1").fetchall()
R["head"] = con.sql("select * from m limit 10").df().to_dict("records")
json.dump(R, open(f"{ST}/controles.json", "w"), default=str, ensure_ascii=False, indent=1)
print(json.dumps({k: R[k] for k in ["def_fin","c1_ok","c1_sin_perdida","c2_filas_malas","c3","c3_dup","urg_sin_perdida","filas","columnas","nulos","comunas_nunca_urg"]}, default=str, indent=1))
print(R["c4"]); print(len(R["saltos"]), R["saltos"][:30])
