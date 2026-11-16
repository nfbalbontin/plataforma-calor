/**
 * Cálculo de riesgo: la misma fórmula del modelo, con la temperatura pronosticada.
 *   Muertes potenciales = suma por día de B x (RR(T) - 1)
 * B son las muertes habituales del lugar en un día de esa época; RR sale de la curva de su región.
 * Funciones puras: las usan el servidor, el navegador y las pruebas.
 */

export type Curva = { x: number[]; rr: number[]; lo: number[]; hi: number[]; umbral: number };
export const NIVELES = ["Bajo", "Moderado", "Alto", "Muy alto"] as const;

/** Interpolación lineal sobre una grilla creciente; fuera de la grilla usa el valor del extremo. */
export function interp(xs: number[], ys: number[], x: number): number {
  const n = xs.length;
  if (n === 0) return NaN;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let a = 0, b = n - 1;
  while (b - a > 1) { const m = (a + b) >> 1; if (xs[m] <= x) a = m; else b = m; }
  return ys[a] + ((ys[b] - ys[a]) * (x - xs[a])) / (xs[b] - xs[a]);
}

/** Promedio de la temperatura máxima del día i y de los `rezago` días anteriores que existan. */
export function promedioRezagos(tmax: (number | null)[], i: number, rezago = 3): number | null {
  if (tmax[i] == null) return null;
  let s = 0, n = 0;
  for (let k = Math.max(0, i - rezago); k <= i; k++) if (tmax[k] != null) { s += tmax[k]!; n++; }
  return n ? s / n : null;
}

/**
 * Lleva la temperatura de una comuna a la escala de la capital regional por percentil local:
 * el mismo percentil en la historia de la comuna y en la de la capital. Sobre el máximo histórico suma los grados de exceso.
 */
export function aEscalaRegion(x: number, qComuna: number[], qRegion: number[]): number {
  const p = [...qComuna.keys()];
  const max = qComuna[qComuna.length - 1], min = qComuna[0];
  if (x >= max) return qRegion[qRegion.length - 1] + (x - max);
  if (x <= min) return qRegion[0] + (x - min);
  return interp(p, qRegion, interp(qComuna, p, x));
}

export type RiesgoDia = { rr: number; lo: number; hi: number };
/** Riesgo relativo de un día según la curva. Bajo el umbral de calor es 1. */
export function riesgoDia(x: number | null, c: Curva): RiesgoDia {
  if (x == null || x <= c.umbral) return { rr: 1, lo: 1, hi: 1 };
  return { rr: interp(c.x, c.rr, x), lo: interp(c.x, c.lo, x), hi: interp(c.x, c.hi, x) };
}

/** Nivel 0 a 3 (bajo, moderado, alto, muy alto) según el aumento esperado de muertes. */
export function nivelDe(exceso: number, cortes: number[]): number {
  let n = 0;
  for (const c of cortes) if (exceso >= c) n++;
  return n;
}

export type Rango = [est: number, lo: number, hi: number];
export const sumar = (a: Rango, b: Rango): Rango => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** Cifra con su rango, sin frases: «12 (7 – 17)». Con valores chicos usa más decimales. */
export function textoRango(r: Rango, dec?: number): string {
  const hi = Math.max(0, r[2]), d = dec ?? (hi < 1 ? 2 : hi < 10 ? 1 : 0);
  const f = (v: number) => Math.max(0, v).toLocaleString("es-CL", { minimumFractionDigits: d, maximumFractionDigits: d });
  return `${f(r[0])} (${f(r[1])} – ${f(r[2])})`;
}

/** Índice mensual 0 a 4 de noviembre a marzo; fuera de temporada usa el mes cálido más cercano. */
export function mesCalido(fecha: string): number {
  const m = Number(fecha.slice(5, 7));
  return m === 11 ? 0 : m === 12 ? 1 : m <= 3 ? m + 1 : m <= 7 ? 4 : 0;
}

/** Tendencia del verano según la anomalía mensual de la temperatura máxima. */
export function tendencia(anomalia: number, corte: number): "Más cálido" | "Normal" | "Menos cálido" {
  return anomalia >= corte ? "Más cálido" : anomalia <= -corte ? "Menos cálido" : "Normal";
}
