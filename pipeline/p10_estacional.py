"""Proyección mensual: temperaturas pronosticadas por región para el motor de cálculo (Panel 3).

- Próximos 16 días: pronóstico diario de Open-Meteo (api.open-meteo.com/v1/forecast), día a día.
- Desde el día 17 hasta marzo: API estacional de Open-Meteo (seasonal-api.open-meteo.com/v1/seasonal).
  El pronóstico estacional crudo no trae ajuste de sesgo, así que no se usa su temperatura directa.
  Se usa su anomalía mensual de la temperatura máxima (ECMWF SEAS5, respecto del clima del propio
  modelo), y la dispersión entre los 51 miembros del ensamble se toma de las series diarias de cada
  miembro (promedio mensual del miembro menos promedio del ensamble).
- El motor (src/lib/motor.ts) suma esa anomalía a los días históricos de cada mes y aplica la fórmula.
  Este programa no calcula muertes.
- Punto de cada región: el centro poblado de su comuna capital, el mismo de su umbral.

Solo usa la biblioteca estándar y curl, para poder correr en GitHub Actions.
Uso: python p10_estacional.py
"""
import datetime as dt
import json
import subprocess
import sys
import time
import urllib.parse
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DATOS = RAIZ / "datos"
DIARIO = "https://api.open-meteo.com/v1/forecast"
ESTACIONAL = "https://seasonal-api.open-meteo.com/v1/seasonal"
MESES_CALIDOS = (11, 12, 1, 2, 3)


def pedir(url, params):
    for intento in range(5):
        r = subprocess.run(["curl", "-s", "-4", "-m", "120", url + "?" + urllib.parse.urlencode(params)], capture_output=True, text=True)
        try:
            d = json.loads(r.stdout)
        except ValueError:
            time.sleep(20)
            continue
        if isinstance(d, dict) and d.get("error"):
            if "limit" in str(d.get("reason", "")).lower() and intento < 4:
                time.sleep(65)
                continue
            raise RuntimeError(d.get("reason"))
        return d
    raise RuntimeError(f"sin respuesta de {url}")


def main():
    ins = json.loads((DATOS / "motor_insumos.json").read_text())
    comunas = {c["cod"]: c for c in json.loads((DATOS / "comunas.json").read_text())}
    hoy = dt.date.today()
    fin = dt.date(hoy.year + (hoy.month > 3), 3, 31)          # fin del período cálido
    dias = min(215, (fin - hoy).days + 1)
    regiones, omitidas = {}, []
    for reg, r in sorted(ins["regiones"].items()):
        cap = comunas.get(f"{reg}101")
        if not r["clima"] or not cap or not cap["punto_clima"] or dias < 1:
            omitidas.append(reg)
            continue
        lon, lat = cap["punto_clima"]
        base = {"latitude": lat, "longitude": lon, "timezone": "auto"}
        d16 = pedir(DIARIO, {**base, "daily": "temperature_2m_max", "forecast_days": 16})["daily"]
        mens = pedir(ESTACIONAL, {**base, "monthly": "temperature_max24h_2m_anomaly"})["monthly"]
        est = pedir(ESTACIONAL, {**base, "daily": "temperature_2m_max", "forecast_days": dias})["daily"]
        claves = sorted(k for k in est if k.startswith("temperature_2m_max"))
        anomalia = {f[:7]: v for f, v in zip(mens["time"], mens["temperature_max24h_2m_anomaly"]) if v is not None}
        # Dispersión: promedio mensual de cada miembro menos el promedio del ensamble.
        suma, cuenta = {}, {}
        for i, f in enumerate(est["time"]):
            for j, k in enumerate(claves):
                if est[k][i] is not None:
                    suma.setdefault(f[:7], [0.0] * len(claves))[j] += est[k][i]
                    cuenta.setdefault(f[:7], [0] * len(claves))[j] += 1
        meses = {}
        for ym in sorted(suma):
            if int(ym[5:]) not in MESES_CALIDOS or ym not in anomalia:
                continue
            medias = [s / n for s, n in zip(suma[ym], cuenta[ym]) if n]
            centro = sum(medias) / len(medias)
            meses[ym] = {"anomalia": round(anomalia[ym], 2), "desvios": [round(m - centro, 2) for m in medias],
                         "normal": r["clima"]["normal_mes"].get(str(int(ym[5:])))}
        regiones[reg] = {"capital": cap["nombre"], "umbral": r["clima"]["umbral"], "miembros": len(claves),
                         "diario": [[f, t] for f, t in zip(d16["time"], d16["temperature_2m_max"]) if t is not None], "meses": meses}
        print(f"  región {reg} ({cap['nombre']}): {len(claves)} miembros; anomalías {[(k[5:], v['anomalia']) for k, v in meses.items()]}", flush=True)
        time.sleep(4)
    if not regiones:
        print("ninguna región tiene umbral todavía")
        return 1
    salida = {
        "corrida": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "modelo": "Primeros 16 días: pronóstico diario de Open-Meteo. Después: anomalía mensual de la temperatura máxima de ECMWF SEAS5 y dispersión de los 51 miembros del ensamble (EC46 + SEAS5, grilla de 36 km)",
        "fuente": "Open-Meteo (CC BY 4.0): api.open-meteo.com/v1/forecast y seasonal-api.open-meteo.com/v1/seasonal",
        "metodo": "La anomalía de cada miembro (anomalía mensual del modelo más el desvío del miembro) se suma a los días históricos de ese mes en la capital regional. "
                  "Así no se usa la temperatura cruda del modelo estacional, que no trae ajuste de sesgo. Los pronósticos estacionales indican tendencias, no días puntuales.",
        "hasta": fin.isoformat(), "regiones_omitidas": omitidas, "regiones": regiones}
    (DATOS / "proyeccion_mensual.json").write_text(json.dumps(salida, ensure_ascii=False, separators=(",", ":"), allow_nan=False))
    print(f"  datos/proyeccion_mensual.json: {len(regiones)} regiones, hasta {fin}; sin umbral: {omitidas}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
