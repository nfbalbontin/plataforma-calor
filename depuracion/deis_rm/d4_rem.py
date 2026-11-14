"""Tabla anexa 2: REM serie P (P3 y P5), RM, últimos tres años. El mapeo de columnas se lee del diccionario de cada año.
Uso: d4_rem.py DESCARGAS TMP DEPURADO STAGE AÑO..."""
import duckdb, sys, os, subprocess, glob, re, json, openpyxl, pandas as pd
DL, TMP, OUT, ST = sys.argv[1:5]; YEARS = [int(a) for a in sys.argv[5:]]
CODES = "P3160800 P3130200 P3140400 P3120500 P3161050 P5180100 P5180200 P5300510 P5300100 P5300200 P5300520 P5300530".split()
ISCODE = re.compile(r"^P\d{7}$")
norm = lambda s: re.sub(r"\s+", " ", str(s)).strip() if s is not None else ""

def mapeo(xlsm):
    wb = openpyxl.load_workbook(xlsm, data_only=True); res = {}
    for sh in ("P3", "P5"):
        ws = wb[sh]; g = {}
        for row in ws.iter_rows():
            for c in row:
                if c.value is not None: g[(c.row, c.column)] = c.value
        for m in ws.merged_cells.ranges:
            v = ws.cell(m.min_row, m.min_col).value
            for r in range(m.min_row, m.max_row+1):
                for cc in range(m.min_col, m.max_col+1): g.setdefault((r, cc), v)
        isrow = lambda r: norm(g.get((r,2))).upper().startswith("SUBTOTAL") or ISCODE.match(norm(g.get((r,1)))) is not None \
                          or any(norm(g.get((r,c))).upper() == "COL01" for c in range(2, 8))
        for r in range(1, ws.max_row+1):
            code = norm(g.get((r,1)))
            if code not in CODES: continue
            r0 = r
            while r0 > 1 and isrow(r0-1): r0 -= 1
            hdr, h = [], r0-1
            while h > 0 and not isrow(h) and len(hdr) < 4: hdr.insert(0, h); h -= 1
            glosa = " - ".join(dict.fromkeys(norm(g.get((r,c))) for c in (2,3) if norm(g.get((r,c)))))
            tot, c65 = [], []
            for c in range(1, ws.max_column+1):
                v = norm(g.get((r,c))).upper()
                if not re.match(r"^COL\d\d$", v): continue
                lab = [norm(g.get((hh,c))) for hh in hdr]
                if any(x.upper().startswith("TOTAL") for x in lab) and "ambos" in lab[-1].lower(): tot.append(v)
                ages = [re.match(r"^(\d+) (a \d+|y m[aá]s)", x) for x in lab]; ages = [a for a in ages if a]
                if ages and int(ages[0].group(1)) >= 65 and lab[-1].lower() in ("hombres", "mujeres"):
                    c65.append((v, ages[0].group(0), lab[-1]))
            res[code] = dict(hoja=sh, fila=r, glosa=glosa, total=tot, c65=c65)
    return res

con = duckdb.connect(); stats, maps = [], []
for y in YEARS:
    d = f"{TMP}/rem{y}"; os.makedirs(d, exist_ok=True)
    subprocess.run(["unzip", "-o", "-q", f"{DL}/SERIE_REM_{y}.zip", f"Datos/SerieP{y}.csv", "Diccionarios/DICCIONARIO CODIGOS SP*", "-d", d], check=True)
    mp = mapeo(glob.glob(f"{d}/Diccionarios/DICCIONARIO CODIGOS SP*")[0])
    assert set(mp) == set(CODES), set(CODES) - set(mp)
    for code, m in mp.items():
        assert len(m["total"]) == 1, (y, code, m["total"])
        maps.append(dict(ano=y, codigo=code, hoja=m["hoja"], fila_diccionario=m["fila"], glosa=m["glosa"], col_total=m["total"][0],
                         cols_65_mas=" ".join(c for c, _, _ in m["c65"]), tramos_65_mas=" | ".join(f"{c}={a} {s}" for c, a, s in m["c65"])))
    con.execute(f"create or replace view p as select * from read_csv('{d}/Datos/SerieP{y}.csv', delim=';', header=true, all_varchar=true, encoding='latin-1')")
    con.execute("create or replace table mp (codigo varchar, glosa varchar, col_total varchar, cols varchar[])")
    con.executemany("insert into mp values (?,?,?,?)", [(c, m["glosa"], m["total"][0], [x for x, _, _ in m["c65"]]) for c, m in mp.items()])
    # unpivot de columnas para aplicar el mapeo por código
    colnames = [c for c in [r[0] for r in con.sql("describe p").fetchall()] if re.match(r"^Col\d\d$", c)]
    con.execute(f"""create or replace table l as select Ano, Mes, IdEstablecimiento, IdComuna, CodigoPrestacion, IdRegion, upper(col) col, try_cast(val as bigint) val, val raw
        from (unpivot (select * from p where trim(IdRegion)='13' and trim(CodigoPrestacion) in {tuple(CODES)}) on {', '.join(colnames)} into name col value val)""")
    con.execute(f"""create or replace table r as
        select try_cast(p.Ano as int) ano, try_cast(p.Mes as int) mes, trim(p.IdEstablecimiento) id_establecimiento, lpad(trim(p.IdComuna),5,'0') cod_comuna,
               trim(p.CodigoPrestacion) codigo, mp.glosa,
               (select val from l where l.Ano=p.Ano and l.Mes=p.Mes and l.IdEstablecimiento=p.IdEstablecimiento and l.CodigoPrestacion=p.CodigoPrestacion and l.col=mp.col_total limit 1)::BIGINT n_total,
               (select sum(val) from l where l.Ano=p.Ano and l.Mes=p.Mes and l.IdEstablecimiento=p.IdEstablecimiento and l.CodigoPrestacion=p.CodigoPrestacion and list_contains(mp.cols, l.col))::BIGINT n_65_mas
        from p join mp on mp.codigo=trim(p.CodigoPrestacion) where trim(p.IdRegion)='13'""")
    con.execute(f"COPY r TO '{ST}/rem_{y}.parquet'")
    s = con.sql(f"""select {y} ano, (select count(*) from p) filas_leidas, (select count(*) from p where trim(IdRegion)<>'13' or IdRegion is null) fuera_rm,
        (select count(*) from p where trim(IdRegion)='13' and trim(CodigoPrestacion) not in {tuple(CODES)}) rm_otro_codigo,
        count(*) conservadas, count(*) filter (where n_total is null) n_total_nulo, count(*) filter (where n_65_mas is null) n_65_nulo,
        count(*) filter (where n_65_mas > n_total) n65_mayor_total, count(*) - count(distinct (ano, mes, id_establecimiento, codigo)) llaves_duplicadas,
        count(*) filter (where ano<>{y}) ano_distinto, string_agg(distinct mes::varchar, ',' order by mes::varchar) meses,
        count(distinct id_establecimiento) establecimientos, count(distinct cod_comuna) comunas,
        count(*) filter (where not (try_cast(cod_comuna as int) between 13101 and 13605)) comuna_fuera_rm from r""").df()
    stats.append(s); print(s.to_dict("records"), flush=True)
    subprocess.run(["rm", "-rf", d])
pd.DataFrame(maps).to_csv(f"{OUT}/rem_mapeo_columnas.csv", index=False)
pd.concat(stats).to_csv(f"{ST}/rem_stats.csv", index=False)
lst = ",".join(f"'{ST}/rem_{y}.parquet'" for y in YEARS)
con.execute(f"COPY (select * from read_parquet([{lst}]) order by ano, mes, cod_comuna, id_establecimiento, codigo) TO '{OUT}/rem_dependencia.csv' (HEADER)")
print(con.sql(f"select ano, mes, codigo, count(*), sum(n_total), sum(n_65_mas) from read_parquet([{lst}]) group by all order by all").df().to_string())
