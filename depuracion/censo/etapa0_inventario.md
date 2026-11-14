# Censo 2024 · Etapa 0: inventario y mapeo

Fecha: 2026-11-14. Solo lectura de originales (copias extraídas en un directorio temporal; los zip y xlsx de `~/Downloads` no se tocaron).

## 1. Fuentes

| Archivo | Contenido real |
|---|---|
| `Base_manzana_entidad_CPV24.zip` → `Base_manzana_entidad_CPV24.csv` | 197.032 filas × 212 columnas. UTF-8 con BOM, separador `;`, decimal con coma, CRLF. 23 columnas de identificación + 189 variables (`n_*`, `prom_*`). |
| `diccionario_variables_glosas_censo2024.xlsx` | **Es el diccionario de la base manzana-entidad**: hoja `Dicionario` (212 variables con temática, descripción y universo), `DPA` (346 comunas), `Glosas_variables_geográficas`. |
| `diccionario_variables_censo2024.xlsx` | Diccionario de los **microdatos** (viviendas, hogares, personas). No se usa para estas tablas, salvo la hoja `codigos_territoriales`. |
| `Cartografia_censo2024_Pais (1).zip` | 10 capas GeoParquet + `Diccionario_variables_geograficas_CPV24.xlsx`. |
| `D1_Poblacion-censada-por-sexo-y-edad-en-grupos-quinquenales.xlsx` | Hoja `4`: comuna × grupo quinquenal (0-4 … 80-84, **85 o más**), 346 comunas, sin celdas suprimidas. |
| `Manual_uso_cartografia_CPV2024.pdf` | 23 págs. Confirma SIRGAS 2000 (EPSG:4674), asteriscos por anonimización, contenedores comunales y manzanas indeterminadas multiparte. |

## 2. Capas de la cartografía

Todas: geometría `SHAPE` (WKB, MultiPolygon), **CRS EPSG:4674 (SIRGAS 2000)** → hay que reproyectar a EPSG:4326. Códigos guardados como números (`CUT` INTEGER, `MANZENT` DOUBLE): los ceros iniciales se perdieron en origen.

| Capa | Filas | Columnas de identificación | Variables censales |
|---|---:|---|---:|
| Regional | 16 | COD_REGION, REGION | 0 |
| Provincial | 56 | COD_REGION, REGION, COD_PROVINCIA, PROVINCIA | 0 |
| Comunal | **345** | CUT, COD_REGION, REGION, COD_PROVINCIA, PROVINCIA, COMUNA | 0 |
| Distrital | 2.762 | … + DISTRITO, COD_DISTRITO, TIPO_DISTRITO, ID_DISTRITO | 0 |
| Zonal | 4.911 | … + AREA_C, COD_LOCALIDAD, COD_ZONA, LOCALIDAD, COD_ENTIDAD, ENTIDAD, COD_CATEGORIA, CATEGORIA, ID_* | 189 |
| Limite_Urbano | 592 | … + COD_LOCALIDAD, LOCALIDAD, COD_ENTIDAD, ENTIDAD, CONURBACION, ID_* | 189 |
| Localidades | 9.736 | … + AREA_C, COD_LOCALIDAD, LOCALIDAD, ID_LOCALIDAD | 189 |
| Aldeas | 725 | … + AREA_C, ENTIDAD, COD_CATEGORIA, CATEGORIA, ID_ENTIDAD | 189 |
| **Entidades** (rurales) | 28.415 | … + AREA_C, **MANZENT**, DISTRITO, COD_LOCALIDAD, COD_ENTIDAD, MZ_BASE_CENSO, ID_* | 189 |
| **Manzanas** (urbanas + aldea) | 216.341 | … + AREA_C, **MANZENT**, DISTRITO, COD_DISTRITO, COD_LOCALIDAD, COD_ZONA, COD_ENTIDAD, **COD_MANZANA**, TIPO_MZ, MZ_BASE_CENSO, ID_* | 189 |

Las 189 variables son las mismas en todas las capas con datos y en el CSV. Además, cada capa trae OBJECTID, SHAPE_Length, SHAPE_Area y SHAPE_bbox.

## 3. Mapeo de variables (etapa 1)

| Variable pedida | Columna real | Glosa del diccionario (universo) | Archivo | Estado |
|---|---|---|---|---|
| cod_manzana | `MANZENT` | Código único identificador de manzana / entidad | CSV y capas Manzanas/Entidades | Existe. 13 dígitos (regiones 1–9) o 14 (10–16) |
| cod_comuna | `CUT` | Código único territorial de comuna | CSV | Existe (4 o 5 dígitos, hay que rellenar a 5) |
| cod_region | `COD_REGION` | Código de región | CSV | Existe (1 o 2 dígitos, hay que rellenar a 2) |
| tipo | `AREA_C` + `TIPO_MZ` + `CONTENEDOR_COMUNAL` | Estrato (1 urbano, 2 rural); tipo de manzana urbana/aldea; registro solo a nivel comuna | CSV | Existe: URBANO 160.282 · ALDEA 8.013 · entidad rural 28.352 · contenedor comunal 385 |
| poblacion | `n_per` | Personas (censadas en viviendas particulares, colectivas y situación de calle) | CSV | Existe, sin suprimidos |
| mayores 60+ | `n_edad_60_mas` | Personas de 60 años o más | CSV | Existe (2 celdas `*`) |
| mayores 65+, 75+, 80+ | — | — | — | **No existe a nivel manzana**. Solo hay 65-69…85+ a nivel comuna (D1, hoja 4) |
| ninos_0_5 | `n_edad_0_5` | Personas de 0 a 5 años | CSV | Existe (7 celdas `*`) |
| discapacidad | `n_discapacidad` | Personas con discapacidad (mucha dificultad o no puede en algún ítem de salud) — universo 5 años o más | CSV | Existe (1 celda `*`) |
| viviendas | `n_vp` | Viviendas particulares (incluye desocupadas) | CSV | Existe. También `n_vp_ocupada` |
| viviendas_hacinadas | `n_viv_hacinadas` | Viviendas hacinadas (particulares ocupadas con moradores presentes) | CSV | Existe |
| hogares unipersonales de mayores | — | — | — | **No existe**. Lo más cercano: `n_hog_60` = hogares compuestos solo de personas de 60+ (1.080.204 en el país); `n_hog_unipersonales` es de cualquier edad |
| materialidad precaria / mediagua | `n_tipo_viv_mediagua` | Tipo de vivienda: mediagua, mejora, etc. | CSV | Existe (27.490) |
| | `n_viv_irrecuperables` | Viviendas irrecuperables | CSV | Existe (72.642) |
| | `n_mat_paredes_precarios` / `n_mat_techo_precarios` | Paredes / techo de materiales precarios o de desecho | CSV | Existen |
| sin agua de red pública | `n_fuente_agua_pozo` + `n_fuente_agua_camion` + `n_fuente_agua_rio` | Fuente de agua: pozo o noria / camión aljibe / río, vertiente, estero, canal | CSV | No hay columna directa; es la suma de las tres fuentes no públicas (492.693). `n_fuente_agua_publica` = 5.914.136 |
| lat, lon | — | — | capa Manzanas (urbano+aldea) y Entidades (rural) | Se calcula del centroide de `SHAPE` tras reproyectar |

## 4. Llave base ↔ cartografía

Llave: **`MANZENT`** (CSV como texto; capa como DOUBLE, entero exacto → `CAST(CAST(MANZENT AS BIGINT) AS VARCHAR)`). Sin duplicados ni nulos en ningún lado.

| Grupo de la base | Filas | Capa con geometría | Calzan |
|---|---:|---|---:|
| Manzanas urbanas | 160.282 | Manzanas | 160.282 (100 %) |
| Manzanas de aldea | 8.013 | Manzanas | 8.013 (100 %) |
| Entidades rurales | 28.352 | Entidades | 28.352 (100 %) |
| Contenedores comunales (`…99x999999`) | 385 (254.224 personas) | ninguna, por diseño | 0 |
| **Total** | **197.032** | | **196.647** |

En sentido inverso: 48.046 polígonos de Manzanas y 63 de Entidades no están en la base; todos tienen `MZ_BASE_CENSO = 0` (sin información, población 0). `n_per` del CSV y de la capa coincide en el 100 % de los cruces.

## 5. Datos de control ya visibles

- Suma de `n_per` en la base: **18.480.432**, exactamente la cifra del INE (incluye contenedores).
- Base: 16 regiones, 346 comunas. D1: 346 comunas. **Capa Comunal: 345 polígonos — falta Antártica (12202)**, que solo tiene un contenedor de 60 personas.
- Celdas `*` en toda la base: 252.497, en 85 de 189 columnas y 138.228 filas, casi todas en variables que no usaremos. En las variables elegidas: `n_edad_0_5` 7, `n_edad_60_mas` 2, `n_discapacidad` 1. Celdas vacías: `prom_edad`, `prom_escolaridad18`, `prom_per_hog` cuando no hay personas u hogares (no se usan).
- Filas con `n_per = 0`: 5.587. Filas con 1–19 personas (pct_mayores nulo): 24.290.
- Largo de `MANZENT`: 13 dígitos 111.870 · 14 dígitos 85.162. Las de 13 son de las regiones 1–9 a las que les falta el cero inicial del CUT.
- RM: 50.022 manzanas urbanas con datos en 51 comunas (todas de 14 dígitos); 50.521 si se suman las de aldea (52 comunas); la capa trae 66.297 polígonos urbanos en total. Ninguna combinación da 53.004 manzanas en 47 comunas, así que AURA probablemente usa otra base (¿Censo 2017?) u otro universo.
- Manzanas indeterminadas: el INE agrupó manzanas pequeñas en un solo registro con polígono multiparte. Un mismo `MANZENT` del 2024 puede cubrir varias manzanas físicas.
- Los polígonos de entidad rural son Thiessen (referencia estadística, no límite real); su centroide puede caer lejos de las viviendas.
