"""Controles automáticos sobre lo generado (RNF-04, RNF-08). Termina con error si alguno falla.

Uso: python controles.py
"""
import json
import sys

import duckdb
from pmtiles.reader import MmapSource, Reader

from rutas import CONFIG, DATOS, DESCARGAS, TESELAS, TRABAJO

fallas = []


def control(nombre, ok, detalle=""):
    print(("  ✔ " if ok else "  ✘ ") + nombre + (f": {detalle}" if detalle else ""))
    if not ok:
        fallas.append(nombre)


con = duckdb.connect()
mz = f"'{TRABAJO}/manzana.parquet'"
n = con.execute(f"select count(*) from {mz} where poblacion < 20 and pct_mayores is not null").fetchone()[0]
control("Sin porcentajes en manzanas con menos de 20 habitantes (RNF-08)", n == 0, f"{n} filas")
n = con.execute(f"select count(*) from {mz} where clase_prioridad not in ('alta','media','sin') or clase_prioridad is null").fetchone()[0]
control("Toda manzana tiene clase de prioridad", n == 0, f"{n} sin clase")
tot, alta = con.execute(f"select count(*), count(*) filter (where clase_prioridad='alta') from {mz}").fetchone()
control("Manzanas del país en la tabla de trabajo", tot == 196647, f"{tot}")

archivos = sorted(TESELAS.glob("*.pmtiles"))
base = [a for a in archivos if "_aura" not in a.name]
control("17 archivos de teselas (Chile + 16 regiones)", len(base) == 17, f"{len(base)}")
for a in archivos:
    mb = a.stat().st_size / 1e6
    with open(a, "rb") as f:
        r = Reader(MmapSource(f))
        h = r.header()
        capas = [c["id"] for c in r.metadata().get("vector_layers", [])]
    control(f"{a.name} bajo 100 MB (RNF-04)", mb < 100, f"{mb:.1f} MB, zoom {h['min_zoom']}-{h['max_zoom']}, capas {capas}")
    if a.name.startswith("manzanas_"):
        campos = next(c["fields"] for c in json.loads(json.dumps(r.metadata()))["vector_layers"] if c["id"] == "manzanas")
        control(f"{a.name}: sin nombres, direcciones ni muertes entre los atributos", not any(k for k in campos if any(x in k for x in ("nombre", "direccion", "def_", "muerte"))))
        if "_aura" not in a.name:
            control(f"{a.name}: sin atributos de AURA (el módulo va en archivo aparte)", not any(k in campos for k in ("dif_temp_dia", "isla_calor", "humidex")))

comunas = json.loads((DATOS / "comunas.json").read_text())
control("346 comunas y 16 regiones", len(comunas) == 346 and len({c["cod_region"] for c in comunas}) == 16)
prov = json.loads((DATOS / "provincias.json").read_text())
control("56 provincias que cubren las 346 comunas", len(prov) == 56 and sum(len(p["comunas"]) for p in prov) == 346, f"{len(prov)} provincias")
drd = json.loads((DATOS / "def_region_dia.json").read_text())
control("Defunciones diarias: el país es la suma de las 16 regiones", all(
    sum(drd["territorios"][r]["total"][i] for r in drd["territorios"] if r != "00") == drd["territorios"]["00"]["total"][i] for i in (0, 1000, 3000, len(drd["territorios"]["00"]["total"]) - 1)))
control("Población nacional del Censo 2024", sum(c["pob"]["total"] for c in comunas) == 18480432, str(sum(c["pob"]["total"] for c in comunas)))
control("Una lista descargable por comuna", len(list((DESCARGAS / "manzanas").glob("*.csv"))) == 346)
um = json.loads((CONFIG / "umbrales.json").read_text())
malos = [k for k, u in um["comunas"].items() if not (u["p50"] < u["p90"] < u["p95"] < u["p99"])]
control("Umbrales ordenados (p50 < p90 < p95 < p99) en cada comuna", not malos, f"{len(um['comunas'])} comunas con umbral; {len(malos)} con error")
for nombre in ("comunas", "regiones", "establecimientos", "dependencia", "vigilancia", "urgencias", "comuna_mes", "episodios", "impactlab",
               "provincias", "def_region_dia", "def_comuna_mes", "def_calor_certificado", "manzana_stats", "urg_establecimiento", "evidencia_alerta",
               "motor_insumos", "proyeccion_mensual"):
    try:
        json.loads((DATOS / f"{nombre}.json").read_text(), parse_constant=lambda c: (_ for _ in ()).throw(ValueError(c)))
        ok = True
    except Exception as e:  # noqa: BLE001
        ok = False
    control(f"datos/{nombre}.json es JSON válido (sin NaN)", ok)
# Motor de cálculo de los paneles de análisis
if (DATOS / "motor_insumos.json").exists():
    mi = json.loads((DATOS / "motor_insumos.json").read_text())
    pm = json.loads((CONFIG / "parametros_motor.json").read_text())
    control("Motor: la población por tramo suma la población nacional del Censo", sum(sum(r["pob"]) for r in mi["regiones"].values()) == 18480432
            and sum(sum(c["pob"]) for c in mi["comunas"].values()) == 18480432)
    control("Motor: tasas base positivas y crecientes con la edad en cada región", all(0 < r["tasa"][1] < r["tasa"][2] < r["tasa"][3] for r in mi["regiones"].values()))
    control("Motor: RR y coeficientes ordenados (bajo ≤ alto)", 1 < pm["rr"]["bajo"] <= pm["rr"]["alto"] and pm["coef_verde"]["alto"] <= pm["coef_verde"]["bajo"] <= 0)
    con_clima = [k for k, r in mi["regiones"].items() if r["clima"]]
    control("Motor: regiones con clima histórico de su capital", len(con_clima) >= 1, f"{len(con_clima)} de 16: {con_clima}")
    control("Motor: ningún exceso negativo ni mayor que 20 °C", all(0 < e <= 20 for r in mi["regiones"].values() if r["clima"] for e in r["clima"]["excesos"]))

# Módulo AURA (solo si está construido)
if (DATOS / "aura.json").exists():
    au = json.loads((DATOS / "aura.json").read_text())
    r = au["resumen"]
    control("AURA: al menos 95 % de las manzanas urbanas de la RM con dato", r["censo_urbanas_con_aura"] / r["censo_urbanas_rm"] >= 0.95,
            f"{r['censo_urbanas_con_aura']} de {r['censo_urbanas_rm']}")
    n = con.execute(f"select count(*) from '{TRABAJO}/manzana_aura.parquet' where abs(dif_temp_dia) > 8 or abs(dif_temp_noche) > 8").fetchone()[0]
    control("AURA: ninguna diferencia de temperatura fuera de ±8 °C", n == 0, f"{n} manzanas")
    n = con.execute(f"""select count(*) from '{TRABAJO}/manzana_aura.parquet' a join {mz} m using (cod_manzana_14)
                        where a.clase_prioridad = 'alta' and a.aplica and not (a.calor_q5 and m.clase_prioridad = 'alta')""").fetchone()[0]
    control("AURA: toda manzana de clase alta está en el quintil superior de mayores y de calor", n == 0, f"{n} fuera de la regla")
    control("AURA: teselas del módulo en archivo aparte y bajo 100 MB", (TESELAS / "manzanas_13_aura.pmtiles").exists()
            and (TESELAS / "manzanas_13_aura.pmtiles").stat().st_size < 100e6)
print("\nTodos los controles pasan." if not fallas else f"\n{len(fallas)} controles fallan.")
sys.exit(1 if fallas else 0)
