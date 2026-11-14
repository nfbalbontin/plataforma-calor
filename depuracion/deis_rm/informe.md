# Informe de depuración · datos DEIS para prevención de muertes por calor en la RM

Generado el 2026-11-14. Fuentes: descargas de datos abiertos del DEIS (Minsal). Scripts en `src/depuracion/` (d1 a d6). Los originales no se modificaron: cada CSV se extrajo del zip de a uno a una carpeta temporal, se procesó con DuckDB fuera de memoria y se borró.

## Salidas

| Archivo | Contenido | Tamaño |
|---|---|---:|
| `comuna_dia.parquet` | Tabla maestra: 320.372 filas × 18 columnas | 2.2 MB |
| `establecimiento_rm.csv` | Anexa 1: 1.090 establecimientos vigentes de la RM | 138 KB |
| `rem_dependencia.csv` | Anexa 2: 13.819 filas (REM P3 y P5, 2024–2026) | 849 KB |
| `egresos_comuna_anio.csv` | Anexa 3: egresos hospitalarios ANUALES por comuna de residencia RM × año × grupo de edad (2010–2025) | 219 KB |
| `mapa_establecimiento_comuna.csv` | Apoyo: código de establecimiento → comuna usado en urgencias 2008–2022 | 396 KB |
| `rem_mapeo_columnas.csv` | Apoyo: columna ColNN de total y de 65+ por código y año, leída del diccionario | 15 KB |

**Rango de fechas de la tabla maestra:** 2010-01-01 a 2026-11-13 (6.161 días × 52 comunas).

## Controles obligatorios

**1. Defunciones de la RM por año de FECHA_DEF:** todas coinciden.

| Año | Tabla maestra | Esperado | Resultado |
|---|---:|---|---|
| 2010 | 36.934 | 36.934 | ✔ coincide |
| 2011 | 36.396 |  |  |
| 2012 | 37.286 |  |  |
| 2013 | 37.565 |  |  |
| 2014 | 38.839 |  |  |
| 2015 | 39.084 | 39.084 | ✔ coincide |
| 2016 | 39.283 |  |  |
| 2017 | 40.384 |  |  |
| 2018 | 39.958 |  |  |
| 2019 | 41.866 | 41.866 | ✔ coincide |
| 2020 | 51.600 | 51.600 | ✔ coincide |
| 2021 | 51.532 |  |  |
| 2022 | 49.967 |  |  |
| 2023 | 44.633 | 44.633 | ✔ coincide |
| 2024 | 46.872 | 46.872 | ✔ coincide |
| 2025 | 46.548 | 46.548 | ✔ coincide |
| 2026 | 40.208 |  |  |

La suma de `def_total` en la tabla maestra es idéntica a la de los registros conservados (diferencia: 0).

**2. def_0_64 + def_65_79 + def_80_mas = def_total:** se cumple en todas las filas (las 312 filas sin dato de defunciones, del 2026-11-08 al 2026-11-13, no aplican).

**3. Filas por fecha:** mínimo 52, máximo 52 en 6.161 fechas; 0 llaves (fecha, cod_comuna) repetidas.

**4. Urgencias: comunas y establecimientos que informan, por año de la fecha de atención:**

| Año (fecha) | Días con datos | Comunas que informan | Establecimientos que informan |
|---|---:|---:|---:|
| 2010 | 365 | 47 | 115 |
| 2011 | 365 | 48 | 116 |
| 2012 | 366 | 49 | 125 |
| 2013 | 365 | 49 | 131 |
| 2014 | 365 | 49 | 133 |
| 2015 | 365 | 49 | 133 |
| 2016 | 366 | 49 | 135 |
| 2017 | 365 | 49 | 135 |
| 2018 | 365 | 50 | 139 |
| 2019 | 365 | 50 | 141 |
| 2020 | 366 | 51 | 142 |
| 2021 | 365 | 51 | 148 |
| 2022 | 365 | 51 | 147 |
| 2023 | 365 | 51 | 148 |
| 2024 | 366 | 51 | 149 |
| 2025 | 365 | 51 | 152 |
| 2026 | 317 | 52 | 160 |

La suma de `urg_total` en la tabla maestra es idéntica a la de los registros conservados (diferencia: 0).

## Decisiones de depuración (aprobadas antes de procesar)

1. **Urgencias 2008–2022 sin región ni comuna.** Esos archivos tienen 15 columnas; desde 2023 tienen 21 (se agregan CodigoRegion, NombreRegion, CodigoDependencia, NombreDependencia, CodigoComuna y NombreComuna). La comuna se asignó por `IdEstablecimiento` (sin espacios sobrantes), con esta prioridad: comuna del archivo de urgencias más antiguo que la trae (2023+), catálogo de establecimientos (código antiguo `NN-NNN` o código nuevo de 6 dígitos) y, por último, asignación manual por nombre. Ver `mapa_establecimiento_comuna.csv`.
2. **Asignaciones manuales por nombre:** `10-852` SAPU Dr. Gustavo Molina → Pudahuel 13124 (aprobado). `04-801` SAPU Rosario Corvalán → Caldera y `04-821` SAPU Dr. Bernardo Mellibovsky → Copiapó (fuera de la RM; quedan como descarte «fuera de la RM» en vez de «sin comuna»).
3. **Cambio de comuna del Hospital Félix Bulnes (`10-120`):** el archivo dice Quinta Normal (13126) en 2023–2024 y Cerro Navia (13103) en 2025–2026. En 2023+ se usa la comuna de cada archivo; antes de 2023, Quinta Normal (coincide con el nombre del establecimiento en esos años).
4. **2023+:** se usa CodigoRegion/CodigoComuna del archivo. En 2024 hay 7.720 filas de `17-803` con región y comuna vacías: el mapa lo ubica en Ñuble (16101) y quedan fuera de la RM. Región y comuna del archivo son coherentes en todas las filas.
5. **Fechas en el límite de año:** cada archivo anual parte el 2 de enero y el 1 de enero queda en el archivo del año anterior (el de 2009 trae además el 2010-02-01). Cada fila se asignó por su fecha; ninguna llave aparece en dos archivos. Por eso se leyó también 2009 (aporta 1.134 filas de la RM) y 2008 (todo fuera del periodo).
6. **Duplicados:** se eliminó la fila repetida cuando establecimiento, fecha, causa y todas las cifras coinciden. El caso principal es `13-823` en 2018–2019, informado dos veces cada día con dos nombres (SAPU Laura Vicuña y SAR Haydee López) y las mismas cifras. No quedaron llaves con cifras distintas.
7. **Fecha final:** 2026-11-13, último día con urgencias. Las defunciones llegan al 2026-11-07; del 08 al 13-11 las columnas `def_*` quedan nulas (sin dato), no en 0.
8. **REM:** el mapeo de columnas se leyó del diccionario de cada año (hojas P3 y P5) y es idéntico en 2024, 2025 y 2026. Ver `rem_mapeo_columnas.csv`.

## Defunciones

Fuentes: `DEFUNCIONES_FUENTE_DEIS_1990_2023_CIFRAS_OFICIALES` y `DEFUNCIONES_FUENTE_DEIS_2024_2026_10112026`. Misma estructura de 27 columnas en ambos. Orden de descarte: sin fecha → antes de 2010 → sin comuna → fuera de la RM. «Sin comuna» no permite saber si la persona residía en la RM.

| Archivo | Año (AÑO) | Leídas | Conservadas RM | Fuera de la RM | Sin comuna (vacía o 99999) | Sin fecha | Antes de 2010 |
|---|---|---:|---:|---:|---:|---:|---:|
| 1990–2023 oficiales | 1990-2009 | 1.635.907 | 0 | 0 | 0 | 290 | 1.635.617 |
| 1990–2023 oficiales | 2010 | 97.930 | 36.934 | 60.993 | 0 | 3 | 0 |
| 1990–2023 oficiales | 2011 | 94.985 | 36.396 | 58.587 | 0 | 2 | 0 |
| 1990–2023 oficiales | 2012 | 98.711 | 37.286 | 61.424 | 0 | 1 | 0 |
| 1990–2023 oficiales | 2013 | 99.770 | 37.565 | 62.202 | 0 | 3 | 0 |
| 1990–2023 oficiales | 2014 | 101.960 | 38.839 | 63.097 | 21 | 3 | 0 |
| 1990–2023 oficiales | 2015 | 103.327 | 39.084 | 64.237 | 0 | 6 | 0 |
| 1990–2023 oficiales | 2016 | 104.026 | 39.283 | 64.740 | 0 | 3 | 0 |
| 1990–2023 oficiales | 2017 | 106.388 | 40.384 | 66.004 | 0 | 0 | 0 |
| 1990–2023 oficiales | 2018 | 106.796 | 39.958 | 66.819 | 18 | 1 | 0 |
| 1990–2023 oficiales | 2019 | 109.658 | 41.866 | 67.791 | 0 | 1 | 0 |
| 1990–2023 oficiales | 2020 | 126.169 | 51.600 | 74.566 | 0 | 3 | 0 |
| 1990–2023 oficiales | 2021 | 137.629 | 51.532 | 86.095 | 0 | 2 | 0 |
| 1990–2023 oficiales | 2022 | 136.972 | 49.967 | 87.003 | 0 | 2 | 0 |
| 1990–2023 oficiales | 2023 | 122.218 | 44.633 | 77.560 | 22 | 3 | 0 |
| 2024–2026 preliminares | 2024 | 126.928 | 46.872 | 80.056 | 0 | 0 | 0 |
| 2024–2026 preliminares | 2025 | 126.466 | 46.548 | 79.859 | 59 | 0 | 0 |
| 2024–2026 preliminares | 2026 | 108.198 | 40.208 | 67.953 | 37 | 0 | 0 |

- Edad: `EDAD_CANT` si `EDAD_TIPO = 1`; en otro caso, 0 (menores de un año o tipo vacío). En la RM desde 2010 hay 9.249 registros con edad en meses, días u horas, o con tipo vacío; todos quedan en `def_0_64`.
- Hay edades de 116 a 140 años con `EDAD_TIPO = 1` (22 registros a nivel nacional); se usan tal cual y caen en `def_80_mas`.

## Urgencias

Fuente: `AtencionesUrgencia<AÑO>.zip` (2008–2026). Orden de descarte: sin fecha → causa no seleccionada → fuera del periodo 2010-01-01 a 2026-11-13 → sin comuna → fuera de la RM → duplicado exacto. «Comuna vía mapa» cuenta las filas de la RM (antes de quitar duplicados) cuya comuna salió del mapa y no del archivo.

| Archivo | Columnas | Fechas en el archivo | Leídas | Otras causas | Fuera del periodo | Sin fecha | Sin comuna | Fuera de la RM | Duplicados eliminados | Conservadas RM | Comuna vía mapa |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2008 | 15 | 2008-01-03 a 2009-03-01 | 274.924 | 211.480 | 63.444 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2009 | 15 | 2009-01-02 a 2010-02-01 | 1.432.946 | 1.102.263 | 327.467 | 0 | 0 | 2.082 | 0 | 1.134 | 1.134 |
| 2010 | 15 | 2010-01-02 a 2011-01-01 | 3.045.168 | 2.346.489 | 0 | 0 | 0 | 470.283 | 0 | 228.396 | 228.396 |
| 2011 | 15 | 2011-01-02 a 2011-12-31 | 3.503.601 | 2.725.023 | 0 | 0 | 0 | 535.980 | 0 | 242.598 | 242.598 |
| 2012 | 15 | 2012-01-01 a 2012-12-31 | 3.796.178 | 2.952.584 | 0 | 0 | 0 | 581.934 | 0 | 261.660 | 261.660 |
| 2013 | 15 | 2013-01-01 a 2013-12-31 | 4.039.441 | 3.141.791 | 0 | 0 | 0 | 617.290 | 4 | 280.356 | 280.360 |
| 2014 | 15 | 2014-01-01 a 2014-12-31 | 4.134.043 | 3.215.368 | 0 | 0 | 0 | 634.566 | 3 | 284.106 | 284.109 |
| 2015 | 15 | 2015-01-01 a 2015-12-31 | 4.340.412 | 3.375.876 | 0 | 0 | 0 | 674.484 | 0 | 290.052 | 290.052 |
| 2016 | 15 | 2016-01-01 a 2016-12-31 | 4.435.590 | 3.449.905 | 0 | 0 | 0 | 691.715 | 0 | 293.970 | 293.970 |
| 2017 | 15 | 2017-01-01 a 2017-12-31 | 4.455.127 | 3.465.099 | 0 | 0 | 0 | 695.056 | 0 | 294.972 | 294.972 |
| 2018 | 15 | 2018-01-01 a 2018-12-31 | 4.488.935 | 3.491.394 | 0 | 0 | 0 | 700.629 | 2.192 | 294.720 | 296.912 |
| 2019 | 15 | 2019-01-01 a 2019-12-31 | 4.550.877 | 3.539.571 | 0 | 0 | 0 | 704.352 | 2.190 | 304.764 | 306.954 |
| 2020 | 15 | 2020-01-01 a 2020-12-31 | 6.446.646 | 5.279.400 | 0 | 0 | 0 | 858.984 | 0 | 308.262 | 308.262 |
| 2021 | 15 | 2021-01-01 a 2021-12-31 | 8.816.240 | 7.493.804 | 0 | 0 | 0 | 1.002.834 | 0 | 319.602 | 319.602 |
| 2022 | 15 | 2022-01-01 a 2022-12-31 | 8.926.307 | 7.587.359 | 0 | 0 | 0 | 1.017.942 | 0 | 321.006 | 321.006 |
| 2023 | 21 | 2023-01-01 a 2023-12-31 | 8.899.080 | 7.564.218 | 0 | 0 | 0 | 1.012.584 | 0 | 322.278 | 0 |
| 2024 | 21 | 2024-01-01 a 2024-12-31 | 8.973.229 | 7.627.245 | 0 | 0 | 0 | 1.024.774 | 0 | 321.210 | 0 |
| 2025 | 21 | 2025-01-01 a 2025-12-31 | 9.127.869 | 7.761.441 | 0 | 0 | 0 | 1.040.472 | 0 | 325.956 | 0 |
| 2026 | 21 | 2026-01-01 a 2026-11-13 | 8.168.430 | 6.973.050 | 0 | 0 | 0 | 911.106 | 0 | 284.274 | 0 |

**Glosas de las causas conservadas, por archivo** (mismo significado en todos los años; en 2025–2026 cambia la redacción y se agregan los rangos CIE-10):

- 2010: 1=SECCIÓN 1. TOTAL ATENCIONES DE URGENCIA | 2=TOTAL CAUSAS SISTEMA RESPIRATORIO | 7=CAUSAS SISTEMA RESPIRATORIO | 12=TOTAL CAUSAS SISTEMA CIRCULATORIO | 22=- CAUSAS SISTEMA CIRCULATORIO | 25=SECCIÓN 2. TOTAL DE HOSPITALIZACIONES
- 2024: 1=SECCIÓN 1. TOTAL ATENCIONES DE URGENCIA | 2=TOTAL CAUSAS SISTEMA RESPIRATORIO | 7=CAUSAS SISTEMA RESPIRATORIO | 12=TOTAL CAUSAS SISTEMA CIRCULATORIO | 22=- CAUSAS SISTEMA CIRCULATORIO | 25=SECCIÓN 2. TOTAL DE HOSPITALIZACIONES
- 2025: 1=SECCIÓN 1. TOTAL ATENCIONES DE URGENCIA | 2=TOTAL CAUSA SISTEMA  RESPIRATORIO (J00-J98) | 7=- Causas sistema respiratorio (J00-J98) | 12=TOTAL ATENCIONES POR CAUSA SISTEMA CIRCULATORIO (I00-I99) | 22=- Causas sistema circulatorio (I00-I99) | 25=SECCIÓN 2. TOTAL HOSPITALIZACIONES POR GRUPO DE CAUSA
- 2026: 1=SECCIÓN 1. TOTAL ATENCIONES DE URGENCIA | 2=TOTAL CAUSA SISTEMA  RESPIRATORIO (J00-J98) | 7=- Causas sistema respiratorio (J00-J98) | 12=TOTAL ATENCIONES POR CAUSA SISTEMA CIRCULATORIO (I00-I99) | 22=- Causas sistema circulatorio (I00-I99) | 25=SECCIÓN 2. TOTAL HOSPITALIZACIONES POR GRUPO DE CAUSA
- 2008 a 2024 usan las mismas glosas que 2010; 2025 y 2026 son iguales entre sí.

**Reglas de la tabla maestra:** se suma por comuna del establecimiento y día; `urg_n_establecimientos` cuenta los establecimientos con al menos una fila de las 6 causas ese día. Si ninguno informó, las columnas `urg_*` y `hosp_*` quedan nulas y `urg_n_establecimientos` = 0.

## Tabla anexa 1 · establecimientos

Fuente `establecimientos_20261110.csv` (UTF-8, 33 columnas). Leídas 5.837; fuera de la RM 4.645; RM no vigentes (cerrados) 102; conservadas 1.090. De las conservadas, 277 no tienen código antiguo y 5 no tienen coordenadas. El estado viene escrito de dos formas («Vigente en Operación Habitual» y «Vigente en operación habitual»), y `TieneServicioUrgencia` usa «SI», «NO», «No» y «No Aplica»: se dejaron tal cual.

## Tabla anexa 2 · REM dependencia

Fuente `SERIE_REM_<AÑO>.zip`, solo `Datos/SerieP<AÑO>.csv` de 2024, 2025 y 2026. La serie P es semestral: corte de junio y diciembre (2026 solo junio). Mapeo, igual en los tres años:

| Código | Hoja | Glosa (diccionario 2026) | n_total | n_65_mas |
|---|---|---|---|---|
| P3120500 | P3 | Oxigeno Dependiente | COL01 | COL30–COL37 (8) |
| P3161050 | P3 | Asistencia Ventilatoria No Invasiva o Invasiva | COL01 | COL30–COL37 (8) |
| P3130200 | P3 | Dependencia severa - Oncológica | COL01 | COL30–COL37 (8) |
| P3140400 | P3 | Dependencia severa - No Oncológica | COL01 | COL30–COL37 (8) |
| P3160800 | P3 | Atención domiciliaria por dependencia severa - Total personas | COL01 | COL30–COL37 (8) |
| P5180100 | P5 | Autovalente sin riesgo | COL01 | COL04–COL19 (16) |
| P5180200 | P5 | Autovalente con riesgo | COL01 | COL04–COL19 (16) |
| P5300510 | P5 | Riesgo de dependencia | COL01 | COL04–COL19 (16) |
| P5300100 | P5 | Dependiente leve | COL01 | COL04–COL19 (16) |
| P5300200 | P5 | Dependiente moderado | COL01 | COL04–COL19 (16) |
| P5300520 | P5 | Dependiente grave | COL01 | COL04–COL19 (16) |
| P5300530 | P5 | Dependiente total | COL01 | COL04–COL19 (16) |

En P3, COL30–COL37 son 65–69, 70–74, 75–79 y 80+ años, hombres y mujeres. En P5 todos los tramos son de 65+ (COL04–COL19), así que `n_65_mas = n_total` en todas las filas. `n_65_mas` es la suma de las celdas con dato y queda nulo si todas están vacías.

| Año | Meses | Leídas | Fuera de la RM | RM, otros códigos | Conservadas | n_65_mas nulo | n_65_mas > n_total | Llaves duplicadas | Establecimientos | Comunas |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2024 | 12,6 | 1.200.514 | 982.129 | 212.948 | 5.437 | 81 | 0 | 0 | 280 | 52 |
| 2025 | 12,6 | 1.245.116 | 1.021.075 | 218.491 | 5.550 | 93 | 0 | 0 | 277 | 52 |
| 2026 | 6 | 629.427 | 515.537 | 111.058 | 2.832 | 38 | 0 | 0 | 278 | 52 |

## Anomalías

- **Últimos días incompletos.** Defunciones por día en la RM hasta el 2026-11-07: 10-29 119, 10-30 129, 10-31 123, 11-01 114, 11-02 122, 11-03 124, 11-04 120, 11-05 129, 11-06 91, 11-07 14. Lo normal es unas 120 al día: el 06 y el 07-11 están subregistrados (registro tardío). Lo mismo con urgencias: establecimientos que informan, 11-04 150, 11-05 151, 11-06 150, 11-07 148, 11-08 146, 11-09 135, 11-10 135, 11-11 131, 11-12 122, 11-13 24. El 2026-11-13 solo informaron 24 de unos 150.
- **Datos 2024–2026 preliminares** (`def_provisional`): el archivo 2024–2026 tiene fecha de corte 10-11-2026 y las cifras pueden cambiar.
- **Comunas con urgencias en menos del 97 % de los 6.161 días** (inicio tardío o meses sin establecimiento informante; esos días quedan nulos): 13132: 316 días, desde 2026-01-01; 13403: 2.139 días, desde 2020-12-27; 13505: 2.849 días, desde 2018-12-30; 13202: 5.455 días, desde 2010-12-22; 13302: 5.495 días, desde 2010-01-04; 13303: 5.536 días, desde 2011-01-03; 13113: 5.794 días, desde 2011-01-01; 13301: 5.944 días, desde 2010-01-05; 13504: 5.956 días, desde 2010-01-01. La cobertura crece de 47 comunas en 2010 a 52 en 2026; Vitacura (13132) entra recién en 2026.
- **Días con caída o salto de urgencias** en el total de la RM (menos del 50 % o más del 180 % de la mediana de los 28 días previos, o menos del 80 % de los establecimientos habituales): 2020-03-27 (7.451 atenciones frente a una mediana de 15.402, con 139 establecimientos); 2024-06-13 (8.286 atenciones frente a una mediana de 17.252, con 146 establecimientos); 2026-11-13 (2.339 atenciones frente a una mediana de 16.529, con 24 establecimientos). El 2020-03-27 es parte de la caída por COVID-19, que empezó a mediados de marzo; el 2024-06-13 informaron los mismos establecimientos de siempre con la mitad de las atenciones, sin explicación en los datos; el 2026-11-13 está incompleto. No se corrigieron.
- **2020–2022:** las defunciones suben con la pandemia (51.600, 51.532 y 49.967, frente a 41.866 en 2019). Es un cambio real, no un error de carga.
- **Una comuna-día con total pero sin circulatorias:** 2010-10-03 en 13604 (`10-867` informó la causa 1 sin la 12): `urg_circulatorio` queda nulo y las demás no.
- Defunciones sin fecha a nivel nacional: 290 en 1990–2009 y 33 desde 2010; de los 323, 29 tenían comuna de residencia en la RM; quedan fuera de la grilla.

## Columnas de comuna_dia.parquet

| Columna | Tipo | Definición |
|---|---|---|
| fecha | texto AAAA-MM-DD | Día (llave) |
| cod_comuna | texto 5 dígitos | Comuna de residencia (defunciones) o del establecimiento (urgencias) (llave) |
| def_total | entero | Defunciones de residentes; 0 = cero real; nulo después del 2026-11-07 |
| def_0_64, def_65_79, def_80_mas | entero | Por edad en años (EDAD_TIPO = 1; otros tipos = 0 años) |
| def_circulatorio | entero | CAPITULO_DIAG1 = I00-I99 |
| def_respiratorio | entero | CAPITULO_DIAG1 = J00-J99 |
| def_en_casa | entero | LUGAR_DEFUNCION = Casa habitación |
| def_provisional | booleano | Verdadero desde 2024-01-01 |
| urg_total, urg_65_mas | entero | IdCausa 1: Total y De_65_y_mas |
| urg_respiratorio | entero | IdCausa 2 |
| urg_circulatorio | entero | IdCausa 12 |
| hosp_total | entero | IdCausa 25 |
| hosp_respiratorio | entero | IdCausa 7 |
| hosp_circulatorio | entero | IdCausa 22 |
| urg_n_establecimientos | entero | Establecimientos que informaron ese día (0 = ninguno; entonces urg_* y hosp_* son nulos) |

## Tabla anexa 3 · egresos hospitalarios (anual)

**Limitación principal:** los egresos de datos abiertos del DEIS (`EGRESOS_<AÑO>.zip`) **no traen fecha de ingreso ni de egreso, solo `ANO_EGRESO`**, ni establecimiento; la edad viene en grupos de 10 años (2012 y 2021, de 5 años). No sirven para medir el efecto diario del calor ni se pueden cruzar con `comuna_dia`. La tabla es una línea base anual: qué comunas y qué causas sensibles al calor hospitalizan más, por grupo de edad. Para el análisis diario hay que pedir al DEIS la base con fecha (ver `../solicitud_deis_egresos_con_fecha.md`).

**Archivo:** `egresos_comuna_anio.csv`, una fila por año × comuna de residencia (52) × grupo de edad (0_59, 60_69, 70_79, 80_mas, desconocida): 4.160 filas. Una combinación sin egresos es 0. Las causas se definen por el diagnóstico principal (`DIAG1`) y se superponen (`egr_insuf_cardiaca` está dentro de `egr_circulatorio`): no sumar entre causas.

| Columna | Definición |
|---|---|
| egr_total | Todos los egresos |
| egr_renal | N17–N19 insuficiencia renal |
| egr_diabetes | E10–E14 |
| egr_deshidratacion | E86 |
| egr_calor | T67 efectos del calor y de la luz |
| egr_insuf_cardiaca | I50 |
| egr_isquemica | I20–I25 |
| egr_cerebrovascular | I60–I69 |
| egr_circulatorio | I00–I99 |
| egr_respiratorio | J00–J99 |
| egr_fallecidos | CONDICION_EGRESO = 2 (todas las causas) |
| dias_estada | Suma de días de estada |

**Edad:** los grupos de 10 años se agrupan en 0–59, 60–69, 70–79 y 80+ (los únicos cortes comunes a todos los años; no se puede separar 65+). En 2012 y 2021, los grupos de 5 años y de días o meses se agregan a esos mismos cortes. `desconocida` = edad oculta con `*`.

| Año | Columnas | Leídas | Conservadas RM | Fuera de la RM | Comuna y región ocultas (*) | RM con año y edad ocultos | Suma en la tabla |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2010 | 18 | 1.623.875 | 621.027 | 1.002.848 | 0 | 849 | 621.027 |
| 2011 | 18 | 1.648.687 | 558.899 | 1.089.788 | 0 | 3.879 | 558.899 |
| 2012 | 15 | 1.670.447 | 615.931 | 1.043.416 | 11.100 | 0 | 615.931 |
| 2013 | 18 | 1.676.936 | 641.495 | 1.035.441 | 0 | 1.590 | 641.495 |
| 2014 | 18 | 1.660.151 | 624.065 | 1.036.086 | 0 | 2.804 | 624.065 |
| 2015 | 18 | 1.671.054 | 654.146 | 1.016.908 | 0 | 2.160 | 654.146 |
| 2016 | 18 | 1.637.265 | 634.228 | 1.003.037 | 0 | 1.228 | 634.228 |
| 2017 | 18 | 1.637.150 | 645.567 | 991.583 | 0 | 1.501 | 645.567 |
| 2018 | 18 | 1.669.602 | 656.574 | 1.013.028 | 0 | 1.079 | 656.574 |
| 2019 | 18 | 1.667.180 | 661.396 | 1.005.781 | 3 | 918 | 661.396 |
| 2020 | 18 | 1.330.477 | 540.700 | 789.777 | 0 | 1.466 | 540.700 |
| 2021 | 15 | 1.467.062 | 604.332 | 862.730 | 0 | 0 | 604.332 |
| 2022 | 18 | 1.597.118 | 651.561 | 945.557 | 0 | 1.515 | 651.561 |
| 2023 | 16 | 1.612.267 | 596.091 | 888.068 | 128.108 | 0 | 596.091 |
| 2024 | 16 | 1.667.349 | 626.595 | 916.246 | 124.508 | 0 | 626.595 |
| 2025 | 17 | 1.705.514 | 645.879 | 940.674 | 118.961 | 0 | 645.879 |

Control: la suma de `egr_total` de la tabla coincide con los registros conservados en todos los años; la suma de los grupos de edad es igual al total en cada comuna y año por construcción. Se usaron los años 2010 a 2025 (2001–2009 quedan fuera del periodo de `comuna_dia`; falta además el archivo 2007). Los zips «(1)» y «(2)» de 2012–2020 son copias idénticas.

**Anomalías de egresos:**

- **2023–2025: 7–8 % de los egresos del país tienen comuna, región y edad ocultas (`*`)** (128.108, 124.508 y 118.961 registros) y no se pueden asignar a la RM. Antes de 2023 esto casi no ocurre (11.100 en 2012). Por eso **2023–2025 subestiman la RM y no son comparables con años anteriores**. Porcentaje oculto del total nacional por causa:

| Año | Total | Circulatorio | Respiratorio | Renal | Diabetes |
|---|---|---|---|---|---|
| 2012 | 0,7 | 0,7 | 0,5 | 0,4 | 0,5 |
| 2023 | 7,9 | 6,0 | 10,1 | 5,8 | 5,1 |
| 2024 | 7,5 | 5,9 | 8,3 | 6,2 | 4,3 |
| 2025 | 7,0 | 5,6 | 8,0 | 5,0 | 3,9 |

- Registros de la RM con año y edad ocultos (`*`) dentro del archivo de cada año: se asignan al año del archivo y quedan en edad `desconocida` (entre 849 y 3.879 por año hasta 2022).
- 2011 tiene unos 60 mil egresos de la RM menos que 2010 y 2012, y 2020 unos 120 mil menos que 2019 (pandemia). El de 2011 no tiene explicación en los datos.
- La codificación del origen es mixta (latin-1 y UTF-8; 2024–2025 traen tildes ya dañadas, «90 y mï¿½s»). Se transcodificó a UTF-8 y se usaron solo códigos; los textos no se usan.
- Estructura distinta: 2012 y 2021 tienen 15 columnas (sin etnia, sexo numérico, edad quinquenal); 2022 agrega glosas de intervención y procedimiento; 2023–2024 tienen 16 columnas; 2025 agrega `ERROR`. Ninguna de esas columnas se usa.
