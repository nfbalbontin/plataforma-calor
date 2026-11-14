"""Territorio: regiones, comunas, clase de prioridad de cada manzana y listas descargables.

Insumo: tablas depuradas del Censo 2024 (INE, CC BY-SA 4.0).
Salidas: datos/regiones.json, datos/comunas.json, .trabajo/manzana.parquet,
         public/descargas/manzanas/<cod_comuna>.csv
"""
import duckdb

from rutas import CENSO, DESCARGAS, TRABAJO, guardar, leer_config

cfg = leer_config("prioridad.json")
con = duckdb.connect()
con.execute("INSTALL spatial; LOAD spatial")

# --- Manzanas con clase de prioridad (S5) ---------------------------------
con.execute(f"""
create table mz as
with base as (select * from '{CENSO}/censo_manzana.parquet'),
rango as (
  select cod_manzana,
         cume_dist() over (partition by cod_comuna order by mayores) as cd
  from base where mayores > 0
)
select b.*,
       case when r.cd > {cfg['corte_alta']} then 'alta'
            when r.cd > {cfg['corte_media']} then 'media'
            else 'sin' end as clase_prioridad
from base b left join rango r using (cod_manzana)
""")
con.execute(f"copy mz to '{TRABAJO}/manzana.parquet' (format parquet)")
print(con.execute("select clase_prioridad, count(*), sum(mayores) from mz group by 1 order by 1").fetchall())

# --- Comunas ---------------------------------------------------------------
con.execute(f"create table cg as select * from '{CENSO}/censo_comuna_geo.parquet'")
con.execute(f"""
create table com as
with pri as (
  select cod_comuna,
         count(*) filter (where clase_prioridad='alta') n_alta,
         count(*) filter (where clase_prioridad='media') n_media,
         coalesce(sum(mayores) filter (where clase_prioridad='alta'),0) mayores_alta,
         coalesce(sum(mayores) filter (where clase_prioridad='media'),0) mayores_media,
         coalesce(sum(ninos_0_5),0) ninos_0_5, coalesce(sum(discapacidad),0) discapacidad,
         coalesce(sum(hogares_solo_mayores),0) hogares_solo_mayores
  from mz group by 1),
mayor as (  -- manzana más poblada: punto de respaldo para consultar el clima
  select cod_comuna, arg_max(lat_interior, poblacion) lat_m, arg_max(lon_interior, poblacion) lon_m
  from mz group by 1)
select c.*, p.* exclude (cod_comuna), m.lat_m, m.lon_m,
       ST_XMin(g.geometry) x0, ST_YMin(g.geometry) y0, ST_XMax(g.geometry) x1, ST_YMax(g.geometry) y1,
       case when c.lat_centro is null then null
            when ST_Contains(g.geometry, ST_Point(c.lon_centro, c.lat_centro)) then true else false end centro_dentro
from '{CENSO}/censo_comuna.parquet' c
left join pri p using (cod_comuna) left join mayor m using (cod_comuna)
left join cg g using (cod_comuna)
order by c.cod_comuna
""")

ISLAS = {"05201", "05104"}  # Isla de Pascua y Juan Fernández: fuera del encuadre continental
comunas = []
for r in con.execute("select * from com").fetch_df().to_dict("records"):
    nulo = lambda v: None if v != v else v  # NaN -> None
    lat_c, lon_c = nulo(r["lat_centro"]), nulo(r["lon_centro"])
    if lat_c is None:
        punto, metodo = None, "sin manzanas"
    elif r["centro_dentro"]:
        punto, metodo = [round(lon_c, 4), round(lat_c, 4)], "centro poblado"
    else:
        punto, metodo = [round(r["lon_m"], 4), round(r["lat_m"], 4)], "manzana más poblada"
    comunas.append({
        "cod": r["cod_comuna"], "nombre": r["nombre_comuna"],
        "cod_region": r["cod_region"], "region": r["nombre_region"],
        "pob": {"total": int(r["pob_total"]), "e0_64": int(r["pob_0_64"]), "e65_74": int(r["pob_65_74"]),
                "e75_84": int(r["pob_75_84"]), "e85_mas": int(r["pob_85_mas"])},
        "mayores60": int(nulo(r["mayores"]) or 0), "n_manzanas": int(nulo(r["n_manzanas"]) or 0),
        "viviendas": int(nulo(r["viviendas"]) or 0), "viviendas_hacinadas": int(nulo(r["viviendas_hacinadas"]) or 0),
        "ninos_0_5": int(nulo(r["ninos_0_5"]) or 0), "discapacidad": int(nulo(r["discapacidad"]) or 0),
        "hogares_solo_mayores": int(nulo(r["hogares_solo_mayores"]) or 0),
        "prioridad": {"n_alta": int(nulo(r["n_alta"]) or 0), "n_media": int(nulo(r["n_media"]) or 0),
                      "mayores_alta": int(nulo(r["mayores_alta"]) or 0), "mayores_media": int(nulo(r["mayores_media"]) or 0)},
        "punto_clima": punto, "punto_metodo": metodo,
        "bbox": None if nulo(r["x0"]) is None else [round(r["x0"], 4), round(r["y0"], 4), round(r["x1"], 4), round(r["y1"], 4)],
        "isla": r["cod_comuna"] in ISLAS,
    })
guardar("comunas.json", comunas)
print("  comunas:", len(comunas), "| sin punto de clima:", [c["cod"] for c in comunas if not c["punto_clima"]],
      "| punto en manzana más poblada:", [c["nombre"] for c in comunas if c["punto_metodo"] == "manzana más poblada"])

# --- Regiones --------------------------------------------------------------
regiones = {}
for c in comunas:
    g = regiones.setdefault(c["cod_region"], {
        "cod": c["cod_region"], "nombre": c["region"], "n_comunas": 0,
        "pob": {"total": 0, "e0_64": 0, "e65_74": 0, "e75_84": 0, "e85_mas": 0},
        "mayores60": 0, "mayores_alta": 0, "bbox": None})
    g["n_comunas"] += 1
    for k in g["pob"]:
        g["pob"][k] += c["pob"][k]
    g["mayores60"] += c["mayores60"]
    g["mayores_alta"] += c["prioridad"]["mayores_alta"]
    if c["bbox"] and not c["isla"]:
        b = g["bbox"]
        g["bbox"] = c["bbox"][:] if b is None else [min(b[0], c["bbox"][0]), min(b[1], c["bbox"][1]),
                                                     max(b[2], c["bbox"][2]), max(b[3], c["bbox"][3])]
guardar("regiones.json", sorted(regiones.values(), key=lambda r: r["cod"]))

# --- Listas descargables por comuna (RF-04) --------------------------------
carpeta = DESCARGAS / "manzanas"
carpeta.mkdir(parents=True, exist_ok=True)
for c in comunas:
    con.execute(f"""
      copy (select cod_manzana_14 as cod_manzana, tipo, clase_prioridad, mayores as personas_mayores_60_mas, poblacion
            from mz where cod_comuna='{c['cod']}' order by clase_prioridad, mayores desc nulls last)
      to '{carpeta}/{c['cod']}.csv' (header, delimiter ',')""")
print("  listas por comuna:", len(comunas))
