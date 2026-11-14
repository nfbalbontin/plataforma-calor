"""Rutas de insumos y salidas del proceso externo (corre en el computador, no en Vercel).

Los insumos son las tablas depuradas; este proceso no modifica ninguna.
"""
import json
import os
from pathlib import Path

PLATAFORMA = Path(__file__).resolve().parent.parent
ANALISIS = PLATAFORMA.parent

# Insumos (tablas depuradas). Se pueden cambiar con variables de entorno.
CENSO = Path(os.environ.get("CALOR_CENSO", "/Users/Macbook/Documents/New project/depurado/censo"))
# Tablas del DEIS: la depuración nacional si existe; si no, la de la RM.
_NAC = ANALISIS / "depurado_nacional"
DEIS = Path(os.environ.get("CALOR_DEIS", _NAC if (_NAC / "comuna_dia.parquet").exists() else ANALISIS / "depurado"))
ESTABLECIMIENTOS_NACIONAL = Path(os.environ.get(
    "CALOR_ESTABLECIMIENTOS", Path.home() / "Downloads" / "establecimientos_20261110.csv"))

# Salidas
DATOS = PLATAFORMA / "datos"              # JSON que leen las páginas (versionado)
TESELAS = PLATAFORMA / "public" / "teselas"
DESCARGAS = PLATAFORMA / "public" / "descargas"
TRABAJO = PLATAFORMA / ".trabajo"          # intermedios; no se versiona
CONFIG = PLATAFORMA / "config"

for d in (DATOS, TESELAS, DESCARGAS, TRABAJO):
    d.mkdir(parents=True, exist_ok=True)


def guardar(nombre, objeto):
    ruta = DATOS / nombre
    ruta.parent.mkdir(parents=True, exist_ok=True)
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(objeto, f, ensure_ascii=False, separators=(",", ":"), allow_nan=False)  # falla si queda un NaN
    print(f"  {ruta.relative_to(PLATAFORMA)}  {ruta.stat().st_size/1024:.0f} KB")


def leer_config(nombre):
    with open(CONFIG / nombre, encoding="utf-8") as f:
        return json.load(f)
