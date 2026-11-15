"""Etapa 6 · Insumos fijos del módulo de riesgo: clima propio de las comunas que ya tienen serie histórica.

Para comparar el pronóstico de una comuna con su propia historia se guardan los cuantiles del promedio de la
temperatura máxima del día y de los 3 días anteriores (temporada cálida). Las comunas sin serie propia usan la
temperatura de la capital de su región, igual que el modelo.

Salida: datos/clima_comunas.json  {cod_comuna: {"q": [101 cuantiles], "temporadas": n}}
Uso: python e6_riesgo.py
"""
import json

import numpy as np

from rutas import DATOS, TRABAJO, guardar

HIST = TRABAJO / "clima"
grupos = json.loads((HIST / "grupos.json").read_text())
MINIMO = 10          # temporadas
salida = {}
for cod, g in sorted(grupos.items()):
    carpeta = HIST / g["rep"]
    archivos = sorted(carpeta.glob("*.json")) if carpeta.exists() else []
    if len(archivos) < MINIMO:
        continue
    xs = []
    for f in archivos:
        t = [v + g["dif"]["tmax"] for v in json.loads(f.read_text())["tmax"] if v is not None]
        xs += [float(np.mean(t[max(0, i - 3):i + 1])) for i in range(len(t))]
    salida[cod] = {"q": np.round(np.percentile(xs, np.arange(0, 101)), 2).tolist(), "temporadas": len(archivos)}
guardar("clima_comunas.json", {"nota": "Cuantiles 0 a 100 del promedio de la máxima del día y de los 3 días anteriores, noviembre a marzo.",
                               "minimo_temporadas": MINIMO, "comunas": salida})
print(f"  comunas con clima propio: {len(salida)} de {len(grupos)}")
