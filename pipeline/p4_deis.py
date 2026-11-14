"""Impacto observado: vigilancia de mortalidad, señal de urgencias y resumen mensual (RF-28, RF-29).

Insumo: comuna_dia.parquet depurado (DEIS). Hoy cubre las 52 comunas de la RM.
Reglas:
- Muertes esperadas (S10): mediana de la misma semana ISO en los años de referencia
  2015-2019 y desde 2023, sin contar el año evaluado. Rango = mínimo y máximo de esos años.
- Señal de urgencias: valor del día contra la mediana del mismo día de la semana en las 8 semanas previas.
- Privacidad (RNF-07): lo diario sale solo por región; lo comunal de defunciones, por mes.
Salidas: datos/vigilancia.json, datos/urgencias.json, datos/comuna_mes.json, .trabajo/region_dia.parquet
"""
import datetime as dt

import duckdb

from rutas import DEIS, TRABAJO, guardar

con = duckdb.connect()
con.execute(f"""
  create table cd as
  select cast(fecha as date) fecha, cod_comuna, substr(cod_comuna,1,2) cod_region, * exclude (fecha, cod_comuna)
  from '{DEIS}/comuna_dia.parquet'""")
ult_def = con.execute("select max(fecha) from cd where def_total is not null").fetchone()[0]
ult_urg = con.execute("select max(fecha) from cd where urg_total is not null").fetchone()[0]
regiones = [r[0] for r in con.execute("select distinct cod_region from cd order by 1").fetchall()]
print("  regiones con datos:", regiones, "| última defunción:", ult_def, "| última urgencia:", ult_urg)

TRAMOS = {"total": "def_total", "e0_64": "def_0_64", "e65_79": "def_65_79", "e80_mas": "def_80_mas"}
REF = "(a between 2015 and 2019 or a >= 2023)"

# --- Región por día (insumo de episodios; lo diario solo se publica por región) ---
con.execute("""
  create table rd as
  select cod_region, fecha, sum(def_total) def_total, sum(def_0_64) def_0_64, sum(def_65_79) def_65_79,
         sum(def_80_mas) def_80_mas, sum(def_circulatorio) def_circulatorio, sum(def_respiratorio) def_respiratorio,
         sum(urg_total) urg_total, sum(urg_65_mas) urg_65_mas
  from cd where def_total is not null group by 1,2""")
# País = código "00": suma de las regiones (solo si están las 16).
if len(regiones) == 16:
    con.execute("""insert into rd select '00', fecha, sum(def_total), sum(def_0_64), sum(def_65_79), sum(def_80_mas),
                   sum(def_circulatorio), sum(def_respiratorio), sum(urg_total), sum(urg_65_mas) from rd group by fecha""")
    regiones = ["00"] + regiones

# --- Semanas ISO -------------------------------------------------------------
con.execute("""
  create table rs as
  select cod_region, isoyear(fecha) a, least(weekofyear(fecha), 52) s, min(fecha) inicio, count(*) dias,
         sum(def_total) total, sum(def_0_64) e0_64, sum(def_65_79) e65_79, sum(def_80_mas) e80_mas
  from rd group by 1,2,3""")
# Semana 53: se suma a la 52 y se normaliza a 7 días para comparar.
con.execute("update rs set total = total*7.0/dias, e0_64 = e0_64*7.0/dias, e65_79 = e65_79*7.0/dias, e80_mas = e80_mas*7.0/dias where dias > 7")

vig = {"metodo": "Muertes esperadas = mediana de la misma semana en 2015-2019 y desde 2023, sin el año evaluado. "
                 "Rango = mínimo y máximo de esos años.",
       "ultima_defuncion": str(ult_def),
       "cobertura": "Región Metropolitana" if regiones == ["13"] else "Nacional: país y 16 regiones" if len(regiones) == 17 else "regiones " + ", ".join(regiones),
       "tramos": list(TRAMOS), "regiones": {}}
hoy_sem = con.execute("select isoyear(?::date), weekofyear(?::date)", [ult_def, ult_def]).fetchone()
for reg in regiones:
    semanas = []
    filas = con.execute(f"select a, s, inicio, dias, total, e0_64, e65_79, e80_mas from rs where cod_region='{reg}' and a >= 2010 order by a, s").fetchall()
    ref = {}
    for a, s, inicio, dias, *vals in filas:
        if (2015 <= a <= 2019 or a >= 2023) and dias >= 7:
            ref.setdefault(s, []).append((a, vals))
    n = len(filas)
    for i, (a, s, inicio, dias, *vals) in enumerate(filas):
        otros = [v for (aa, v) in ref.get(s, []) if aa != a]
        fila = {"a": a, "s": s, "inicio": str(inicio), "dias": dias, "provisional": i >= n - 4}
        for j, t in enumerate(TRAMOS):
            xs = sorted(v[j] for v in otros)
            fila[t] = None if dias < 7 else round(vals[j])
            if xs:
                m = len(xs)
                med = xs[m // 2] if m % 2 else (xs[m // 2 - 1] + xs[m // 2]) / 2
                fila[t + "_esp"] = [round(xs[0]), round(med), round(xs[-1])]
            else:
                fila[t + "_esp"] = None
        semanas.append(fila)
    vig["regiones"][reg] = semanas
guardar("vigilancia.json", vig)

# --- Señal diaria de urgencias por comuna ------------------------------------
VARS = ["urg_total", "urg_65_mas", "urg_circulatorio", "urg_respiratorio"]
con.execute("create table rec as select * from cd where fecha > ?::date - 100", [ult_urg])
con.execute(f"""
  create table sen as
  select a.cod_comuna, a.fecha, a.urg_n_establecimientos n_est, {', '.join('a.' + v for v in VARS)},
         {', '.join(f"(select median(b.{v}) from rec b where b.cod_comuna=a.cod_comuna and b.{v} is not null "
                    f"and b.fecha in (a.fecha-7, a.fecha-14, a.fecha-21, a.fecha-28, a.fecha-35, a.fecha-42, a.fecha-49, a.fecha-56)) {v}_hab"
                    for v in VARS)},
         (select median(b.urg_n_establecimientos) from rec b where b.cod_comuna=a.cod_comuna
            and b.fecha between a.fecha-56 and a.fecha-1) n_est_hab
  from rec a where a.fecha > ?::date - 42 and a.fecha <= ?::date""", [ult_urg, ult_urg])
urg = {"metodo": "Cada valor se compara con la mediana del mismo día de la semana en las 8 semanas previas. "
                 "La comuna es la del establecimiento que atiende, no la de residencia; solo red pública.",
       "ultima_fecha": str(ult_urg), "campos": ["fecha", "n_est", "n_est_hab"] + [x for v in VARS for x in (v, v + "_hab")],
       "comunas": {}}
informan = {r[0] for r in con.execute("select cod_comuna from rec group by 1 having max(urg_n_establecimientos) > 0").fetchall()}
for row in con.execute("select * from sen order by cod_comuna, fecha").fetchall():
    if row[0] not in informan:
        continue
    cod, fecha, n_est, *resto = row
    vals, habs, n_hab = resto[:4], resto[4:8], resto[8]
    fila = [str(fecha), n_est, None if n_hab is None else round(n_hab)]
    for v, h in zip(vals, habs):
        fila += [v, None if h is None else round(h, 1)]
    urg["comunas"].setdefault(cod, []).append(fila)
guardar("urgencias.json", urg)

# --- Resumen mensual por comuna (lo comunal se publica por mes) --------------
con.execute("""
  create table cm as
  select cod_comuna, year(fecha) a, month(fecha) m, count(*) filter (where def_total is not null) dias_def,
         sum(def_total) def_total, sum(def_65_79)+sum(def_80_mas) def_65_mas,
         sum(urg_total) urg_total, sum(urg_65_mas) urg_65_mas, count(*) dias
  from cd group by 1,2,3""")
cm = {"metodo": "Defunciones por comuna de residencia y mes. Esperadas = mediana del mismo mes en 2015-2019 y desde 2023, sin el año evaluado.",
      "campos": ["a", "m", "def_total", "def_65_mas", "def_esp", "urg_total", "urg_65_mas", "completo"], "comunas": {}}
filas = con.execute("select cod_comuna, a, m, dias_def, dias, def_total, def_65_mas, urg_total, urg_65_mas from cm order by 1,2,3").fetchall()
ref = {}
for cod, a, m, dd, d, dt_, d65, ut, u65 in filas:
    if (2015 <= a <= 2019 or a >= 2023) and dd == d:
        ref.setdefault((cod, m), []).append((a, dt_))
for cod, a, m, dd, d, dt_, d65, ut, u65 in filas:
    xs = sorted(v for (aa, v) in ref.get((cod, m), []) if aa != a)
    med = None
    if xs:
        k = len(xs)
        med = xs[k // 2] if k % 2 else (xs[k // 2 - 1] + xs[k // 2]) / 2
    cm["comunas"].setdefault(cod, []).append([a, m, dt_, d65, med, ut, u65, dd == d])
guardar("comuna_mes.json", cm)

con.execute(f"copy rd to '{TRABAJO}/region_dia.parquet' (format parquet)")
con.execute(f"copy (select * from rs) to '{TRABAJO}/region_semana.parquet' (format parquet)")
print("  listo")
