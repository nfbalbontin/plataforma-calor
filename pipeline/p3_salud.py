"""Establecimientos de salud y población dependiente por centro (RF-03, RF-32).

Insumos: catálogo de establecimientos del DEIS y REM Serie P (hojas P3 y P5) depurado.
Salidas: datos/establecimientos.json, public/datos/establecimientos_<region>.json, datos/dependencia.json
"""
import json

import duckdb

from rutas import DEIS, ESTABLECIMIENTOS_NACIONAL, PLATAFORMA, guardar

con = duckdb.connect()

# --- Establecimientos -------------------------------------------------------
if ESTABLECIMIENTOS_NACIONAL.exists():
    # Mismas reglas que la depuración de la RM (d1), sin el filtro de región.
    con.execute(f"""
      create table est as
      select EstablecimientoCodigo cod, EstablecimientoCodigoAntiguo cod_antiguo, EstablecimientoGlosa nombre, TipoEstablecimientoGlosa tipo,
             lpad(ComunaCodigo, 5, '0') com, lpad(RegionCodigo, 2, '0') reg,
             try_cast(Latitud as double) lat, try_cast(Longitud as double) lon,
             upper(TieneServicioUrgencia) = 'SI' urg, TipoUrgencia tipo_urg, TipoSistemaSaludGlosa sistema
      from read_csv('{ESTABLECIMIENTOS_NACIONAL}', delim=';', header=true, all_varchar=true)
      where EstadoFuncionamiento like 'Vigente%'""")
    cobertura = "nacional"
    archivo = ESTABLECIMIENTOS_NACIONAL.name
else:
    con.execute(f"""
      create table est as
      select EstablecimientoCodigo::varchar cod, EstablecimientoCodigoAntiguo cod_antiguo, EstablecimientoGlosa nombre, TipoEstablecimientoGlosa tipo,
             ComunaCodigo::varchar com, '13' reg, Latitud lat, Longitud lon,
             upper(TieneServicioUrgencia) = 'SI' urg, TipoUrgencia tipo_urg, TipoSistemaSaludGlosa sistema
      from read_csv('{DEIS}/establecimiento_rm.csv', header=true)""")
    cobertura = "Región Metropolitana"
    archivo = "establecimiento_rm.csv"

filas = con.execute("select * from est order by com, cod").fetch_df()
filas = filas.astype(object).where(filas.notna(), None).to_dict("records")  # NaN -> nulo (NaN no es JSON válido)
for f in filas:
    f["urg"] = bool(f["urg"]) if f["urg"] is not None else False
    for k in ("lat", "lon"):
        f[k] = None if f[k] is None else round(float(f[k]), 5)
n_sin = sum(1 for f in filas if f["lat"] is None)
guardar("establecimientos.json", {"cobertura": cobertura, "archivo": archivo, "n": len(filas),
                                  "sin_coordenadas": n_sin, "establecimientos": filas})
por_region = {}
for f in filas:
    if f["lat"] is not None and f["reg"]:
        por_region.setdefault(f["reg"], []).append(
            {k: f[k] for k in ("cod", "nombre", "tipo", "com", "lat", "lon", "urg", "sistema")})
pub = PLATAFORMA / "public" / "datos"
pub.mkdir(parents=True, exist_ok=True)
for reg, lista in por_region.items():
    with open(pub / f"establecimientos_{reg}.json", "w", encoding="utf-8") as fh:
        json.dump(lista, fh, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
print(f"  establecimientos vigentes: {len(filas)} ({cobertura}); sin coordenadas: {n_sin}; regiones: {len(por_region)}")

# --- Dependencia (REM P3 y P5), último corte --------------------------------
CODIGOS = {
    "P3160800": "dep_severa",        # Atención domiciliaria por dependencia severa, total de personas
    "P3130200": "dep_severa_onco",
    "P3140400": "dep_severa_no_onco",
    "P3120500": "oxigeno",           # Oxígeno dependientes
    "P3161050": "ventilacion",       # Asistencia ventilatoria
    "P5180100": "pm_autovalente_sin_riesgo",
    "P5180200": "pm_autovalente_con_riesgo",
    "P5300510": "pm_riesgo_dependencia",
    "P5300100": "pm_dep_leve",
    "P5300200": "pm_dep_moderada",
    "P5300520": "pm_dep_grave",
    "P5300530": "pm_dep_total",
}
con.execute(f"create table rem as select * from read_csv('{DEIS}/rem_dependencia.csv', header=true, all_varchar=true)")
ano, mes = con.execute("select ano::int, mes::int from rem order by ano::int desc, mes::int desc limit 1").fetchone()
rows = con.execute(f"""
  select r.id_establecimiento, r.cod_comuna, r.codigo, try_cast(r.n_total as integer) n, try_cast(r.n_65_mas as integer) n65,
         e.nombre
  from rem r left join est e on e.cod = r.id_establecimiento
  where r.ano::int = {ano} and r.mes::int = {mes}""").fetchall()
centros = {}
for ide, com, codigo, n, n65, nombre in rows:
    c = centros.setdefault(ide, {"id": ide, "nombre": nombre or f"Establecimiento {ide}", "com": com})
    c[CODIGOS[codigo]] = n
    if codigo in ("P3160800", "P3120500"):
        c[CODIGOS[codigo] + "_65"] = n65
comunas = {}
for c in centros.values():
    g = comunas.setdefault(c["com"], {"centros": [], "dep_severa": 0, "oxigeno": 0, "pm_dependientes": 0})
    g["centros"].append(c)
    g["dep_severa"] += c.get("dep_severa") or 0
    g["oxigeno"] += c.get("oxigeno") or 0
    g["pm_dependientes"] += sum(c.get(k) or 0 for k in ("pm_dep_leve", "pm_dep_moderada", "pm_dep_grave", "pm_dep_total"))
for g in comunas.values():
    g["centros"].sort(key=lambda c: -(c.get("dep_severa") or 0))
n_reg = len({k[:2] for k in comunas})
guardar("dependencia.json", {
    "corte": f"{ano}-{mes:02d}", "cobertura": "Nacional" if n_reg == 16 else "Región Metropolitana" if n_reg == 1 else f"{n_reg} regiones",
    "nota": "Solo atención primaria pública. Personas en control al corte; una persona puede estar en más de una condición.",
    "comunas": comunas})
print(f"  dependencia: corte {ano}-{mes:02d}, {len(centros)} centros, {len(comunas)} comunas")
