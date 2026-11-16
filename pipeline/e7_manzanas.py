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
# Capa AURA (solo uso local; public/manzanas_aura está en .gitignore y no se publica sin autorización de AURA):
# diferencia de temperatura de verano de día de cada manzana respecto del promedio de su comuna, en el mismo orden.
AURA = TRABAJO / "manzana_aura.parquet"
if AURA.exists():
    OUTA = PLATAFORMA / "public" / "manzanas_aura"
    if OUTA.exists():
        shutil.rmtree(OUTA)
    OUTA.mkdir()
    for cod, dif in con.sql(f"""select m.cod_comuna, list(round(a.dif_temp_dia, 2) order by m.cod_manzana)
          from '{TRABAJO}/manzana.parquet' m left join '{AURA}' a on a.cod_manzana_14 = m.cod_manzana_14
          where m.poblacion > 0 and coalesce(m.lon_interior, m.lon) is not null and m.cod_region = '13' group by 1""").fetchall():
        if any(v is not None for v in dif):
            (OUTA / f"{cod}.json").write_text(json.dumps({"dif": dif}, separators=(",", ":")))
    print(f"  public/manzanas_aura: {len(list(OUTA.glob('*.json')))} comunas de la RM (no se publica)")
tam = sum(f.stat().st_size for f in OUT.glob("*.json")) / 1e6
print(f"  public/manzanas: {len(filas)} comunas, {n:,} manzanas con población, {tam:.1f} MB")
