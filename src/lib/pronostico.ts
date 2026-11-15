/**
 * Temperatura viva: una tarea diaria consulta el pronóstico de Open-Meteo para todas las comunas y lo guarda.
 * Las visitas leen lo guardado y aplican la fórmula del modelo; nunca consultan la API.
 * Si la API falla se conserva el último pronóstico, con su fecha.
 */
import { baseRiesgo, climaComunas, comunas, configRiesgo, curvaDe, modelo, regiones } from "./datos";
import { ahoraIso, q, seguro } from "./db";
import { aEscalaRegion, mesCalido, nivelDe, promedioRezagos, riesgoDia, type Rango } from "./riesgo";
import { hoyChile, sumarDias } from "./tiempo";

const API = "https://api.open-meteo.com/v1/forecast";
const LOTE = 50;
export const DIAS = 16;      // Open-Meteo pronostica hoy y 15 días más
const ATRAS = 5;             // días observados que se guardan para los rezagos

type Respuesta = { daily: { time: string[]; temperature_2m_max: (number | null)[]; temperature_2m_min: (number | null)[] } };

async function pedir(puntos: [number, number][]): Promise<Respuesta[]> {
  const url = `${API}?latitude=${puntos.map((p) => p[1]).join(",")}&longitude=${puntos.map((p) => p[0]).join(",")}` +
    `&daily=temperature_2m_max,temperature_2m_min&timezone=auto&past_days=${ATRAS}&forecast_days=${DIAS}`;
  let ultimo: unknown;
  for (let intento = 0; intento < 3; intento++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(45000), cache: "no-store" });
      const j = await r.json();
      if (!r.ok || j?.error) throw new Error(j?.reason ?? `HTTP ${r.status}`);
      return Array.isArray(j) ? j : [j];
    } catch (e) {
      ultimo = e;
      await new Promise((ok) => setTimeout(ok, 2000 * (intento + 1) ** 2));
    }
  }
  throw ultimo instanceof Error ? ultimo : new Error("Open-Meteo no respondió");
}

async function insertar(tabla: string, columnas: string[], filas: unknown[][], conflicto: string) {
  const porLote = Math.floor(5000 / columnas.length);
  for (let i = 0; i < filas.length; i += porLote) {
    const lote = filas.slice(i, i + porLote);
    const valores = lote.map((_, f) => `(${columnas.map((_, c) => `$${f * columnas.length + c + 1}`).join(",")})`).join(",");
    await q(`insert into ${tabla} (${columnas.join(",")}) values ${valores} ${conflicto}`, lote.flat());
  }
}

export type ResumenTarea = { hoy: string; comunas_ok: number; comunas_falla: number; duracion_s: number; error?: string };

export async function tareaDiaria(): Promise<ResumenTarea> {
  const t0 = Date.now(), inicio = ahoraIso(), hoy = hoyChile();
  const lista = comunas().filter((c) => c.punto_clima);
  const res: ResumenTarea = { hoy, comunas_ok: 0, comunas_falla: 0, duracion_s: 0 };
  const dias: unknown[][] = [], pron: unknown[][] = [];
  let ultimoError = "";
  for (let i = 0; i < lista.length; i += LOTE) {
    const lote = lista.slice(i, i + LOTE);
    let datos: Respuesta[];
    try { datos = await pedir(lote.map((c) => c.punto_clima!)); } catch (e) { res.comunas_falla += lote.length; ultimoError = (e as Error).message; continue; }
    lote.forEach((c, k) => {
      const d = datos[k]?.daily;
      if (!d) { res.comunas_falla++; return; }
      d.time.forEach((f, j) => {
        if (f < hoy) dias.push([c.cod, f, d.temperature_2m_max[j], d.temperature_2m_min[j], "open-meteo", inicio]);
        else if (f < sumarDias(hoy, DIAS)) pron.push([c.cod, hoy, f, d.temperature_2m_max[j], d.temperature_2m_min[j]]);
      });
      res.comunas_ok++;
    });
    await new Promise((ok) => setTimeout(ok, 250));
  }
  await insertar("comuna_dia", ["cod_comuna", "fecha", "tmax", "tmin", "fuente", "actualizado"], dias,
    "on conflict (cod_comuna, fecha) do update set tmax=excluded.tmax, tmin=excluded.tmin, fuente=excluded.fuente, actualizado=excluded.actualizado");
  await insertar("pronostico", ["cod_comuna", "fecha_emision", "fecha_objetivo", "tmax", "tmin"], pron,
    "on conflict (cod_comuna, fecha_emision, fecha_objetivo) do update set tmax=excluded.tmax, tmin=excluded.tmin");
  await q("delete from pronostico where fecha_emision < $1", [sumarDias(hoy, -30)]);
  await q("delete from comuna_dia where fecha < $1", [sumarDias(hoy, -60)]);
  const ok = res.comunas_ok > 0;
  if (ok) {
    await q(`insert into fuente_estado (fuente, ultima_carga, ultimo_dato, resultado, detalle) values ('open-meteo', $1, $2, $3, $4)
             on conflict (fuente) do update set ultima_carga=excluded.ultima_carga, ultimo_dato=excluded.ultimo_dato, resultado=excluded.resultado, detalle=excluded.detalle`,
      [inicio, hoy, res.comunas_falla === 0 ? "correcta" : "parcial", `${res.comunas_ok} comunas; ${res.comunas_falla} sin respuesta${ultimoError ? ` (${ultimoError})` : ""}`]);
  } else {
    await q(`insert into fuente_estado (fuente, resultado, detalle) values ('open-meteo', 'falla', $1)
             on conflict (fuente) do update set resultado='falla', detalle=excluded.detalle`, [`Intento del ${inicio}: ${ultimoError}. Se conserva el último pronóstico.`]);
    res.error = ultimoError;
  }
  res.duracion_s = Math.round((Date.now() - t0) / 100) / 10;
  await q("insert into ejecucion (tarea, inicio, fin, ok, detalle) values ('diaria', $1, $2, $3, $4)", [inicio, ahoraIso(), ok, JSON.stringify(res)]);
  return res;
}

/** Serie por día de un lugar: temperatura, aumento de riesgo, nivel y muertes potenciales con su rango. */
export type SerieRiesgo = { t: (number | null)[]; x?: (number | null)[]; e: number[]; n: number[]; m: number[]; lo: number[]; hi: number[]; h7: Rango; propia?: boolean };
export type Riesgo = {
  emision: string; actualizado: string | null; hoy: string; vencido: boolean; fechas: string[];
  comunas: Record<string, SerieRiesgo>; regiones: Record<string, SerieRiesgo>; pais: SerieRiesgo; sinDato: string[];
};

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Riesgo de los próximos 16 días con el último pronóstico guardado. Devuelve null si nunca se ha cargado uno. */
export async function riesgoActual(): Promise<Riesgo | null> {
  return seguro(async () => {
    const [ult] = await q<{ f: string | null }>("select max(fecha_emision) f from pronostico");
    const emision = ult?.f;
    const mod = modelo();
    if (!emision || !mod) return null;
    const [estado] = await q<{ ultima_carga: string | null }>("select ultima_carga from fuente_estado where fuente='open-meteo'");
    const fechas = Array.from({ length: DIAS }, (_, i) => sumarDias(emision, i));
    const todas = [...Array.from({ length: ATRAS }, (_, i) => sumarDias(emision, i - ATRAS)), ...fechas];
    const pos = new Map(todas.map((f, i) => [f, i]));
    const series = new Map<string, (number | null)[]>();
    const poner = (cod: string, f: string, t: number | null) => {
      const i = pos.get(f);
      if (i == null) return;
      if (!series.has(cod)) series.set(cod, Array(todas.length).fill(null));
      series.get(cod)![i] = t;
    };
    for (const r of await q<{ cod_comuna: string; fecha: string; tmax: number | null }>("select cod_comuna, fecha, tmax from comuna_dia where fecha >= $1 and fecha < $2", [todas[0], emision])) poner(r.cod_comuna, r.fecha, r.tmax);
    for (const r of await q<{ cod_comuna: string; fecha_objetivo: string; tmax: number | null }>("select cod_comuna, fecha_objetivo, tmax from pronostico where fecha_emision = $1", [emision])) poner(r.cod_comuna, r.fecha_objetivo, r.tmax);

    const cfg = configRiesgo(), base = baseRiesgo().comunas, clima = climaComunas().comunas;
    const vacia = (): SerieRiesgo & { b: number[] } => ({ t: Array(DIAS).fill(null), e: Array(DIAS).fill(0), n: Array(DIAS).fill(0), m: Array(DIAS).fill(0), lo: Array(DIAS).fill(0), hi: Array(DIAS).fill(0), h7: [0, 0, 0], b: Array(DIAS).fill(0) });
    const out: Riesgo = { emision, actualizado: estado?.ultima_carga ?? null, hoy: hoyChile(), vencido: emision < hoyChile(), fechas, comunas: {}, regiones: {}, pais: vacia(), sinDato: [] };
    const acum: Record<string, SerieRiesgo & { b: number[] }> = {};
    const pais = out.pais as SerieRiesgo & { b: number[] };
    for (const c of comunas()) {
      const reg = c.cod_region, mr = mod.regiones[reg], curva = curvaDe(reg, "M_T"), curvaH = curvaDe(reg, "H_T");
      const propia = series.get(c.cod), capital = series.get(`${reg}101`), qc = clima[c.cod]?.q;
      const usaPropia = !!(propia && qc);
      const serie = usaPropia ? propia! : capital;
      if (!mr || !curva || !serie) { out.sinDato.push(c.cod); continue; }
      const b = base[c.cod] ?? { m: [0, 0, 0, 0, 0], m65: [0, 0, 0, 0, 0], h: [0, 0, 0, 0, 0] };
      const s: SerieRiesgo = { t: [], x: [], e: [], n: [], m: [], lo: [], hi: [], h7: [0, 0, 0], propia: usaPropia };
      const a = (acum[reg] ??= vacia());
      for (let d = 0; d < DIAS; d++) {
        const i = ATRAS + d;
        let x = promedioRezagos(serie, i);
        if (x != null && usaPropia) x = aEscalaRegion(x, qc!, mr.cuantiles_x);
        const r = riesgoDia(x, curva), mes = mesCalido(fechas[d]), B = b.m[mes];
        s.t.push((propia ?? serie)[i]); s.x!.push(x == null ? null : Math.round(x * 10) / 10);
        s.e.push(r3(r.rr - 1)); s.n.push(nivelDe(r.rr - 1, cfg.cortes_exceso));
        s.m.push(r3(B * (r.rr - 1))); s.lo.push(r3(B * (r.lo - 1))); s.hi.push(r3(B * (r.hi - 1)));
        a.m[d] += B * (r.rr - 1); a.lo[d] += B * (r.lo - 1); a.hi[d] += B * (r.hi - 1); a.b[d] += B;
        if (d < cfg.dias_confianza_alta && curvaH) {
          const rh = riesgoDia(x, curvaH), H = b.h[mes];
          const h: Rango = [H * (rh.rr - 1), H * (rh.lo - 1), H * (rh.hi - 1)];
          for (const g of [s, a]) g.h7 = [g.h7[0] + h[0], g.h7[1] + h[1], g.h7[2] + h[2]];
        }
      }
      out.comunas[c.cod] = s;
    }
    const cerrar = (g: SerieRiesgo & { b?: number[] }, t: (number | null)[] | undefined) => {
      for (let d = 0; d < DIAS; d++) {
        g.e[d] = r3(g.b![d] ? g.m[d] / g.b![d] : 0); g.n[d] = nivelDe(g.e[d], cfg.cortes_exceso);
        g.m[d] = r3(g.m[d]); g.lo[d] = r3(g.lo[d]); g.hi[d] = r3(g.hi[d]);
      }
      g.h7 = g.h7.map(r3) as Rango;
      if (t) g.t = t.slice(ATRAS);
      delete g.b;
    };
    // Chile: las curvas de cada región son independientes, así que sus errores se combinan en cuadratura y no se suman.
    const cuad = (vs: Rango[]): Rango => {
      const m = vs.reduce((a, v) => a + v[0], 0);
      return [m, m - Math.sqrt(vs.reduce((a, v) => a + (v[0] - v[1]) ** 2, 0)), m + Math.sqrt(vs.reduce((a, v) => a + (v[2] - v[0]) ** 2, 0))];
    };
    const regs = Object.values(acum);
    for (let d = 0; d < DIAS; d++) {
      [pais.m[d], pais.lo[d], pais.hi[d]] = cuad(regs.map((g) => [g.m[d], g.lo[d], g.hi[d]]));
      pais.b[d] = regs.reduce((a, g) => a + g.b[d], 0);
    }
    pais.h7 = cuad(regs.map((g) => g.h7));
    for (const r of regiones()) if (acum[r.cod]) { cerrar(acum[r.cod], series.get(`${r.cod}101`)); out.regiones[r.cod] = acum[r.cod]; }
    for (const s of Object.values(out.comunas)) s.h7 = s.h7.map(r3) as Rango;
    cerrar(pais, undefined);
    return out;
  }, null);
}
