"""Insumos del motor de cálculo de muertes atribuibles al calor (paneles de análisis).

El motor (src/lib/motor.ts) aplica una sola fórmula:
  muertes = población_tramo × tasa_base_diaria_tramo × (RR ^ max(0, T − umbral) − 1)
Este programa solo prepara lo que la fórmula necesita; no calcula muertes.

Salida: datos/motor_insumos.json
- Población por tramo (0-14, 15-64, 65-74, 75+) por comuna y región: Censo 2024, grupos quinquenales.
- Tasa base diaria por región y tramo: defunciones DEIS de noviembre a marzo de 2015-2019 y 2023-2025
  (los mismos años de referencia de la vigilancia), dividido por población del Censo y por los días.
- Clima por territorio: umbral (percentil 90 local de la temperatura máxima del período cálido),
  máxima promedio del mes más cálido, días al año sobre el umbral y la lista de grados de exceso.
  Una comuna sin serie propia usa la de la capital de su región, y se marca.
- Validación: defunciones observadas y habituales de cada comuna en los días de episodio de calor.
- Estimación con AURA del cambio de temperatura por punto porcentual de cobertura arbórea.

Uso: python p9_motor.py
"""
import json
import os
import subprocess
from pathlib import Path

import duckdb
import openpyxl

from rutas import CONFIG, DATOS, DEIS, TRABAJO, guardar

DL = Path.home() / "Downloads"
TRAMOS = ["0-14", "15-64", "65-74", "75+"]
ANOS_REF = [2015, 2016, 2017, 2018, 2019, 2023, 2024, 2025]
MESES_CALIDOS = [11, 12, 1, 2, 3]
con = duckdb.connect()
comunas = json.loads((DATOS / "comunas.json").read_text())
reg_de = {c["cod"]: c["cod_region"] for c in comunas}


def tramo(edad):
    return 0 if edad < 15 else 1 if edad < 65 else 2 if edad < 75 else 3


# ---------------- Población por tramo ----------------
wb = openpyxl.load_workbook(DL / "D1_Poblacion-censada-por-sexo-y-edad-en-grupos-quinquenales.xlsx", read_only=True, data_only=True)
filas = list(wb["4"].iter_rows(values_only=True))
hdr = next(i for i, r in enumerate(filas) if r and r[0] == "Código región")
pob = {}
for r in filas[hdr + 1:]:
    if not isinstance(r[0], int) or not isinstance(r[4], int) or r[4] == 0:
        continue
    grupo = str(r[6]).strip()
    if grupo == "Total Comuna":
        continue
    lo = 85 if grupo.startswith("85") else int(grupo.split(" ")[0])
    pob.setdefault(str(r[4]).zfill(5), [0, 0, 0, 0])[tramo(lo)] += int(r[7])
assert len(pob) == 346 and sum(sum(v) for v in pob.values()) == 18480432, (len(pob), sum(sum(v) for v in pob.values()))
pob_reg = {}
for cod, v in pob.items():
    g = pob_reg.setdefault(reg_de[cod], [0, 0, 0, 0])
    for i in range(4):
        g[i] += v[i]

# ---------------- Tasa base diaria por región y tramo ----------------
tmp = TRABAJO / "deis_tmp"
tmp.mkdir(exist_ok=True)
def_reg = {}
for f in ("DEFUNCIONES_FUENTE_DEIS_1990_2023_CIFRAS_OFICIALES", "DEFUNCIONES_FUENTE_DEIS_2024_2026_10112026"):
    subprocess.run(["unzip", "-o", "-q", str(DL / f"{f}.zip"), f"{f}.csv", "-d", str(tmp)], check=True)
    for reg, t, n in con.sql(f"""
        with d as (select try_cast(FECHA_DEF as date) f, lpad(trim(COD_COMUNA),5,'0') cod,
                          case when EDAD_TIPO='1' then try_cast(EDAD_CANT as int) else 0 end edad
                   from read_csv('{tmp}/{f}.csv', delim=';', header=true, all_varchar=true, encoding='latin-1'))
        select substr(cod,1,2), case when edad < 15 then 0 when edad < 65 then 1 when edad < 75 then 2 else 3 end, count(*)
        from d where year(f) in {tuple(ANOS_REF)} and month(f) in {tuple(MESES_CALIDOS)} and cod in {tuple(pob)}
        group by 1,2""").fetchall():
        def_reg.setdefault(reg, [0, 0, 0, 0])[t] += n
    os.remove(tmp / f"{f}.csv")
dias_ref = con.sql(f"""select count(*) from (select unnest(generate_series(DATE '2015-01-01', DATE '2025-12-31', INTERVAL 1 DAY)) d)
                       where year(d) in {tuple(ANOS_REF)} and month(d) in {tuple(MESES_CALIDOS)}""").fetchone()[0]
tasa = {reg: [def_reg[reg][i] / pob_reg[reg][i] / dias_ref for i in range(4)] for reg in pob_reg}
print(f"  tasas base: {dias_ref} días de referencia; RM por 100 mil al día:", [round(x * 1e5, 3) for x in tasa["13"]])

# ---------------- Clima por territorio ----------------
um = json.loads((CONFIG / "umbrales.json").read_text())
hist = TRABAJO / "clima"
grupos = json.loads((hist / "grupos.json").read_text())


def clima(cod):
    u, g = um["comunas"].get(cod), grupos.get(cod)
    if not u or not g:
        return None
    carpeta = hist / g["rep"]
    temporadas = sorted(int(f.stem) for f in carpeta.glob("*.json")) if carpeta.exists() else []
    temporadas = [t for t in temporadas if t >= 2011]
    if len(temporadas) < 10:
        return None
    exc, por_mes, dias_mes, n_dias, dias_hist = [], {}, {}, 0, {}
    for t in temporadas:
        d = json.loads((carpeta / f"{t}.json").read_text())
        for f, tx in zip(d["fecha"], d["tmax"]):
            if tx is None:
                continue
            tx += g["dif"]["tmax"]
            m = int(f[5:7])
            por_mes.setdefault(m, []).append(tx)
            dias_hist.setdefault(str(m), []).append([int(f[8:10]), round(tx, 1)])
            n_dias += 1
            if tx > u["tmax_p90"]:
                exc.append(round(tx - u["tmax_p90"], 1))
                dias_mes[m] = dias_mes.get(m, 0) + 1
    medias = {m: sum(v) / len(v) for m, v in por_mes.items()}
    mes_calido = max(medias, key=medias.get)
    return {"umbral": u["tmax_p90"], "t_prom": round(medias[mes_calido], 2), "mes_calido": mes_calido, "n_anos": len(temporadas),
            "temporadas": f"{temporadas[0] - 1}-{str(temporadas[0])[2:]} a {temporadas[-1] - 1}-{str(temporadas[-1])[2:]}",
            "dias_ano": round(len(exc) / len(temporadas), 1), "excesos": sorted(exc),
            "normal_mes": {str(m): round(dias_mes.get(m, 0) / len(temporadas), 2) for m in MESES_CALIDOS}, "hist_mes": dias_hist}


def sin_hist(c):
    """Las comunas no guardan los días históricos: la proyección mensual usa los de la capital regional."""
    return None if c is None else {k: v for k, v in c.items() if k != "hist_mes"}


clima_reg = {reg: clima(f"{reg}101") for reg in sorted(pob_reg)}
con_clima = [r for r, c in clima_reg.items() if c]
print(f"  regiones con clima de su capital: {len(con_clima)} de 16 -> {con_clima}")

# ---------------- Validación: defunciones de cada comuna en días de episodio de calor ----------------
ep = json.loads((DATOS / "episodios.json").read_text())
dias_ep = {}
for e in ep["episodios"]:
    dias_ep.setdefault(e["cod_region"], set()).update(f for f in e["niveles"] if not ("2020-03" <= f[:7] <= "2022-12"))
valid = {}
if dias_ep:
    con.execute("create table ep (reg varchar, fecha varchar)")
    for reg, fs in dias_ep.items():
        con.executemany("insert into ep values (?, ?)", [(reg, f) for f in fs])
    cm = json.loads((DATOS / "comuna_mes.json").read_text())["comunas"]
    esp = {(cod, f[0], f[1]): f[4] for cod, fs in cm.items() for f in fs if f[4] is not None}
    for cod, a, m, n_dias, obs in con.sql(f"""
        select cod_comuna, year(cast(c.fecha as date)), month(cast(c.fecha as date)), count(*), sum(def_total)
        from '{DEIS}/comuna_dia.parquet' c join ep on ep.reg = substr(c.cod_comuna,1,2) and ep.fecha = c.fecha
        where def_total is not null group by 1,2,3""").fetchall():
        e = esp.get((cod, a, m))
        if e is None:
            continue
        dm = 31 if m in (1, 3, 5, 7, 8, 10, 12) else 30 if m != 2 else (29 if a % 4 == 0 else 28)
        v = valid.setdefault(cod, [0, 0.0, 0])
        v[0] += int(obs); v[1] += e * n_dias / dm; v[2] += n_dias
print(f"  comunas con validación en episodios: {len(valid)}")

# ---------------- Efecto de la cobertura arbórea, con AURA (RM) ----------------
verde = None
csv = TRABAJO / "aura_src" / "AURA_manzanas.csv"
if csv.exists():
    # Zonas naturales de AURA con cobertura arbórea declarada (punto medio del rango) y suelo desnudo (0 %).
    cob = {"A": 87.5, "B": 62.5, "C": 37.5, "D": 17.5, "F": 0.0, "G": 0.0}
    con.execute(f"create table a as select comuna, zcl_lcz, temp_verano_dia td, temp_verano_noche tn from read_csv('{csv}', header=true, types={{'manzana_id':'VARCHAR'}})")
    con.execute("create table cob (z varchar, c double)")
    con.executemany("insert into cob values (?, ?)", list(cob.items()))

    def pendiente(campo, filtro):
        # Pendiente con efecto fijo de comuna: se compara cada manzana con el promedio de su comuna.
        return con.sql(f"""with x as (select comuna, c, {campo} t from a join cob on cob.z = a.zcl_lcz where {filtro} and {campo} is not null),
            m as (select *, c - avg(c) over (partition by comuna) dc, t - avg(t) over (partition by comuna) dt from x)
            select sum(dc * dt) / sum(dc * dc), count(*) from m""").fetchone()

    p_arb_dia, n1 = pendiente("td", "c > 0")
    p_todo_dia, n2 = pendiente("td", "true")
    p_arb_noche, _ = pendiente("tn", "c > 0")
    p_todo_noche, _ = pendiente("tn", "true")
    verde = {"metodo": "Pendiente de la temperatura de verano de AURA según la cobertura arbórea de la zona climática local (punto medio del rango), "
                       "comparando manzanas de una misma comuna. «Solo con árboles» usa las zonas con 10 % o más de cobertura; «con suelo desnudo» agrega las zonas sin vegetación.",
             "dia_solo_arboles": round(p_arb_dia, 4), "dia_con_suelo_desnudo": round(p_todo_dia, 4),
             "noche_solo_arboles": round(p_arb_noche, 4), "noche_con_suelo_desnudo": round(p_todo_noche, 4), "manzanas": [n1, n2]}
    print("  áreas verdes (°C por punto porcentual):", {k: v for k, v in verde.items() if k != "metodo"})

guardar("motor_insumos.json", {
    "tramos": TRAMOS, "anos_tasa": ANOS_REF, "meses_calidos": MESES_CALIDOS, "dias_tasa": dias_ref, "umbrales": um["version"],
    "nota_clima": "Umbral = percentil 90 local de la temperatura máxima de noviembre a marzo. Una comuna sin serie propia usa el clima de la capital de su región.",
    "regiones": {reg: {"pob": pob_reg[reg], "tasa": [float(f"{x:.4g}") for x in tasa[reg]], "clima": clima_reg[reg]} for reg in sorted(pob_reg)},
    "comunas": {c["cod"]: {"reg": c["cod_region"], "pob": pob[c["cod"]], "clima": sin_hist(clima(c["cod"])),
                           "validacion": [valid[c["cod"]][0], round(valid[c["cod"]][1]), valid[c["cod"]][2]] if c["cod"] in valid else None} for c in comunas},
    "verde_aura": verde})
propias = sum(1 for c in comunas if clima(c["cod"]))
print(f"  comunas con clima propio: {propias}; el resto usa la capital regional")
