/** Módulo Historia: tipos de los archivos por lugar y cálculos que comparten las pantallas y las pruebas. */

export type Tipo = "pais" | "region" | "comuna" | "hospital";
export type Paso = { tipo: Tipo; cod: string; nombre: string };
export type Hijo = Paso & { archivo: string; referencia?: boolean };
export type Perfil = Record<string, { cat: string[]; calor: number[][]; normal: number[][] }>;
export type Episodio = { t: number; ini: string; fin: string; dias: number; tmax: number; reg: string; obs: number; an: number; lo: number; hi: number };
export type Lugar = {
  tipo: Tipo; cod: string; nombre: string; ruta: Paso[]; temporadas: number[];
  clima: { calor: number[]; tmax: (number | null)[]; dias: number[]; p95: number | null; p90: number | null; punto: string | null; regiones: number };
  pob65: (number | null)[]; pobT: (number | null)[]; series: Record<string, (number | null)[][]>; perfil: Perfil | null; episodios: Episodio[];
  curva: string; hijos: Hijo[]; bbox: [number, number, number, number] | null;
  hospital?: { cod: string; nombre: string; dist_km: number; regla: string }; servicio?: string; complejidad?: string | null; con_urgencias?: boolean;
};
export type CurvasRegion = { x: number[]; unidad: string; p95: number; cuantiles?: number[]; curvas: Record<string, { umbral: number | null; umbral_p: number; rr: number[]; lo: number[]; hi: number[]; fuente: string }> };

export const INDICADORES: [clave: string, nombre: string, sustantivo: string][] = [
  ["M", "Muertes totales", "muertes"],
  ["N1", "Muertes por diagnósticos directos", "muertes"],
  ["N2", "Muertes por diagnósticos fuertemente asociados", "muertes"],
  ["N3", "Muertes por diagnósticos de asociación moderada", "muertes"],
  ["H", "Hospitalizaciones desde urgencia", "hospitalizaciones"],
  ["U", "Atenciones de urgencia", "atenciones"],
];
export const EDADES: Record<string, string> = { T: "Todas las edades", "0": "0 a 64 años", "1": "65 a 79 años", "2": "80 años o más", "65": "65 años o más" };
export const SEXOS: Record<string, string> = { A: "Ambos sexos", H: "Hombres", M: "Mujeres" };
export const esMuerte = (ind: string) => ind === "M" || ind.startsWith("N");
export const edadesDe = (ind: string) => (esMuerte(ind) ? ["T", "0", "1", "2"] : ["T", "65"]);

/** Clave de la serie dentro del archivo del lugar. Urgencias y hospitalizaciones no traen sexo. */
export function claveSerie(ind: string, edad: string, sexo: string): string {
  return esMuerte(ind) ? `${ind}_${edad === "65" ? "T" : edad}_${sexo}` : `${ind}_${edad === "65" ? "65" : "T"}_A`;
}
/** Curva del modelo que corresponde a un indicador y un grupo de edad. */
export function claveCurva(ind: string, edad: string): string {
  if (ind === "M") return `M_${edad === "65" ? "T" : edad}`;
  if (ind.startsWith("N")) return ind;
  return `${ind}_${edad === "65" ? "65" : "T"}`;
}
export const temporadaTexto = (t: number) => `${t - 1}-${String(t).slice(2)}`;
export const rutaDe = (p: { tipo: Tipo; cod: string }) => (p.tipo === "pais" ? "/historia" : `/historia/${p.tipo}/${p.cod}`);
export function archivoDe(tipo: string | undefined, cod: string | undefined): string | null {
  if (!tipo) return "pais";
  if (tipo === "region" && /^\d{2}$/.test(cod ?? "")) return `r_${cod}`;
  if (tipo === "comuna" && /^\d{5}$/.test(cod ?? "")) return `c_${cod}`;
  if (tipo === "hospital" && /^\d{4,7}$/.test(cod ?? "")) return `h_${cod}`;
  return null;
}

export const MINIMO_EVENTOS = 50;
/** Base de las tasas: por cada 1.000 habitantes (población total del INE). */
export const POR = 1000;
export type Resumen = { obs: number; an: number; lo: number; hi: number; temporadas: number; suficiente: boolean; tasa: number | null; tasaLo: number | null; tasaHi: number | null };

/** Suma de una serie entre dos temporadas (índices incluidos). El rango suma los extremos de cada temporada. */
export function resumen(l: Lugar, clave: string, i0: number, i1: number): Resumen | null {
  const s = l.series[clave];
  if (!s) return null;
  let obs = 0, an = 0, lo = 0, hi = 0, n = 0, ta = 0, tl = 0, th = 0, nP = 0;
  for (let i = i0; i <= i1; i++) {
    if (s[0][i] == null) continue;
    obs += s[0][i]!; an += s[1][i]!; lo += s[2][i]!; hi += s[3][i]!; n++;
    const p = l.pobT?.[i];
    if (p) { ta += (s[1][i]! / p) * POR; tl += (s[2][i]! / p) * POR; th += (s[3][i]! / p) * POR; nP++; }
  }
  if (!n) return null;
  // Tasa del período: suma de las tasas de cada verano, por 1.000 habitantes (misma base que el número total)
  return { obs, an, lo, hi, temporadas: n, suficiente: obs >= MINIMO_EVENTOS, tasa: nP ? ta : null, tasaLo: nP ? tl : null, tasaHi: nP ? th : null };
}

/** Pendiente por década de una serie anual (mínimos cuadrados). Null con menos de 8 años. */
export function tendenciaDecada(anos: number[], valores: (number | null)[]): number | null {
  const p = anos.map((a, i) => [a, valores[i]] as const).filter((x): x is readonly [number, number] => x[1] != null);
  if (p.length < 8) return null;
  const mx = p.reduce((s, x) => s + x[0], 0) / p.length, my = p.reduce((s, x) => s + x[1], 0) / p.length;
  const sxx = p.reduce((s, x) => s + (x[0] - mx) ** 2, 0);
  return sxx ? (p.reduce((s, x) => s + (x[0] - mx) * (x[1] - my), 0) / sxx) * 10 : null;
}

export type Grupo = { etiqueta: string; i0: number; i1: number };
/** Agrupa temporadas cuando hay pocos casos: de a una, de a cinco, o ninguna (datos insuficientes). */
export function grupos(l: Lugar, clave: string, i0: number, i1: number): Grupo[] | null {
  const s = l.series[clave];
  if (!s) return null;
  const idx: number[] = [];
  for (let i = i0; i <= i1; i++) if (s[0][i] != null) idx.push(i);
  if (!idx.length) return null;
  const media = idx.reduce((a, i) => a + s[0][i]!, 0) / idx.length;
  const paso = media >= 30 ? 1 : media * 5 >= 30 ? 5 : 0;
  if (!paso) return null;
  const out: Grupo[] = [];
  for (let k = 0; k < idx.length; k += paso) {
    const a = idx[k], b = idx[Math.min(k + paso, idx.length) - 1];
    out.push({ etiqueta: a === b ? temporadaTexto(l.temporadas[a]) : `${l.temporadas[a] - 1}-${String(l.temporadas[b]).slice(2)}`, i0: a, i1: b });
  }
  return out;
}

export const fmt = (v: number | null | undefined, dec = 0) => (v == null || Number.isNaN(v) ? "sin dato" : v.toLocaleString("es-CL", { minimumFractionDigits: dec, maximumFractionDigits: dec }));
/** Rango como texto. Si el extremo inferior es negativo, el efecto no se distingue de cero. */
export function rangoTexto(lo: number, hi: number, dec = 0): string {
  return `entre ${fmt(Math.max(0, lo), dec)} y ${fmt(Math.max(0, hi), dec)}`;
}
