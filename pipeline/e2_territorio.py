"""Etapa 2 · Territorio: comuna -> Servicio de Salud -> hospital de referencia, y población por año.

Regla de asignación (propia, declarada en la metodología):
1. Cada comuna va al Servicio de Salud de la mayoría de sus establecimientos públicos (catálogo del DEIS).
   Si no tiene ninguno, al Servicio de la comuna más cercana de su región.
2. Su hospital de referencia es el hospital público con urgencia hospitalaria de ese Servicio que queda
   más cerca del centro poblado de la comuna (distancia en línea recta).
3. Si existe config/derivacion.json con {cod_comuna: código_de_hospital}, reemplaza a la regla de cercanía.

Salidas: datos/territorio.json  (comunas, hospitales con su área, servicios)
         .trabajo/pob_comuna_ano.parquet  (cod_comuna, ano, pob_total, pob_65, pob_80), INE 2002-2035
"""
import json
import math

import duckdb
import pandas as pd

from rutas import ANALISIS, CONFIG, DATOS, ESTABLECIMIENTOS_NACIONAL, TRABAJO, guardar

comunas = json.loads((DATOS / "comunas.json").read_text())
con = duckdb.connect()
con.execute(f"""create table e as select EstablecimientoCodigoAntiguo antiguo, EstablecimientoCodigo codigo, EstablecimientoGlosa nombre,
    SeremiSaludCodigo_ServicioDeSaludCodigo ss, SeremiSaludGlosa_ServicioDeSaludGlosa ss_nombre, TipoEstablecimientoGlosa tipo,
    lpad(ComunaCodigo,5,'0') comuna, TipoUrgencia urgencia, try_cast(Latitud as double) lat, try_cast(Longitud as double) lon,
    NivelComplejidadEstabGlosa complejidad
  from read_csv('{ESTABLECIMIENTOS_NACIONAL}', delim=';', header=true, all_varchar=true)
  where TipoSistemaSaludGlosa='Público' and TipoPertenenciaEstabGlosa like 'Perteneciente%'
    and lower(EstadoFuncionamiento) like 'vigente%' and SeremiSaludGlosa_ServicioDeSaludGlosa like 'Servicio de Salud%'""")


def km(a, b):
    """Distancia en línea recta entre dos puntos [lon, lat]."""
    r = math.pi / 180
    h = math.sin((b[1] - a[1]) * r / 2) ** 2 + math.cos(a[1] * r) * math.cos(b[1] * r) * math.sin((b[0] - a[0]) * r / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


# 1) Servicio de Salud de cada comuna
ss_nombre = dict(con.sql("select ss, any_value(ss_nombre) from e group by 1").fetchall())
ss_de = dict(con.sql("select comuna, mode(ss) from e group by 1").fetchall())
punto = {c["cod"]: c["punto_clima"] or ([(c["bbox"][0] + c["bbox"][2]) / 2, (c["bbox"][1] + c["bbox"][3]) / 2] if c["bbox"] else None) for c in comunas}
for c in comunas:                      # sin punto ni polígono (Antártica): se usa la capital de su región
    if punto[c["cod"]] is None:
        punto[c["cod"]] = punto[c["cod"][:2] + "101"]
sin_ss = [c["cod"] for c in comunas if c["cod"] not in ss_de]
for cod in sin_ss:
    vecinas = [c["cod"] for c in comunas if c["cod"][:2] == cod[:2] and c["cod"] in ss_de]
    ss_de[cod] = ss_de[min(vecinas, key=lambda v: km(punto[cod], punto[v]))]

# 2) Hospital de referencia
# Hospitales generales con urgencia hospitalaria: se excluyen los pediátricos y los institutos de especialidad,
# que no reciben a toda la población de un territorio.
EXCLUIR = ("niños", "infantil", "pediátric", "instituto", "psiquiátric", "geriátric", "exequiel gonzález cortés")
hosp = [h for h in con.sql("""select antiguo, codigo, nombre, ss, comuna, lat, lon, complejidad from e
                  where tipo='Hospital' and urgencia = 'Urgencia Hospitalaria (UEH)' and lat is not null and lon is not null""").fetchall()
        if not any(x in h[2].lower() for x in EXCLUIR)]
ids_urg = {r[0] for r in con.sql(f"select distinct id from read_parquet('{TRABAJO}/deis_stage/urg/ok_*.parquet')").fetchall()}
derivacion = json.loads((CONFIG / "derivacion.json").read_text()) if (CONFIG / "derivacion.json").exists() else {}
hospitales, salida_comunas = {}, {}
for c in comunas:
    cod, ss = c["cod"], ss_de[c["cod"]]
    cand = [h for h in hosp if h[3] == ss]
    regla = "cercanía"
    if cod in derivacion:
        cand, regla = [h for h in hosp if h[1] == derivacion[cod]], "mapa de derivación"
    if not cand:                      # Servicio sin hospital con urgencia: el más cercano del país
        cand, regla = hosp, "cercanía fuera del Servicio"
    h = min(cand, key=lambda x: km(punto[cod], [x[6], x[5]]))
    d = km(punto[cod], [h[6], h[5]])
    salida_comunas[cod] = {"ss": ss, "hospital": h[1], "dist_km": round(d, 1), "regla": regla}
    hospitales.setdefault(h[1], {"cod": h[1], "antiguo": h[0], "nombre": h[2], "ss": h[3], "comuna": h[4], "lat": h[5], "lon": h[6],
                                 "complejidad": h[7], "con_urgencias": h[0] in ids_urg, "area": []})["area"].append(cod)
# Hospitales con urgencia que no son referencia de ninguna comuna: se listan igual, sin área.
for h in hosp:
    hospitales.setdefault(h[1], {"cod": h[1], "antiguo": h[0], "nombre": h[2], "ss": h[3], "comuna": h[4], "lat": h[5], "lon": h[6],
                                 "complejidad": h[7], "con_urgencias": h[0] in ids_urg, "area": []})
guardar("territorio.json", {
    "regla": "Cada comuna va al Servicio de Salud de la mayoría de sus establecimientos públicos. Su hospital de referencia es el hospital público general con urgencia hospitalaria de ese Servicio más cercano a su centro poblado, en línea recta; no se consideran hospitales pediátricos ni institutos de especialidad. Es una aproximación propia: no es el mapa oficial de derivación.",
    "catalogo": ESTABLECIMIENTOS_NACIONAL.name,
    "servicios": {k: v.replace("Servicio de Salud ", "") for k, v in ss_nombre.items()},
    "comunas": salida_comunas, "hospitales": hospitales})
ref = [h for h in hospitales.values() if h["area"]]
print(f"  comunas con hospital: {len(salida_comunas)} de {len(comunas)} | Servicios: {len(set(ss_de.values()))} | hospitales de referencia: {len(ref)} "
      f"de {len(hospitales)} con urgencia | sin datos de urgencia: {sum(1 for h in ref if not h['con_urgencias'])}")
print(f"  comunas sin establecimiento público (Servicio por vecindad): {sin_ss}")
ds = sorted(v["dist_km"] for v in salida_comunas.values())
print(f"  distancia al hospital: mediana {ds[len(ds)//2]} km, máxima {ds[-1]} km; fuera del Servicio: "
      f"{[k for k, v in salida_comunas.items() if v['regla'] != 'cercanía']}")

# 3) Población por comuna y año (INE, estimaciones y proyecciones base 2017)
d = pd.read_excel(ANALISIS / "datos/ine/estimaciones-y-proyecciones-2002-2035-comunas.xlsx", sheet_name=0).dropna(subset=["Edad", "Comuna"])
anos = [c for c in d.columns if str(c).startswith("Poblacion ")]
d["cod_comuna"] = d["Comuna"].astype(int).astype(str).str.zfill(5)
largo = d.melt(id_vars=["cod_comuna", "Edad"], value_vars=anos, var_name="ano", value_name="p")
largo["ano"] = largo["ano"].str[-4:].astype(int)
largo["p65"] = largo["p"].where(largo["Edad"] >= 65, 0)
largo["p80"] = largo["p"].where(largo["Edad"] >= 80, 0)
pob = largo.groupby(["cod_comuna", "ano"], as_index=False).agg(pob_total=("p", "sum"), pob_65=("p65", "sum"), pob_80=("p80", "sum"))
pob.to_parquet(TRABAJO / "pob_comuna_ano.parquet", index=False)
faltan = sorted(set(salida_comunas) - set(pob["cod_comuna"]))
print(f"  población INE: {pob['cod_comuna'].nunique()} comunas, {pob['ano'].min()}-{pob['ano'].max()}; comunas del Censo sin proyección: {faltan}")
