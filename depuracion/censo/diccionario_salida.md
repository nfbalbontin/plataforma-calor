# Censo 2024 · Diccionario de salida

Fuentes:
- **Base**: `Base_manzana_entidad_CPV24.csv`, con glosas de `diccionario_variables_glosas_censo2024.xlsx` (hoja `Dicionario`).
- **Quinquenal**: `D1_Poblacion-censada-por-sexo-y-edad-en-grupos-quinquenales.xlsx`, hoja `4`, columna «Población censada» (ambos sexos).
- **Carto**: `Cartografia_censo2024_Pais_*.parquet` (EPSG:4674, reproyectada a EPSG:4326).

Los códigos son texto. Los conteos son enteros y la supresión `*` queda nula.

## censo_manzana.parquet

Una fila por manzana urbana, manzana de aldea o entidad rural con datos (sin contenedores comunales). Orden: región, comuna, `cod_manzana_14`.

| Columna | Tipo | Origen | Glosa / regla |
|---|---|---|---|
| cod_manzana | texto | Base `MANZENT` | Código único identificador de manzana / entidad. Tal como viene: 13 dígitos en regiones 1–9, 14 en 10–16 |
| cod_manzana_14 | texto | Base `MANZENT` | `MANZENT` con ceros a la izquierda hasta 14 dígitos (restituye el cero inicial del código de comuna) |
| cod_comuna | texto(5) | Base `CUT` | Código único territorial de comuna, con cero inicial |
| cod_region | texto(2) | Base `COD_REGION` | Código de región, con cero inicial |
| tipo | texto | Base `TIPO_MZ`, `AREA_C` | `manzana_urbana` (TIPO_MZ = URBANO) · `manzana_aldea` (TIPO_MZ = ALDEA) · `entidad_rural` (AREA_C = 2 sin TIPO_MZ) |
| poblacion | entero | Base `n_per` | Personas censadas en viviendas particulares, colectivas y en situación de calle |
| mayores | entero | Base `n_edad_60_mas` | Personas de 60 años o más. Es el único tramo de personas mayores que existe a nivel manzana |
| ninos_0_5 | entero | Base `n_edad_0_5` | Personas de 0 a 5 años |
| discapacidad | entero | Base `n_discapacidad` | Personas con discapacidad: declaran mucha dificultad o imposibilidad en alguna actividad del módulo de salud. Universo: personas de 5 años o más |
| viviendas | entero | Base `n_vp` | Viviendas particulares (ocupadas y desocupadas) |
| viviendas_hacinadas | entero | Base `n_viv_hacinadas` | Viviendas hacinadas. Universo: viviendas particulares ocupadas con moradores presentes |
| hogares_solo_mayores | entero | Base `n_hog_60` | Hogares compuestos solo de personas de 60 años o más. Universo: hogares en viviendas particulares ocupadas con moradores presentes. No equivale a «unipersonales de mayores», que no existe en la base |
| viv_mediagua | entero | Base `n_tipo_viv_mediagua` | Viviendas con tipo de vivienda: mediagua, mejora, etc. |
| viv_irrecuperables | entero | Base `n_viv_irrecuperables` | Viviendas irrecuperables |
| viv_paredes_precarias | entero | Base `n_mat_paredes_precarios` | Viviendas con materialidad de paredes: materiales precarios o de desecho |
| viv_techo_precario | entero | Base `n_mat_techo_precarios` | Viviendas con materialidad de techo: materiales precarios o de desecho |
| viv_sin_agua_red | entero | Base `n_fuente_agua_pozo` + `n_fuente_agua_camion` + `n_fuente_agua_rio` | Viviendas cuya fuente de agua es pozo o noria, camión aljibe, o río/vertiente/estero/canal. Nula si alguna componente es nula |
| pct_mayores | decimal | calculada | `mayores / poblacion` (proporción entre 0 y 1). Nula si `poblacion < 20` o si `mayores` es nulo |
| lat | decimal | Carto `SHAPE` (Manzanas o Entidades) | Latitud del centroide geométrico del polígono, EPSG:4326. Puede caer fuera del polígono (ver informe) |
| lon | decimal | Carto `SHAPE` | Longitud del centroide, EPSG:4326 |
| lat_interior | decimal | Carto `SHAPE` | Latitud de un punto garantizado dentro del polígono (`ST_PointOnSurface`), EPSG:4326. Es el recomendado para ubicar o mostrar la manzana |
| lon_interior | decimal | Carto `SHAPE` | Longitud del punto interior, EPSG:4326 |

## censo_manzana_geo_<cod_region>.parquet (16 archivos)

| Columna | Tipo | Origen | Regla |
|---|---|---|---|
| cod_manzana | texto | Carto `MANZENT` (DOUBLE → entero → texto) | Mismo valor que `censo_manzana.cod_manzana`, para cruzar |
| geometry | GEOMETRY (WKB, MultiPolygon) | Carto `SHAPE` | Capa Manzanas (urbano y aldea) o Entidades (rural), solo `MZ_BASE_CENSO = 1`, sin simplificar, EPSG:4326 |

## censo_comuna_geo.parquet (345 filas; falta Antártica)

| Columna | Tipo | Origen | Regla |
|---|---|---|---|
| cod_comuna | texto(5) | Carto Comunal `CUT` | Con cero inicial |
| nombre_comuna | texto | Carto Comunal `COMUNA` | En mayúsculas, como en la cartografía |
| cod_region | texto(2) | Carto Comunal `COD_REGION` | Con cero inicial |
| geometry | GEOMETRY | Carto Comunal `SHAPE` | Sin simplificar, EPSG:4326 |

## censo_region_geo.parquet (16 filas)

| Columna | Tipo | Origen | Regla |
|---|---|---|---|
| cod_region | texto(2) | Carto Regional `COD_REGION` | Con cero inicial |
| nombre_region | texto | Carto Regional `REGION` | En mayúsculas |
| geometry | GEOMETRY | Carto Regional `SHAPE` | Sin simplificar, EPSG:4326 |

## censo_comuna.parquet (346 filas)

| Columna | Tipo | Origen | Regla |
|---|---|---|---|
| cod_comuna | texto(5) | Quinquenal «Código comuna» | Con cero inicial |
| nombre_comuna | texto | Quinquenal «Comuna» | Nombre oficial actualizado (incluye el cambio de Paihuano, 04-12-2025) |
| cod_region | texto(2) | Quinquenal «Código región» | Con cero inicial |
| nombre_region | texto | Quinquenal «Región» | |
| pob_total | entero | Quinquenal, grupo «Total Comuna» | Población censada, ambos sexos |
| pob_0_64 | entero | Quinquenal, grupos 0-4 a 60-64 | Suma de 13 grupos |
| pob_65_74 | entero | Quinquenal, 65-69 + 70-74 | |
| pob_75_84 | entero | Quinquenal, 75-79 + 80-84 | |
| pob_85_mas | entero | Quinquenal, «85 o más» | |
| n_manzanas | entero | censo_manzana | Número de filas de la comuna en censo_manzana (manzanas urbanas, de aldea y entidades rurales, incluidas las sin personas) |
| mayores | entero | suma de censo_manzana.mayores | Personas de 60+ en manzanas (excluye contenedores; ignora los 2 nulos) |
| viviendas | entero | suma de censo_manzana.viviendas | Viviendas particulares en manzanas |
| viviendas_hacinadas | entero | suma de censo_manzana.viviendas_hacinadas | |
| lat_centro | decimal | censo_manzana lat (centroide) × poblacion | Σ(lat · poblacion) / Σ poblacion sobre manzanas con poblacion > 0. Centro poblado, no centro geográfico. Nulo en Antártica |
| lon_centro | decimal | censo_manzana lon × poblacion | Ídem con longitud |
