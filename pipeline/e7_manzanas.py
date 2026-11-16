"""Etapa 6 · Puntos de manzana por comuna, para ver su distribución en el mapa de riesgo desde cualquier altura.

Las teselas de manzanas solo existen desde el nivel de acercamiento 12. Más lejos, el mapa dibuja un punto por manzana
(su punto interior) con la misma regla de color. Solo entran las manzanas con población.

Salida: public/manzanas/<cod_comuna>.json  {x: [lon], y: [lat], p: [población], m: [mayores], n: [niños 0-5], d: [discapacidad]}
Uso: python e7_manzanas.py
"""
import json
import shutil

import duckdb

from rutas import PLATAFORMA, TRABAJO

OUT = PLATAFORMA / "public" / "manzanas"
if OUT.exists():
    shutil.rmtree(OUT)
OUT.mkdir(parents=True)
con = duckdb.connect()
filas = con.sql(f"""select cod_comuna, list(round(coalesce(lon_interior, lon), 5) order by cod_manzana), list(round(coalesce(lat_interior, lat), 5) order by cod_manzana),
    list(poblacion order by cod_manzana), list(coalesce(mayores, 0) order by cod_manzana), list(coalesce(ninos_0_5, 0) order by cod_manzana),
    list(coalesce(discapacidad, 0) order by cod_manzana)
  from '{TRABAJO}/manzana.parquet' where poblacion > 0 and coalesce(lon_interior, lon) is not null group by 1""").fetchall()
n = 0
for cod, x, y, p, m, ni, d in filas:
    (OUT / f"{cod}.json").write_text(json.dumps({"x": x, "y": y, "p": p, "m": m, "n": ni, "d": d}, separators=(",", ":"), allow_nan=False))
    n += len(x)
tam = sum(f.stat().st_size for f in OUT.glob("*.json")) / 1e6
print(f"  public/manzanas: {len(filas)} comunas, {n:,} manzanas con población, {tam:.1f} MB")
