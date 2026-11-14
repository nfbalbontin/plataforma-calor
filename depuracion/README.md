# Programas de depuración

Copia de los programas que generan las tablas depuradas que consume `pipeline/`, con sus informes de controles.
Los archivos de origen (zip del DEIS, Censo 2024) no están en el repositorio: se descargan de las direcciones indicadas en la página Metodología.

- `censo/`: Censo 2024 (base manzana-entidad, cartografía, población por edad). Ver `informe.md` y `diccionario_salida.md`.
- `deis_rm/`: primera depuración, solo Región Metropolitana (`d1` a `d7`), con el mapa de establecimiento a comuna y el mapeo de columnas del REM.
- `deis_nacional/`: depuración de todo el país (`n1` a `n3`). El control principal exige que el subconjunto de la RM sea idéntico a la tabla de `deis_rm`.
