"""Tabla anexa 1: establecimientos vigentes de la RM (fuente establecimientos_<fecha>.csv, UTF-8, ';')."""
import duckdb, sys, json
src, out = sys.argv[1], sys.argv[2]
con = duckdb.connect()
con.execute(f"create view e as select * from read_csv('{src}', delim=';', header=true, all_varchar=true)")
filt = "RegionCodigo='13' and EstadoFuncionamiento like 'Vigente%'"
con.execute(f"""COPY (select EstablecimientoCodigo, EstablecimientoCodigoAntiguo, EstablecimientoGlosa, TipoEstablecimientoGlosa,
    ComunaCodigo, try_cast(Latitud as double) Latitud, try_cast(Longitud as double) Longitud, TieneServicioUrgencia, TipoUrgencia, TipoSistemaSaludGlosa
    from e where {filt} order by ComunaCodigo, EstablecimientoCodigo) TO '{out}/establecimiento_rm.csv' (HEADER, DELIMITER ',')""")
r = con.sql(f"""select count(*) leidas, count(*) filter (where RegionCodigo<>'13' or RegionCodigo is null) fuera_rm,
    count(*) filter (where RegionCodigo='13' and not (EstadoFuncionamiento like 'Vigente%')) rm_no_vigente,
    count(*) filter (where {filt}) conservadas,
    count(*) filter (where {filt} and try_cast(Latitud as double) is null) sin_coord,
    count(*) filter (where {filt} and EstablecimientoCodigoAntiguo is null) sin_codigo_antiguo
    from e""").df().iloc[0].to_dict()
json.dump({k:int(v) for k,v in r.items()}, open(f"{out}/../src/depuracion/_est_stats.json","w"))
print(r)
