"""Umbrales por percentil local (S3, S4) y episodios de calor pasados (RF-11).

Insumos: .trabajo/clima (serie histórica de Open-Meteo por celda), datos/vigilancia.json,
         .trabajo/region_dia.parquet.
Salidas: config/umbrales.json (archivo versionado, RNF-17) y datos/episodios.json.

Percentiles con interpolación lineal sobre los días de noviembre a marzo de las temporadas
disponibles entre 1990-91 y 2019-20 (serie 1991-2020). Mientras la descarga no esté completa,
la versión se marca como provisional y declara qué temporadas usó cada comuna.
"""
import datetime as dt
import json

import duckdb
import numpy as np

from rutas import CONFIG, DATOS, TRABAJO, guardar, leer_config

HIST = TRABAJO / "clima"
MIN_TEMPORADAS = 10
grupos = json.loads((HIST / "grupos.json").read_text())
comunas = json.loads((DATOS / "comunas.json").read_text())
cfg_ep = leer_config("episodios.json")

series = {}  # rep -> {temporada: {fecha, tmean, tmax, tmin}}


def serie(rep):
    if rep not in series:
        carpeta = HIST / rep
        series[rep] = {int(f.stem): json.loads(f.read_text()) for f in carpeta.glob("*.json")} if carpeta.exists() else {}
    return series[rep]


# --- Umbrales ---------------------------------------------------------------
um = {}
for c in comunas:
    g = grupos.get(c["cod"])
    if not g:
        continue
    s = serie(g["rep"])
    base = sorted(t for t in s if 1991 <= t <= 2020)
    if len(base) < MIN_TEMPORADAS:
        continue
    v = {k: np.array([x for t in base for x in s[t][k] if x is not None], dtype=float) + g["dif"][k] for k in ("tmean", "tmax", "tmin")}
    um[c["cod"]] = {
        "p50": round(float(np.percentile(v["tmean"], 50)), 2), "p90": round(float(np.percentile(v["tmean"], 90)), 2),
        "p95": round(float(np.percentile(v["tmean"], 95)), 2), "p99": round(float(np.percentile(v["tmean"], 99)), 2),
        "tmax_p90": round(float(np.percentile(v["tmax"], 90)), 2), "tmin_p90": round(float(np.percentile(v["tmin"], 90)), 2),
        "n_dias": int(len(v["tmean"])), "temporadas": f"{base[0] - 1}-{str(base[0])[2:]} a {base[-1] - 1}-{str(base[-1])[2:]} ({len(base)})",
    }
completas = sum(1 for u in um.values() if u["temporadas"].endswith("(30)"))
provisional = completas < len(um) or len(um) < sum(1 for c in comunas if c["punto_clima"])
hoy = dt.date.today().isoformat()
con_punto = sum(1 for c in comunas if c["punto_clima"])
salida = {
    "version": "umbrales-2026.1" + ("-prov" if provisional else ""),
    "fecha": hoy,
    "base": (f"{len(um)} de {con_punto} comunas con umbral; {completas} con la serie 1991-2020 completa. "
             "Las demás usan las temporadas ya descargadas (mínimo 10) o esperan su descarga."),
    "cortes": {"1": 90, "2": 95, "3": 99},
    "variables": "Nivel: temperatura media diaria. Calor acumulado: máxima (día) y mínima (noche) sobre su percentil 90. Calor moderado: media sobre el percentil 50.",
    "periodo": "Noviembre a marzo",
    "fuente": "Open-Meteo, reanálisis ERA5 (modelo era5_seamless); elaboración propia",
    "codigo_rojo": {"aplica_region": "13", "cortes_tmax": [33, 34, 35],
                    "nota": "Cortes del supuesto S3 sobre la temperatura máxima. Falta revisar el texto vigente del Código Rojo y qué autoridad lo fija."},
    "comunas": um,
}
with open(CONFIG / "umbrales.json", "w", encoding="utf-8") as f:
    json.dump(salida, f, ensure_ascii=False, indent=1)
print(f"  umbrales {salida['version']}: {len(um)} comunas ({completas} con 30 temporadas)")

# --- Episodios --------------------------------------------------------------
vig = json.loads((DATOS / "vigilancia.json").read_text())
con = duckdb.connect()
rd = {}
if (TRABAJO / "region_dia.parquet").exists():
    for reg, f, n in con.execute(f"select cod_region, fecha, def_total from '{TRABAJO}/region_dia.parquet'").fetchall():
        rd[(reg, f.isoformat())] = n
ult_def = vig["ultima_defuncion"]
episodios = []
cobertura = []
for reg in sorted({c["cod_region"] for c in comunas}):
    cap = f"{reg}101"
    if cap not in um:
        continue
    g = grupos[cap]
    s = serie(g["rep"])
    temporadas = sorted(t for t in s if t >= 2010)
    if not temporadas:
        continue
    cobertura.append(f"{reg}: {temporadas[0] - 1}-{str(temporadas[0])[2:]} a {temporadas[-1] - 1}-{str(temporadas[-1])[2:]}")
    esp_sem = {(w["a"], w["s"]): w["total_esp"] for w in vig["regiones"].get(reg, [])}
    en_region = [c["cod"] for c in comunas if c["cod_region"] == reg and c["cod"] in um]
    for t in temporadas:
        d = s[t]
        tm = [None if x is None else x + g["dif"]["tmean"] for x in d["tmean"]]
        tx = [None if x is None else x + g["dif"]["tmax"] for x in d["tmax"]]
        i = 0
        while i < len(tm):
            j = i
            while j < len(tm) and tm[j] is not None and tm[j] >= um[cap]["p90"]:
                j += 1
            if j - i >= cfg_ep["dias_minimos"]:
                fechas = d["fecha"][i:j]
                obs, esp = 0, [0.0, 0.0, 0.0]
                completo = fechas[-1] <= ult_def
                for f in fechas:
                    iso = dt.date.fromisoformat(f).isocalendar()
                    e = esp_sem.get((iso[0], min(iso[1], 52)))
                    if (reg, f) not in rd or e is None:
                        completo = False
                        break
                    obs += rd[(reg, f)]
                    esp = [a + b / 7 for a, b in zip(esp, e)]
                niveles = {}
                for k, f in enumerate(fechas):
                    fila = {}
                    for cod in en_region:
                        gc = grupos[cod]
                        sc = serie(gc["rep"]).get(t)
                        if not sc or sc["tmean"][i + k] is None:
                            continue
                        v = sc["tmean"][i + k] + gc["dif"]["tmean"]
                        u = um[cod]
                        fila[cod] = 3 if v >= u["p99"] else 2 if v >= u["p95"] else 1 if v >= u["p90"] else 0
                    niveles[f] = fila
                ano = int(fechas[0][:4])
                episodios.append({
                    "id": f"{reg}-{fechas[0]}", "cod_region": reg, "inicio": fechas[0], "termino": fechas[-1], "dias": j - i,
                    "tmean_max": round(max(tm[i:j]), 1), "tmax_max": round(max(x for x in tx[i:j] if x is not None), 1),
                    "def_obs": obs if completo else None, "def_esp": [round(x) for x in esp] if completo else None,
                    "nota": ("Años de pandemia: la diferencia con lo esperado no se puede atribuir al calor." if 2020 <= ano <= 2022 else None),
                    "niveles": niveles,
                })
            i = max(j, i + 1)
episodios.sort(key=lambda e: e["inicio"], reverse=True)
guardar("episodios.json", {
    "version": cfg_ep["version"], "definicion": cfg_ep["definicion"], "umbrales": salida["version"],
    "cobertura": "; ".join(cobertura) if cobertura else "sin regiones con serie histórica todavía",
    "metodo_muertes": "Muertes observadas: residentes de la región fallecidos en los días del episodio (DEIS). "
                      "Esperadas: suma, día a día, de un séptimo de la mediana semanal de referencia; rango = mínimo y máximo.",
    "desde": episodios[-1]["inicio"] if episodios else None, "hasta": episodios[0]["termino"] if episodios else None,
    "episodios": episodios})
print(f"  episodios: {len(episodios)} en {len(cobertura)} regiones")
