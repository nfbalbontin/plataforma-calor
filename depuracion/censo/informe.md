# Censo 2024 · Informe de depuración

Fecha: 2026-11-14 · Script: [`scripts/construir_censo.py`](scripts/construir_censo.py) (DuckDB 1.4.5 + extensión spatial). Inventario previo: [`etapa0_inventario.md`](etapa0_inventario.md). Columnas: [`diccionario_salida.md`](diccionario_salida.md).

Los originales no se modificaron: se leyeron desde una copia extraída de los zip. No se imputó ningún valor.

## Decisiones aplicadas (confirmadas en la etapa 0)

1. `cod_manzana` se deja tal como viene (13 o 14 dígitos). Se agrega `cod_manzana_14`, que solo antepone un cero a los de 13 dígitos (regiones 1–9, donde el INE perdió el cero inicial del código de comuna).
2. Los 385 **contenedores comunales** (254.224 personas sin manzana asignada) quedan fuera de `censo_manzana`; sí cuentan en `censo_comuna` a través del archivo de grupos quinquenales.
3. Las geometrías de manzana son solo las que tienen datos (`MZ_BASE_CENSO = 1`): urbanas y de aldea desde la capa Manzanas, entidades rurales desde la capa Entidades.
4. Variables extra: `hogares_solo_mayores` (`n_hog_60`), las cuatro de precariedad por separado y `viv_sin_agua_red` (suma de pozo + camión + río).
5. Antártica (12202) tiene fila en `censo_comuna` pero no tiene polígono.
6. Se agregó a `censo_manzana` un punto interior garantizado (`lat_interior`, `lon_interior`), además del centroide (pedido después de la primera entrega).

## Filas y columnas

| Etapa | Filas | Columnas |
|---|---:|---:|
| CSV manzana-entidad leído | 197.032 | 212 |
| `censo_manzana` conservadas | 196.647 | 22 |
| descartadas (contenedores comunales) | 385 | — |
| Geometrías de manzana/entidad (16 archivos) | 196.647 | 2 |
| Polígonos de la cartografía sin datos (no publicados) | 48.109 (48.046 manzanas + 63 entidades) | — |
| `censo_comuna` | 346 | 15 |
| `censo_comuna_geo` | 345 | 4 |
| `censo_region_geo` | 16 | 3 |

Por tipo: manzana_urbana 160.282 (15.777.741 personas) · manzana_aldea 8.013 (408.212) · entidad_rural 28.352 (2.040.255).

## Celdas suprimidas (`*` en el CSV)

Hay 252.497 en toda la base, en 85 de las 189 variables; casi todas están en variables descartadas. En las columnas conservadas quedan **10 nulos**, todos en entidades rurales:

| Columna de salida | Original | Celdas `*` → nulo |
|---|---|---:|
| ninos_0_5 | n_edad_0_5 | 7 |
| mayores | n_edad_60_mas | 2 |
| discapacidad | n_discapacidad | 1 |
| todas las demás | — | 0 |

`pct_mayores` es nulo en 24.291 filas: 24.290 tienen menos de 20 personas y 1 (`13110072002001`, 123 personas) tiene `mayores` suprimido. El archivo de grupos quinquenales no trae celdas suprimidas.

## Controles obligatorios

### 1. Filas y regiones de `censo_comuna`
346 filas, 346 comunas distintas y 16 regiones. ✅

### 2. Población nacional
Suma de `pob_total` = **18.480.432**. La diferencia con la referencia del INE es **0**. La suma de los cuatro tramos de edad también da 18.480.432, y en las 346 comunas el total coincide con la suma de sus grupos quinquenales. ✅

### 3. Población en manzanas vs. comunal, por región
La diferencia es exactamente la población de los contenedores comunales en todas las regiones. Comuna por comuna, la base completa (con contenedores) coincide con el archivo quinquenal en las 346 comunas.

| Región | Comunal (quinquenal) | En manzanas | Diferencia | % |
|---|---:|---:|---:|---:|
| 01 Tarapacá | 369.806 | 358.910 | 10.896 | 2,9 |
| 02 Antofagasta | 635.416 | 618.389 | 17.027 | 2,7 |
| 03 Atacama | 299.180 | 294.897 | 4.283 | 1,4 |
| 04 Coquimbo | 832.864 | 817.236 | 15.628 | 1,9 |
| 05 Valparaíso | 1.896.053 | 1.866.910 | 29.143 | 1,5 |
| 06 O'Higgins | 987.228 | 981.737 | 5.491 | 0,6 |
| 07 Maule | 1.123.008 | 1.114.486 | 8.522 | 0,8 |
| 08 Biobío | 1.613.059 | 1.606.060 | 6.999 | 0,4 |
| 09 La Araucanía | 1.010.423 | 1.003.546 | 6.877 | 0,7 |
| 10 Los Lagos | 890.284 | 870.825 | 19.459 | 2,2 |
| 11 Aysén | 100.745 | 98.351 | 2.394 | 2,4 |
| 12 Magallanes | 166.537 | 163.961 | 2.576 | 1,5 |
| 13 Metropolitana | 7.400.741 | 7.291.744 | 108.997 | 1,5 |
| 14 Los Ríos | 398.230 | 393.520 | 4.710 | 1,2 |
| 15 Arica y Parinacota | 244.569 | 237.430 | 7.139 | 2,9 |
| 16 Ñuble | 512.289 | 508.206 | 4.083 | 0,8 |
| **Total** | **18.480.432** | **18.226.208** | **254.224** | **1,4** |

### 4. Calce entre datos y geometría
- Manzanas con datos sin geometría: **0**.
- Geometrías publicadas sin datos: **0**.
- Comunas sin polígono: **1**, Antártica (12202). Además no tiene centro poblado, porque no tiene manzanas.
- La población de `censo_manzana` (18.226.208) coincide con la suma de `n_per` en las capas Manzanas + Entidades.

### 5. Largo de `cod_manzana` y Región Metropolitana

| Largo | Manzanas |
|---|---:|
| 13 dígitos (regiones 01–09) | 111.639 |
| 14 dígitos (regiones 10–16) | 85.008 |
| `cod_manzana_14` | 196.647, todas de 14 |

| RM | Filas | Comunas | Con 14 dígitos |
|---|---:|---:|---:|
| manzana_urbana | 50.022 | 51 | 50.022 |
| manzana_aldea | 499 | 20 | 499 |
| entidad_rural | 2.072 | 26 | 2.072 |
| **Total (archivo geo_13)** | **52.593** | **52** | **52.593** |

En la RM todos los códigos tienen 14 dígitos (comunas 13xxx), así que el formato es compatible con AURA. Pero **ninguna combinación de filtros reproduce sus 53.004 manzanas en 47 comunas**: las urbanas con personas son 49.907 en 51 comunas, y la capa trae 66.297 polígonos urbanos contando los vacíos. Conviene confirmar qué año censal y qué universo usa AURA antes del cruce. Además, el INE fusionó manzanas pequeñas en polígonos multiparte (manzanas «indeterminadas»), así que un código de 2024 puede cubrir varias manzanas de otra fuente.

## Geometrías

- CRS de origen: EPSG:4674 (SIRGAS 2000). Se aplicó `ST_Transform(…, 'EPSG:4674', 'EPSG:4326', always_xy)`. PROJ usa transformación nula entre ambos (diferencia < 1 m), así que las coordenadas no cambian. Los GeoParquet de salida no declaran `crs`, lo que según la especificación GeoParquet 1.0 equivale a OGC:CRS84 (EPSG:4326 en orden lon/lat).
- No se simplificó nada. Los límites comunales y regionales pesan 106 MB y 90 MB por el detalle de la costa y las islas; para un mapa web conviene generar además una versión simplificada.
- **20 polígonos de manzana inválidos** según `ST_IsValid` (vienen así del INE; no se corrigieron): 10101071015002, 1107021002003, 12101101002068, 13107011008032, 13115011008006, 13122091002024, 13301021004050, 2104021001032, 2104031001073, 3101173092002, 3304011003016, 4101091001004, 4303113017007, 5101231014007, 5804041003038, 6106023066001, 7402011001044, 8105081001009, 8202033148011, 9101101004005. Los límites comunales y regionales son todos válidos.
- Polígonos multiparte: 7.759 manzanas y 1.201 entidades.

## Anomalías y advertencias

1. **El centroide cae fuera de su propio polígono en 6.967 casos** (6.127 manzanas y 840 entidades): manzanas multiparte, formas en L o entidades rurales Thiessen de gran tamaño. Por eso se agregaron `lat_interior` y `lon_interior` (`ST_PointOnSurface`), que caen dentro del polígono en las 196.647 filas, incluidos los 20 polígonos inválidos. En esos 6.967 casos, la distancia entre el centroide y el punto interior tiene mediana de 64 m y percentil 90 de 437 m; el máximo, en una entidad rural, es 62,7 km. **Para ubicar o mostrar una manzana conviene usar el punto interior**; `lat`/`lon` (centroide) se mantienen porque son la base del centro poblado comunal.
2. **El centro poblado cae fuera del polígono comunal en 7 comunas**: Juan Fernández, Constitución, Quemchi, Quinchao, Cisnes, Guaitecas y Río Verde. Son comunas con islas o con población separada por agua, y el promedio ponderado queda en el mar o en otra isla. Es lo esperable del método, pero no sirve como punto para consultar clima en esas comunas.
3. **Las entidades rurales son polígonos Thiessen** construidos alrededor de las viviendas (manual, §3.3): son una referencia estadística, no un límite real, y su centroide puede quedar lejos de las casas.
4. **Universos distintos:** `discapacidad` es sobre personas de 5 años o más; las variables de vivienda (hacinamiento, precariedad, agua) son sobre viviendas particulares ocupadas con moradores presentes; `viviendas` (`n_vp`) incluye las desocupadas. No se deben dividir unas por otras sin cuidar el denominador.
5. **`mayores` es 60+ en las manzanas; en las comunas los tramos parten en 65.** La suma de mayores de 60 en las manzanas es 3.628.004; los de 65+ comunales suman 2.587.238.
6. 5.587 filas tienen 0 personas pero viviendas (por ejemplo, segunda vivienda o desocupadas); se conservan.
7. La nota del archivo quinquenal indica un cambio de nombre de la comuna de Paihuano (actualización del 04-12-2025): los nombres de comuna se tomaron de ese archivo.

## Archivos

| Archivo | Filas | Tamaño |
|---|---:|---:|
| censo_manzana.parquet | 196.647 | 7,6 MB |
| censo_comuna.parquet | 346 | 18 KB |
| censo_manzana_geo_01 … _16.parquet | 196.647 en total | 189 MB en total (1,7 a 29,3 MB c/u) |
| censo_comuna_geo.parquet | 345 | 105,6 MB |
| censo_region_geo.parquet | 16 | 90,4 MB |

Filas por archivo regional: 01: 3.357 · 02: 6.269 · 03: 5.140 · 04: 12.398 · 05: 23.703 · 06: 11.802 · 07: 15.866 · 08: 18.613 · 09: 14.491 · 10: 12.180 · 11: 2.085 · 12: 3.044 · 13: 52.593 · 14: 5.429 · 15: 2.903 · 16: 6.774.
