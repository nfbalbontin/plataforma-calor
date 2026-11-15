"""Serie histórica de temperatura por comuna (Open-Meteo, reanálisis ERA5; CC BY 4.0).

Sirve para los percentiles locales (S3) y para los episodios pasados (RF-11).
Open-Meteo es un modelo en grilla, no una medición (S8).

La API gratuita cuenta cada consulta según los días pedidos: una temporada cálida
(1-nov a 31-mar) de un punto pesa unas 20 llamadas, y el límite es de 10.000 al día
y 5.000 por hora. Por eso el programa:
  1. sondea a qué celda de la grilla cae cada comuna y agrupa las que comparten celda
     (difieren solo en una constante por altitud, que se mide en el sondeo);
  2. baja una temporada por celda, en orden de prioridad, hasta agotar el presupuesto;
  3. se puede volver a ejecutar: no repite lo ya descargado.

Uso: python p5_clima_historico.py [--presupuesto 4000] [--por-minuto 60] [--solo-sondeo] [--bloques 3]
"""
import argparse
import json
import subprocess
import sys
import time
import urllib.parse
from pathlib import Path

from rutas import DATOS, TRABAJO

URL = "https://archive-api.open-meteo.com/v1/archive"
MODELO = "era5_seamless"
VARS = "temperature_2m_mean,temperature_2m_max,temperature_2m_min"
HIST = TRABAJO / "clima"
HIST.mkdir(parents=True, exist_ok=True)
SONDEO = HIST / "sondeo.json"
SONDEO_FECHAS = ("2020-01-01", "2020-01-13")


class LimiteDiario(Exception):
    pass


def peso(dias, n_puntos=1):
    """Estimación prudente del costo en llamadas (la página de precios da: 4 semanas = 3 llamadas)."""
    return max(1.0, dias / 7 - 1) * n_puntos


def consultar(puntos, inicio, fin):
    params = urllib.parse.urlencode({
        "latitude": ",".join(str(p[1]) for p in puntos), "longitude": ",".join(str(p[0]) for p in puntos),
        "start_date": inicio, "end_date": fin, "daily": VARS, "models": MODELO, "timezone": "auto"})
    espera = 30
    for intento in range(40):   # el servidor histórico se cae a ratos: se insiste con esperas crecientes
        # curl del sistema con IPv4: el Python 3.9 de macOS falla con este servidor y por IPv6 se cuelga.
        r = subprocess.run(["curl", "-s", "-4", "-m", "90", URL + "?" + params], capture_output=True, text=True)
        try:
            d = json.loads(r.stdout)
        except ValueError:
            print(f"    respuesta ilegible (curl {r.returncode}); reintento en {espera}s", flush=True)
            time.sleep(espera)
            espera = min(300, espera + 30)
            continue
        if isinstance(d, dict) and d.get("error"):
            motivo = str(d.get("reason", ""))
            if "aily" in motivo:
                raise LimiteDiario(motivo)
            if "limit" in motivo.lower():
                espera = 660 if "ourly" in motivo else 65
                print(f"    límite ({motivo}); espero {espera}s", flush=True)
                time.sleep(espera)
                continue
            raise RuntimeError(motivo)
        return d if isinstance(d, list) else [d]
    raise RuntimeError("sin respuesta de Open-Meteo")


def sondear(comunas):
    """Celda de grilla de cada comuna y diferencia constante respecto de la comuna representante."""
    s = json.loads(SONDEO.read_text()) if SONDEO.exists() else {}
    falta = [c for c in comunas if c["cod"] not in s]
    gastado = 0
    for i in range(0, len(falta), 25):
        lote = falta[i:i + 25]
        res = consultar([c["punto_clima"] for c in lote], *SONDEO_FECHAS)
        gastado += len(lote)
        for c, d in zip(lote, res):
            s[c["cod"]] = {"celda": f"{d['latitude']:.3f}_{d['longitude']:.3f}", "elevacion": d.get("elevation"),
                           "tmean": d["daily"]["temperature_2m_mean"], "tmax": d["daily"]["temperature_2m_max"],
                           "tmin": d["daily"]["temperature_2m_min"]}
        SONDEO.write_text(json.dumps(s))
        print(f"  sondeo {min(i + 25, len(falta))}/{len(falta)}", flush=True)
        time.sleep(3)
    return s, gastado


def agrupar(comunas, s):
    """Devuelve {cod: (cod_representante, {var: diferencia})}. Representante = comuna con más personas de 65+."""
    peso65 = {c["cod"]: c["pob"]["e65_74"] + c["pob"]["e75_84"] + c["pob"]["e85_mas"] for c in comunas}
    celdas = {}
    for c in comunas:
        celdas.setdefault(s[c["cod"]]["celda"], []).append(c["cod"])
    grupo = {}
    for cods in celdas.values():
        rep = max(cods, key=lambda k: peso65[k])
        for cod in cods:
            dif, constante = {}, True
            for v in ("tmean", "tmax", "tmin"):
                ds = [a - b for a, b in zip(s[cod][v], s[rep][v]) if a is not None and b is not None]
                m = sum(ds) / len(ds)
                if max(abs(x - m) for x in ds) > 0.15:
                    constante = False
                dif[v] = round(m, 2)
            grupo[cod] = (rep, dif) if constante else (cod, {"tmean": 0, "tmax": 0, "tmin": 0})
    return grupo


def temporada(t):
    return f"{t - 1}-11-01", f"{t}-03-31"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--presupuesto", type=float, default=4000)
    ap.add_argument("--por-minuto", type=float, default=60)
    ap.add_argument("--solo-sondeo", action="store_true")
    ap.add_argument("--ultima-temporada", type=int, default=2026)
    ap.add_argument("--solo-capitales", action="store_true", help="solo las celdas de las capitales regionales, todas las temporadas")
    ap.add_argument("--bloques", default="", help="lista de bloques a procesar, p. ej. 3 (capitales regionales); vacío = todos")
    a = ap.parse_args()

    comunas = [c for c in json.loads((DATOS / "comunas.json").read_text()) if c["punto_clima"]]
    por_cod = {c["cod"]: c for c in comunas}
    gastado = 0.0
    try:
        s, g = sondear(comunas)
        gastado += g
    except LimiteDiario as e:
        print("límite diario alcanzado en el sondeo:", e)
        return 2
    grupo = agrupar(comunas, s)
    reps = sorted(set(r for r, _ in grupo.values()))
    (HIST / "grupos.json").write_text(json.dumps({k: {"rep": v[0], "dif": v[1]} for k, v in grupo.items()}))
    rm = [r for r in reps if r.startswith("13")]
    print(f"  comunas: {len(comunas)} | celdas distintas: {len(reps)} | en la RM: {len(rm)} de "
          f"{sum(1 for c in comunas if c['cod_region'] == '13')} comunas", flush=True)
    if a.solo_sondeo:
        return 0

    # Población de 65+ que representa cada celda, para ordenar.
    carga = {}
    for cod, (rep, _) in grupo.items():
        p = por_cod[cod]["pob"]
        carga[rep] = carga.get(rep, 0) + p["e65_74"] + p["e75_84"] + p["e85_mas"]
    capital = {grupo[f"{r}101"][0] for r in ("%02d" % i for i in range(1, 17)) if f"{r}101" in grupo}
    base_v0 = list(range(2020, 2010, -1))                       # temporadas 2010-11 a 2019-20
    recientes = list(range(a.ultima_temporada, 2020, -1)) + [2010]
    antiguas = list(range(2009, 1990, -1))                      # completa 1991-2020
    cola = []
    for rep in reps:
        es_rm, es_cap = rep.startswith("13"), rep in capital
        for t in base_v0 + recientes + antiguas:
            if es_rm and es_cap and t >= 2010:
                bloque = 0
            elif es_rm and t in base_v0:
                bloque = 1
            elif es_rm and t in recientes:
                bloque = 2
            elif es_cap and t >= 2010:
                bloque = 3
            elif t in base_v0:
                bloque = 4
            elif es_rm:
                bloque = 5
            elif t in recientes:
                bloque = 6
            else:
                bloque = 7
            if not (HIST / rep / f"{t}.json").exists():
                cola.append((bloque, -carga[rep], -t, rep, t))
    if a.bloques:
        permitidos = {int(b) for b in a.bloques.split(",")}
        cola = [x for x in cola if x[0] in permitidos]
    if a.solo_capitales:
        cola = [x for x in cola if x[3] in capital]
    cola.sort(key=lambda x: (x[2], x[3])) if a.solo_capitales else cola.sort()
    print(f"  pendientes: {len(cola)} temporadas-celda; presupuesto de esta corrida: {a.presupuesto:.0f} llamadas", flush=True)

    hechas = 0
    try:
        while cola and gastado < a.presupuesto:
            # Lote: hasta 4 celdas de la misma temporada y bloque.
            b0, _, _, _, t0 = cola[0]
            lote = [x for x in cola if x[0] == b0 and x[4] == t0][:4]
            ini, fin = temporada(t0)
            dias = (time.mktime(time.strptime(fin, "%Y-%m-%d")) - time.mktime(time.strptime(ini, "%Y-%m-%d"))) / 86400 + 1
            costo = peso(dias, len(lote))
            if gastado + costo > a.presupuesto:
                break
            t_ini = time.time()
            res = consultar([por_cod[x[3]]["punto_clima"] for x in lote], ini, fin)
            for x, d in zip(lote, res):
                carpeta = HIST / x[3]
                carpeta.mkdir(exist_ok=True)
                (carpeta / f"{x[4]}.json").write_text(json.dumps({
                    "fecha": d["daily"]["time"], "tmean": d["daily"]["temperature_2m_mean"],
                    "tmax": d["daily"]["temperature_2m_max"], "tmin": d["daily"]["temperature_2m_min"]}))
                cola.remove(x)
            gastado += costo
            hechas += len(lote)
            if hechas % 20 < len(lote):
                print(f"  {hechas} temporadas-celda | ~{gastado:.0f} llamadas | bloque {b0} temporada {t0} | quedan {len(cola)}", flush=True)
            # Ritmo: no más de --por-minuto llamadas ponderadas.
            time.sleep(max(0.5, costo / a.por_minuto * 60 - (time.time() - t_ini)))
    except LimiteDiario as e:
        print("  límite diario de Open-Meteo alcanzado; se retoma mañana:", e, flush=True)
    print(f"  corrida terminada: {hechas} temporadas-celda, ~{gastado:.0f} llamadas; quedan {len(cola)}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
