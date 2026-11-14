"""Módulo de la RM: cruce de AURA con el Censo 2024 (S5, S7; RF-01, RF-03, RF-04).

AURA (Universidad de Chile y CR2, proyecto FONDEF IT23I0095) no publica licencia de reutilización:
este módulo se puede construir y probar, pero no publicar sin su autorización escrita. Por eso todas
sus salidas van en archivos aparte (datos/aura.json, teselas *_aura, descargas/manzanas_aura), que
están fuera del repositorio y se borran sin afectar al resto (RNF-13).

Cruce: los códigos de manzana de AURA no son los del Censo 2024, así que se cruza por posición.
Cada manzana urbana o de aldea del Censo recibe los polígonos de AURA que
  (a) contienen su punto interior, o
  (b) tienen su centroide dentro del polígono censal (el INE fusionó manzanas).
Los valores se promedian ponderando por la superficie de la manzana de AURA; uso de suelo y zona
climática toman la categoría con más superficie. No se reestima nada de AURA.

Insumos: ~/Downloads/AURA_manzanas_csv.zip, AURA_capas_geograficas.zip y AURA_datos_manzanas_1.xlsx
Uso: python p7_aura.py
"""
import json
import os
import subprocess
import unicodedata
from pathlib import Path

import duckdb
import openpyxl

from rutas import CENSO, DATOS, DESCARGAS, TRABAJO, guardar, leer_config

ORIGEN = Path(os.environ.get("CALOR_AURA", Path.home() / "Downloads"))
SRC = TRABAJO / "aura_src"
SRC.mkdir(parents=True, exist_ok=True)
subprocess.run(["unzip", "-o", "-q", str(ORIGEN / "AURA_manzanas_csv.zip"), "-d", str(SRC)], check=True)
subprocess.run(["unzip", "-o", "-q", str(ORIGEN / "AURA_capas_geograficas.zip"), "AURA_manzanas.gpkg", "-d", str(SRC)], check=True)
cfg = leer_config("prioridad.json")
COBERTURA_MINIMA = 0.5   # una comuna usa la regla con calor si al menos la mitad de sus manzanas urbanas tiene dato de AURA

con = duckdb.connect()
con.execute("INSTALL spatial; LOAD spatial")
con.execute(f"create table a as select * from read_csv('{SRC}/AURA_manzanas.csv', header=true, types={{'manzana_id':'VARCHAR'}})")
con.execute(f"create table g as select manzana_id, ST_MakeValid(geom) geom from ST_Read('{SRC}/AURA_manzanas.gpkg')")
con.execute("create index gi on g using rtree (geom)")
n_aura = con.sql("select count(*) from a").fetchone()[0]

con.execute(f"""create table c as
   select m.*, p.geometry geom from '{TRABAJO}/manzana.parquet' m
   join '{CENSO}/censo_manzana_geo_13.parquet' p using (cod_manzana)
   where m.cod_region='13' and m.tipo in ('manzana_urbana','manzana_aldea')""")
con.execute("create index ci on c using rtree (geom)")

# --- Vínculos manzana censal <-> manzana AURA ---------------------------------
con.execute("""create table v as
   select c.cod_manzana_14 cod, g.manzana_id, 'a' via from c join g on ST_Contains(g.geom, ST_Point(c.lon_interior, c.lat_interior))
   union
   select c.cod_manzana_14, a.manzana_id, 'b' from c join a on ST_Contains(c.geom, ST_Point(a.centroide_lon, a.centroide_lat))""")
con.execute("create table vd as select cod, manzana_id, string_agg(via, '') via from v group by 1,2")
iguales, total_v = con.sql("select count(*) filter (where cod = manzana_id), count(*) from vd").fetchone()

# --- Valores por manzana censal -------------------------------------------------
con.execute("""create table x as
   select vd.cod,
          sum(a.temp_verano_dia * w) / sum(w) temp_dia, sum(a.temp_verano_noche * w) / sum(w) temp_noche,
          sum(a.isla_calor_c * w) / sum(w) isla_calor, sum(a.confort_termico * w) / sum(w) humidex,
          sum(a.delta_cc_2050_verano_dia * w) / sum(w) delta_dia, sum(a.delta_cc_2050_verano_noche * w) / sum(w) delta_noche,
          count(*) n_aura
   from vd join (select *, greatest(coalesce(area_manzana_m2, 1), 1) w from a) a using (manzana_id) group by 1""")
for campo, salida in (("destino_principal", "uso_principal"), ("zcl_plataforma", "zona_climatica")):
    con.execute(f"""create table k_{salida} as select cod, arg_max({campo}, s) {salida} from (
        select vd.cod, a.{campo}, sum(greatest(coalesce(a.area_manzana_m2, 1), 1)) s
        from vd join a using (manzana_id) where a.{campo} is not null group by 1,2) group by 1""")

# --- Media comunal publicada por AURA ---------------------------------------------
def norm(s):
    return "".join(ch for ch in unicodedata.normalize("NFD", str(s).upper()) if unicodedata.category(ch) != "Mn").strip()


wb = openpyxl.load_workbook(ORIGEN / "AURA_datos_manzanas_1.xlsx", read_only=True)
filas = list(wb["Comunas"].iter_rows(values_only=True))
enc = filas[0]
pub = {norm(f[0]): dict(zip(enc, f)) for f in filas[1:] if f[0]}
zcl = {f[0]: f[3] for f in list(wb["ZCL"].iter_rows(values_only=True))[1:] if f[0]}
leeme = {str(f[0]): f[1] for f in wb["Léeme"].iter_rows(values_only=True) if f and f[0]}
comunas = json.loads((DATOS / "comunas.json").read_text())
rm = [c for c in comunas if c["cod_region"] == "13"]
con.execute("create table cm (cod_comuna varchar, t_dia double, t_noche double, n_pub integer)")
for c in rm:
    p = pub.get(norm(c["nombre"]))
    if p:
        con.execute("insert into cm values (?,?,?,?)", [c["cod"], p["temp_prom_verano_dia"], p["temp_prom_verano_noche"], p["total_manzanas"]])
sin_calce = sorted(set(pub) - {norm(c["nombre"]) for c in rm})
assert not sin_calce, f"comunas de AURA sin calce por nombre: {sin_calce}"

# --- Tabla final por manzana censal, con diferencia y clase ------------------------
con.execute(f"""create table f as
   with base as (
     select c.cod_manzana_14 cod, c.cod_comuna, c.tipo, c.poblacion, c.mayores, c.clase_prioridad clase_nacional,
            x.temp_dia, x.temp_noche, x.isla_calor, x.humidex, x.delta_dia, x.delta_noche, x.n_aura, u.uso_principal, z.zona_climatica,
            round(x.temp_dia - cm.t_dia, 2) dif_temp_dia, round(x.temp_noche - cm.t_noche, 2) dif_temp_noche
     from c left join x on x.cod = c.cod_manzana_14
     left join k_uso_principal u on u.cod = c.cod_manzana_14 left join k_zona_climatica z on z.cod = c.cod_manzana_14
     left join cm on cm.cod_comuna = c.cod_comuna),
   cob as (select cod_comuna, count(*) filter (where tipo='manzana_urbana') n_urb,
                  count(*) filter (where tipo='manzana_urbana' and temp_dia is not null) n_con from base group by 1),
   q as (select cod, cume_dist() over (partition by cod_comuna order by temp_dia) cd_calor from base where temp_dia is not null)
   select b.*, (cob.n_con >= {COBERTURA_MINIMA} * cob.n_urb and cob.n_con >= 20) aplica,
          coalesce(q.cd_calor > {cfg['corte_alta']}, false) calor_q5,
          case when not (cob.n_con >= {COBERTURA_MINIMA} * cob.n_urb and cob.n_con >= 20) then b.clase_nacional
               -- El quintil de personas mayores es el mismo de la regla nacional (clase_nacional), para no tener dos definiciones.
               when b.clase_nacional = 'alta' and q.cd_calor > {cfg['corte_alta']} then 'alta'
               when b.clase_nacional in ('alta', 'media') then 'media'
               else 'sin' end clase_prioridad
   from base b join cob using (cod_comuna) left join q using (cod)""")
con.execute(f"""copy (select cod cod_manzana_14, round(temp_dia, 2) aura_temp_dia, round(temp_noche, 2) aura_temp_noche, dif_temp_dia, dif_temp_noche,
                     round(isla_calor, 2) isla_calor, round(humidex, 1) humidex, round(delta_dia, 2) delta_2050_dia, round(delta_noche, 2) delta_2050_noche, uso_principal, zona_climatica, n_aura, calor_q5, aplica, clase_prioridad
              from f) to '{TRABAJO}/manzana_aura.parquet' (format parquet)""")

# --- Resumen y controles ---------------------------------------------------------
urb, urb_con, pob, pob_con = con.sql("""select count(*), count(temp_dia), sum(poblacion), sum(poblacion) filter (where temp_dia is not null)
    from f where tipo='manzana_urbana'""").fetchone()
aura_con = con.sql("select count(distinct manzana_id) from vd").fetchone()[0]
aura_pob = con.sql("select count(distinct vd.manzana_id) from vd join c on c.cod_manzana_14 = vd.cod where c.poblacion > 0").fetchone()[0]
por_comuna = {}
for r in con.sql("""select cod_comuna, count(*) filter (where tipo='manzana_urbana') n_urb, count(*) filter (where tipo='manzana_urbana' and temp_dia is not null) n_con,
        bool_or(aplica) aplica, count(*) filter (where clase_prioridad='alta') n_alta, count(*) filter (where clase_prioridad='media') n_media,
        coalesce(sum(mayores) filter (where clase_prioridad='alta'),0) m_alta, coalesce(sum(mayores) filter (where clase_prioridad='media'),0) m_media,
        avg(temp_dia) t_dia_cruce, avg(temp_noche) t_noche_cruce, stddev_samp(temp_dia) sd_dia, avg(delta_dia) d_dia, avg(delta_noche) d_noche
        from f group by 1""").fetchall():
    cod, n_urb, n_con, aplica, n_alta, n_media, m_alta, m_media, td, tn, sd, dd, dn = r
    if n_con == 0:
        continue
    p = con.sql("select t_dia, t_noche, n_pub from cm where cod_comuna = ?", params=[cod]).fetchone()
    por_comuna[cod] = {"n_urbanas": n_urb, "n_con_aura": n_con, "cobertura": round(n_con / n_urb, 3) if n_urb else 0, "aplica_prioridad": bool(aplica),
                       "temp_dia_prom": p[0] if p else None, "temp_noche_prom": p[1] if p else None, "manzanas_aura": p[2] if p else None,
                       "temp_dia_cruce": round(td, 2), "temp_noche_cruce": round(tn, 2), "temp_dia_de": None if sd is None else round(sd, 2),
                       "delta_2050_dia": None if dd is None else round(dd, 2), "delta_2050_noche": None if dn is None else round(dn, 2),
                       "prioridad": {"n_alta": int(n_alta), "n_media": int(n_media), "mayores_alta": int(m_alta), "mayores_media": int(m_media)}}
guardar("aura.json", {
    "version": "aura-cruce-2026.1", "extraccion": str(leeme.get("Fecha de extracción", "")), "fuente": str(leeme.get("Fuente", "")),
    "cita": "AURA (2026). AURA: Evaluador de clima urbano. Universidad de Chile, Proyecto FONDEF IT23I0095.",
    "metodo": "Cruce por posición con el Censo 2024 (los códigos de manzana de AURA no son los del Censo 2024). Cada manzana censal urbana o de aldea "
              "recibe los polígonos de AURA que contienen su punto interior o cuyo centroide cae dentro de ella; promedio ponderado por superficie. "
              "Diferencia = temperatura de verano de la manzana menos el promedio comunal publicado por AURA.",
    "supuesto_s7": "Temperatura estimada de una manzana = valor del día de su comuna + diferencia fija de la manzana. "
                   "El patrón promedio de verano de AURA puede no mantenerse en días extremos.",
    "regla_prioridad": f"En comunas con al menos {int(COBERTURA_MINIMA * 100)} % de manzanas urbanas con dato: alta = quintil superior de personas mayores y "
                       "quintil superior de temperatura de verano de día dentro de la comuna; media = resto de los dos quintiles superiores de personas mayores.",
    "resumen": {"manzanas_aura": n_aura, "aura_vinculadas": aura_con, "aura_con_poblacion": aura_pob,
                "censo_urbanas_rm": urb, "censo_urbanas_con_aura": urb_con, "poblacion_urbana_rm": int(pob), "poblacion_con_aura": int(pob_con),
                "vinculos": total_v, "vinculos_mismo_codigo": iguales, "comunas_con_dato": len(por_comuna),
                "comunas_con_regla": sum(1 for v in por_comuna.values() if v["aplica_prioridad"])},
    "zonas_climaticas": zcl, "comunas": por_comuna})
print(f"  AURA: {n_aura} manzanas; vinculadas {aura_con} ({aura_con / n_aura:.1%}); con población {aura_pob} ({aura_pob / n_aura:.1%})")
print(f"  Censo RM urbano: {urb_con} de {urb} manzanas con dato ({urb_con / urb:.1%}); población {pob_con / pob:.1%}")
print(f"  vínculos con el mismo código: {iguales} de {total_v} ({iguales / total_v:.1%})")
print(f"  comunas con dato: {len(por_comuna)}; con regla de calor: {sum(1 for v in por_comuna.values() if v['aplica_prioridad'])}; "
      f"sin regla: {[next(c['nombre'] for c in rm if c['cod'] == k) for k, v in por_comuna.items() if not v['aplica_prioridad']]}")
dif = con.sql("select max(abs(t_dia_cruce - t_dia)) from (select cod_comuna, avg(temp_dia) t_dia_cruce from f where temp_dia is not null group by 1) join cm using (cod_comuna)").fetchone()[0]
print(f"  mayor diferencia entre el promedio comunal del cruce y el publicado por AURA: {dif:.2f} °C")
print("  clases RM:", con.sql("select clase_prioridad, count(*), sum(mayores) from f group by 1 order by 1").fetchall(),
      "| antes:", con.sql("select clase_nacional, count(*), sum(mayores) from f group by 1 order by 1").fetchall())
print("  diferencia de día: percentiles 1, 50, 99 =", con.sql("select quantile_cont(dif_temp_dia, [0.01, 0.5, 0.99]) from f").fetchone()[0])

# --- Listas descargables con la diferencia de temperatura (RF-04) -------------------
carpeta = DESCARGAS / "manzanas_aura"
carpeta.mkdir(parents=True, exist_ok=True)
for cod in por_comuna:
    con.execute(f"""copy (select cod cod_manzana, tipo, clase_prioridad, mayores personas_mayores_60_mas, poblacion, dif_temp_dia, dif_temp_noche
                  from f where cod_comuna='{cod}' order by clase_prioridad, mayores desc nulls last)
                  to '{carpeta}/{cod}.csv' (header, delimiter ',')""")
print(f"  listas con diferencia de temperatura: {len(por_comuna)} comunas")
