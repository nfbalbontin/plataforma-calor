"""Etapas 1 y 3 · Defunciones del DEIS 1990 en adelante: tabla depurada con el nivel de diagnóstico.

Entrada: los dos CSV de defunciones del DEIS (cifras oficiales 1990-2023 y provisorias 2024-2026), ya extraídos.
Salida:  .trabajo/defunciones.parquet  (fecha, cod_comuna, sexo, edad_g, nivel, causa, lugar, n)
         .trabajo/defunciones_controles.json  (leídas, conservadas y descartes por año; conteo por nivel y año)

Reglas:
- Se conserva la defunción con fecha válida y comuna de residencia que existe en el Censo 2024.
- sexo: H, M o I (indeterminado).  edad_g: 0 = 0 a 64, 1 = 65 a 79, 2 = 80 o más (edad en años; meses, días y horas = 0).
- nivel de diagnóstico (config/diagnosticos.json), sobre la causa básica (DIAG1) y la causa externa (DIAG2):
  1 directos, 2 fuertemente asociados, 3 asociación moderada, 0 el resto. Gana el nivel más directo.
  Solo desde 1997: antes el archivo viene en CIE-9 y queda con nivel -1 (sin clasificar).
- causa: grupo amplio de la causa básica, para el perfil de fallecidos.
- lugar: C casa, H hospital o clínica, O otro.

Uso: python e1_defunciones.py CARPETA_CON_LOS_CSV
"""
import json
import sys

import duckdb

from rutas import CENSO, CONFIG, TRABAJO

ORIGEN = sys.argv[1]
dx = json.loads((CONFIG / "diagnosticos.json").read_text())


def condicion(col, rangos):
    """SQL: la categoría de 3 caracteres de `col` cae en alguno de los rangos ['T67', 'N17-N19', ...]."""
    partes = []
    for r in rangos:
        a, b = (r.split("-") + [r])[:2]
        partes.append(f"substr({col},1,3) between '{a}' and '{b}'")
    return "(" + " or ".join(partes) + ")"


niv = {n["nivel"]: n["codigos"] for n in dx["niveles"]}
caso_nivel = " ".join(
    f"when {condicion('d1', niv[k])} or {condicion('d2', niv[k])} then {k}" for k in (1, 2, 3))
causas = dx["grupos_causa"]            # [[etiqueta, [rangos]], ...] en orden
caso_causa = " ".join(f"when {condicion('d1', r)} then '{e}'" for e, r in causas)

con = duckdb.connect()
con.execute("SET memory_limit='6GB'")
con.execute(f"create table comunas as select cod_comuna from '{CENSO}/censo_comuna.parquet'")
assert con.sql("select count(*) from comunas").fetchone()[0] == 346
con.execute(f"""create table c as
  select try_cast("AÑO" as int) ano, try_cast(FECHA_DEF as date) fecha, lpad(trim(COD_COMUNA),5,'0') cod,
         case SEXO_NOMBRE when 'Hombre' then 'H' when 'Mujer' then 'M' else 'I' end sexo,
         case when EDAD_TIPO='1' then coalesce(try_cast(EDAD_CANT as int),0) else 0 end edad,
         upper(trim(DIAG1)) d1, upper(trim(coalesce(DIAG2,''))) d2,
         case LUGAR_DEFUNCION when 'Casa habitación' then 'C' when 'Hospital o Clínica' then 'H' else 'O' end lugar,
         COD_COMUNA cruda
  from read_csv('{ORIGEN}/*.csv', delim=';', header=true, all_varchar=true, encoding='latin-1', union_by_name=true)""")
con.execute("""create table m as select *,
  case when fecha is null then 'sin_fecha'
       when cruda is null or trim(cruda) in ('', '99999') then 'sin_comuna'
       when cod not in (select cod_comuna from comunas) then 'comuna_fuera_del_censo'
       else 'conservada' end motivo from c""")
desc = con.sql("select cod, count(*) n from m where motivo='comuna_fuera_del_censo' group by 1 order by 2 desc limit 15").fetchall()
if desc:
    print("  códigos de comuna fuera del Censo:", desc)
con.execute(f"""copy (
  select fecha, cod cod_comuna, sexo, case when edad >= 80 then 2 when edad >= 65 then 1 else 0 end edad_g,
         case when not regexp_matches(d1, '^[A-Z][0-9]') then -1 {caso_nivel} else 0 end nivel,
         case when not regexp_matches(d1, '^[A-Z][0-9]') then 'CIE-9' {caso_causa} else 'Otras' end causa,
         lugar, count(*)::int n
  from m where motivo='conservada' group by all) to '{TRABAJO}/defunciones.parquet'""")

por_ano = con.sql("select ano, motivo, count(*) n from m group by all order by 1, 2").fetchall()
niveles = con.sql(f"select year(fecha) a, nivel, sum(n) from '{TRABAJO}/defunciones.parquet' group by all order by 1, 2").fetchall()
ctrl = {"leidas": con.sql("select count(*) from m").fetchone()[0],
        "conservadas": con.sql(f"select sum(n) from '{TRABAJO}/defunciones.parquet'").fetchone()[0],
        "hasta": str(con.sql(f"select max(fecha) from '{TRABAJO}/defunciones.parquet'").fetchone()[0]),
        "por_ano": {}, "nivel_por_ano": {}}
for a, mot, n in por_ano:
    ctrl["por_ano"].setdefault(str(a), {})[mot] = n
for a, k, n in niveles:
    ctrl["nivel_por_ano"].setdefault(str(a), {})[str(k)] = int(n)
assert ctrl["conservadas"] == sum(v.get("conservada", 0) for v in ctrl["por_ano"].values())
(TRABAJO / "defunciones_controles.json").write_text(json.dumps(ctrl, ensure_ascii=False, indent=1))
print(f"  leídas {ctrl['leidas']:,} | conservadas {ctrl['conservadas']:,} | hasta {ctrl['hasta']}")
print("  descartes:", con.sql("select motivo, count(*) from m where motivo<>'conservada' group by 1").fetchall())
print("  por nivel (1997+):", con.sql(f"select nivel, sum(n) from '{TRABAJO}/defunciones.parquet' group by 1 order by 1").fetchall())
print("  filas de la tabla:", con.sql(f"select count(*) from '{TRABAJO}/defunciones.parquet'").fetchone()[0])
