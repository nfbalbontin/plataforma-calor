"""Etapa 5 · Datos del módulo Historia: un archivo por lugar (Chile, región, comuna y hospital).

Aplica la fórmula del modelo hacia atrás: atribuibles del día = casos observados x (RR - 1) / RR, con la temperatura
observada en la capital regional. El rango de 95 % sale de sortear 400 veces los coeficientes de cada curva
(normal multivariada) y recalcular; las regiones se sortean por separado, así el rango de Chile no suma los extremos.

Salidas (public/historia/):
  pais.json, r_<región>.json, c_<comuna>.json, h_<hospital>.json   resumen por temporada, perfil y olas de calor
  dia/<mismo nombre>.json y dia/clima_<región>.json                 detalle diario por temporada
  curvas.json, indice.json
datos/riesgo_base.json: muertes y hospitalizaciones habituales por comuna y mes, para el módulo de riesgo.
Uso: python e5_historia.py
"""
import json
import pickle
import shutil

import duckdb
import numpy as np

from rutas import DATOS, PLATAFORMA, TRABAJO, guardar
from spline import rcs

OUT = PLATAFORMA / "public" / "historia"
if OUT.exists():
    shutil.rmtree(OUT)
(OUT / "dia").mkdir(parents=True)
comunas = json.loads((DATOS / "comunas.json").read_text())
regiones = json.loads((DATOS / "regiones.json").read_text())
terr = json.loads((DATOS / "territorio.json").read_text())
modelo = json.loads((DATOS / "modelo.json").read_text())
ctrl = json.loads((TRABAJO / "defunciones_controles.json").read_text())
coef = pickle.load(open(TRABAJO / "modelo/coeficientes.pkl", "rb"))
COD = [c["cod"] for c in comunas]
IC = {c: i for i, c in enumerate(COD)}
nombre_com = {c["cod"]: c["nombre"] for c in comunas}
nombre_reg = {r["cod"]: r["nombre"] for r in regiones}
REGS = [r["cod"] for r in regiones]
hosp = terr["hospitales"]
NS = 400                                  # sorteos
rng = np.random.default_rng(20261115)
np.seterr(all="ignore")                   # NumPy 2 con Accelerate en macOS da avisos falsos en matmul; abajo se comprueba que todo sea finito

con = duckdb.connect()
con.execute("SET memory_limit='6GB'")
con.execute(f"create table rd as select *, row_number() over (partition by reg order by fecha) - 1 i from '{TRABAJO}/modelo/region_dia.parquet'")
con.execute(f"""create table d as select f.cod_comuna cod, f.fecha::date fecha, r.temporada::int t, r.dos::int dos, r.i::int i, r.calor,
      f.sexo, f.edad_g e, f.nivel k, f.causa, f.lugar, f.n, r.af_M_T mt
    from '{TRABAJO}/defunciones.parquet' f join rd r on r.reg = substr(f.cod_comuna,1,2) and r.fecha::date = f.fecha::date""")
con.execute(f"""create table u as select u.id, u.comuna, r.temporada::int t, r.dos::int dos, r.i::int i,
      coalesce(sum(total) filter (where idcausa=1), 0) u_t, coalesce(sum(de65) filter (where idcausa=1), 0) u_65,
      coalesce(sum(total) filter (where idcausa=25), 0) h_t, coalesce(sum(de65) filter (where idcausa=25), 0) h_65
    from read_parquet('{TRABAJO}/deis_stage/urg/ok_*.parquet') u join rd r on r.reg = substr(u.comuna,1,2) and r.fecha::date = u.fecha
    where r.temporada >= 2011 group by all""")
T = [int(x[0]) for x in con.sql("select distinct temporada from rd order by 1").fetchall()]
IT = {t: i for i, t in enumerate(T)}
nT, nC = len(T), len(COD)
print(f"  temporadas {T[0]}-{T[-1]}; defunciones en temporada cálida: {con.sql('select sum(n) from d').fetchone()[0]:,}", flush=True)

# ------------------------------------------------------------ series y curvas
SX = {"H": 0, "M": 1, "I": 2}
EDAD = {"T": (0, 1, 2), "0": (0,), "1": (1,), "2": (2,)}
SEXO = {"A": (0, 1, 2), "H": (0,), "M": (1,)}
SERIES = []                                # (clave, curva, máscara sobre las 45 celdas edad x sexo x nivel)
for ek, es in EDAD.items():
    for sk, ss in SEXO.items():
        m = np.zeros((3, 3, 5), bool)
        m[np.ix_(es, ss, range(5))] = True
        SERIES.append((f"M_{ek}_{sk}", "M_T" if ek == "T" else f"M_{ek}", m.reshape(-1)))
        for k in (1, 2, 3):
            m = np.zeros((3, 3, 5), bool)
            m[np.ix_(es, ss, [k + 1])] = True
            SERIES.append((f"N{k}_{ek}_{sk}", f"N{k}", m.reshape(-1)))
MASCARA = np.array([s[2] for s in SERIES], np.float32).T          # 45 x 48
IS = {s[0]: i for i, s in enumerate(SERIES)}
USERIES = [("U_T_A", "U_T"), ("U_65_A", "U_65"), ("H_T_A", "H_T"), ("H_65_A", "H_65")]
DESDE_N, DESDE_U = modelo["desde"]["N1"], 2011


def fracciones(clave, reg, x, p):
    """Fracción atribuible por día: estimación central (nd) y sorteos (nd x NS)."""
    c = coef[(clave, reg)]
    v = p if c["escala"] == "p" else x
    B = rcs(v, c["nudos"]) - rcs([c["umbral"]], c["nudos"])
    L = np.linalg.cholesky(c["V"] + 1e-12 * np.eye(len(c["th"])))
    th = c["th"][:, None] + L @ rng.standard_normal((len(c["th"]), NS))
    sobre = (v > c["umbral"])[:, None]
    assert np.isfinite(th).all() and np.isfinite(B).all(), (clave, reg)
    return np.where(sobre[:, 0], 1 - np.exp(-(B @ c["th"])), 0.0), np.where(sobre, 1 - np.exp(-(B @ th)), 0.0).astype(np.float32)


# Resultados por lugar: {archivo: {clave: [obs, an, lo, hi] por temporada}}
RES, OLAS_L = {}, {}
PAIS_S = {}                                # sorteos acumulados de Chile: clave -> (nT x NS)
PAIS_P = {}                                # puntos acumulados de Chile: clave -> (2 x nT) obs y an
PAIS_OLAS = []
est_ids = sorted(x[0] for x in con.sql("select distinct id from u").fetchall())
com_est = dict(con.sql("select id, any_value(comuna) from u group by 1").fetchall())
area_fuera = [h["cod"] for h in hosp.values() if any(c[:2] != h["comuna"][:2] for c in h["area"])]
if area_fuera:
    print(f"  hospitales con comunas de otra región en su área (se cuentan solo las de su región): {area_fuera}")

for reg in REGS:
    rdr = con.sql(f"select i, temporada, dos, x, p, ola, tmax from rd where reg='{reg}' order by i").fetchall()
    nd = len(rdr)
    temp = np.array([IT[int(r[1])] for r in rdr])
    x, p = np.array([r[3] for r in rdr]), np.array([r[4] for r in rdr])
    ola = np.array([int(r[5]) for r in rdr])
    cods = [c for c in COD if c[:2] == reg]
    jc = {c: j for j, c in enumerate(cods)}
    # Lugares de la región: sus comunas, la región y los hospitales ubicados en ella
    hs = [h for h in hosp.values() if h["comuna"][:2] == reg]
    lugares = [f"c_{c}" for c in cods] + [f"r_{reg}"] + [f"h_{h['cod']}" for h in hs]
    M = np.zeros((len(lugares), len(cods)), np.float32)
    for j in range(len(cods)):
        M[j, j] = 1
    M[len(cods), :] = 1
    for a, h in enumerate(hs):
        for c in h["area"]:
            if c in jc:
                M[len(cods) + 1 + a, jc[c]] = 1
    # Muertes diarias por comuna y celda -> por lugar y serie
    D = np.zeros((nd, len(cods), 45), np.float32)
    for cod, i, e, sx, k, n in con.sql(f"select cod, i, e, sexo, k, sum(n) from d where substr(cod,1,2)='{reg}' group by all").fetchall():
        D[i, jc[cod], e * 15 + SX[sx] * 5 + k + 1] += n
    S = np.einsum("dcz,lc,zs->dls", D, M, MASCARA, optimize=True)           # nd x lugares x 48
    del D
    obs = np.zeros((len(lugares), len(SERIES), nT))
    an = np.zeros((3, len(lugares), len(SERIES), nT))
    af_mt = None
    for curva in sorted(set(s[1] for s in SERIES)):
        cols = [i for i, s in enumerate(SERIES) if s[1] == curva]
        pt, sor = fracciones(curva, reg, x, p)
        if curva == "M_T":
            af_mt = (pt, sor)
        for t in range(nT):
            dd = temp == t
            if not dd.any():
                continue
            blo = S[dd][:, :, cols]                                          # días x lugares x cols
            obs[:, cols, t] = blo.sum(0)
            an[0][:, cols, t] = np.einsum("dlc,d->lc", blo, pt[dd])
            sr = np.einsum("dlc,dn->lcn", blo, sor[dd])                      # lugares x cols x NS
            an[1][:, cols, t], an[2][:, cols, t] = np.percentile(sr, 2.5, axis=2), np.percentile(sr, 97.5, axis=2)
            for a, ci in enumerate(cols):                                    # Chile: se acumulan los sorteos de la región
                clave = SERIES[ci][0]
                PAIS_S.setdefault(clave, np.zeros((nT, NS)))[t] += sr[len(cods), a]
                pp = PAIS_P.setdefault(clave, np.zeros((2, nT)))
                pp[0, t] += obs[len(cods), ci, t]
                pp[1, t] += an[0][len(cods), ci, t]
    for li, nombre in enumerate(lugares):
        RES[nombre] = {s[0]: [obs[li, i], an[0][li, i], an[1][li, i], an[2][li, i]] for i, s in enumerate(SERIES)}
    # Olas de calor: muertes en la ola y los 3 días siguientes (curva de todas las edades)
    pt, sor = af_mt
    serie_total = S[:, :, IS["M_T_A"]]                                       # nd x lugares
    for o in sorted(set(ola[ola > 0])):
        idx = np.where(ola == o)[0]
        t = temp[idx[0]]
        fin = min(idx[-1] + 3, np.where(temp == t)[0][-1])
        v = slice(idx[0], fin + 1)
        sr = serie_total[v].T @ sor[v]                                       # lugares x NS
        fila = con.sql(f"select min(fecha)::date::varchar, max(fecha)::date::varchar, max(tmax) from rd where reg='{reg}' and ola={o}").fetchone()
        base = {"t": T[t], "ini": fila[0], "fin": fila[1], "dias": len(idx), "tmax": round(fila[2], 1), "reg": reg}
        o_obs, o_an = serie_total[v].sum(0), serie_total[v].T @ pt[v]
        lo, hi = np.percentile(sr, 2.5, axis=1), np.percentile(sr, 97.5, axis=1)
        for li, nombre in enumerate(lugares):
            OLAS_L.setdefault(nombre, []).append({**base, "obs": int(o_obs[li]), "an": round(float(o_an[li]), 1), "lo": round(float(lo[li]), 1), "hi": round(float(hi[li]), 1)})
        PAIS_OLAS.append(OLAS_L[f"r_{reg}"][-1])
    del S
    # Urgencias y hospitalizaciones por establecimiento -> comuna, región, hospital
    ests = [e for e in est_ids if com_est[e][:2] == reg]
    if ests:
        je = {e: j for j, e in enumerate(ests)}
        Ud = np.zeros((nd, len(ests), 4), np.float32)
        for eid, i, a, b, c, e in con.sql(f"select id, i, u_t, u_65, h_t, h_65 from u where substr(comuna,1,2)='{reg}'").fetchall():
            Ud[i, je[eid]] = (a, b, c, e)
        Mu = np.zeros((len(lugares), len(ests)), np.float32)
        for e, j in je.items():
            if com_est[e] in jc:
                Mu[jc[com_est[e]], j] = 1
        Mu[len(cods), :] = 1
        for a, h in enumerate(hs):
            if h["antiguo"] in je:
                Mu[len(cods) + 1 + a, je[h["antiguo"]]] = 1
        Su = np.einsum("dez,le->dlz", Ud, Mu, optimize=True)                 # nd x lugares x 4
        for z, (clave, curva) in enumerate(USERIES):
            pt, sor = fracciones(curva, reg, x, p)
            arr = np.full((4, len(lugares), nT), np.nan)
            for t in range(nT):
                dd = temp == t
                if T[t] < DESDE_U or not dd.any():
                    continue
                blo = Su[dd][:, :, z]
                sr = blo.T @ sor[dd]
                arr[0][:, t], arr[1][:, t] = blo.sum(0), blo.T @ pt[dd]
                arr[2][:, t], arr[3][:, t] = np.percentile(sr, 2.5, axis=1), np.percentile(sr, 97.5, axis=1)
                PAIS_S.setdefault(clave, np.zeros((nT, NS)))[t] += sr[len(cods)]
                pp = PAIS_P.setdefault(clave, np.zeros((2, nT)))
                pp[0, t] += arr[0][len(cods), t]
                pp[1, t] += arr[1][len(cods), t]
            for li, nombre in enumerate(lugares):
                if Mu[li].any():
                    RES[nombre][clave] = [arr[b][li] for b in range(4)]
        del Ud, Su
    print(f"  región {reg}: {len(lugares)} lugares", flush=True)
RES["pais"] = {k: [PAIS_P[k][0], PAIS_P[k][1], np.percentile(v, 2.5, axis=1), np.percentile(v, 97.5, axis=1)] for k, v in PAIS_S.items()}
OLAS_L["pais"] = PAIS_OLAS

# ------------------------------------------------------------ perfil, clima, población
CAUSAS = [g[0] for g in json.loads((PLATAFORMA / "config/diagnosticos.json").read_text())["grupos_causa"]] + ["Otras", "CIE-9"]
DIM = {"edad": ["0 a 64", "65 a 79", "80 o más"], "sexo": ["Hombres", "Mujeres"], "lugar": ["Casa", "Hospital o clínica", "Otro"],
       "causa": CAUSAS[:-1], "nivel": ["Directos", "Fuertemente asociados", "Asociación moderada", "Otras causas"]}
P = {k: np.zeros((nC, nT, 2, len(v))) for k, v in DIM.items()}
for col, clave, mapa in (("e", "edad", {0: 0, 1: 1, 2: 2}), ("sexo", "sexo", {"H": 0, "M": 1}), ("lugar", "lugar", {"C": 0, "H": 1, "O": 2}),
                         ("causa", "causa", {c: i for i, c in enumerate(CAUSAS[:-1])}), ("k", "nivel", {1: 0, 2: 1, 3: 2, 0: 3})):
    for cod, t, cal, v, n in con.sql(f"select cod, t, calor, {col}, sum(n) from d group by all").fetchall():
        if v in mapa:
            P[clave][IC[cod], IT[t], int(cal), mapa[v]] = n
clima = {}
for reg, t, dias, cal, tmax in con.sql("select reg, temporada, count(*), sum(calor::int), max(tmax) from rd group by all").fetchall():
    c = clima.setdefault(reg, {"dias": [0] * nT, "calor": [0] * nT, "tmax": [None] * nT})
    c["dias"][IT[t]], c["calor"][IT[t]], c["tmax"][IT[t]] = int(dias), int(cal), round(tmax, 1)
POB = np.full((nC, nT), np.nan)
for cod, ano, pb in con.sql(f"select cod_comuna, ano, pob_65 from '{TRABAJO}/pob_comuna_ano.parquet'").fetchall():
    if cod in IC and ano in IT:
        POB[IC[cod], IT[ano]] = pb


# ------------------------------------------------------------ armado por lugar
def r1(v, dec=2):
    out = []
    for x in np.asarray(v, float).tolist():
        out.append(None if x != x else (int(x) if float(x).is_integer() else round(x, dec)))
    return out


def series_de(archivo):
    out = {}
    for clave, arr in RES.get(archivo, {}).items():
        col = [r1(a) for a in arr]
        desde = DESDE_N if clave[0] == "N" else DESDE_U if clave[0] in "UH" else 0
        for a in col:
            for i, t in enumerate(T):
                if t < desde:
                    a[i] = None
        if any(v for v in col[0] if v):
            out[clave] = col
    return out


def perfil(ci):
    return {k: {"cat": DIM[k], "calor": P[k][ci].sum(0)[:, 1].astype(int).tolist(), "normal": P[k][ci].sum(0)[:, 0].astype(int).tolist()} for k in DIM}


def clima_de(regs):
    if len(regs) == 1:
        c, r = clima[regs[0]], modelo["regiones"][regs[0]]
        return {"calor": c["calor"], "tmax": c["tmax"], "dias": c["dias"], "p95": r["p95_tmax"], "p90": r["p90_tmax"],
                "punto": nombre_com[regs[0] + "101"], "regiones": 1}
    w = np.array([sum(c["pob"][k] for k in ("e65_74", "e75_84", "e85_mas")) for c in comunas])
    wr = {r: w[[IC[c] for c in COD if c[:2] == r]].sum() for r in regs}
    tot = sum(wr.values())
    return {"calor": [round(sum(clima[r]["calor"][i] * wr[r] for r in regs) / tot, 1) for i in range(nT)],
            "tmax": [None] * nT, "dias": [max(clima[r]["dias"][i] for r in regs) for i in range(nT)], "p95": None, "p90": None, "punto": None, "regiones": len(regs)}


def diario(ci, ei):
    """Detalle diario por temporada, en ternas [día, celda, n]: muertes (celda = edad*2 + sexo; 6 = sexo indeterminado) y niveles."""
    out = {}
    if len(ci):
        filtro = "" if len(ci) == nC else "where cod in (" + ",".join(f"'{COD[i]}'" for i in ci) + ")"
        for t, dos, cel, n in con.sql(f"select t, dos, case sexo when 'H' then e*2 when 'M' then e*2+1 else 6 end c, sum(n)::int from d {filtro} group by all order by 1, 2, 3").fetchall():
            out.setdefault(str(t), {"m": [], "k": []})["m"] += [dos, cel, n]
        for t, dos, k, n in con.sql(f"select t, dos, k, sum(n)::int from d {filtro + (' and' if filtro else 'where')} k > 0 group by all order by 1, 2, 3").fetchall():
            out.setdefault(str(t), {"m": [], "k": []})["k"] += [dos, k, n]
    if len(ei):
        lista = ",".join(f"'{e}'" for e in ei)
        for t, dos, a, b, c, e in con.sql(f"select t, dos, sum(u_t)::int, sum(u_65)::int, sum(h_t)::int, sum(h_65)::int from u where id in ({lista}) group by all order by 1, 2").fetchall():
            xx = out.setdefault(str(t), {"m": [], "k": []}).setdefault("u", [[], [], [], [], []])
            for arr, v in zip(xx, (dos, a, b, c, e)):
                arr.append(v)
    return out


def caja(cods):
    bs = [c["bbox"] for c in comunas if c["cod"] in cods and c["bbox"] and not c.get("isla")]
    return [min(b[0] for b in bs), min(b[1] for b in bs), max(b[2] for b in bs), max(b[3] for b in bs)] if bs else None


def escribir(nombre, obj, carpeta=OUT):
    (carpeta / f"{nombre}.json").write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False))


def lugar(archivo, tipo, cod, nombre, ruta, ci, ei, regs, hijos, extra=None):
    pob = POB[ci].sum(0) if len(ci) else np.full(nT, np.nan)
    obj = {"tipo": tipo, "cod": cod, "nombre": nombre, "ruta": ruta, "temporadas": T, "clima": clima_de(regs),
           "pob65": r1(pob, 0), "series": series_de(archivo), "perfil": perfil(ci) if len(ci) else None, "episodios": OLAS_L.get(archivo, []),
           "curva": regs[0] if len(regs) == 1 else "00", "hijos": hijos,
           "bbox": None if tipo == "pais" else caja({COD[i] for i in ci}), **(extra or {})}
    escribir(archivo, obj)
    # Detalle diario: muertes en Chile, región y comuna; urgencias en Chile, región y hospital.
    escribir(archivo, {"temporadas": diario([] if tipo == "hospital" else ci, [] if tipo == "comuna" else ei),
                       "clima": f"clima_{regs[0]}" if len(regs) == 1 else "clima_00"}, OUT / "dia")


PAIS = {"tipo": "pais", "cod": "00", "nombre": "Chile"}
lugar("pais", "pais", "00", "Chile", [PAIS], list(range(nC)), est_ids, REGS, [{"tipo": "region", "cod": r, "nombre": nombre_reg[r], "archivo": f"r_{r}"} for r in REGS])
hosp_de_comuna, est_de_comuna = {}, {}
for h in hosp.values():
    hosp_de_comuna.setdefault(h["comuna"], []).append(h["cod"])
for e, c in com_est.items():
    est_de_comuna.setdefault(c, []).append(e)
for r in REGS:
    ci = [i for i, c in enumerate(COD) if c[:2] == r]
    R = {"tipo": "region", "cod": r, "nombre": nombre_reg[r]}
    lugar(f"r_{r}", "region", r, nombre_reg[r], [PAIS, R], ci, [e for e in est_ids if com_est[e][:2] == r], [r],
          [{"tipo": "comuna", "cod": COD[i], "nombre": nombre_com[COD[i]], "archivo": f"c_{COD[i]}"} for i in ci])
    for i in ci:
        cod = COD[i]
        tc = terr["comunas"][cod]
        hs = [tc["hospital"]] + [h for h in hosp_de_comuna.get(cod, []) if h != tc["hospital"]]
        lugar(f"c_{cod}", "comuna", cod, nombre_com[cod], [PAIS, R, {"tipo": "comuna", "cod": cod, "nombre": nombre_com[cod]}], [i],
              est_de_comuna.get(cod, []), [r],
              [{"tipo": "hospital", "cod": h, "nombre": hosp[h]["nombre"], "archivo": f"h_{h}", "referencia": h == tc["hospital"]} for h in hs],
              {"hospital": {"cod": tc["hospital"], "nombre": hosp[tc["hospital"]]["nombre"], "dist_km": tc["dist_km"], "regla": tc["regla"]},
               "servicio": terr["servicios"][tc["ss"]]})
for h in hosp.values():
    r = h["comuna"][:2]
    ci = [IC[c] for c in h["area"] if c[:2] == r]
    ei = [h["antiguo"]] if h["antiguo"] in com_est else []
    ruta = [PAIS, {"tipo": "region", "cod": r, "nombre": nombre_reg[r]}, {"tipo": "comuna", "cod": h["comuna"], "nombre": nombre_com[h["comuna"]]},
            {"tipo": "hospital", "cod": h["cod"], "nombre": h["nombre"]}]
    lugar(f"h_{h['cod']}", "hospital", h["cod"], h["nombre"], ruta, ci, ei, [r],
          [{"tipo": "comuna", "cod": c, "nombre": nombre_com[c], "archivo": f"c_{c}"} for c in h["area"]],
          {"servicio": terr["servicios"][h["ss"]], "complejidad": h["complejidad"], "con_urgencias": bool(ei), "lat": h["lat"], "lon": h["lon"]})

# Temperatura diaria por región (compartida por todos los lugares de la región); para Chile, regiones con calor extremo por día
temp_reg, n_calor_pais = {}, {}
for reg, t, fechas, tmax, cal in con.sql("""select reg, temporada, list(strftime(fecha, '%Y-%m-%d') order by fecha), list(round(tmax, 1) order by fecha),
                                            list(calor order by fecha) from rd group by all""").fetchall():
    temp_reg.setdefault(reg, {})[str(int(t))] = {"ini": fechas[0], "n": len(fechas), "tmax": tmax, "calor": [i for i, c in enumerate(cal) if c]}
for t, dos, n in con.sql("select temporada, dos, sum(calor::int) from rd group by all order by 1, 2").fetchall():
    n_calor_pais.setdefault(str(int(t)), []).append(int(n))
for r in REGS:
    escribir(f"clima_{r}", temp_reg[r], OUT / "dia")
escribir("clima_00", {t: {"ini": temp_reg["13"][t]["ini"], "n": len(v), "regiones_calor": v} for t, v in n_calor_pais.items() if t in temp_reg["13"]}, OUT / "dia")

# Curvas para el sitio: por región en grados; para Chile, promedio de las regiones sobre el percentil local
curvas = {}
for r in REGS:
    m = modelo["regiones"][r]
    curvas[r] = {"x": m["grilla"], "unidad": "°C", "p95": m["p95_tmax"], "cuantiles": m["cuantiles_x"],
                 "curvas": {k: {kk: v[kk] for kk in ("umbral", "umbral_p", "rr", "lo", "hi", "fuente")} for k, v in m["curvas"].items()}}
nac = {}
for k in modelo["curvas"]:
    w = np.array([modelo["regiones"][r]["curvas"][k]["eventos"] for r in REGS], float)
    fila = {}
    for banda in ("rr", "lo", "hi"):
        L = np.array([np.interp(modelo["regiones"][r]["cuantiles_x"], modelo["regiones"][r]["grilla"], np.log(modelo["regiones"][r]["curvas"][k][banda])) for r in REGS])
        fila[banda] = np.round(np.exp((L * w[:, None]).sum(0) / w.sum()), 4).tolist()
    nac[k] = {**fila, "umbral": None, "umbral_p": int(round(float(np.average([modelo["regiones"][r]["curvas"][k]["umbral_p"] for r in REGS], weights=w)))),
              "fuente": "promedio de las 16 regiones"}
curvas["00"] = {"x": list(range(0, 101)), "unidad": "percentil local", "p95": 95, "curvas": nac}
escribir("curvas", curvas)
escribir("indice", {"temporadas": T, "defunciones_hasta": ctrl["hasta"], "urgencias_desde": DESDE_U, "niveles_desde": DESDE_N,
                    "poblacion_desde": 2002, "modelo": modelo["version"], "ajustado": modelo["ajustado"], "sorteos": NS,
                    "lugares": {"pais": 1, "regiones": len(REGS), "comunas": nC, "hospitales": len(hosp)}})

# Base del módulo de riesgo: muertes y hospitalizaciones habituales por día, según comuna y mes (últimas 4 temporadas)
ult = ",".join(map(str, T[-4:]))
base = {c: {"m": [0.0] * 5, "m65": [0.0] * 5, "h": [0.0] * 5} for c in COD}
MES = {11: 0, 12: 1, 1: 2, 2: 3, 3: 4}
dias_mes = {MES[m]: n for m, n in con.sql(f"select month(fecha), count(*) from rd where reg='13' and temporada in ({ult}) group by 1").fetchall()}
for cod, m, n, n65, a in con.sql(f"select cod, month(fecha), sum(n), sum(n) filter (where e > 0), sum(n*mt) from d where t in ({ult}) group by all").fetchall():
    base[cod]["m"][MES[m]] = round((n - a) / dias_mes[MES[m]], 4)          # sin el efecto del calor
    base[cod]["m65"][MES[m]] = round((n65 or 0) / dias_mes[MES[m]], 4)
for cod, m, h in con.sql(f"""select u.comuna, month(r.fecha), sum(u.h_t) from u join rd r on r.reg = substr(u.comuna,1,2) and r.i = u.i
                             where u.t in ({ult}) group by all""").fetchall():
    if cod in base:
        base[cod]["h"][MES[m]] = round(float(h or 0) / dias_mes[MES[m]], 3)
guardar("riesgo_base.json", {"temporadas": T[-4:], "nota": "Promedio diario por mes (noviembre a marzo) de las últimas 4 temporadas; las muertes descuentan las atribuibles al calor.",
                             "comunas": base})
tam = sum(f.stat().st_size for f in OUT.rglob("*.json")) / 1e6
print(f"  public/historia: {sum(1 for _ in OUT.rglob('*.json'))} archivos, {tam:.1f} MB (detalle diario {sum(f.stat().st_size for f in (OUT / 'dia').glob('*.json')) / 1e6:.1f} MB)")
p = RES["pais"]["M_T_A"]
print(f"  Chile, todas las muertes: atribuibles {p[1].sum():,.0f} (suma de extremos por temporada {p[2].sum():,.0f} a {p[3].sum():,.0f}) de {p[0].sum():,.0f}")
