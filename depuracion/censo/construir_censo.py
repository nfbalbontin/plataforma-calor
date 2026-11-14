"""Construye las tablas depuradas del Censo 2024 (INE) para la plataforma de calor.

Uso:
  python -I construir_censo.py <csv_manzana_entidad> <dir_cartografia> <xlsx_quinquenales> <xlsx_glosas> <dir_salida> <dir_temporal>

Lee los originales sin modificarlos. La cartografía se lee con DuckDB (en streaming).
No imputa: las celdas '*' (supresión por secreto estadístico) quedan nulas y se cuentan.
"""
import json
import os
import sys

import duckdb
import openpyxl

CSV, CARTO, D1, GLOSAS, OUT, TMP = sys.argv[1:7]
os.makedirs(OUT, exist_ok=True)
REF_INE = 18480432

con = duckdb.connect()
con.execute(f"SET temp_directory='{TMP}'; SET memory_limit='6GB'")
con.execute("INSTALL spatial; LOAD spatial")
q = lambda s: con.execute(s).fetchall()
M = {}  # métricas para el informe


def num(col):
    """Texto -> entero; '*' -> NULL. Falla si aparece otro token (no se esconde nada)."""
    return f"CASE WHEN {col} = '*' THEN NULL ELSE CAST({col} AS INTEGER) END"


# ---------------------------------------------------------------- base
con.execute(f"""CREATE TABLE b AS SELECT * FROM read_csv('{CSV}', delim=';', header=true,
                all_varchar=true, encoding='utf-8')""")
M["filas_leidas"] = q("SELECT count(*) FROM b")[0][0]
M["cols_leidas"] = len(q("DESCRIBE b"))
vars_all = [r[0] for r in q("DESCRIBE b") if r[0].startswith(("n_", "prom_"))]
M["asteriscos_base_total"] = sum(q(f"SELECT count(*) FROM b WHERE {v}='*'")[0][0] for v in vars_all)

ORIG = {  # columna de salida -> columna(s) originales
    "poblacion": "n_per",
    "mayores": "n_edad_60_mas",
    "ninos_0_5": "n_edad_0_5",
    "discapacidad": "n_discapacidad",
    "viviendas": "n_vp",
    "viviendas_hacinadas": "n_viv_hacinadas",
    "hogares_solo_mayores": "n_hog_60",
    "viv_mediagua": "n_tipo_viv_mediagua",
    "viv_irrecuperables": "n_viv_irrecuperables",
    "viv_paredes_precarias": "n_mat_paredes_precarios",
    "viv_techo_precario": "n_mat_techo_precarios",
}
AGUA = ["n_fuente_agua_pozo", "n_fuente_agua_camion", "n_fuente_agua_rio"]
usadas = list(ORIG.values()) + AGUA
M["asteriscos_por_col"] = {c: q(f"SELECT count(*) FROM b WHERE CONTENEDOR_COMUNAL='0' AND {c}='*'")[0][0] for c in usadas}
M["contenedores"] = q("SELECT count(*), sum(CAST(n_per AS BIGINT)) FROM b WHERE CONTENEDOR_COMUNAL='1'")[0]

sel = ",\n  ".join(f"{num(src)} AS {dst}" for dst, src in ORIG.items())
agua = " + ".join(num(c) for c in AGUA)  # NULL si alguna componente es NULL (no se imputa)
con.execute(f"""
CREATE TABLE cm AS
SELECT
  MANZENT AS cod_manzana,
  lpad(MANZENT, 14, '0') AS cod_manzana_14,
  lpad(CUT, 5, '0') AS cod_comuna,
  lpad(COD_REGION, 2, '0') AS cod_region,
  CASE WHEN TIPO_MZ = 'URBANO' THEN 'manzana_urbana'
       WHEN TIPO_MZ = 'ALDEA'  THEN 'manzana_aldea'
       WHEN AREA_C = '2' AND TIPO_MZ IS NULL THEN 'entidad_rural'
       ELSE 'otro' END AS tipo,
  {sel},
  {agua} AS viv_sin_agua_red
FROM b WHERE CONTENEDOR_COMUNAL = '0'
""")

# ---------------------------------------------------------------- geometrías de manzana / entidad
def capa(nombre):
    return f"read_parquet('{CARTO}/Cartografia_censo2024_Pais_{nombre}.parquet')"

TR = "ST_Transform(SHAPE, 'EPSG:4674', 'EPSG:4326', always_xy := true)"
con.execute(f"""
CREATE TABLE g AS
SELECT CAST(CAST(MANZENT AS BIGINT) AS VARCHAR) AS cod_manzana, lpad(CAST(COD_REGION AS VARCHAR),2,'0') AS cod_region,
       'Manzanas' AS capa, {TR} AS geometry
FROM {capa('Manzanas')} WHERE MZ_BASE_CENSO = 1
UNION ALL
SELECT CAST(CAST(MANZENT AS BIGINT) AS VARCHAR), lpad(CAST(COD_REGION AS VARCHAR),2,'0'),
       'Entidades', {TR}
FROM {capa('Entidades')} WHERE MZ_BASE_CENSO = 1
""")
M["capa_sin_datos"] = q(f"""SELECT 'Manzanas', count(*) FROM {capa('Manzanas')} WHERE MZ_BASE_CENSO=0
                           UNION ALL SELECT 'Entidades', count(*) FROM {capa('Entidades')} WHERE MZ_BASE_CENSO=0""")
M["geo_dup"] = q("SELECT count(*) - count(DISTINCT cod_manzana) FROM g")[0][0]
M["geo_invalidas"] = q("SELECT capa, count(*) FROM g WHERE NOT ST_IsValid(geometry) GROUP BY 1")
M["geo_invalidas_lista"] = q("SELECT cod_manzana FROM g WHERE NOT ST_IsValid(geometry) ORDER BY 1")
M["geo_vacias"] = q("SELECT count(*) FROM g WHERE geometry IS NULL OR ST_IsEmpty(geometry)")[0][0]
M["geo_multiparte"] = q("SELECT capa, count(*) FROM g WHERE ST_NumGeometries(geometry) > 1 GROUP BY 1 ORDER BY 1")

con.execute("""CREATE TABLE cen AS
  WITH p AS (SELECT cod_manzana, geometry, ST_Centroid(geometry) c, ST_PointOnSurface(geometry) s FROM g)
  SELECT cod_manzana, ST_Y(c) AS lat, ST_X(c) AS lon, ST_Intersects(c, geometry) AS centroide_dentro,
         ST_Y(s) AS lat_interior, ST_X(s) AS lon_interior, ST_Intersects(s, geometry) AS interior_dentro,
         ST_Distance_Sphere(c, s) AS dist_m
  FROM p""")
M["interior_fuera"] = q("SELECT count(*) FILTER (WHERE NOT interior_dentro), count(*) FILTER (WHERE lat_interior IS NULL) FROM cen")[0]
M["interior_dist"] = q("""SELECT round(quantile_cont(dist_m, 0.5) FILTER (WHERE NOT centroide_dentro)),
                                 round(quantile_cont(dist_m, 0.9) FILTER (WHERE NOT centroide_dentro)),
                                 round(max(dist_m)) FROM cen""")[0]
M["centroide_fuera"] = q("SELECT count(*) FILTER (WHERE NOT centroide_dentro) FROM cen")[0][0]
M["centroide_fuera_tipo"] = q("SELECT g.capa, count(*) FROM cen JOIN g USING (cod_manzana) WHERE NOT centroide_dentro GROUP BY 1 ORDER BY 1")

# ---------------------------------------------------------------- censo_manzana.parquet
cols_m = ["cod_manzana", "cod_manzana_14", "cod_comuna", "cod_region", "tipo"] + list(ORIG) + ["viv_sin_agua_red"]
con.execute(f"""
CREATE TABLE censo_manzana AS
SELECT {', '.join('cm.' + c for c in cols_m)},
  CASE WHEN cm.poblacion >= 20 AND cm.mayores IS NOT NULL
       THEN cm.mayores::DOUBLE / cm.poblacion END AS pct_mayores,
  cen.lat, cen.lon, cen.lat_interior, cen.lon_interior
FROM cm LEFT JOIN cen USING (cod_manzana)
ORDER BY cod_region, cod_comuna, cod_manzana_14
""")
con.execute(f"COPY (SELECT * FROM censo_manzana ORDER BY cod_region, cod_comuna, cod_manzana_14) TO '{OUT}/censo_manzana.parquet' (FORMAT parquet, COMPRESSION zstd)")
M["filas_manzana"] = q("SELECT count(*) FROM censo_manzana")[0][0]
M["tipo"] = q("SELECT tipo, count(*), sum(poblacion) FROM censo_manzana GROUP BY 1 ORDER BY 1")
M["nulos_salida"] = {c: q(f"SELECT count(*) FROM censo_manzana WHERE {c} IS NULL")[0][0]
                     for c in list(ORIG) + ["viv_sin_agua_red", "pct_mayores", "lat", "lon", "lat_interior", "lon_interior"]}

# ---------------------------------------------------------------- geometrías por región
M["archivos_region"] = []
for (r,) in q("SELECT DISTINCT cod_region FROM g ORDER BY 1"):
    f = f"{OUT}/censo_manzana_geo_{r}.parquet"
    con.execute(f"""COPY (SELECT cod_manzana, geometry FROM g WHERE cod_region='{r}' ORDER BY cod_manzana)
                    TO '{f}' (FORMAT parquet, COMPRESSION zstd)""")
    M["archivos_region"].append((r, q(f"SELECT count(*) FROM '{f}'")[0][0]))

con.execute(f"""COPY (SELECT lpad(CAST(CUT AS VARCHAR),5,'0') AS cod_comuna, COMUNA AS nombre_comuna,
                 lpad(CAST(COD_REGION AS VARCHAR),2,'0') AS cod_region, {TR} AS geometry
                 FROM {capa('Comunal')} ORDER BY 1) TO '{OUT}/censo_comuna_geo.parquet' (FORMAT parquet, COMPRESSION zstd)""")
con.execute(f"""COPY (SELECT lpad(CAST(COD_REGION AS VARCHAR),2,'0') AS cod_region, REGION AS nombre_region, {TR} AS geometry
                 FROM {capa('Regional')} ORDER BY 1) TO '{OUT}/censo_region_geo.parquet' (FORMAT parquet, COMPRESSION zstd)""")
M["comuna_geo_filas"] = q(f"SELECT count(*), count(DISTINCT cod_comuna) FROM '{OUT}/censo_comuna_geo.parquet'")[0]
M["region_geo_filas"] = q(f"SELECT count(*) FROM '{OUT}/censo_region_geo.parquet'")[0][0]
M["comuna_geo_invalidas"] = q(f"SELECT count(*) FROM '{OUT}/censo_comuna_geo.parquet' WHERE NOT ST_IsValid(geometry)")[0][0]
M["region_geo_invalidas"] = q(f"SELECT count(*) FROM '{OUT}/censo_region_geo.parquet' WHERE NOT ST_IsValid(geometry)")[0][0]

# ---------------------------------------------------------------- quinquenales (hoja 4)
wb = openpyxl.load_workbook(D1, read_only=True, data_only=True)
filas = list(wb["4"].iter_rows(values_only=True))
hdr = next(i for i, r in enumerate(filas) if r and r[0] == "Código región")
reg = []
for r in filas[hdr + 1:]:
    if not isinstance(r[0], int) or not isinstance(r[4], int) or r[4] == 0:
        continue  # fila país, notas o vacías
    reg.append((str(r[0]).zfill(2), r[1], str(r[4]).zfill(5), r[5], str(r[6]).strip(), r[7]))
con.execute("CREATE TABLE q5 (cod_region VARCHAR, nombre_region VARCHAR, cod_comuna VARCHAR, nombre_comuna VARCHAR, grupo VARCHAR, pob BIGINT)")
con.executemany("INSERT INTO q5 VALUES (?,?,?,?,?,?)", reg)
M["q5_grupos"] = [g for (g,) in q("SELECT DISTINCT grupo FROM q5 ORDER BY 1")]
M["q5_no_numericos"] = sum(1 for x in reg if not isinstance(x[5], int))

esperados = {f"{a} a {a + 4}" for a in range(0, 85, 5)} | {"85 o más", "Total Comuna"}
assert set(M["q5_grupos"]) == esperados, set(M["q5_grupos"]) ^ esperados
lo = "TRY_CAST(split_part(grupo, ' ', 1) AS INTEGER)"
con.execute(f"""
CREATE TABLE qc AS
SELECT cod_comuna, any_value(nombre_comuna) nombre_comuna, any_value(cod_region) cod_region, any_value(nombre_region) nombre_region,
  sum(pob) FILTER (WHERE grupo = 'Total Comuna') AS pob_total,
  sum(pob) FILTER (WHERE grupo <> 'Total Comuna' AND {lo} < 65) AS pob_0_64,
  sum(pob) FILTER (WHERE grupo <> 'Total Comuna' AND {lo} BETWEEN 65 AND 74) AS pob_65_74,
  sum(pob) FILTER (WHERE grupo <> 'Total Comuna' AND {lo} BETWEEN 75 AND 84) AS pob_75_84,
  sum(pob) FILTER (WHERE grupo = '85 o más') AS pob_85_mas,
  sum(pob) FILTER (WHERE grupo <> 'Total Comuna') AS suma_grupos
FROM q5 GROUP BY cod_comuna
""")
M["q5_total_vs_grupos"] = q("SELECT count(*) FILTER (WHERE pob_total <> suma_grupos) FROM qc")[0][0]

# ---------------------------------------------------------------- censo_comuna.parquet
con.execute("""
CREATE TABLE censo_comuna AS
WITH m AS (
  SELECT cod_comuna, count(*) n_manzanas, sum(mayores) mayores, sum(viviendas) viviendas,
         sum(viviendas_hacinadas) viviendas_hacinadas,
         sum(lat * poblacion) FILTER (WHERE poblacion > 0 AND lat IS NOT NULL)
           / sum(poblacion) FILTER (WHERE poblacion > 0 AND lat IS NOT NULL) AS lat_centro,
         sum(lon * poblacion) FILTER (WHERE poblacion > 0 AND lat IS NOT NULL)
           / sum(poblacion) FILTER (WHERE poblacion > 0 AND lat IS NOT NULL) AS lon_centro
  FROM censo_manzana GROUP BY 1)
SELECT qc.cod_comuna, qc.nombre_comuna, qc.cod_region, qc.nombre_region,
       CAST(qc.pob_total AS INTEGER) pob_total, CAST(qc.pob_0_64 AS INTEGER) pob_0_64, CAST(qc.pob_65_74 AS INTEGER) pob_65_74,
       CAST(qc.pob_75_84 AS INTEGER) pob_75_84, CAST(qc.pob_85_mas AS INTEGER) pob_85_mas,
       CAST(coalesce(m.n_manzanas, 0) AS INTEGER) AS n_manzanas, CAST(m.mayores AS INTEGER) mayores,
       CAST(m.viviendas AS INTEGER) viviendas, CAST(m.viviendas_hacinadas AS INTEGER) viviendas_hacinadas,
       m.lat_centro, m.lon_centro
FROM qc LEFT JOIN m USING (cod_comuna)
ORDER BY qc.cod_region, qc.cod_comuna
""")
con.execute(f"COPY (SELECT * FROM censo_comuna ORDER BY cod_region, cod_comuna) TO '{OUT}/censo_comuna.parquet' (FORMAT parquet, COMPRESSION zstd)")

# ---------------------------------------------------------------- controles
C = {}
C["c1"] = q("SELECT count(*), count(DISTINCT cod_region), count(DISTINCT cod_comuna) FROM censo_comuna")[0]
C["c2"] = q("SELECT sum(pob_total) FROM censo_comuna")[0][0]
C["c2_suma_grupos"] = q("SELECT sum(pob_0_64+pob_65_74+pob_75_84+pob_85_mas) FROM censo_comuna")[0][0]
C["c3"] = q("""
  WITH mz AS (SELECT cod_region, sum(poblacion) p FROM censo_manzana GROUP BY 1),
       ct AS (SELECT lpad(COD_REGION,2,'0') cod_region, sum(CAST(n_per AS BIGINT)) p FROM b WHERE CONTENEDOR_COMUNAL='1' GROUP BY 1),
       co AS (SELECT cod_region, any_value(nombre_region) n, sum(pob_total) p FROM censo_comuna GROUP BY 1)
  SELECT co.cod_region, co.n, co.p, mz.p, co.p - mz.p, ct.p FROM co LEFT JOIN mz USING (cod_region) LEFT JOIN ct USING (cod_region)
  ORDER BY 1""")
C["c3_comuna_base_vs_d1"] = q("""
  WITH bb AS (SELECT lpad(CUT,5,'0') cod_comuna, sum(CAST(n_per AS BIGINT)) p FROM b GROUP BY 1)
  SELECT count(*) FILTER (WHERE bb.p IS DISTINCT FROM c.pob_total), count(*) FROM censo_comuna c FULL JOIN bb USING (cod_comuna)""")[0]
C["c3_comuna_dif"] = q("""
  WITH bb AS (SELECT lpad(CUT,5,'0') cod_comuna, sum(CAST(n_per AS BIGINT)) p FROM b GROUP BY 1)
  SELECT c.cod_comuna, c.nombre_comuna, c.pob_total, bb.p FROM censo_comuna c FULL JOIN bb USING (cod_comuna)
  WHERE bb.p IS DISTINCT FROM c.pob_total""")
C["c4_sin_geo"] = q("SELECT tipo, count(*) FROM censo_manzana WHERE lat IS NULL GROUP BY 1")
C["c4_geo_sin_datos"] = q("SELECT count(*) FROM g WHERE cod_manzana NOT IN (SELECT cod_manzana FROM censo_manzana)")[0][0]
C["c4_comuna_sin_geo"] = q(f"SELECT cod_comuna, nombre_comuna FROM censo_comuna WHERE cod_comuna NOT IN (SELECT cod_comuna FROM '{OUT}/censo_comuna_geo.parquet')")
C["c4_comuna_sin_centro"] = q("SELECT cod_comuna, nombre_comuna, n_manzanas FROM censo_comuna WHERE lat_centro IS NULL")
C["c5_largo"] = q("SELECT length(cod_manzana), count(*) FROM censo_manzana GROUP BY 1 ORDER BY 1")
C["c5_largo14"] = q("SELECT length(cod_manzana_14), count(*) FROM censo_manzana GROUP BY 1 ORDER BY 1")
C["c5_rm"] = q("SELECT tipo, count(*), count(DISTINCT cod_comuna), count(*) FILTER (WHERE length(cod_manzana)=14) FROM censo_manzana WHERE cod_region='13' GROUP BY 1 ORDER BY 1")
C["c5_rm_pob"] = q("SELECT count(*), count(DISTINCT cod_comuna) FROM censo_manzana WHERE cod_region='13' AND tipo='manzana_urbana' AND poblacion > 0")[0]
C["c5_rm_capa"] = q(f"SELECT count(*), count(DISTINCT CUT) FROM {capa('Manzanas')} WHERE COD_REGION=13 AND AREA_C='URBANO'")[0]
# extras de coherencia
C["x_suma_manzana_vs_carto"] = q(f"SELECT (SELECT sum(poblacion) FROM censo_manzana), (SELECT sum(n_per) FROM {capa('Manzanas')}) + (SELECT sum(n_per) FROM {capa('Entidades')})")[0]
C["x_centro_dentro_comuna"] = q(f"""
  SELECT count(*) FILTER (WHERE NOT ST_Intersects(ST_Point(c.lon_centro, c.lat_centro), g.geometry)), count(*)
  FROM censo_comuna c JOIN '{OUT}/censo_comuna_geo.parquet' g USING (cod_comuna) WHERE c.lat_centro IS NOT NULL""")[0]
C["x_centro_fuera_lista"] = q(f"""
  SELECT c.cod_comuna, c.nombre_comuna FROM censo_comuna c JOIN '{OUT}/censo_comuna_geo.parquet' g USING (cod_comuna)
  WHERE c.lat_centro IS NOT NULL AND NOT ST_Intersects(ST_Point(c.lon_centro, c.lat_centro), g.geometry)""")
C["x_mayores_vs_q5"] = q("SELECT sum(mayores), sum(pob_65_74+pob_75_84+pob_85_mas) FROM censo_comuna")[0]
C["x_bbox"] = q("SELECT min(lat), max(lat), min(lon), max(lon) FROM censo_manzana")[0]
C["x_pct_rango"] = q("SELECT min(pct_mayores), max(pct_mayores), count(*) FILTER (WHERE mayores > poblacion) FROM censo_manzana")[0]
C["x_crs_meta"] = q(f"SELECT decode(value) FROM parquet_kv_metadata('{OUT}/censo_comuna_geo.parquet') WHERE decode(key)='geo'")[0][0]

M["controles"] = C
M["tamanos"] = {f: os.path.getsize(os.path.join(OUT, f)) for f in sorted(os.listdir(OUT)) if f.endswith(".parquet")}
with open(os.path.join(TMP, "metricas.json"), "w") as fh:
    json.dump(M, fh, ensure_ascii=False, indent=1, default=str)
print(json.dumps(M, ensure_ascii=False, indent=1, default=str))
