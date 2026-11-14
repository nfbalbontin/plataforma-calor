/**
 * Cálculos de riesgo diario (RF-06, RF-07, RF-08, RF-29). Funciones puras, con pruebas en tests/.
 * Todo esto es elaboración propia a partir de Open-Meteo y del DEIS.
 */

export type Umbral = {
  p50: number; p90: number; p95: number; p99: number;
  tmax_p90: number; tmin_p90: number;
};
export type Nivel = 0 | 1 | 2 | 3;
export type Confianza = "alta" | "media" | "baja" | "muy baja";

export const TEXTO_NIVEL: Record<Nivel, string> = {
  0: "Sin calor inusual",
  1: "Calor inusual",
  2: "Calor muy inusual",
  3: "Calor extremo",
};
export const CORTE_NIVEL: Record<Nivel, string> = {
  0: "Bajo el p90", 1: "Desde el p90", 2: "Desde el p95", 3: "Desde el p99",
};

/** Nivel 0 a 3 según el percentil local de la temperatura media diaria (S3). */
export function nivelEstimado(tmean: number | null | undefined, u: Umbral | null | undefined): Nivel | null {
  if (tmean == null || !u || Number.isNaN(tmean)) return null;
  if (tmean >= u.p99) return 3;
  if (tmean >= u.p95) return 2;
  if (tmean >= u.p90) return 1;
  return 0;
}

/** El nivel es incierto si la temperatura queda a menos de 1 °C de un corte (RF-08). */
export function esIncierto(tmean: number | null | undefined, u: Umbral | null | undefined): boolean {
  if (tmean == null || !u) return false;
  return [u.p90, u.p95, u.p99].some((c) => Math.abs(tmean - c) < 1);
}

/** Confianza del pronóstico por día de anticipación: 0 a 2 alta, 3 y 4 media, 5 a 7 baja, 8 en adelante muy baja (RF-08, extendido). */
export function confianza(diasAdelante: number): Confianza {
  if (diasAdelante <= 2) return "alta";
  if (diasAdelante <= 4) return "media";
  if (diasAdelante <= 7) return "baja";
  return "muy baja";
}

/**
 * Calor acumulado (S4): grados sobre el percentil 90 local en los últimos 3 días,
 * de día (con la máxima) y de noche (con la mínima). `dias` va del más antiguo al más reciente.
 */
export function calorAcumulado(
  dias: { tmax: number | null; tmin: number | null }[], u: Umbral | null | undefined,
): { dia: number; noche: number } | null {
  if (!u) return null;
  const ult = dias.slice(-3);
  if (ult.length === 0) return null;
  let dia = 0, noche = 0;
  for (const d of ult) {
    if (d.tmax != null) dia += Math.max(0, d.tmax - u.tmax_p90);
    if (d.tmin != null) noche += Math.max(0, d.tmin - u.tmin_p90);
  }
  return { dia: Math.round(dia * 10) / 10, noche: Math.round(noche * 10) / 10 };
}

/**
 * Calor moderado sostenido (S4): días seguidos, hasta el último de la serie, con la
 * temperatura media sobre la mediana del período cálido. Un día sin dato corta la cuenta.
 */
export function diasCalorModerado(tmeans: (number | null)[], u: Umbral | null | undefined): number | null {
  if (!u) return null;
  let n = 0;
  for (let i = tmeans.length - 1; i >= 0; i--) {
    const t = tmeans[i];
    if (t == null || t <= u.p50) break;
    n++;
  }
  return n;
}

/** Cortes del Código Rojo de la RM sobre la temperatura máxima (S3): 0 si no alcanza el primero. */
export function corteCodigoRojo(tmax: number | null | undefined, cortes: number[]): number {
  if (tmax == null) return 0;
  let n = 0;
  for (const c of cortes) if (tmax >= c) n++;
  return n;
}

/** Mediana; ignora nulos. Devuelve null si no hay valores. */
export function mediana(xs: (number | null | undefined)[]): number | null {
  const v = xs.filter((x): x is number => x != null && !Number.isNaN(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export type Senal = { estado: "sin dato" | "habitual" | "sobre lo habitual" | "muy sobre lo habitual" | "bajo lo habitual"; razon: number | null };

/**
 * Señal de urgencias (RF-29): valor del día contra la mediana del mismo día de la semana
 * en las 8 semanas previas. Sin informe de ningún establecimiento es "sin dato", no cero.
 */
export function senalUrgencias(valor: number | null | undefined, habitual: number | null | undefined): Senal {
  if (valor == null || habitual == null || habitual <= 0) return { estado: "sin dato", razon: null };
  const r = valor / habitual;
  const estado = r >= 1.3 ? "muy sobre lo habitual" : r >= 1.15 ? "sobre lo habitual" : r <= 0.85 ? "bajo lo habitual" : "habitual";
  return { estado, razon: Math.round(r * 100) / 100 };
}

/** Percentil con interpolación lineal (mismo método que numpy por defecto). */
export function percentil(valores: number[], p: number): number {
  const v = [...valores].sort((a, b) => a - b);
  const pos = (p / 100) * (v.length - 1);
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}
