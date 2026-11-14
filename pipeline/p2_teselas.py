"""Teselas vectoriales PMTiles (RF-01, RNF-03, RNF-04).

- public/teselas/chile.pmtiles: capas `regiones` y `comunas` simplificadas por nivel de zoom.
- public/teselas/manzanas_<region>.pmtiles: capa `manzanas`, un archivo por región.

Se generan con DuckDB (ST_AsMVT) y se empaquetan con pmtiles. El mapa las lee
directo: no pasan por la base de datos.

Uso: python p2_teselas.py [chile] [01 02 ... 16] [13aura]   (sin argumentos: todo menos 13aura)
"""
import gzip
import sys
import time

import duckdb
from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import Writer

from rutas import CENSO, TESELAS, TRABAJO

R = 20037508.342789244
con = duckdb.connect()
con.execute("INSTALL spatial; LOAD spatial")
con.execute("SET preserve_insertion_order=false")


def ancho(z):
    return 2 * R / 2 ** z


def teselas_de(tabla, z, capa, columnas, area_min_unidades=4.0, tol_unidades=1.2):
    """Devuelve [(x, y, blob)] de la capa `capa` en el zoom z. `tabla` tiene columna g (EPSG:3857)."""
    w = ancho(z)
    u = w / 4096
    attrs = ", ".join(f"'{c}': {c}" for c in columnas)
    con.execute(f"""
      create or replace temp table s as
      select {', '.join(columnas)}, ST_SimplifyPreserveTopology(g, {tol_unidades * u}) gs
      from {tabla} where ST_Area(g) >= {area_min_unidades * u * u}""")
    q = f"""
      with b as (
        select *, cast(floor((ST_XMin(gs)+{R})/{w}) as integer) tx0, cast(floor((ST_XMax(gs)+{R})/{w}) as integer) tx1,
                  cast(floor(({R}-ST_YMax(gs))/{w}) as integer) ty0, cast(floor(({R}-ST_YMin(gs))/{w}) as integer) ty1
        from s),
      bx as (select *, unnest(range(tx0, tx1+1)) x from b),
      bxy as (select *, unnest(range(ty0, ty1+1)) y from bx),
      m as (select x, y, {', '.join(columnas)},
                   ST_AsMVTGeom(gs, ST_Extent(ST_TileEnvelope({z}, x::integer, y::integer)), 4096, 64, true) geom from bxy)
      select x, y, ST_AsMVT({{{attrs}, 'geom': geom}}, '{capa}', 4096, 'geom') blob
      from m where geom is not null and not ST_IsEmpty(geom) group by x, y"""
    return con.execute(q).fetchall()


def escribir(ruta, teselas, zmin, zmax, bounds, capas):
    """teselas: dict {(z,x,y): bytes sin comprimir}."""
    orden = sorted(((zxy_to_tileid(z, x, y), d) for (z, x, y), d in teselas.items()), key=lambda t: t[0])
    with open(ruta, "wb") as f:
        w = Writer(f)
        for tid, d in orden:
            w.write_tile(tid, gzip.compress(d, 6))
        w.finalize(
            {"tile_type": TileType.MVT, "tile_compression": Compression.GZIP,
             "min_zoom": zmin, "max_zoom": zmax,
             "min_lon_e7": int(bounds[0] * 1e7), "min_lat_e7": int(bounds[1] * 1e7),
             "max_lon_e7": int(bounds[2] * 1e7), "max_lat_e7": int(bounds[3] * 1e7),
             "center_zoom": zmin, "center_lon_e7": int((bounds[0] + bounds[2]) / 2 * 1e7),
             "center_lat_e7": int((bounds[1] + bounds[3]) / 2 * 1e7)},
            {"vector_layers": capas, "attribution": "INE, Censo 2024 (CC BY-SA 4.0)"})
    print(f"  {ruta.name}: {len(orden)} teselas, {ruta.stat().st_size/1e6:.1f} MB", flush=True)


def chile():
    t0 = time.time()
    # Se separan las partes de cada multipolígono (islas) para acotar las teselas que toca cada una.
    con.execute(f"""
      create or replace temp table reg as
      select cod, nombre, d.geom g from (
        select cod_region cod, nombre_region nombre,
               unnest(ST_Dump(ST_Transform(geometry,'EPSG:4326','EPSG:3857', always_xy:=true))) d
        from '{CENSO}/censo_region_geo.parquet')""")
    con.execute(f"""
      create or replace temp table com as
      select cod, region, d.geom g from (
        select cod_comuna cod, cod_region region,
               unnest(ST_Dump(ST_Transform(geometry,'EPSG:4326','EPSG:3857', always_xy:=true))) d
        from '{CENSO}/censo_comuna_geo.parquet')""")
    print("  partes: regiones", con.execute("select count(*) from reg").fetchone()[0],
          "comunas", con.execute("select count(*) from com").fetchone()[0], flush=True)
    teselas = {}
    for z in range(0, 11):
        partes = {}
        if z <= 8:
            for x, y, b in teselas_de("reg", z, "regiones", ["cod", "nombre"]):
                partes[(x, y)] = bytes(b)
        # Comunas desde el zoom 0: en un teléfono Chile completo se ve en zoom 2.
        for x, y, b in teselas_de("com", z, "comunas", ["cod", "region"], area_min_unidades=1.0 if z < 3 else 4.0):
            partes[(x, y)] = partes.get((x, y), b"") + bytes(b)  # las capas MVT se concatenan
        for (x, y), b in partes.items():
            teselas[(z, x, y)] = b
        print(f"  z{z}: {len(partes)} teselas ({time.time()-t0:.0f}s)", flush=True)
    escribir(TESELAS / "chile.pmtiles", teselas, 0, 10, [-109.5, -56.0, -66.4, -17.5], [
        {"id": "regiones", "fields": {"cod": "String", "nombre": "String"}, "minzoom": 0, "maxzoom": 8},
        {"id": "comunas", "fields": {"cod": "String", "region": "String"}, "minzoom": 0, "maxzoom": 10}])


COLS_BASE = ["cod_manzana", "cod_comuna", "tipo", "poblacion", "mayores", "pct_mayores", "ninos_0_5",
        "discapacidad", "viviendas_hacinadas", "hogares_solo_mayores", "clase_prioridad"]


def recortar(origen, destino, z, cols):
    """Recorta las partes de `origen` (con columnas x, y del zoom z) a su tesela con margen."""
    w = ancho(z)
    m = w * 96 / 4096
    con.execute(f"""
      create or replace temp table {destino} as
      with e as (
        select {cols}, x, y, g,
               x*{w}-{R}-{m} ex0, {R}-(y+1)*{w}-{m} ey0, (x+1)*{w}-{R}+{m} ex1, {R}-y*{w}+{m} ey1,
               ST_XMin(g) gx0, ST_YMin(g) gy0, ST_XMax(g) gx1, ST_YMax(g) gy1
        from {origen}),
      f as (select * from e where gx1 >= ex0 and gx0 <= ex1 and gy1 >= ey0 and gy0 <= ey1),
      r as (
        select {cols}, x, y,
               case when gx0 >= ex0 and gx1 <= ex1 and gy0 >= ey0 and gy1 <= ey1 then g
                    else ST_Intersection(g, ST_MakeEnvelope(ex0, ey0, ex1, ey1)) end g
        from f)
      select * from r where g is not null and not ST_IsEmpty(g)""")


def emitir(tabla, z, columnas, filtro="true", area_min_unidades=1.0):
    u = ancho(z) / 4096
    attrs = ", ".join(f"'{c}': {c}" for c in columnas)
    return con.execute(f"""
      with m as (
        select x, y, {', '.join(columnas)},
               ST_AsMVTGeom(ST_SimplifyPreserveTopology(g, {1.2 * u}),
                            ST_Extent(ST_TileEnvelope({z}, x::integer, y::integer)), 4096, 64, true) geom
        from {tabla} where {filtro} and ST_Area(g) >= {area_min_unidades * u * u})
      select x, y, ST_AsMVT({{{attrs}, 'geom': geom}}, 'manzanas', 4096, 'geom')
      from m where geom is not null and not ST_IsEmpty(geom) group by x, y""").fetchall()


COLS_AURA = ["dif_temp_dia", "dif_temp_noche", "isla_calor", "humidex", "delta_2050_dia", "uso_principal", "zona_climatica"]


def manzanas(region, aura=False):
    """Pirámide: cada polígono se recorta en z10 y luego cada parte se subdivide en sus 4 hijas.
    Así las entidades rurales muy grandes (Aysén, Magallanes) no se recortan miles de veces completas.
    Con aura=True escribe un archivo aparte (manzanas_<region>_aura.pmtiles) con los atributos del módulo
    de la RM y la clase de prioridad que exige calor; ese archivo no se publica sin autorización de AURA."""
    t0 = time.time()
    COLS = COLS_BASE + (COLS_AURA if aura else [])
    cols = ", ".join(COLS)
    extra = ", ".join(f"x.{c}" for c in COLS_AURA)
    con.execute(f"""
      create or replace temp table mzg as
      select m.cod_manzana_14 cod_manzana, m.cod_comuna, m.tipo, m.poblacion, m.mayores,
             round(m.pct_mayores, 3) pct_mayores, m.ninos_0_5, m.discapacidad, m.viviendas_hacinadas,
             m.hogares_solo_mayores, {"coalesce(x.clase_prioridad, m.clase_prioridad)" if aura else "m.clase_prioridad"} clase_prioridad,
             {extra + "," if aura else ""}
             ST_MakeValid(ST_Transform(g.geometry,'EPSG:4326','EPSG:3857', always_xy:=true)) g
      from '{CENSO}/censo_manzana_geo_{region}.parquet' g
      join '{TRABAJO}/manzana.parquet' m using (cod_manzana)
      {f"left join '{TRABAJO}/manzana_aura.parquet' x on x.cod_manzana_14 = m.cod_manzana_14" if aura else ""}""")
    n = con.execute("select count(*) from mzg").fetchone()[0]
    b = con.execute(f"select min(lon), min(lat), max(lon), max(lat) from '{TRABAJO}/manzana.parquet' where cod_region='{region}'").fetchone()
    w = ancho(10)
    con.execute(f"""
      create or replace temp table semilla as
      with b as (select *, cast(floor((ST_XMin(g)+{R})/{w}) as integer) tx0, cast(floor((ST_XMax(g)+{R})/{w}) as integer) tx1,
                        cast(floor(({R}-ST_YMax(g))/{w}) as integer) ty0, cast(floor(({R}-ST_YMin(g))/{w}) as integer) ty1 from mzg),
      bx as (select *, unnest(range(tx0, tx1+1)) x from b)
      select {cols}, g, x, unnest(range(ty0, ty1+1)) y from bx""")
    recortar("semilla", "p10", 10, cols)
    teselas = {}
    minimas = ["cod_manzana", "cod_comuna", "clase_prioridad"] + (["dif_temp_dia", "dif_temp_noche"] if aura else [])
    for z in (10, 11, 12, 13):
        if z > 10:
            con.execute(f"""
              create or replace temp table hijas as
              select {cols}, g, x*2+dx x, y*2+dy y from p{z-1}, (values (0,0),(1,0),(0,1),(1,1)) d(dx, dy)""")
            recortar("hijas", f"p{z}", z, cols)
            con.execute(f"drop table p{z-1}")
        if z <= 11:   # vista de comuna: solo manzanas con prioridad y atributos mínimos
            res = emitir(f"p{z}", z, minimas, "clase_prioridad in ('alta','media')", 4.0)
        else:         # vista de manzana: todas, con sus atributos
            res = emitir(f"p{z}", z, COLS)
        for x, y, blob in res:
            teselas[(z, x, y)] = bytes(blob)
        print(f"    z{z}: {len(res)} teselas ({time.time()-t0:.0f}s)", flush=True)
    con.execute("drop table p13")
    campos = {c: ("Number" if c in ("poblacion", "mayores", "pct_mayores", "ninos_0_5", "discapacidad", "viviendas_hacinadas",
                                    "hogares_solo_mayores", "dif_temp_dia", "dif_temp_noche", "isla_calor", "humidex", "delta_2050_dia") else "String") for c in COLS}
    escribir(TESELAS / f"manzanas_{region}{'_aura' if aura else ''}.pmtiles", teselas, 10, 13, list(b),
             [{"id": "manzanas", "fields": campos, "minzoom": 10, "maxzoom": 13}])
    print(f"  región {region}: {n} manzanas en {time.time()-t0:.0f}s", flush=True)


if __name__ == "__main__":
    args = sys.argv[1:] or ["chile"] + [f"{i:02d}" for i in range(1, 17)]
    for a in args:
        print(a, flush=True)
        chile() if a == "chile" else manzanas(a[:2], aura=a.endswith("aura"))
