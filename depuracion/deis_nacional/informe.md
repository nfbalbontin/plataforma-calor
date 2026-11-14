# Informe de depuración · datos DEIS nacionales

Generado con `src/depuracion/n1_nacional.py`, `n2_rem_nacional.py` y `n3_controles_informe.py`. Mismas reglas que la depuración de la RM (ver `../depurado/informe.md`), sin el filtro de región. Los originales no se modificaron.

## Salidas

- `comuna_dia.parquet`: 2.131.706 filas × 21 columnas; 346 comunas × 6.161 días (2010-01-01 a 2026-11-13). Defunciones hasta el 2026-11-07; después quedan nulas.
- `rem_dependencia.csv`: REM Serie P (P3 y P5), cortes de junio y diciembre 2024-2026, todas las regiones.
- Columnas nuevas respecto de la tabla de la RM: `def_65_74`, `def_75_84`, `def_85_mas` (tramos del documento de requerimientos).

## Controles

| Control | Resultado | Detalle |
|---|---|---|
| 346 comunas en todas las fechas | ✔ | 2.131.706 filas = 346 × 6.161 días |
| Sin llaves (fecha, comuna) repetidas | ✔ |  |
| RM de la tabla nacional idéntica a la tabla de la RM aprobada | ✔ | 320.372 filas contra 320.372; 0 filas con alguna diferencia en 16 columnas |
| Defunciones conservadas por año = suma de la tabla | ✔ |  |
| Tramos de edad suman el total (0-64, 65-79, 80+) | ✔ |  |
| Tramos del documento suman el total (0-64, 65-74, 75-84, 85+) | ✔ |  |
| Urgencias: la suma de la tabla coincide con los registros conservados | ✔ |  |
| Urgencias: ninguna fila sin comuna asignada | ✔ | 0 filas |
| Urgencias: ninguna comuna fuera del Censo | ✔ | 0 filas |
| Urgencias: ninguna llave con cifras distintas | ✔ |  |
| REM: RM de la tabla nacional idéntica a la tabla de la RM aprobada | ✔ | 13.819 filas contra 13.819; 0 con diferencias |
| REM: sin llaves duplicadas ni región incoherente | ✔ |  |

## Defunciones por año

| Año | Leídas | Conservadas | Sin comuna (vacía o 99999) | Comuna fuera del Censo | Sin fecha | Antes de 2010 |
|---|---:|---:|---:|---:|---:|---:|
| 1990-2009 | 1.635.907 | 0 | 0 | 0 | 290 | 1.635.617 |
| 2010 | 97.930 | 97.927 | 0 | 0 | 3 | 0 |
| 2011 | 94.985 | 94.983 | 0 | 0 | 2 | 0 |
| 2012 | 98.711 | 98.710 | 0 | 0 | 1 | 0 |
| 2013 | 99.770 | 99.767 | 0 | 0 | 3 | 0 |
| 2014 | 101.960 | 101.936 | 21 | 0 | 3 | 0 |
| 2015 | 103.327 | 103.321 | 0 | 0 | 6 | 0 |
| 2016 | 104.026 | 104.023 | 0 | 0 | 3 | 0 |
| 2017 | 106.388 | 106.388 | 0 | 0 | 0 | 0 |
| 2018 | 106.796 | 106.777 | 18 | 0 | 1 | 0 |
| 2019 | 109.658 | 109.657 | 0 | 0 | 1 | 0 |
| 2020 | 126.169 | 126.166 | 0 | 0 | 3 | 0 |
| 2021 | 137.629 | 137.627 | 0 | 0 | 2 | 0 |
| 2022 | 136.972 | 136.970 | 0 | 0 | 2 | 0 |
| 2023 | 122.218 | 122.193 | 22 | 0 | 3 | 0 |
| 2024 | 126.928 | 126.928 | 0 | 0 | 0 | 0 |
| 2025 | 126.466 | 126.407 | 59 | 0 | 0 | 0 |
| 2026 | 108.198 | 108.161 | 37 | 0 | 0 | 0 |

Las defunciones sin comuna no entran a ninguna comuna ni región, así que el total nacional de la tabla queda bajo el del archivo en esa cantidad.

## Urgencias por archivo

| Archivo | Leídas | Otras causas | Fuera del periodo | Sin fecha | Sin comuna | Duplicados eliminados | Conservadas | Comuna vía mapa |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 2008 | 274.924 | 211.480 | 63.444 | 0 | 0 | 0 | 0 | 0 |
| 2009 | 1.432.946 | 1.102.263 | 327.467 | 0 | 0 | 0 | 3.216 | 3.216 |
| 2010 | 3.045.168 | 2.346.489 | 0 | 0 | 0 | 0 | 698.679 | 698.679 |
| 2011 | 3.503.601 | 2.725.023 | 0 | 0 | 0 | 0 | 778.578 | 778.578 |
| 2012 | 3.796.178 | 2.952.584 | 0 | 0 | 0 | 0 | 843.594 | 843.594 |
| 2013 | 4.039.441 | 3.141.791 | 0 | 0 | 0 | 8 | 897.642 | 897.650 |
| 2014 | 4.134.043 | 3.215.368 | 0 | 0 | 0 | 15 | 918.660 | 918.675 |
| 2015 | 4.340.412 | 3.375.876 | 0 | 0 | 0 | 6 | 964.530 | 964.536 |
| 2016 | 4.435.590 | 3.449.905 | 0 | 0 | 0 | 17 | 985.668 | 985.685 |
| 2017 | 4.455.127 | 3.465.099 | 0 | 0 | 0 | 10 | 990.018 | 990.028 |
| 2018 | 4.488.935 | 3.491.394 | 0 | 0 | 0 | 2.201 | 995.340 | 997.541 |
| 2019 | 4.550.877 | 3.539.571 | 0 | 0 | 0 | 2.190 | 1.009.116 | 1.011.306 |
| 2020 | 6.446.646 | 5.279.400 | 0 | 0 | 0 | 0 | 1.167.246 | 1.167.246 |
| 2021 | 8.816.240 | 7.493.804 | 0 | 0 | 0 | 0 | 1.322.436 | 1.322.436 |
| 2022 | 8.926.307 | 7.587.359 | 0 | 0 | 0 | 0 | 1.338.948 | 1.338.948 |
| 2023 | 8.899.080 | 7.564.218 | 0 | 0 | 0 | 6 | 1.334.856 | 0 |
| 2024 | 8.973.229 | 7.627.245 | 0 | 0 | 0 | 4 | 1.345.980 | 1.158 |
| 2025 | 9.127.869 | 7.761.441 | 0 | 0 | 0 | 0 | 1.366.428 | 0 |
| 2026 | 8.168.430 | 6.973.050 | 0 | 0 | 0 | 0 | 1.195.380 | 0 |

## Urgencias: cobertura por año

| Año | Días con datos | Comunas que informan | Establecimientos que informan |
|---|---:|---:|---:|
| 2010 | 365 | 203 | 374 |
| 2011 | 365 | 206 | 377 |
| 2012 | 366 | 220 | 409 |
| 2013 | 365 | 225 | 427 |
| 2014 | 365 | 224 | 431 |
| 2015 | 365 | 238 | 460 |
| 2016 | 366 | 237 | 462 |
| 2017 | 365 | 237 | 464 |
| 2018 | 365 | 239 | 472 |
| 2019 | 365 | 239 | 475 |
| 2020 | 366 | 299 | 607 |
| 2021 | 365 | 308 | 635 |
| 2022 | 365 | 311 | 638 |
| 2023 | 365 | 312 | 642 |
| 2024 | 366 | 310 | 640 |
| 2025 | 365 | 313 | 652 |
| 2026 | 317 | 317 | 677 |

**Comunas que nunca informan urgencias (25):** 02202, 05704, 06306, 06309, 09110, 09113, 09117, 09121, 09206, 09207, 09209, 11102, 11203, 11302, 11303, 11402, 12102, 12103, 12104, 12202, 12302, 12303, 12402, 15102, 15202. No tienen un establecimiento de urgencia de la red pública que informe; en la plataforma aparecen como «sin dato».

**Comunas sin defunciones en todo el periodo:** ninguna.

## REM por año

| Año | Leídas | Conservadas | n_total nulo | n_65_mas nulo | n_65_mas > n_total | Establecimientos | Comunas | Regiones |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 2024 | 1.200.514 | 34.352 | 0 | 480 | 4 | 2.082 | 344 | 16 |
| 2025 | 1.245.116 | 35.261 | 2 | 568 | 2 | 2.092 | 344 | 16 |
| 2026 | 629.427 | 17.773 | 0 | 227 | 0 | 2.085 | 343 | 16 |

Las filas con `n_65_mas > n_total` y con `n_total` nulo vienen así del origen y están fuera de la RM; no se corrigieron.

## Advertencias

- **Últimos días incompletos**, igual que en la RM: defunciones por día al cierre 10-29 328, 10-30 333, 10-31 339, 11-01 322, 11-02 312, 11-03 300, 11-04 334, 11-05 313, 11-06 175, 11-07 14.
- Establecimientos que informan urgencias en los últimos días: 11-04 612, 11-05 611, 11-06 609, 11-07 605, 11-08 601, 11-09 566, 11-10 566, 11-11 545, 11-12 482, 11-13 102.
- Las urgencias registran la comuna del establecimiento y solo la red pública. En comunas con hospitales grandes la señal incluye pacientes de otras comunas.
- Las defunciones 2024-2026 son preliminares (`def_provisional`).
