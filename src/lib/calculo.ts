/**
 * Cálculo de riesgo, puro: lo usa el servidor con el pronóstico guardado y el navegador con una temperatura simulada.
 * Para cada comuna y día: promedio de la máxima del día y de los 3 anteriores, llevado a la escala de la capital
 * regional si la comuna tiene clima propio; riesgo relativo de la curva de su región; muertes = B x (RR - 1).
 */
import { aEscalaRegion, mesCalido, nivelDe, promedioRezagos, riesgoDia, type Curva, type Rango } from "./riesgo";

export type SerieRiesgo = { t: (number | null)[]; x?: (number | null)[]; e: number[]; n: number[]; m: number[]; lo: number[]; hi: number[]; h7: Rango; propia?: boolean };
export type Riesgo = {
  emision: string; actualizado: string | null; hoy: string; vencido: boolean; fechas: string[];
  comunas: Record<string, SerieRiesgo>; regiones: Record<string, SerieRiesgo>; pais: SerieRiesgo; sinDato: string[];
};
/** Todo lo fijo que necesita el cálculo; cabe en unos 100 KB y se manda al navegador para simular. */
export type Insumos = {
  cortes: number[]; diasAlta: number;
  curvas: Record<string, { M: Curva; H: Curva | null; qx: number[] }>;
  base: Record<string, { m: number[]; h: number[] }>;
  clima: Record<string, number[]>;
  comunas: { cod: string; reg: string }[];
};

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * series: temperatura máxima por comuna para los días `atras` previos y los días de `fechas`.
 * Si una comuna no tiene serie propia o no tiene clima histórico propio, usa la de la capital de su región.
 */
export function calcularRiesgo(ins: Insumos, series: Map<string, (number | null)[]>, fechas: string[], atras: number, meta: Pick<Riesgo, "emision" | "actualizado" | "hoy" | "vencido">): Riesgo {
  const N = fechas.length;
  const vacia = (): SerieRiesgo & { b: number[] } => ({ t: Array(N).fill(null), e: Array(N).fill(0), n: Array(N).fill(0), m: Array(N).fill(0), lo: Array(N).fill(0), hi: Array(N).fill(0), h7: [0, 0, 0], b: Array(N).fill(0) });
  const out: Riesgo = { ...meta, fechas, comunas: {}, regiones: {}, pais: vacia(), sinDato: [] };
  const acum: Record<string, SerieRiesgo & { b: number[] }> = {};
  const pais = out.pais as SerieRiesgo & { b: number[] };
  for (const c of ins.comunas) {
    const cv = ins.curvas[c.reg];
    const propia = series.get(c.cod), capital = series.get(`${c.reg}101`), qc = ins.clima[c.cod];
    const usaPropia = !!(propia && qc);
    const serie = usaPropia ? propia! : capital;
    if (!cv || !serie) { out.sinDato.push(c.cod); continue; }
    const b = ins.base[c.cod] ?? { m: [0, 0, 0, 0, 0], h: [0, 0, 0, 0, 0] };
    const s: SerieRiesgo = { t: [], x: [], e: [], n: [], m: [], lo: [], hi: [], h7: [0, 0, 0], propia: usaPropia };
    const a = (acum[c.reg] ??= vacia());
    for (let d = 0; d < N; d++) {
      const i = atras + d;
      let x = promedioRezagos(serie, i);
      if (x != null && usaPropia) x = aEscalaRegion(x, qc!, cv.qx);
      const r = riesgoDia(x, cv.M), mes = mesCalido(fechas[d]), B = b.m[mes];
      s.t.push((propia ?? serie)[i]); s.x!.push(x == null ? null : Math.round(x * 10) / 10);
      s.e.push(r3(r.rr - 1)); s.n.push(nivelDe(r.rr - 1, ins.cortes));
      s.m.push(r3(B * (r.rr - 1))); s.lo.push(r3(B * (r.lo - 1))); s.hi.push(r3(B * (r.hi - 1)));
      a.m[d] += B * (r.rr - 1); a.lo[d] += B * (r.lo - 1); a.hi[d] += B * (r.hi - 1); a.b[d] += B;
      if (d < ins.diasAlta && cv.H) {
        const rh = riesgoDia(x, cv.H), H = b.h[mes];
        const h: Rango = [H * (rh.rr - 1), H * (rh.lo - 1), H * (rh.hi - 1)];
        for (const g of [s, a]) g.h7 = [g.h7[0] + h[0], g.h7[1] + h[1], g.h7[2] + h[2]];
      }
    }
    s.h7 = s.h7.map(r3) as Rango;
    out.comunas[c.cod] = s;
  }
  const cerrar = (g: SerieRiesgo & { b?: number[] }, t: (number | null)[] | undefined) => {
    for (let d = 0; d < N; d++) {
      g.e[d] = r3(g.b![d] ? g.m[d] / g.b![d] : 0); g.n[d] = nivelDe(g.e[d], ins.cortes);
      g.m[d] = r3(g.m[d]); g.lo[d] = r3(g.lo[d]); g.hi[d] = r3(g.hi[d]);
    }
    g.h7 = g.h7.map(r3) as Rango;
    if (t) g.t = t.slice(atras);
    delete g.b;
  };
  // Chile: las curvas de cada región son independientes, así que sus errores se combinan en cuadratura y no se suman.
  const cuad = (vs: Rango[]): Rango => {
    const m = vs.reduce((a, v) => a + v[0], 0);
    return [m, m - Math.sqrt(vs.reduce((a, v) => a + (v[0] - v[1]) ** 2, 0)), m + Math.sqrt(vs.reduce((a, v) => a + (v[2] - v[0]) ** 2, 0))];
  };
  const regs = Object.values(acum);
  for (let d = 0; d < N; d++) {
    [pais.m[d], pais.lo[d], pais.hi[d]] = cuad(regs.map((g) => [g.m[d], g.lo[d], g.hi[d]]));
    pais.b[d] = regs.reduce((a, g) => a + g.b[d], 0);
  }
  pais.h7 = cuad(regs.map((g) => g.h7));
  for (const r of Object.keys(acum).sort()) { cerrar(acum[r], series.get(`${r}101`)); out.regiones[r] = acum[r]; }
  cerrar(pais, undefined);
  return out;
}

/** Escenario simulado: la misma temperatura máxima en todas las comunas, todos los días (también los 3 anteriores). */
export function simularRiesgo(ins: Insumos, tmax: number, fechas: string[]): Riesgo {
  const atras = 3, serie = Array(atras + fechas.length).fill(tmax);
  const series = new Map(ins.comunas.map((c) => [c.cod, serie]));
  return calcularRiesgo(ins, series, fechas, atras, { emision: fechas[0], actualizado: null, hoy: fechas[0], vencido: false });
}
