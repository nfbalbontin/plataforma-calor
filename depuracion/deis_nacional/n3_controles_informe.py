"""Controles de la depuración nacional e informe. Termina con error si un control obligatorio falla.

Control principal: el subconjunto de la RM de la tabla nacional debe ser idéntico, celda por celda,
a la tabla de la RM ya aprobada (depurado/comuna_dia.parquet y depurado/rem_dependencia.csv).
Uso: n3_controles_informe.py DEPURADO_RM DEPURADO_NACIONAL STAGE
"""
import json
import sys

import duckdb
import pandas as pd

RM, NAC, ST = sys.argv[1:4]
con = duckdb.connect()
fallas, L = [], []


def control(nombre, ok, detalle=""):
    L.append(f"| {nombre} | {'✔' if ok else '✘'} | {detalle} |")
    print(("  ✔ " if ok else "  ✘ ") + nombre + (f": {detalle}" if detalle else ""))
    if not ok:
        fallas.append(nombre)


n = lambda x: f"{int(x):,}".replace(",", ".")
con.execute(f"create view nac as select * from '{NAC}/comuna_dia.parquet'")
con.execute(f"create view rm as select * from '{RM}/comuna_dia.parquet'")
cols = [r[0] for r in con.sql("describe rm").fetchall()]
filas, fechas, comunas = con.sql("select count(*), count(distinct fecha), count(distinct cod_comuna) from nac").fetchone()
control("346 comunas en todas las fechas", comunas == 346 and filas == 346 * fechas, f"{n(filas)} filas = 346 × {n(fechas)} días")
control("Sin llaves (fecha, comuna) repetidas", con.sql("select count(*) - count(distinct (fecha, cod_comuna)) from nac").fetchone()[0] == 0)

# 1. Identidad con la tabla de la RM
n_rm = con.sql("select count(*) from rm").fetchone()[0]
n_sub = con.sql("select count(*) from nac where cod_comuna like '13%'").fetchone()[0]
dif = con.sql(f"""select count(*) from rm full join (select * from nac where cod_comuna like '13%') s using (fecha, cod_comuna)
    where {' or '.join(f'rm.{c} is distinct from s.{c}' for c in cols if c not in ('fecha', 'cod_comuna'))}""").fetchone()[0]
control("RM de la tabla nacional idéntica a la tabla de la RM aprobada", n_rm == n_sub and dif == 0,
        f"{n(n_sub)} filas contra {n(n_rm)}; {dif} filas con alguna diferencia en {len(cols) - 2} columnas")

# 2. Defunciones: nada se pierde
ds = pd.read_csv(f"{ST}/def_stats.csv", dtype={"ano": str})
tab = ds.pivot_table(index="ano", columns="motivo", values="n", aggfunc="sum", fill_value=0)
por_ano = dict(con.sql("select left(fecha,4), sum(def_total) from nac group by 1").fetchall())
ok = all(int(tab.loc[a].get("conservada", 0)) == int(por_ano.get(a, 0)) for a in tab.index if a != "1990-2009")
control("Defunciones conservadas por año = suma de la tabla", ok)
control("Tramos de edad suman el total (0-64, 65-79, 80+)", con.sql("select count(*) from nac where def_total is not null and def_0_64+def_65_79+def_80_mas<>def_total").fetchone()[0] == 0)
control("Tramos del documento suman el total (0-64, 65-74, 75-84, 85+)", con.sql("select count(*) from nac where def_total is not null and def_0_64+def_65_74+def_75_84+def_85_mas<>def_total").fetchone()[0] == 0)

# 3. Urgencias: nada se pierde
us = pd.read_csv(f"{ST}/urg_stats.csv")
for c in ("sin_comuna", "comuna_desconocida", "fuera_periodo", "ok"):
    if c not in us:
        us[c] = 0
m = json.load(open(f"{ST}/controles_maestra.json"))
control("Urgencias: la suma de la tabla coincide con los registros conservados", m["urg_sin_perdida"] == 0)
control("Urgencias: ninguna fila sin comuna asignada", int(us["sin_comuna"].sum()) == 0, f"{n(us['sin_comuna'].sum())} filas")
control("Urgencias: ninguna comuna fuera del Censo", int(us["comuna_desconocida"].sum()) == 0, f"{n(us['comuna_desconocida'].sum())} filas")
control("Urgencias: ninguna llave con cifras distintas", int(us["llaves_en_conflicto"].sum()) == 0)

# 4. REM
con.execute(f"create view rem as select * from read_csv('{NAC}/rem_dependencia.csv', header=true, all_varchar=true)")
con.execute(f"create view rem_rm as select * from read_csv('{RM}/rem_dependencia.csv', header=true, all_varchar=true)")
rc = [r[0] for r in con.sql("describe rem_rm").fetchall()]
llave = ["ano", "mes", "id_establecimiento", "codigo"]
a, b = con.sql("select count(*) from rem_rm").fetchone()[0], con.sql("select count(*) from rem where cod_comuna like '13%'").fetchone()[0]
dif_rem = con.sql(f"""select count(*) from rem_rm full join (select * from rem where cod_comuna like '13%') s using ({', '.join(llave)})
    where {' or '.join(f'rem_rm.{c} is distinct from s.{c}' for c in rc if c not in llave)}""").fetchone()[0]
control("REM: RM de la tabla nacional idéntica a la tabla de la RM aprobada", a == b and dif_rem == 0, f"{n(b)} filas contra {n(a)}; {dif_rem} con diferencias")
rs = pd.read_csv(f"{NAC}/rem_stats.csv")
control("REM: sin llaves duplicadas ni región incoherente", int(rs["llaves_duplicadas"].sum()) == 0 and int(rs["region_incoherente"].sum()) == 0)

# ---------------- Informe ----------------
I = ["# Informe de depuración · datos DEIS nacionales", "",
     f"Generado con `src/depuracion/n1_nacional.py`, `n2_rem_nacional.py` y `n3_controles_informe.py`. "
     "Mismas reglas que la depuración de la RM (ver `../depurado/informe.md`), sin el filtro de región. Los originales no se modificaron.", "",
     "## Salidas", "",
     f"- `comuna_dia.parquet`: {n(filas)} filas × {len(con.sql('describe nac').fetchall())} columnas; 346 comunas × {n(fechas)} días (2010-01-01 a {m['fin']}). "
     f"Defunciones hasta el {m['def_fin']}; después quedan nulas.",
     "- `rem_dependencia.csv`: REM Serie P (P3 y P5), cortes de junio y diciembre 2024-2026, todas las regiones.",
     "- Columnas nuevas respecto de la tabla de la RM: `def_65_74`, `def_75_84`, `def_85_mas` (tramos del documento de requerimientos).", "",
     "## Controles", "", "| Control | Resultado | Detalle |", "|---|---|---|", *L, "",
     "## Defunciones por año", "",
     "| Año | Leídas | Conservadas | Sin comuna (vacía o 99999) | Comuna fuera del Censo | Sin fecha | Antes de 2010 |", "|---|---:|---:|---:|---:|---:|---:|"]
for a_ in tab.index:
    g = lambda k: n(tab.loc[a_].get(k, 0))
    I.append(f"| {a_} | {n(tab.loc[a_].sum())} | {g('conservada')} | {g('sin_comuna')} | {g('comuna_desconocida')} | {g('sin_fecha')} | {g('antes_2010')} |")
I += ["", "Las defunciones sin comuna no entran a ninguna comuna ni región, así que el total nacional de la tabla queda bajo el del archivo en esa cantidad.",
      "", "## Urgencias por archivo", "",
      "| Archivo | Leídas | Otras causas | Fuera del periodo | Sin fecha | Sin comuna | Duplicados eliminados | Conservadas | Comuna vía mapa |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|"]
for r in us.itertuples():
    I.append(f"| {r.ano_archivo} | {n(r.filas_leidas)} | {n(r.otra_causa)} | {n(r.fuera_periodo)} | {n(r.sin_fecha)} | {n(r.sin_comuna)} | {n(r.duplicados_exactos)} | {n(r.ok - r.duplicados_exactos)} | {n(r.filas_por_mapa)} |")
I += ["", "## Urgencias: cobertura por año", "", "| Año | Días con datos | Comunas que informan | Establecimientos que informan |", "|---|---:|---:|---:|"]
for r in m["urg_por_ano"]:
    I.append(f"| {r['ano']} | {r['dias']} | {r['comunas']} | {r['establecimientos']} |")
sin_urg = m["comunas_sin_urgencias"]
I += ["", f"**Comunas que nunca informan urgencias ({len(sin_urg)}):** {', '.join(sin_urg) if sin_urg else 'ninguna'}. "
      "No tienen un establecimiento de urgencia de la red pública que informe; en la plataforma aparecen como «sin dato».",
      "", f"**Comunas sin defunciones en todo el periodo:** {', '.join(m['comunas_sin_defunciones']) or 'ninguna'}.", "",
      "## REM por año", "", "| Año | Leídas | Conservadas | n_total nulo | n_65_mas nulo | n_65_mas > n_total | Establecimientos | Comunas | Regiones |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|"]
for r in rs.itertuples():
    I.append(f"| {r.ano} | {n(r.filas_leidas)} | {n(r.conservadas)} | {r.n_total_nulo} | {r.n_65_nulo} | {r.n65_mayor_total} | {n(r.establecimientos)} | {r.comunas} | {r.regiones} |")
I += ["", "Las filas con `n_65_mas > n_total` y con `n_total` nulo vienen así del origen y están fuera de la RM; no se corrigieron.", "",
      "## Advertencias", "",
      "- **Últimos días incompletos**, igual que en la RM: defunciones por día al cierre " + ", ".join(f"{f[5:]} {int(v)}" for f, v in m["def_ultimos"]) + ".",
      "- Establecimientos que informan urgencias en los últimos días: " + ", ".join(f"{f[5:]} {int(e)}" for f, e, _ in m["urg_ultimos"]) + ".",
      "- Las urgencias registran la comuna del establecimiento y solo la red pública. En comunas con hospitales grandes la señal incluye pacientes de otras comunas.",
      "- Las defunciones 2024-2026 son preliminares (`def_provisional`).", ""]
open(f"{NAC}/informe.md", "w", encoding="utf-8").write("\n".join(I))
print("\nTodos los controles pasan." if not fallas else f"\n{len(fallas)} controles fallan: {fallas}")
sys.exit(1 if fallas else 0)
