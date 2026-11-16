# Calor y mortalidad en Chile

Sitio público de solo lectura que responde dos preguntas, y nada más:

| Módulo | Pregunta | Ruta |
|---|---|---|
| Historia | ¿Han aumentado las muertes y hospitalizaciones asociadas al calor, y dónde? | `/historia`, `/historia/region/13`, `/historia/comuna/13101`, `/historia/hospital/109100` |
| Riesgo futuro | ¿Dónde puede morir u hospitalizarse más gente con el calor que viene? | `/riesgo` (admite `?region=13`, `?comuna=13101`, `?dia=3`). Dentro de una región las comunas o provincias se pintan por sus muertes potenciales, por tasa o por nivel |

`/metodologia` explica fuentes, transformaciones, diagnósticos, territorio, modelo, validación y límites.
No hay cuentas, carga de archivos, alertas oficiales, notificaciones ni simulación de políticas.

## Cómo se arma

La base histórica es fija: se genera una vez con los programas de `pipeline/` y queda en archivos. Solo la temperatura es viva.

| Etapa | Programa | Salida | Comprobación |
|---|---|---|---|
| 1 y 3. Defunciones y diagnósticos | `e1_defunciones.py CARPETA_CSV` | `.trabajo/defunciones.parquet` | leídas = conservadas + descartes por año; conteo por nivel y año |
| 2. Territorio | `e2_territorio.py` | `datos/territorio.json`, población INE por año | 346 comunas con Servicio de Salud y hospital de referencia |
| Clima histórico | `p5_clima_historico.py --solo-capitales` | `.trabajo/clima/` | se puede reanudar; respeta el límite de Open-Meteo |
| 4. Modelo y validación | `e4_modelo.py` | `datos/modelo.json`, `.trabajo/modelo/` | veranos reservados, comparación con el estudio UC, sensibilidad |
| 5. Historia | `e5_historia.py` | `public/historia/` (un archivo por lugar), `datos/riesgo_base.json` | valores finitos; 1 país, 16 regiones, 346 comunas y los hospitales |
| 6. Riesgo | `e6_riesgo.py`, `p10_estacional.py` | `datos/clima_comunas.json`, `datos/proyeccion_mensual.json` | |
| Puntos de manzana | `e7_manzanas.py` | `public/manzanas/<comuna>.json` | un punto por manzana con población, para verlas desde lejos |
| Territorio y teselas (ya hechas) | `p1_territorio.py`, `p2_teselas.py`, `p7_aura.py` | `datos/comunas.json`, `public/teselas/` | |

Todos corren con el Python de `../.venv` desde `pipeline/`. Orden tras cambiar datos: e1, e2, p5, e4, e5, e6.
Las urgencias por establecimiento salen de `../src/depuracion/n1_nacional.py` (carpeta `.trabajo/deis_stage/urg`).

## Modelo

Regresión de Poisson con sobredispersión por región, temporada cálida (noviembre a marzo). Exposición: promedio de la
temperatura máxima del día y de los 3 anteriores en la capital regional; spline cúbico natural con nudos en percentiles
locales. Controles: curva estacional por temporada, día de la semana y feriados. Las curvas regionales se acercan a la
nacional (metaanálisis multivariado). El sitio solo aplica la fórmula con las curvas guardadas:

    Muertes potenciales = Σ_d B_d · (RR(T_d) − 1)

Hacia atrás (temperatura observada) da las muertes atribuibles de Historia; hacia adelante (pronóstico), las del mapa
de riesgo. El rango de 95 % sale de sortear los coeficientes; toda cifra se muestra con su rango.

## Sitio

Next.js 15 + React 19, MapLibre con teselas PMTiles estáticas. `npm run dev` (puerto 3300 con `.claude/launch.json`),
`npm run typecheck`, `npm test`.

- Temperatura: `GET /api/tareas/diaria` con `Authorization: Bearer $TAREA_SECRETO` guarda el pronóstico de 16 días de
  las comunas (Open-Meteo). Las visitas leen lo guardado. Si la API falla, el mapa muestra el último pronóstico con su fecha.
  `vercel.json` la agenda una vez al día.
- Base: PGlite local en `.datos/pglite`; con `DATABASE_URL`, Postgres. Solo guarda temperatura reciente y pronóstico.
- Capa AURA: apagada salvo `MODULO_AURA=1`. Sus datos derivados no se publican sin autorización escrita de su equipo.

## Decisiones tomadas y pendientes

- Egresos hospitalarios: los datos abiertos no traen el día, así que no se usan; las hospitalizaciones salen de urgencias.
- Temperatura: capital regional para el modelo y la historia. La serie por comuna (302 celdas, 1991 en adelante) son
  unas 220.000 llamadas a la API gratuita, cerca de 4 semanas de corridas diarias. `pipeline/descarga_diaria.sh`
  baja hasta 8.000 llamadas por día y luego corre `e6_riesgo.py` (`--iniciar` en segundo plano, `--estado` para ver
  el avance; registro en `.trabajo/clima_diaria.log`). Al terminar falta decidir si el modelo pasa a usar la
  temperatura de cada comuna.
- Hospital de referencia: regla de cercanía dentro del Servicio de Salud; `config/derivacion.json` la reemplaza donde
  haya mapa oficial.
- Datos estáticos en archivos en vez de tablas Postgres: mismo contenido, sin costo de base.
- Pendiente: confirmar condiciones de uso de AURA, enlazar los estudios de la tabla de diagnósticos, publicar el repositorio.
