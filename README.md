# Plataforma de prevención de muertes por calor extremo (prototipo)

Prototipo de uso no comercial. No emite alertas oficiales: muestra la oficial vigente y, aparte, un nivel estimado propio.
Implementa el documento «Plataforma de prevención de muertes por calor extremo — Definición de requerimientos» (14-11-2026).

## Cómo se usa

```bash
npm install
npm run dev -- -p 3300
```

- Sin `DATABASE_URL` la base es local (PGlite en `.datos/pglite`). Con `DATABASE_URL` usa Postgres (Neon).
- `.env.local` trae `ADMIN_CLAVE` (sección Carga) y `TAREA_SECRETO` (tarea diaria). Ver `.env.example`.
- Tarea diaria: `curl -H "Authorization: Bearer $TAREA_SECRETO" http://localhost:3300/api/tareas/diaria`, o el botón «Ejecutar ahora» en Carga.
- Pruebas: `npm test` (niveles, calor acumulado, señal de urgencias, validación de cargas, alertas).

## Proceso de datos (corre en el computador, no en Vercel)

Usa el entorno de Python de `../.venv` (DuckDB 1.4.5, pmtiles). Orden:

| Programa | Qué hace | Insumo |
|---|---|---|
| `pipeline/p1_territorio.py` | Comunas, regiones, clase de prioridad por manzana, listas CSV por comuna | `depurado/censo/` |
| `pipeline/p2_teselas.py` | `public/teselas/chile.pmtiles` y `manzanas_<región>.pmtiles` | `depurado/censo/` |
| `pipeline/p3_salud.py` | Establecimientos y dependencia por centro (nacional) | DEIS |
| `pipeline/p4_deis.py` | Vigilancia semanal (país y 16 regiones), señal de urgencias, resumen mensual | `../depurado_nacional/comuna_dia.parquet` |
| `pipeline/p5_clima_historico.py` | Serie histórica de Open-Meteo por celda, con presupuesto diario; se puede repetir | Open-Meteo |
| `pipeline/p6_umbrales_episodios.py` | `config/umbrales.json` y `datos/episodios.json` | salida de p5 y p4 |
| `pipeline/p7_aura.py` | Módulo de la RM: cruce de AURA con el Censo, prioridad con calor, listas con diferencia de temperatura. Después: `p2_teselas.py 13aura` | `~/Downloads/AURA_*` |
| `pipeline/controles.py` | Controles automáticos sobre lo generado | todo lo anterior |

La API gratuita de Open-Meteo cobra cada consulta según los días pedidos (10.000 llamadas al día, 5.000 por hora).
La serie 1991-2020 de las 345 comunas con punto de clima son unas 220.000 llamadas: hay que correr
`p5_clima_historico.py --presupuesto 8000` una vez al día durante unas cuatro semanas, y después `p6`.
Las comunas que comparten celda de la grilla se bajan una sola vez (302 celdas para 345 comunas).

## Dónde vive cada dato

- `datos/*.json`: lo que generó el proceso externo. Las páginas lo leen directo, sin base.
- `public/teselas/*.pmtiles`: el mapa las lee directo; no pasan por la base.
- Base (PGlite o Neon): solo lo que cambia cada día: `comuna_dia`, `pronostico`, `cambio_nivel`, `alerta_oficial`, `fuente_estado`, `carga`, `ejecucion`.
- `config/*.json`: umbrales, medidas, fuentes, prioridad y episodios. Son archivos versionados.

Diferencia con el modelo de datos del documento: las tablas fijas (región, comuna, establecimiento, dependencia,
vigilancia) quedaron como archivos y no como tablas de Postgres. Así el sitio sigue visible si la base falla y
ninguna página fija consulta la base.

## Estado de los requerimientos

| Requerimiento | Estado |
|---|---|
| RF-01 Mapa en tres niveles | Hecho. Con el módulo AURA activo, la RM tiene capa de temperatura estimada por manzana (día y noche) |
| RF-02 Ficha de comuna | Hecho para las 346 comunas |
| RF-03 Ficha de manzana | Hecho; en la RM agrega temperatura estimada, isla de calor, Humidex, uso de suelo y zona climática (módulo AURA) |
| RF-04 Manzanas prioritarias y CSV | Hecho para las 346 comunas; con el módulo AURA, 46 comunas de la RM incluyen la diferencia de temperatura |
| RF-32 Dependientes por centro | Hecho: 2.085 centros en 343 comunas |
| RF-05 Ingesta diaria | Hecho. Reintenta y conserva el último dato; el respaldo de la DMC no está configurado |
| RF-06 Nivel estimado | Hecho; solo en las comunas que ya tienen umbral |
| RF-07 Calor acumulado y moderado | Hecho, con pruebas |
| RF-08 Niveles con confianza | Hecho |
| RF-28 Vigilancia de mortalidad | Hecho para el país y las 16 regiones. La carga semanal automática del DEIS no está |
| RF-29 Señal de urgencias | Hecho para las comunas con un establecimiento que informa. La carga diaria automática no está |
| RF-11 Historial de episodios | Hecho para la RM, por región; las demás regiones esperan su serie de temperatura; falta el detalle por comuna |
| RF-09 Panorama de temporada | Hecho con los totales por región; falta el archivo mes a mes |
| RF-10 Muertes con rango | Hecho por región |
| RF-12 a RF-18 Panel operacional | Hecho |
| RF-19 a RF-21 Vistas | Hecho; el tercer horizonte de Futuro (AURA) queda pendiente |
| RF-22 Trazabilidad | Hecho en las cifras principales |
| RF-35 Descargas | Hecho |
| RF-38 Metodología | Hecho; falta el contacto |
| RF-36 Fuente vencida | Hecho |
| RF-37 Carga con clave | Hecho para el archivo del Impact Lab; los archivos grandes necesitan GitHub Actions |
| RF-30, 31, 33, 34 | Pendientes: dependen de la calibración |
| RF-23 a RF-27 | Fase posterior |

## Cambios del 14-11 (segunda ronda)

- **Inicio** (`/`) con el video y las secciones; el mapa pasó a `/mapa`. **Tutorial** en `/tutorial` y botón **Ayuda** en cada sección (recorrido guiado; se abre con `?ayuda=1`).
- **Modo claro y oscuro** (botón en el encabezado; queda guardado en el navegador).
- **Mapa**: filtros de región, provincia, comuna y nivel mínimo; agrupación por región, provincia, comuna o manzana; la distribución por nivel está siempre visible; al seleccionar se ven promedio, desviación estándar, mínimo y máximo. Los hospitales se ven desde lejos y se pueden pinchar.
- **Impacto** (`/vigilancia`): gráfico de defunciones con filtros de región, comuna, edad, año, mes y agrupación; marca los períodos con episodio de calor y los que superan el rango. Por comuna el detalle mínimo es el mes (RNF-07).
- **Establecimientos** (`/establecimientos`): hospitales y centros con sus urgencias de 65+ y los días de calor con alza. El DEIS no publica defunciones por establecimiento.
- **Futuro**: pronóstico de 16 días (hoy y 15 más), temporada y cambio al 2050 por comuna de la RM.
- **Regla de alerta propia** (`config/alerta.json`, `src/lib/alerta.ts`), respaldada con `datos/evidencia_alerta.json`; documentada en Metodología.
- **Ingreso** en `/login`; `/admin` redirige ahí. Metodología y Estado muestran la API o descarga de cada fuente; se quitó la columna de permisos.
- Datos nuevos: `pipeline/p8_extras.py` (provincias, defunciones filtrables, causa certificada por calor, urgencias por establecimiento, evidencia de la regla).

## Requisitos no funcionales

| Requisito | Estado |
|---|---|
| RNF-03 El mapa no consulta la base | Cumple: teselas estáticas y una ruta de niveles con caché |
| RNF-04 Teselas por región bajo 100 MB | Cumple: 17 archivos, 71 MB en total, el mayor de 9,8 MB (`controles.py`) |
| RNF-05 Sitio visible si falla la base | Implementado (lecturas con respaldo); no se probó con la base desconectada |
| RNF-06 y RNF-07 Privacidad | Solo agregados; la única cookie es la de sesión del administrador; muertes comunales solo por mes |
| RNF-08 Sin porcentajes bajo 20 habitantes | Cumple (`controles.py`) |
| RNF-09 Claves y secretos | Cumple: sin clave la tarea responde 401; 5 intentos de acceso cada 15 minutos |
| RNF-11 Validación y reversión de cargas | Cumple; probado con un archivo defectuoso y uno correcto |
| RNF-12 y RNF-13 Autoría y módulos | Citas en Metodología; AURA e Impact Lab se apagan con `MODULO_AURA` y `MODULO_IMPACTLAB`. Se probó apagar y reactivar AURA; no el Impact Lab |
| RNF-17 y RNF-18 Configuración versionada y pruebas | `config/*.json`; 19 pruebas con `npm test` (falta correrlas en cada cambio en GitHub) |
| RNF-01, RNF-02, RNF-16 Costo, rendimiento, procesos | Sin verificar: no hay despliegue todavía |
| RNF-10 Usuario de solo lectura | Pendiente |
| RNF-14 Código abierto y licencia | Pendiente: falta el repositorio y el archivo de licencia |
| RNF-19 Accesibilidad | Parcial: niveles con número y texto, foco visible, uso en teléfono; falta la revisión con herramienta |

## Módulo de la RM (AURA)

- Se activa con `MODULO_AURA=1` (solo en `.env.local`). Sus salidas van aparte y están en `.gitignore`: `datos/aura.json`,
  `public/teselas/manzanas_13_aura.pmtiles` y `public/descargas/manzanas_aura/`. **No se publican sin autorización escrita del equipo de AURA.**
  Para retirarlo: `MODULO_AURA=0` y borrar esos tres.
- Los códigos de manzana de AURA no son los del Censo 2024: solo el 10 % de los vínculos por posición comparte código. El cruce es por posición.
- Resultado: 48.003 de 50.022 manzanas urbanas de la RM con dato (96,9 % de la población urbana); 47.831 de 53.004 manzanas de AURA vinculadas
  (de las 5.173 sin vínculo, 4.152 no tienen uso habitacional). 46 comunas con dato; 45 usan la regla con calor (San José de Maipo tiene 31 % de cobertura).
- Diferencia de temperatura = valor de la manzana menos el promedio comunal publicado por AURA. La mediana es +0,2 °C, porque ese promedio
  incluye manzanas sin población; la mayor distancia entre el promedio del cruce y el publicado es 0,9 °C.
- Con la regla de calor (S5) la clase alta de la RM pasa de 10.127 a 2.133 manzanas (de 681.667 a 145.307 personas de 60 años o más).
- Falta: clima proyectado al 2050 (RF-26) y la extracción trimestral automática.

## Lo que falta para publicar

1. Tareas programadas para recargar el DEIS (hoy la depuración nacional se corre a mano: `../src/depuracion/n1_nacional.py`, `n2_rem_nacional.py`, `n3_controles_informe.py`).
2. Completar la serie histórica de temperatura (ver arriba).
3. Cuentas de Vercel, Neon y GitHub; tareas de GitHub Actions para el DEIS.
4. Autorización de AURA y condiciones del Climate Impact Lab; revisar términos del DEIS.
5. Definir quién firma la plataforma y el contacto para correcciones.

## Licencias

Datos derivados del Censo 2024: CC BY-SA 4.0 (INE). Temperatura: Open-Meteo, CC BY 4.0, API gratuita solo para uso no comercial.
