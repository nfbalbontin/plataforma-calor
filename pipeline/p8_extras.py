"""Datos para filtros, agregaciones, hospitales y regla de alerta.

Salidas (datos/):
- provincias.json: provincia de cada comuna (nombre del Censo 2024).
- def_region_dia.json: defunciones diarias por país y región y tramo de edad (lo diario solo por región, RNF-07).
- def_comuna_mes.json: defunciones mensuales por comuna y tramo de edad (lo comunal solo por mes).
- def_calor_certificado.json: defunciones con causa certificada por calor (CIE-10 X30 o T67), por región, año y mes.
- manzana_stats.json: promedio y desviación estándar por comuna de los valores de sus manzanas.
- urg_establecimiento.json: atenciones de urgencia por establecimiento y su comportamiento en días de calor.
- evidencia_alerta.json: defunciones de 65+ en la RM según nivel y persistencia del calor (respaldo de la regla de alerta).

Uso: python p8_extras.py [STAGE_URGENCIAS]   (carpeta con ok_<año>.parquet de n1_nacional.py; opcional)
"""
import datetime as dt
import io
import json
import math
import os
import subprocess
import sys
import zipfile
from pathlib import Path

import duckdb

from rutas import CONFIG, DATOS, DEIS, TRABAJO, guardar

DL = Path.home() / "Downloads"
con = duckdb.connect()
MENORES = {"De", "Del", "La", "Las", "Los", "Y", "El"}


def titulo(s):
    p = [w.capitalize() for w in s.strip().split()]
    return " ".join(w.lower() if i and w in MENORES else w for i, w in enumerate(p))


# ---------------- Provincias ----------------
z = zipfile.ZipFile(DL / "Base_manzana_entidad_CPV24.zip")
nombre = [i for i in z.namelist() if i.endswith(".csv")][0]
prov = {}
with z.open(nombre) as f:
    t = io.TextIOWrapper(f, encoding="utf-8-sig")
    cab = t.readline().rstrip("\n").split(";")
    i_cut, i_prov = cab.index("CUT"), cab.index("PROVINCIA")
    for linea in t:
        c = linea.split(";", max(i_cut, i_prov) + 1)
        prov.setdefault(c[i_cut].zfill(5), c[i_prov])
comunas = json.loads((DATOS / "comunas.json").read_text())
lista = {}
for c in comunas:
    cp = c["cod"][:3]
    lista.setdefault(cp, {"cod": cp, "nombre": titulo(prov.get(c["cod"], f"Provincia {cp}")), "cod_region": c["cod_region"], "comunas": []})["comunas"].append(c["cod"])
guardar("provincias.json", sorted(lista.values(), key=lambda p: p["cod"]))
print("  provincias:", len(lista))

# ---------------- Defunciones filtrables ----------------
con.execute(f"create table cd as select cast(fecha as date) fecha, cod_comuna, substr(cod_comuna,1,2) reg, def_total, def_0_64, def_65_79, def_80_mas from '{DEIS}/comuna_dia.parquet'")
ini, fin = con.sql("select min(fecha), max(fecha) filter (where def_total is not null) from cd").fetchone()
TR = {"total": "def_total", "e0_64": "def_0_64", "e65_79": "def_65_79", "e80_mas": "def_80_mas"}
terr = {}
for reg, expr in [("00", "true")] + [(r[0], f"reg='{r[0]}'") for r in con.sql("select distinct reg from cd order by 1").fetchall()]:
    filas = con.sql(f"select {', '.join(f'sum({v})' for v in TR.values())} from cd where {expr} and fecha <= DATE '{fin}' group by fecha order by fecha").fetchall()
    terr[reg] = {k: [int(f[i]) for f in filas] for i, k in enumerate(TR)}
guardar("def_region_dia.json", {"inicio": str(ini), "fin": str(fin), "territorios": terr})
meses = [r[0] for r in con.sql(f"select distinct strftime(fecha, '%Y-%m') from cd where fecha <= DATE '{fin}' order by 1").fetchall()]
completo_hasta = meses[-1] if (fin + dt.timedelta(days=1)).day == 1 else meses[-2]
cm = {}
for cod, m, *vals in con.sql(f"select cod_comuna, strftime(fecha, '%Y-%m') m, {', '.join(f'sum({v})' for v in TR.values())} from cd where fecha <= DATE '{fin}' group by 1,2 order by 1,2").fetchall():
    d = cm.setdefault(cod, {k: [] for k in TR})
    for k, v in zip(TR, vals):
        d[k].append(int(v))
guardar("def_comuna_mes.json", {"meses": meses, "completo_hasta": completo_hasta, "comunas": cm})

# ---------------- Defunciones con causa certificada por calor ----------------
tmp = TRABAJO / "deis_tmp"
tmp.mkdir(exist_ok=True)
cert = []
for f in ("DEFUNCIONES_FUENTE_DEIS_1990_2023_CIFRAS_OFICIALES", "DEFUNCIONES_FUENTE_DEIS_2024_2026_10112026"):
    subprocess.run(["unzip", "-o", "-q", str(DL / f"{f}.zip"), f"{f}.csv", "-d", str(tmp)], check=True)
    cert += con.sql(f"""select year(try_cast(FECHA_DEF as date)) a, month(try_cast(FECHA_DEF as date)) m, substr(lpad(trim(COD_COMUNA),5,'0'),1,2) reg,
            case when DIAG1 like 'X30%' or DIAG2 like 'X30%' then 'X30' else 'T67' end causa, count(*) n
        from read_csv('{tmp}/{f}.csv', delim=';', header=true, all_varchar=true, encoding='latin-1')
        where try_cast(FECHA_DEF as date) >= DATE '2010-01-01' and (DIAG1 like 'X30%' or DIAG2 like 'X30%' or DIAG1 like 'T67%' or DIAG2 like 'T67%')
        group by all order by all""").fetchall()
    os.remove(tmp / f"{f}.csv")
guardar("def_calor_certificado.json", {
    "definicion": "Defunciones cuya causa básica o causa externa es exposición al calor natural excesivo (CIE-10 X30) o efectos del calor y de la luz (T67).",
    "nota": "Se publican solo por región, año y mes. El calor rara vez se certifica como causa: estas cifras subestiman las muertes relacionadas con el calor.",
    "total": sum(r[4] for r in cert),
    "filas": [{"a": a, "m": m, "cod_region": reg, "causa": causa, "n": n} for a, m, reg, causa, n in cert]})
print("  defunciones certificadas por calor desde 2010:", sum(r[4] for r in cert), "| por región:", sorted({(r[2]) for r in cert}))

# ---------------- Estadísticas de manzanas por comuna ----------------
st = {}
for r in con.sql(f"""select cod_comuna, count(*) n, avg(poblacion), stddev_samp(poblacion), avg(mayores), stddev_samp(mayores), max(mayores),
        avg(pct_mayores), stddev_samp(pct_mayores), sum(discapacidad), sum(viviendas_hacinadas)
        from '{TRABAJO}/manzana.parquet' where poblacion > 0 group by 1""").fetchall():
    f = lambda v, d=1: None if v is None or (isinstance(v, float) and math.isnan(v)) else round(v, d)
    st[r[0]] = {"n": r[1], "pob_prom": f(r[2]), "pob_de": f(r[3]), "may_prom": f(r[4]), "may_de": f(r[5]), "may_max": r[6],
                "pct_prom": f(r[7], 3), "pct_de": f(r[8], 3), "discapacidad": int(r[9] or 0), "hacinadas": int(r[10] or 0)}
guardar("manzana_stats.json", st)

# ---------------- Días de calor por región (episodios) ----------------
ep = json.loads((DATOS / "episodios.json").read_text()) if (DATOS / "episodios.json").exists() else {"episodios": []}
dias_calor = {}
for e in ep["episodios"]:
    dias_calor.setdefault(e["cod_region"], set()).update(e["niveles"].keys())

# ---------------- Urgencias por establecimiento ----------------
stage = Path(sys.argv[1]) if len(sys.argv) > 1 else None
if stage and list(stage.glob("ok_*.parquet")):
    con.execute(f"""create table ue as select id, comuna, fecha, sum(total) filter (where idcausa=1) total, sum(de65) filter (where idcausa=1) m65,
        sum(total) filter (where idcausa=25) hosp from read_parquet('{stage}/ok_*.parquet') where fecha >= DATE '2015-01-01' group by all""")
    ult = con.sql("select max(fecha) from ue").fetchone()[0]
    con.execute("create table calor (reg varchar, fecha date)")
    for reg, fs in dias_calor.items():
        con.executemany("insert into calor values (?, ?)", [(reg, f) for f in fs])
    # Lo habitual de cada día: mediana del mismo día de la semana en las 8 semanas previas.
    con.execute("""create table uh as select a.*, (select median(b.m65) from ue b where b.id=a.id and b.fecha in
        (a.fecha-7, a.fecha-14, a.fecha-21, a.fecha-28, a.fecha-35, a.fecha-42, a.fecha-49, a.fecha-56)) hab
        from ue a where a.fecha > ?::date - 35 or (substr(a.comuna,1,2), a.fecha) in (select reg, fecha from calor)""", [ult])
    filas = con.execute("""select id, any_value(comuna) com,
        avg(total) filter (where fecha > ?::date - 35 and fecha <= ?::date - 7) total_prom, avg(m65) filter (where fecha > ?::date - 35 and fecha <= ?::date - 7) m65_prom,
        avg(hosp) filter (where fecha > ?::date - 35 and fecha <= ?::date - 7) hosp_prom,
        max(fecha) filter (where fecha <= ?::date - 2) ult_fecha,
        count(*) filter (where (substr(comuna,1,2), fecha) in (select reg, fecha from calor) and hab > 0) dias_calor,
        count(*) filter (where (substr(comuna,1,2), fecha) in (select reg, fecha from calor) and hab > 0 and m65 >= 1.15 * hab) dias_alza,
        avg(m65 / hab) filter (where (substr(comuna,1,2), fecha) in (select reg, fecha from calor) and hab > 0) razon_calor
        from uh group by id having max(fecha) > ?::date - 35""", [ult] * 8).fetchall()
    est = []
    for i, com, tp, mp, hp, uf, dc, da, rc in filas:
        u = con.sql("select m65, hab from uh where id = ? and fecha = ?", params=[i, uf]).fetchone() if uf else None
        est.append({"id": i, "com": com, "total_prom": None if tp is None else round(tp, 1), "m65_prom": None if mp is None else round(mp, 1),
                    "hosp_prom": None if hp is None else round(hp, 1), "ult_fecha": str(uf) if uf else None,
                    "ult_m65": None if not u or u[0] is None else int(u[0]), "ult_hab": None if not u or u[1] is None else round(u[1], 1),
                    "dias_calor": dc, "dias_alza": da, "razon_calor": None if rc is None else round(rc, 3)})
    guardar("urg_establecimiento.json", {
        "ultima_fecha": str(ult),
        "metodo": "Promedios diarios de las cuatro semanas anteriores a la última. «Días de calor»: días de los episodios de calor de su región desde 2015. "
                  "«Alza»: atenciones de 65 años o más al menos 15 % sobre la mediana del mismo día de la semana en las 8 semanas previas.",
        "nota": "Los datos abiertos del DEIS no dicen en qué establecimiento ocurre cada defunción; por eso se usa la atención de urgencia.",
        "regiones_con_episodios": sorted(dias_calor), "establecimientos": est})
    print("  establecimientos con urgencias recientes:", len(est))
    # Se agrega a los archivos del mapa el resumen de urgencias de cada establecimiento (por código nuevo o antiguo).
    cat = json.loads((DATOS / "establecimientos.json").read_text())["establecimientos"]
    por_id = {e["id"]: e for e in est}
    pub = DATOS.parent / "public" / "datos"
    con_u = 0
    for reg in sorted({c["reg"] for c in cat if c["reg"]}):
        ruta = pub / f"establecimientos_{reg}.json"
        if not ruta.exists():
            continue
        antiguo = {c["cod"]: c.get("cod_antiguo") for c in cat if c["reg"] == reg}
        lista = json.loads(ruta.read_text())
        for e in lista:
            u = por_id.get(e["cod"]) or por_id.get(antiguo.get(e["cod"]) or "")
            if u:
                e["u"] = {"m65": u["m65_prom"], "ult": u["ult_m65"], "hab": u["ult_hab"], "dc": u["dias_calor"], "da": u["dias_alza"]}
                con_u += 1
            else:
                e.pop("u", None)
        ruta.write_text(json.dumps(lista, ensure_ascii=False, separators=(",", ":"), allow_nan=False))
    print("  establecimientos del mapa con resumen de urgencias:", con_u)
else:
    print("  sin carpeta de urgencias por establecimiento: se conserva el archivo anterior")

# ---------------- Evidencia para la regla de alerta (RM) ----------------
um = json.loads((CONFIG / "umbrales.json").read_text())
cap, hist = "13101", TRABAJO / "clima"
gr = json.loads((hist / "grupos.json").read_text())[cap]
u = um["comunas"].get(cap)
serie = {}
for f in sorted((hist / gr["rep"]).glob("*.json")):
    d = json.loads(f.read_text())
    for fe, t in zip(d["fecha"], d["tmean"]):
        if t is not None:
            serie[fe] = t + gr["dif"]["tmean"]
muertes = dict(con.sql("select strftime(fecha, '%Y-%m-%d'), sum(def_65_79 + def_80_mas) from cd where reg='13' and def_total is not null group by 1").fetchall())
nivel = {f: (3 if t >= u["p99"] else 2 if t >= u["p95"] else 1 if t >= u["p90"] else 0) for f, t in serie.items()}
fechas = sorted(f for f in nivel if f in muertes and not ("2020-03" <= f[:7] <= "2022-12"))
base = {}
for f in fechas:
    if nivel[f] == 0:
        base.setdefault(f[:7], []).append(muertes[f])
base = {k: sum(v) / len(v) for k, v in base.items() if len(v) >= 5}
racha = {}
for f in sorted(nivel):
    ayer = (dt.date.fromisoformat(f) - dt.timedelta(days=1)).isoformat()
    racha[f] = (racha.get(ayer, 0) + 1) if nivel[f] >= 1 else 0


def resumen(dias, rezago=0):
    rs = []
    for f in dias:
        g = (dt.date.fromisoformat(f) + dt.timedelta(days=rezago)).isoformat()
        if g in muertes and g[:7] in base and not ("2020-03" <= g[:7] <= "2022-12"):
            rs.append(muertes[g] / base[g[:7]])
    if len(rs) < 5:
        return {"dias": len(rs), "razon": None, "ic": None}
    m = sum(rs) / len(rs)
    ee = (sum((x - m) ** 2 for x in rs) / (len(rs) - 1)) ** 0.5 / len(rs) ** 0.5
    return {"dias": len(rs), "razon": round(m, 3), "ic": [round(m - 1.96 * ee, 3), round(m + 1.96 * ee, 3)]}


cat = {
    "Nivel 0": [f for f in fechas if nivel[f] == 0],
    "Nivel 1, primer o segundo día": [f for f in fechas if nivel[f] == 1 and racha[f] <= 2],
    "Nivel 1 o más, tercer día seguido o posterior": [f for f in fechas if nivel[f] >= 1 and racha[f] >= 3],
    "Nivel 2 o más": [f for f in fechas if nivel[f] >= 2],
    "Nivel 2 o más, segundo día seguido o posterior": [f for f in fechas if nivel[f] >= 2 and racha[f] >= 2],
    "Nivel 3": [f for f in fechas if nivel[f] == 3],
}
ev = {"territorio": "Región Metropolitana; temperatura de la comuna de Santiago", "periodo": f"{fechas[0]} a {fechas[-1]}, noviembre a marzo, sin marzo 2020 a diciembre 2022",
      "metodo": "Razón entre las defunciones de 65 años o más del día y el promedio de los días de nivel 0 del mismo mes y año. "
                "Intervalo del 95 % del promedio. Es una descripción, no un modelo: no controla contaminación, feriados ni rezagos largos.",
      "umbrales": um["version"],
      "filas": [{"categoria": k, **{f"rezago_{r}": resumen(v, r) for r in (0, 1, 2)}} for k, v in cat.items()]}
guardar("evidencia_alerta.json", ev)
for fila in ev["filas"]:
    print("  ", fila["categoria"], "|", " | ".join(f"r{r}: {fila[f'rezago_{r}']['razon']} {fila[f'rezago_{r}']['ic']} n={fila[f'rezago_{r}']['dias']}" for r in (0, 1, 2)))
