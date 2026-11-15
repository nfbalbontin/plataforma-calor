"""Etapa 4 · Modelo estadístico: de grados de temperatura a muertes y hospitalizaciones, con validación.

Un solo modelo alimenta los dos módulos. Se ajusta aquí, fuera de la plataforma; el sitio solo lee sus resultados.

- Qué se explica: conteos diarios por región (muertes por todas las causas y por grupo de edad, muertes por nivel
  de diagnóstico, atenciones de urgencia y hospitalizaciones desde urgencia).
- Con qué: temperatura máxima del día y de los 3 días anteriores (promedio 0-3), en la capital regional.
- Método: regresión de Poisson con sobredispersión (cuasi-Poisson). La curva es un spline cúbico natural con nudos
  en los percentiles 10, 50, 75, 90 y 97 de la temperatura local (escala de percentil local).
- Controles: una curva estacional por temporada (spline del día de la temporada, 4 gl, que también recoge la
  tendencia de largo plazo), día de la semana y feriados.
- Período: temporada cálida, 1 de noviembre a 31 de marzo.
- Agrupación: una curva por región, acercada a la curva nacional según cuánta información tiene (mejor predictor
  lineal insesgado de un metaanálisis multivariado). El nivel 1 tiene tan pocos casos que usa una sola curva nacional.
- Umbral de calor: la temperatura de menor riesgo entre los percentiles 50 y 95; bajo ella el riesgo relativo es 1.

Salidas: .trabajo/modelo/region_dia.parquet (temperatura, percentil, día de calor y fracción atribuible por curva)
         .trabajo/modelo/coeficientes.pkl (coeficientes y covarianza de cada curva)
         datos/modelo.json (curvas, umbrales, cuantiles, validación y pruebas de sensibilidad)
Uso: python e4_modelo.py
"""
import datetime as dt
import json
import warnings

import duckdb
import numpy as np
import pandas as pd
import statsmodels.api as sm

from rutas import TRABAJO, guardar
from spline import NUDOS_P, rcs

warnings.filterwarnings("ignore")
HIST = TRABAJO / "clima"
SALIDA = TRABAJO / "modelo"
SALIDA.mkdir(exist_ok=True)
REGIONES = [f"{i:02d}" for i in range(1, 17)]
REZAGO = 3
# curva: (columna, primera temporada, descripción)
CURVAS = {
    "M_T": ("m_t", 1991, "Muertes, todas las edades"), "M_0": ("m_0", 1991, "Muertes, 0 a 64 años"),
    "M_1": ("m_1", 1991, "Muertes, 65 a 79 años"), "M_2": ("m_2", 1991, "Muertes, 80 años o más"),
    "N1": ("n1", 1998, "Muertes por diagnósticos directos"), "N2": ("n2", 1998, "Muertes por diagnósticos fuertemente asociados"),
    "N3": ("n3", 1998, "Muertes por diagnósticos de asociación moderada"),
    "U_T": ("u_t", 2011, "Atenciones de urgencia, todas las edades"), "U_65": ("u_65", 2011, "Atenciones de urgencia, 65 años o más"),
    "H_T": ("h_t", 2011, "Hospitalizaciones desde urgencia, todas las edades"), "H_65": ("h_65", 2011, "Hospitalizaciones desde urgencia, 65 años o más"),
}
VALIDACION_DESDE = 2024          # se ajusta sin las temporadas 2023-24, 2024-25 y 2025-26


def pascua(y):
    a, b, c = y % 19, y // 100, y % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    return dt.date(y, (h + l - 7 * m + 114) // 31, (h + l - 7 * m + 114) % 31 + 1)


def es_feriado(f):
    if (f.month, f.day) in ((11, 1), (12, 8), (12, 25), (1, 1)):
        return True
    p = pascua(f.year)
    return f in (p - dt.timedelta(days=2), p - dt.timedelta(days=1))


# ---------------------------------------------------------------- datos
grupos = json.loads((HIST / "grupos.json").read_text())


def clima(reg):
    g = grupos[f"{reg}101"]
    filas = []
    for f in sorted((HIST / g["rep"]).glob("*.json")):
        d = json.loads(f.read_text())
        t = pd.DataFrame({"fecha": pd.to_datetime(d["fecha"]), "tmax": d["tmax"], "tmin": d["tmin"]})
        t["tmax"] += g["dif"]["tmax"]
        t["tmin"] += g["dif"]["tmin"]
        t["temporada"] = int(f.stem)
        t = t.dropna(subset=["tmax"]).reset_index(drop=True)
        t["dos"] = np.arange(len(t))
        for nombre, n in (("x", REZAGO), ("x7", 7), ("x21", 21)):
            t[nombre] = t["tmax"].rolling(n + 1, min_periods=1).mean()
        t["tn"] = t["tmin"].rolling(2, min_periods=1).mean()
        filas.append(t)
    return pd.concat(filas, ignore_index=True)


# Solo entran las temporadas que ya tienen temperatura en las 16 capitales.
COMPLETAS = set.intersection(*[{int(f.stem) for f in (HIST / grupos[f"{r}101"]["rep"]).glob("*.json")} for r in REGIONES])
con = duckdb.connect()
con.execute(f"""create table def as select substr(cod_comuna,1,2) reg, fecha,
    sum(n) m_t, sum(n) filter (where edad_g=0) m_0, sum(n) filter (where edad_g=1) m_1, sum(n) filter (where edad_g=2) m_2,
    sum(n) filter (where nivel=1) n1, sum(n) filter (where nivel=2) n2, sum(n) filter (where nivel=3) n3,
    sum(n) filter (where causa='COVID-19') covid
  from '{TRABAJO}/defunciones.parquet' where month(fecha) in (11,12,1,2,3) group by all""")
con.execute(f"""create table urg as select substr(comuna,1,2) reg, fecha,
    sum(total) filter (where idcausa=1) u_t, sum(de65) filter (where idcausa=1) u_65,
    sum(total) filter (where idcausa=25) h_t, sum(de65) filter (where idcausa=25) h_65
  from read_parquet('{TRABAJO}/deis_stage/urg/ok_*.parquet') where month(fecha) in (11,12,1,2,3) group by all""")
defu = con.sql("select * from def").df()
urge = con.sql("select * from urg").df()
defu["fecha"] = pd.to_datetime(defu["fecha"])
urge["fecha"] = pd.to_datetime(urge["fecha"])
FIN_DEF = pd.Timestamp(con.sql(f"select max(fecha) from '{TRABAJO}/defunciones.parquet'").fetchone()[0])

datos = {}
for reg in REGIONES:
    t = clima(reg)
    t = t[t.temporada.isin(COMPLETAS)].reset_index(drop=True)
    t = t.merge(defu[defu.reg == reg].drop(columns="reg"), on="fecha", how="left")
    t = t.merge(urge[urge.reg == reg].drop(columns="reg"), on="fecha", how="left")
    for c in ("m_t", "m_0", "m_1", "m_2", "n1", "n2", "n3", "covid"):
        t[c] = t[c].fillna(0)
    t.loc[t.fecha > FIN_DEF, ["m_t", "m_0", "m_1", "m_2", "n1", "n2", "n3"]] = np.nan
    t["m_sin_covid"] = t["m_t"] - t["covid"]
    t["dow"] = t.fecha.dt.dayofweek
    t["feriado"] = [es_feriado(f.date()) for f in t.fecha]
    q = np.percentile(t["x"], np.arange(0, 101))
    t["p"] = np.interp(t["x"], q, np.arange(0, 101))                 # percentil local del promedio 0-3
    t["reg"] = reg
    datos[reg] = t
temporadas = sorted(set(int(s) for s in datos["13"].temporada.unique()))
print(f"  temporadas con temperatura: {temporadas[0]}-{temporadas[-1]} ({len(temporadas)}); regiones con todas: "
      f"{sum(1 for r in REGIONES if datos[r].temporada.nunique() == len(temporadas))} de 16", flush=True)


# ---------------------------------------------------------------- ajuste
def controles(d):
    cols, temps = [], sorted(d.temporada.unique())
    nd = np.percentile(d.dos, (5, 27.5, 50, 72.5, 95))
    base = np.column_stack([np.ones(len(d)), rcs(d.dos, nd)])
    for s in temps:
        cols.append(base * (d.temporada.values == s)[:, None])
    dow = np.column_stack([(d.dow.values == k) * 1.0 for k in range(1, 7)])
    return np.column_stack(cols + [dow, d.feriado.values * 1.0])


def ajustar(d, y, xcol="x", nudos=None, extra=None):
    """Ajuste cuasi-Poisson. Devuelve coeficientes y covarianza de la curva de temperatura."""
    d = d[d[y].notna()]
    nudos = np.percentile(d[xcol], NUDOS_P) if nudos is None else nudos
    B = rcs(d[xcol], nudos)
    C = controles(d)
    X = np.column_stack([C, B] + ([extra(d)] if extra else []))
    m = sm.GLM(d[y].values, X, family=sm.families.Poisson()).fit(scale="X2", maxiter=100)
    i = slice(C.shape[1], C.shape[1] + B.shape[1])
    th, V = np.asarray(m.params)[i], np.asarray(m.cov_params())[i, i]
    if not np.all(np.isfinite(th)) or not np.all(np.isfinite(V)) or np.max(np.abs(th[:1])) > 5:
        raise ValueError("ajuste no converge")
    return th, V, nudos, float(m.scale), int(d[y].sum())


def psd(M):
    w, v = np.linalg.eigh((M + M.T) / 2)
    return (v * np.clip(w, 0, None)) @ v.T


def combinar(aj):
    """Metaanálisis multivariado (momentos) y mejor predictor lineal insesgado por región."""
    regs = list(aj)
    TH = np.array([aj[r][0] for r in regs])
    Vs = [aj[r][1] for r in regs]
    psi = psd(np.cov(TH.T) - np.mean(Vs, axis=0)) if len(regs) > 3 else np.zeros_like(Vs[0])
    W = [np.linalg.inv(V + psi + 1e-10 * np.eye(len(V))) for V in Vs]
    Vm = np.linalg.inv(np.sum(W, axis=0))
    media = Vm @ np.sum([w @ t for w, t in zip(W, TH)], axis=0)
    blup = {}
    for r, t, V, w in zip(regs, TH, Vs, W):
        blup[r] = (media + psi @ w @ (t - media), psd(psi - psi @ w @ psi + Vm))
    return media, psd(Vm + psi), blup


def curva(th, V, nudos, xs, q):
    """log RR respecto de la temperatura de menor riesgo entre los percentiles 50 y 95 (umbral)."""
    cand = np.linspace(q[50], q[95], 91)
    umbral = float(cand[np.argmin(rcs(cand, nudos) @ th)])
    D = rcs(xs, nudos) - rcs([umbral], nudos)
    lr = D @ th
    se = np.sqrt(np.clip(np.einsum("ij,jk,ik->i", D, V, D), 0, None))
    sobre = np.asarray(xs) > umbral
    return umbral, np.where(sobre, lr, 0.0), np.where(sobre, lr - 1.96 * se, 0.0), np.where(sobre, lr + 1.96 * se, 0.0)


def ajustar_todo(sub, y, **k):
    aj = {}
    for r in REGIONES:
        try:
            aj[r] = ajustar(sub[r], y, **k)
        except Exception:
            pass
    return aj


def modelo_curva(clave, hasta=None, y=None, **k):
    """Curvas por región de una serie: ajuste por región, combinación y umbral."""
    col, desde, _ = CURVAS[clave]
    y = y or col
    sub = {r: d[(d.temporada >= desde) & ((d.temporada < hasta) if hasta else True)] for r, d in datos.items()}
    aj = ajustar_todo(sub, y, **k)
    media, Vmedia, blup = combinar(aj)
    res = {}
    for r in REGIONES:
        nudos = aj[r][2] if r in aj else np.percentile(sub[r][k.get("xcol", "x")], NUDOS_P)
        th, V = blup[r] if r in aj else (media, Vmedia)
        res[r] = {"th": th, "V": V, "nudos": nudos, "fuente": "región acercada a la curva nacional" if r in aj else "curva nacional",
                  "eventos": aj[r][4] if r in aj else int(sub[r][y].sum()), "dispersion": aj[r][3] if r in aj else None}
    return res, aj


def nacional_apilado(clave):
    """Una sola curva nacional sobre el percentil local, para series con muy pocos casos (nivel 1)."""
    col, desde, _ = CURVAS[clave]
    d = pd.concat([x[(x.temporada >= desde) & x[col].notna()] for x in datos.values()], ignore_index=True)
    nd = np.percentile(d.dos, (5, 27.5, 50, 72.5, 95))
    reg = np.column_stack([(d.reg.values == r) * 1.0 for r in REGIONES])
    tem = np.column_stack([(d.temporada.values == s) * 1.0 for s in sorted(d.temporada.unique())[1:]])
    dow = np.column_stack([(d.dow.values == k) * 1.0 for k in range(1, 7)])
    C = np.column_stack([reg, tem, rcs(d.dos, nd), dow, d.feriado.values * 1.0])
    B = rcs(d.p, NUDOS_P)
    m = sm.GLM(d[col].values, np.column_stack([C, B]), family=sm.families.Poisson()).fit(scale="X2", maxiter=100)
    i = slice(C.shape[1], C.shape[1] + B.shape[1])
    return np.asarray(m.params)[i], np.asarray(m.cov_params())[i, i], int(d[col].sum())


# ---------------------------------------------------------------- curvas principales
cuantiles = {r: np.percentile(datos[r]["x"], np.arange(0, 101)) for r in REGIONES}
modelos, crudos = {}, {}
for clave in CURVAS:
    if clave == "N1":
        continue
    modelos[clave], crudos[clave] = modelo_curva(clave)
    print(f"  {clave}: regiones con ajuste propio {len(crudos[clave])} de 16", flush=True)
th1, V1, n1_eventos = nacional_apilado("N1")

salida_curvas, coef = {}, {}
for r in REGIONES:
    d, q = datos[r], cuantiles[r]
    xs = np.round(np.arange(np.floor(q[1] * 2) / 2, q[100] + 5.01, 0.5), 1)
    salida_curvas[r] = {"grilla": xs.tolist(), "cuantiles_x": np.round(q, 2).tolist(),
                        "cuantiles_tmax": np.round(np.percentile(d.tmax, np.arange(0, 101)), 2).tolist(), "curvas": {}}
    for clave in CURVAS:
        if clave == "N1":                       # curva nacional sobre percentil: se lleva a los grados de la región
            pg, pd_ = np.interp(xs, q, np.arange(0, 101)), d.p.values
            pc = np.linspace(50, 95, 91)
            pu = float(pc[np.argmin(rcs(pc, NUDOS_P) @ th1)])
            um = float(np.interp(pu, np.arange(0, 101), q))

            def ev(pp):
                D = rcs(pp, NUDOS_P) - rcs([pu], NUDOS_P)
                lr, se = D @ th1, np.sqrt(np.clip(np.einsum("ij,jk,ik->i", D, V1, D), 0, None))
                s = np.asarray(pp) > pu
                return np.where(s, lr, 0.0), np.where(s, lr - 1.96 * se, 0.0), np.where(s, lr + 1.96 * se, 0.0)
            (g, glo, ghi), (a, alo, ahi) = ev(pg), ev(pd_)
            fuente, eventos = "curva nacional (pocos casos)", n1_eventos
            coef[(clave, r)] = {"th": th1, "V": V1, "nudos": np.array(NUDOS_P, float), "umbral": pu, "escala": "p"}
        else:
            m = modelos[clave][r]
            um, g, glo, ghi = curva(m["th"], m["V"], m["nudos"], xs, q)
            _, a, alo, ahi = curva(m["th"], m["V"], m["nudos"], d.x.values, q)
            fuente, eventos = m["fuente"], m["eventos"]
            coef[(clave, r)] = {"th": m["th"], "V": m["V"], "nudos": m["nudos"], "umbral": um, "escala": "x"}
        salida_curvas[r]["curvas"][clave] = {"umbral": round(um, 1), "umbral_p": int(round(float(np.interp(um, q, np.arange(0, 101))))),
                                             "rr": np.round(np.exp(g), 4).tolist(), "lo": np.round(np.exp(glo), 4).tolist(),
                                             "hi": np.round(np.exp(ghi), 4).tolist(), "fuente": fuente, "eventos": eventos}
        for suf, v in (("", a), ("_lo", alo), ("_hi", ahi)):
            d[f"af_{clave}{suf}"] = 1 - np.exp(-v)          # fracción atribuible del día: (RR - 1) / RR

# Día de calor extremo y olas de calor
for r in REGIONES:
    d = datos[r]
    p95, p90 = np.percentile(d.tmax, 95), np.percentile(d.tmax, 90)
    salida_curvas[r]["p95_tmax"], salida_curvas[r]["p90_tmax"] = round(float(p95), 1), round(float(p90), 1)
    d["calor"] = d.tmax > p95
    d["ola"] = 0
    n = 0
    for s, g in d.groupby("temporada"):
        sobre = (g.tmax > p90).values
        i = 0
        while i < len(g):
            if sobre[i]:
                j = i
                while j + 1 < len(g) and sobre[j + 1]:
                    j += 1
                if j - i + 1 >= 3:
                    n += 1
                    d.loc[g.index[i:j + 1], "ola"] = n
                i = j + 1
            else:
                i += 1
todo = pd.concat(datos.values(), ignore_index=True)
todo.to_parquet(SALIDA / "region_dia.parquet", index=False)
import pickle
with open(SALIDA / "coeficientes.pkl", "wb") as fh:     # para sortear la incertidumbre al aplicar la fórmula (e5)
    pickle.dump(coef, fh)

# ---------------------------------------------------------------- validación
print("  validación…", flush=True)


def bandas(p, pu):
    return np.where(p <= pu, 0, np.where(p < 90, 1, np.where(p < 95, 2, np.where(p < 99, 3, 4))))


ent, _ = modelo_curva("M_T", hasta=VALIDACION_DESDE)
# En los veranos reservados se estima la razón observada de cada banda de temperatura con un modelo aparte
# (mismos controles por región y temporada, más un indicador por banda) y se compara con la que predice
# la curva ajustada sin esos veranos.
partes, Cs = [], []
for r in REGIONES:
    d = datos[r]
    prueba = d[(d.temporada >= VALIDACION_DESDE) & d.m_t.notna()].copy()
    q = np.percentile(d[d.temporada < VALIDACION_DESDE].x, np.arange(0, 101))
    um, lr, lo, hi = curva(ent[r]["th"], ent[r]["V"], ent[r]["nudos"], prueba.x.values, q)
    prueba["banda"] = bandas(np.interp(prueba.x.values, q, np.arange(0, 101)), np.interp(um, q, np.arange(0, 101)))
    prueba["rr"], prueba["rr_lo"], prueba["rr_hi"] = np.exp(lr), np.exp(lo), np.exp(hi)
    partes.append(prueba)
    Cs.append(controles(prueba))
v = pd.concat(partes, ignore_index=True)
ancho = sum(c.shape[1] for c in Cs)
C, fila, col = np.zeros((len(v), ancho)), 0, 0
for c in Cs:
    C[fila:fila + c.shape[0], col:col + c.shape[1]] = c
    fila, col = fila + c.shape[0], col + c.shape[1]
Bd = np.column_stack([(v.banda.values == k) * 1.0 for k in range(1, 5)])
mv = sm.GLM(v.m_t.values, np.column_stack([C, Bd]), family=sm.families.Poisson()).fit(scale="X2", maxiter=100)
coef, ee = np.asarray(mv.params)[-4:], np.asarray(mv.bse)[-4:]
v["obs"] = v.m_t
v["esp"] = np.asarray(mv.fittedvalues) / np.exp(np.concatenate([[0], coef])[v.banda.values])     # esperadas sin calor
v["pred"], v["pred_lo"], v["pred_hi"] = v.esp * (v.rr - 1), v.esp * (v.rr_lo - 1), v.esp * (v.rr_hi - 1)
NOMBRES_BANDA = ["Bajo el umbral", "Umbral a percentil 90", "Percentil 90 a 95", "Percentil 95 a 99", "Sobre el percentil 99"]
val_bandas = []
for k in range(5):
    g = v[v.banda == k]
    val_bandas.append({"banda": NOMBRES_BANDA[k], "dias_region": int(len(g)), "observadas": int(g.obs.sum()), "esperadas": round(float(g.esp.sum())),
                       "exceso_observado": round(float(g.obs.sum() - g.esp.sum())), "exceso_predicho": round(float(g.pred.sum())),
                       "predicho_lo": round(float(g.pred_lo.sum())), "predicho_hi": round(float(g.pred_hi.sum())),
                       "razon_observada": round(float(g.obs.sum() / g.esp.sum()), 3) if len(g) else None,
                       "razon_observada_ic": [round(float(np.exp(coef[k - 1] - 1.96 * ee[k - 1])), 3), round(float(np.exp(coef[k - 1] + 1.96 * ee[k - 1])), 3)] if k else None,
                       "razon_predicha": round(float(1 + g.pred.sum() / g.esp.sum()), 3) if len(g) else None})
cal = v[v.banda >= 1]
validacion = {"sin_temporadas": [f"{t - 1}-{str(t)[2:]}" for t in range(VALIDACION_DESDE, temporadas[-1] + 1)],
              "bandas": val_bandas,
              "total_sobre_umbral": {"exceso_observado": round(float(cal.obs.sum() - cal.esp.sum())), "exceso_predicho": round(float(cal.pred.sum())),
                                     "predicho_lo": round(float(cal.pred_lo.sum())), "predicho_hi": round(float(cal.pred_hi.sum()))}}
print("   ", json.dumps(validacion["total_sobre_umbral"]), flush=True)
for b in val_bandas:
    print("   ", b["banda"], b["razon_observada"], b["razon_predicha"], b["exceso_observado"], b["exceso_predicho"], flush=True)

# Comparación con el estudio UC (olas de calor de 2017 y 2019)
uc = {}
for ano, ref in ((2017, 584), (2019, 245)):
    g = todo[(todo.fecha.dt.year == ano) & todo.m_t.notna()]
    en_ola = g[g.ola > 0]
    uc[str(ano)] = {"estudio_uc": ref,
                    "en_olas": [round(float((en_ola.m_t * en_ola[f"af_M_T{s}"]).sum())) for s in ("", "_lo", "_hi")],
                    "ano_completo_calido": [round(float((g.m_t * g[f"af_M_T{s}"]).sum())) for s in ("", "_lo", "_hi")]}
print("    UC:", json.dumps(uc), flush=True)


# Sensibilidad: riesgo relativo del percentil 99 respecto del 75, combinado entre regiones
def rr99(aj, xcol="x"):
    num = den = 0.0
    for r, (th, V, nudos, _, _) in aj.items():
        q = np.percentile(datos[r][xcol], (75, 99))
        D = rcs([q[1]], nudos) - rcs([q[0]], nudos)
        lr, va = float(D @ th), float(D @ V @ D.T)
        num, den = num + lr / va, den + 1 / va
    return [round(float(np.exp(num / den)), 4), round(float(np.exp(num / den - 1.96 / den ** 0.5)), 4), round(float(np.exp(num / den + 1.96 / den ** 0.5)), 4)]


base_sub = {r: d[d.temporada >= 1991] for r, d in datos.items()}
sens = {"Principal: máxima, rezagos 0 a 3": rr99(crudos["M_T"]),
        "Rezagos 0 a 7": rr99(ajustar_todo(base_sub, "m_t", xcol="x7"), "x7"),
        "Rezagos 0 a 21": rr99(ajustar_todo(base_sub, "m_t", xcol="x21"), "x21"),
        "Con temperatura mínima como control": rr99(ajustar_todo(base_sub, "m_t", extra=lambda d: rcs(d.tn, np.percentile(d.tn, (10, 50, 90))))),
        "Sin muertes por COVID-19": rr99(ajustar_todo(base_sub, "m_sin_covid")),
        "80 años o más": rr99(crudos["M_2"]), "65 a 79 años": rr99(crudos["M_1"]), "0 a 64 años": rr99(crudos["M_0"])}
for k, x in sens.items():
    print(f"    {k}: {x}", flush=True)

guardar("modelo.json", {
    "version": "modelo-2026.1", "ajustado": dt.date.today().isoformat(),
    "temporadas": [temporadas[0], temporadas[-1]], "defunciones_hasta": str(FIN_DEF.date()),
    "temperatura": "Capital regional (Open-Meteo, reanálisis ERA5). Promedio de la máxima del día y de los 3 días anteriores.",
    "curvas": {k: v[2] for k, v in CURVAS.items()}, "desde": {k: v[1] for k, v in CURVAS.items()},
    "regiones": salida_curvas, "validacion": validacion, "uc": uc, "sensibilidad": sens})
