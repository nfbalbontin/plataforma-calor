"""Escribe depurado/informe.md a partir de las estadísticas de stage. Uso: d6_informe.py STAGE DEPURADO"""
import json, os, sys, pandas as pd
ST, OUT = sys.argv[1:3]
R = json.load(open(f"{ST}/controles.json"))
E = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "_est_stats.json")))
fmt = lambda n: f"{int(n):,}".replace(",", ".") if pd.notna(n) and n != "" else "—"
def tabla(df):
    cols = list(df.columns)
    out = ["| " + " | ".join(cols) + " |", "|" + "|".join("---:" if df[c].dtype != object else "---" for c in cols) + "|"]
    for _, r in df.iterrows():
        out.append("| " + " | ".join(fmt(r[c]) if isinstance(r[c], (int, float)) and not isinstance(r[c], bool) else str(r[c]) for c in cols) + " |")
    return "\n".join(out)
size = lambda f: os.path.getsize(f"{OUT}/{f}")
hum = lambda b: f"{b/1024/1024:.1f} MB" if b > 1024*1024 else f"{b/1024:.0f} KB"

# defunciones
d = pd.read_csv(f"{ST}/def_stats.csv", dtype={"ano": str})
dp = d.pivot_table(index=["fuente", "ano"], columns="motivo", values="n", aggfunc="sum").fillna(0).astype(int).reset_index()
for c in ["antes_2010", "conservada", "fuera_rm", "sin_comuna", "sin_fecha"]:
    if c not in dp: dp[c] = 0
dp["leidas"] = dp[["antes_2010", "conservada", "fuera_rm", "sin_comuna", "sin_fecha"]].sum(axis=1)
dp["fuente"] = dp["fuente"].map(lambda s: "1990–2023 oficiales" if "1990" in s else "2024–2026 preliminares")
dp = dp[["fuente", "ano", "leidas", "conservada", "fuera_rm", "sin_comuna", "sin_fecha", "antes_2010"]]
dp.columns = ["Archivo", "Año (AÑO)", "Leídas", "Conservadas RM", "Fuera de la RM", "Sin comuna (vacía o 99999)", "Sin fecha", "Antes de 2010"]

# urgencias
u = pd.read_csv(f"{ST}/urg_stats.csv").fillna(0)
for c in ["rm", "otra_causa", "fuera_rm", "sin_fecha", "fuera_periodo", "sin_comuna"]:
    if c not in u: u[c] = 0
u["conservadas"] = u["rm"] - u["duplicados_exactos"]
c4 = {r["ano"]: r for r in R["c4"]}
ut = pd.DataFrame({"Archivo": u["ano_archivo"].astype(str), "Columnas": u["columnas"].astype(int), "Fechas en el archivo": u["fecha_min"] + " a " + u["fecha_max"],
    "Leídas": u["filas_leidas"], "Otras causas": u["otra_causa"], "Fuera del periodo": u["fuera_periodo"], "Sin fecha": u["sin_fecha"], "Sin comuna": u["sin_comuna"],
    "Fuera de la RM": u["fuera_rm"], "Duplicados eliminados": u["duplicados_exactos"], "Conservadas RM": u["conservadas"], "Comuna vía mapa": u["filas_rm_por_mapa"]})
c4t = pd.DataFrame([{"Año (fecha)": str(r["ano"]), "Días con datos": r["dias"], "Comunas que informan": r["comunas"], "Establecimientos que informan": r["establecimientos"]} for r in R["c4"]])
gl = u[["ano_archivo", "glosas"]]

# rem
rm = pd.read_csv(f"{ST}/rem_stats.csv")
rt = pd.DataFrame({"Año": rm["ano"].astype(str), "Meses": rm["meses"].astype(str), "Leídas": rm["filas_leidas"], "Fuera de la RM": rm["fuera_rm"], "RM, otros códigos": rm["rm_otro_codigo"],
    "Conservadas": rm["conservadas"], "n_65_mas nulo": rm["n_65_nulo"], "n_65_mas > n_total": rm["n65_mayor_total"], "Llaves duplicadas": rm["llaves_duplicadas"],
    "Establecimientos": rm["establecimientos"], "Comunas": rm["comunas"]})
mp = pd.read_csv(f"{OUT}/rem_mapeo_columnas.csv")
mpt = mp[mp.ano == mp.ano.max()][["codigo", "hoja", "glosa", "col_total", "cols_65_mas"]].copy()
mpt["cols_65_mas"] = mpt["cols_65_mas"].str.split().map(lambda l: f"{l[0]}–{l[-1]} ({len(l)})")
same = mp.groupby("codigo")[["col_total", "cols_65_mas"]].nunique().max().max() == 1
mpt.columns = ["Código", "Hoja", "Glosa (diccionario 2026)", "n_total", "n_65_mas"]

c1 = pd.DataFrame([{"Año": str(r["ano"]), "Tabla maestra": r["maestra"], "Esperado": r["esperado"] if r["esperado"] else "",
                    "Resultado": ("✔ coincide" if r["maestra"] == r["esperado"] else "✘ difiere") if r["esperado"] else ""} for r in R["c1"]])
cob = pd.DataFrame(R["comunas_urg_dias"]); total_dias = R["c3"][2]
parcial = cob[cob.dias_con < total_dias * 0.97]
salt = pd.DataFrame(R["saltos"])

files = ["comuna_dia.parquet", "establecimiento_rm.csv", "rem_dependencia.csv", "egresos_comuna_anio.csv", "mapa_establecimiento_comuna.csv", "rem_mapeo_columnas.csv"]
files = [f for f in files if os.path.exists(f"{OUT}/{f}")]
desc = {"comuna_dia.parquet": f"Tabla maestra: {fmt(R['filas'])} filas × {R['columnas']} columnas",
        "establecimiento_rm.csv": f"Anexa 1: {fmt(E['conservadas'])} establecimientos vigentes de la RM",
        "rem_dependencia.csv": f"Anexa 2: {fmt(rm['conservadas'].sum())} filas (REM P3 y P5, 2024–2026)",
        "egresos_comuna_anio.csv": "Anexa 3: egresos hospitalarios ANUALES por comuna de residencia RM × año × grupo de edad (2010–2025)",
        "mapa_establecimiento_comuna.csv": "Apoyo: código de establecimiento → comuna usado en urgencias 2008–2022",
        "rem_mapeo_columnas.csv": "Apoyo: columna ColNN de total y de 65+ por código y año, leída del diccionario"}
L = []
L += ["# Informe de depuración · datos DEIS para prevención de muertes por calor en la RM", "",
      f"Generado el 2026-11-14. Fuentes: descargas de datos abiertos del DEIS (Minsal). Scripts en `src/depuracion/` (d1 a d6). Los originales no se modificaron: cada CSV se extrajo del zip de a uno a una carpeta temporal, se procesó con DuckDB fuera de memoria y se borró.", "",
      "## Salidas", "", "| Archivo | Contenido | Tamaño |", "|---|---|---:|"]
L += [f"| `{f}` | {desc[f]} | {hum(size(f))} |" for f in files]
L += ["", f"**Rango de fechas de la tabla maestra:** 2010-01-01 a 2026-11-13 ({fmt(total_dias)} días × 52 comunas).", "",
      "## Controles obligatorios", "",
      "**1. Defunciones de la RM por año de FECHA_DEF:** " + ("todas coinciden." if R["c1_ok"] else "HAY DIFERENCIAS."), "", tabla(c1), "",
      f"La suma de `def_total` en la tabla maestra es idéntica a la de los registros conservados (diferencia: {R['c1_sin_perdida']}).", "",
      f"**2. def_0_64 + def_65_79 + def_80_mas = def_total:** {'se cumple en todas las filas' if R['c2_filas_malas']==0 else str(R['c2_filas_malas'])+' filas no cumplen'} (las {fmt(R['nulos']['def_total'])} filas sin dato de defunciones, del 2026-11-08 al 2026-11-13, no aplican).", "",
      f"**3. Filas por fecha:** mínimo {R['c3'][0]}, máximo {R['c3'][1]} en {fmt(R['c3'][2])} fechas; {R['c3_dup']} llaves (fecha, cod_comuna) repetidas.", "",
      "**4. Urgencias: comunas y establecimientos que informan, por año de la fecha de atención:**", "", tabla(c4t), "",
      f"La suma de `urg_total` en la tabla maestra es idéntica a la de los registros conservados (diferencia: {R['urg_sin_perdida']}).", "",
      "## Decisiones de depuración (aprobadas antes de procesar)", "",
      "1. **Urgencias 2008–2022 sin región ni comuna.** Esos archivos tienen 15 columnas; desde 2023 tienen 21 (se agregan CodigoRegion, NombreRegion, CodigoDependencia, NombreDependencia, CodigoComuna y NombreComuna). La comuna se asignó por `IdEstablecimiento` (sin espacios sobrantes), con esta prioridad: comuna del archivo de urgencias más antiguo que la trae (2023+), catálogo de establecimientos (código antiguo `NN-NNN` o código nuevo de 6 dígitos) y, por último, asignación manual por nombre. Ver `mapa_establecimiento_comuna.csv`.",
      "2. **Asignaciones manuales por nombre:** `10-852` SAPU Dr. Gustavo Molina → Pudahuel 13124 (aprobado). `04-801` SAPU Rosario Corvalán → Caldera y `04-821` SAPU Dr. Bernardo Mellibovsky → Copiapó (fuera de la RM; quedan como descarte «fuera de la RM» en vez de «sin comuna»).",
      "3. **Cambio de comuna del Hospital Félix Bulnes (`10-120`):** el archivo dice Quinta Normal (13126) en 2023–2024 y Cerro Navia (13103) en 2025–2026. En 2023+ se usa la comuna de cada archivo; antes de 2023, Quinta Normal (coincide con el nombre del establecimiento en esos años).",
      "4. **2023+:** se usa CodigoRegion/CodigoComuna del archivo. En 2024 hay 7.720 filas de `17-803` con región y comuna vacías: el mapa lo ubica en Ñuble (16101) y quedan fuera de la RM. Región y comuna del archivo son coherentes en todas las filas.",
      "5. **Fechas en el límite de año:** cada archivo anual parte el 2 de enero y el 1 de enero queda en el archivo del año anterior (el de 2009 trae además el 2010-02-01). Cada fila se asignó por su fecha; ninguna llave aparece en dos archivos. Por eso se leyó también 2009 (aporta 1.134 filas de la RM) y 2008 (todo fuera del periodo).",
      "6. **Duplicados:** se eliminó la fila repetida cuando establecimiento, fecha, causa y todas las cifras coinciden. El caso principal es `13-823` en 2018–2019, informado dos veces cada día con dos nombres (SAPU Laura Vicuña y SAR Haydee López) y las mismas cifras. No quedaron llaves con cifras distintas.",
      "7. **Fecha final:** 2026-11-13, último día con urgencias. Las defunciones llegan al 2026-11-07; del 08 al 13-11 las columnas `def_*` quedan nulas (sin dato), no en 0.",
      f"8. **REM:** el mapeo de columnas se leyó del diccionario de cada año (hojas P3 y P5) y {'es idéntico en 2024, 2025 y 2026' if same else 'CAMBIA entre años'}. Ver `rem_mapeo_columnas.csv`.", "",
      "## Defunciones", "",
      "Fuentes: `DEFUNCIONES_FUENTE_DEIS_1990_2023_CIFRAS_OFICIALES` y `DEFUNCIONES_FUENTE_DEIS_2024_2026_10112026`. Misma estructura de 27 columnas en ambos. Orden de descarte: sin fecha → antes de 2010 → sin comuna → fuera de la RM. «Sin comuna» no permite saber si la persona residía en la RM.", "",
      tabla(dp), "",
      "- Edad: `EDAD_CANT` si `EDAD_TIPO = 1`; en otro caso, 0 (menores de un año o tipo vacío). En la RM desde 2010 hay 9.249 registros con edad en meses, días u horas, o con tipo vacío; todos quedan en `def_0_64`.",
      "- Hay edades de 116 a 140 años con `EDAD_TIPO = 1` (22 registros a nivel nacional); se usan tal cual y caen en `def_80_mas`.", "",
      "## Urgencias", "",
      "Fuente: `AtencionesUrgencia<AÑO>.zip` (2008–2026). Orden de descarte: sin fecha → causa no seleccionada → fuera del periodo 2010-01-01 a 2026-11-13 → sin comuna → fuera de la RM → duplicado exacto. «Comuna vía mapa» cuenta las filas de la RM (antes de quitar duplicados) cuya comuna salió del mapa y no del archivo.", "",
      tabla(ut), "",
      "**Glosas de las causas conservadas, por archivo** (mismo significado en todos los años; en 2025–2026 cambia la redacción y se agregan los rangos CIE-10):", ""]
L += [f"- {r.ano_archivo}: {r.glosas}" for r in gl.itertuples() if r.ano_archivo in (2010, 2024, 2025, 2026)]
L += ["- 2008 a 2024 usan las mismas glosas que 2010; 2025 y 2026 son iguales entre sí.", "",
      "**Reglas de la tabla maestra:** se suma por comuna del establecimiento y día; `urg_n_establecimientos` cuenta los establecimientos con al menos una fila de las 6 causas ese día. Si ninguno informó, las columnas `urg_*` y `hosp_*` quedan nulas y `urg_n_establecimientos` = 0.", "",
      "## Tabla anexa 1 · establecimientos", "",
      f"Fuente `establecimientos_20261110.csv` (UTF-8, 33 columnas). Leídas {fmt(E['leidas'])}; fuera de la RM {fmt(E['fuera_rm'])}; RM no vigentes (cerrados) {fmt(E['rm_no_vigente'])}; conservadas {fmt(E['conservadas'])}. De las conservadas, {E['sin_codigo_antiguo']} no tienen código antiguo y {E['sin_coord']} no tienen coordenadas. El estado viene escrito de dos formas («Vigente en Operación Habitual» y «Vigente en operación habitual»), y `TieneServicioUrgencia` usa «SI», «NO», «No» y «No Aplica»: se dejaron tal cual.", "",
      "## Tabla anexa 2 · REM dependencia", "",
      "Fuente `SERIE_REM_<AÑO>.zip`, solo `Datos/SerieP<AÑO>.csv` de 2024, 2025 y 2026. La serie P es semestral: corte de junio y diciembre (2026 solo junio). Mapeo, igual en los tres años:", "",
      tabla(mpt), "",
      "En P3, COL30–COL37 son 65–69, 70–74, 75–79 y 80+ años, hombres y mujeres. En P5 todos los tramos son de 65+ (COL04–COL19), así que `n_65_mas = n_total` en todas las filas. `n_65_mas` es la suma de las celdas con dato y queda nulo si todas están vacías.", "",
      tabla(rt), "",
      "## Anomalías", "",
      f"- **Últimos días incompletos.** Defunciones por día en la RM hasta el 2026-11-07: " + ", ".join(f"{f[5:]} {n}" for f, n in R["def_ultimos"]) + ". Lo normal es unas 120 al día: el 06 y el 07-11 están subregistrados (registro tardío). Lo mismo con urgencias: establecimientos que informan, " + ", ".join(f"{f[5:]} {e}" for f, e, t in R["urg_ultimos"]) + ". El 2026-11-13 solo informaron 24 de unos 150.",
      "- **Datos 2024–2026 preliminares** (`def_provisional`): el archivo 2024–2026 tiene fecha de corte 10-11-2026 y las cifras pueden cambiar.",
      f"- **Comunas con urgencias en menos del 97 % de los {fmt(total_dias)} días** (inicio tardío o meses sin establecimiento informante; esos días quedan nulos): " + "; ".join(f"{r.cod_comuna}: {fmt(r.dias_con)} días, desde {r.desde}" for r in parcial.itertuples()) + ". La cobertura crece de 47 comunas en 2010 a 52 en 2026; Vitacura (13132) entra recién en 2026.",
      "- **Días con caída o salto de urgencias** en el total de la RM (menos del 50 % o más del 180 % de la mediana de los 28 días previos, o menos del 80 % de los establecimientos habituales): " + "; ".join(f"{r.fecha} ({fmt(r.urg_total_rm)} atenciones frente a una mediana de {fmt(r.mediana_28d)}, con {int(r.establecimientos)} establecimientos)" for r in salt.itertuples()) + ". El 2020-03-27 es parte de la caída por COVID-19, que empezó a mediados de marzo; el 2024-06-13 informaron los mismos establecimientos de siempre con la mitad de las atenciones, sin explicación en los datos; el 2026-11-13 está incompleto. No se corrigieron.",
      "- **2020–2022:** las defunciones suben con la pandemia (51.600, 51.532 y 49.967, frente a 41.866 en 2019). Es un cambio real, no un error de carga.",
      "- **Una comuna-día con total pero sin circulatorias:** 2010-10-03 en 13604 (`10-867` informó la causa 1 sin la 12): `urg_circulatorio` queda nulo y las demás no.",
      "- Defunciones sin fecha a nivel nacional: 290 en 1990–2009 y 33 desde 2010; de los 323, 29 tenían comuna de residencia en la RM; quedan fuera de la grilla.", "",
      "## Columnas de comuna_dia.parquet", "",
      "| Columna | Tipo | Definición |", "|---|---|---|",
      "| fecha | texto AAAA-MM-DD | Día (llave) |", "| cod_comuna | texto 5 dígitos | Comuna de residencia (defunciones) o del establecimiento (urgencias) (llave) |",
      "| def_total | entero | Defunciones de residentes; 0 = cero real; nulo después del 2026-11-07 |",
      "| def_0_64, def_65_79, def_80_mas | entero | Por edad en años (EDAD_TIPO = 1; otros tipos = 0 años) |",
      "| def_circulatorio | entero | CAPITULO_DIAG1 = I00-I99 |", "| def_respiratorio | entero | CAPITULO_DIAG1 = J00-J99 |", "| def_en_casa | entero | LUGAR_DEFUNCION = Casa habitación |",
      "| def_provisional | booleano | Verdadero desde 2024-01-01 |",
      "| urg_total, urg_65_mas | entero | IdCausa 1: Total y De_65_y_mas |", "| urg_respiratorio | entero | IdCausa 2 |", "| urg_circulatorio | entero | IdCausa 12 |",
      "| hosp_total | entero | IdCausa 25 |", "| hosp_respiratorio | entero | IdCausa 7 |", "| hosp_circulatorio | entero | IdCausa 22 |",
      "| urg_n_establecimientos | entero | Establecimientos que informaron ese día (0 = ninguno; entonces urg_* y hosp_* son nulos) |", ""]
if os.path.exists(f"{ST}/egr_stats.csv"):
    g = pd.read_csv(f"{ST}/egr_stats.csv").fillna(0)
    t = pd.read_csv(f"{OUT}/egresos_comuna_anio.csv", dtype={"cod_comuna": str})
    tot = t.groupby("ano").egr_total.sum()
    gt = pd.DataFrame({"Año": g.ano.astype(str), "Columnas": g.columnas.astype(int), "Leídas": g.leidas, "Conservadas RM": g.rm, "Fuera de la RM": g.fuera_rm,
        "Comuna y región ocultas (*)": g.sin_comuna_ni_region, "RM con año y edad ocultos": g.rm_ano_oculto, "Suma en la tabla": g.ano.map(tot)})
    pct = lambda c: (100 * g[f"oculto_{c}"] / g[f"nacional_{c}"]).round(1)
    oc = pd.DataFrame({"Año": g.ano.astype(str), "Total": pct("egr_total"), "Circulatorio": pct("egr_circulatorio"), "Respiratorio": pct("egr_respiratorio"),
        "Renal": pct("egr_renal"), "Diabetes": pct("egr_diabetes")})[g.sin_comuna_ni_region > 1000]
    oc = oc.astype(str).replace(r"\.", ",", regex=True)
    ok = bool((g.rm == g.ano.map(tot)).all())
    L += ["## Tabla anexa 3 · egresos hospitalarios (anual)", "",
      "**Limitación principal:** los egresos de datos abiertos del DEIS (`EGRESOS_<AÑO>.zip`) **no traen fecha de ingreso ni de egreso, solo `ANO_EGRESO`**, ni establecimiento; la edad viene en grupos de 10 años (2012 y 2021, de 5 años). No sirven para medir el efecto diario del calor ni se pueden cruzar con `comuna_dia`. La tabla es una línea base anual: qué comunas y qué causas sensibles al calor hospitalizan más, por grupo de edad. Para el análisis diario hay que pedir al DEIS la base con fecha (ver `../solicitud_deis_egresos_con_fecha.md`).", "",
      "**Archivo:** `egresos_comuna_anio.csv`, una fila por año × comuna de residencia (52) × grupo de edad (0_59, 60_69, 70_79, 80_mas, desconocida): " + f"{fmt(len(t))} filas. Una combinación sin egresos es 0. Las causas se definen por el diagnóstico principal (`DIAG1`) y se superponen (`egr_insuf_cardiaca` está dentro de `egr_circulatorio`): no sumar entre causas.", "",
      "| Columna | Definición |", "|---|---|",
      "| egr_total | Todos los egresos |", "| egr_renal | N17–N19 insuficiencia renal |", "| egr_diabetes | E10–E14 |", "| egr_deshidratacion | E86 |",
      "| egr_calor | T67 efectos del calor y de la luz |", "| egr_insuf_cardiaca | I50 |", "| egr_isquemica | I20–I25 |", "| egr_cerebrovascular | I60–I69 |",
      "| egr_circulatorio | I00–I99 |", "| egr_respiratorio | J00–J99 |", "| egr_fallecidos | CONDICION_EGRESO = 2 (todas las causas) |", "| dias_estada | Suma de días de estada |", "",
      "**Edad:** los grupos de 10 años se agrupan en 0–59, 60–69, 70–79 y 80+ (los únicos cortes comunes a todos los años; no se puede separar 65+). En 2012 y 2021, los grupos de 5 años y de días o meses se agregan a esos mismos cortes. `desconocida` = edad oculta con `*`.", "",
      tabla(gt), "",
      f"Control: la suma de `egr_total` de la tabla coincide con los registros conservados en {'todos los años' if ok else 'NO todos los años'}; la suma de los grupos de edad es igual al total en cada comuna y año por construcción. Se usaron los años 2010 a 2025 (2001–2009 quedan fuera del periodo de `comuna_dia`; falta además el archivo 2007). Los zips «(1)» y «(2)» de 2012–2020 son copias idénticas.", "",
      "**Anomalías de egresos:**", "",
      "- **2023–2025: 7–8 % de los egresos del país tienen comuna, región y edad ocultas (`*`)** (128.108, 124.508 y 118.961 registros) y no se pueden asignar a la RM. Antes de 2023 esto casi no ocurre (11.100 en 2012). Por eso **2023–2025 subestiman la RM y no son comparables con años anteriores**. Porcentaje oculto del total nacional por causa:", "", tabla(oc), "",
      "- Registros de la RM con año y edad ocultos (`*`) dentro del archivo de cada año: se asignan al año del archivo y quedan en edad `desconocida` (entre 849 y 3.879 por año hasta 2022).",
      "- 2011 tiene unos 60 mil egresos de la RM menos que 2010 y 2012, y 2020 unos 120 mil menos que 2019 (pandemia). El de 2011 no tiene explicación en los datos.",
      "- La codificación del origen es mixta (latin-1 y UTF-8; 2024–2025 traen tildes ya dañadas, «90 y mï¿½s»). Se transcodificó a UTF-8 y se usaron solo códigos; los textos no se usan.",
      "- Estructura distinta: 2012 y 2021 tienen 15 columnas (sin etnia, sexo numérico, edad quinquenal); 2022 agrega glosas de intervención y procedimiento; 2023–2024 tienen 16 columnas; 2025 agrega `ERROR`. Ninguna de esas columnas se usa.", ""]
open(f"{OUT}/informe.md", "w").write("\n".join(L))
print("ok", len(L))
