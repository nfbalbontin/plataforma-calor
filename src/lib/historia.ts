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

/** Qué incluye cada categoría del perfil de fallecidos (se abre al hacer clic). */
export const DEFINICIONES: Record<string, Record<string, string>> = {
  nivel: {
    "Directos": "Golpe de calor y agotamiento por calor (T67), exposición al calor natural excesivo (X30) y deshidratación (E86). Son las causas que el certificado atribuye al calor; casi nunca se anotan.",
    "Fuertemente asociados": "Trastornos de líquidos y electrolitos (E87), insuficiencia renal (N17 a N19), infección urinaria (N39), septicemia (A40, A41), cardiopatía isquémica (I20 a I25), accidente cerebrovascular (I60 a I69), cardiopatía hipertensiva (I10 a I15), diabetes (E10 a E14), EPOC (J40 a J47) e infección respiratoria baja (J12 a J18). Los estudios muestran que aumentan con el calor.",
    "Asociación moderada": "Trastornos mentales (F00 a F99), infecciones intestinales (A00 a A09) y causas externas: ahogamientos (W65 a W74), suicidios (X60 a X84) y agresiones (X85 a Y09).",
    "Otras causas": "Todas las demás causas de muerte. La insuficiencia cardíaca (I50) queda aquí a propósito: en olas de calor no aumenta.",
  },
  causa: {
    "Circulatorias": "Enfermedades del sistema circulatorio (I00 a I99): infarto, accidente cerebrovascular, insuficiencia cardíaca, hipertensión, entre otras.",
    "Tumores": "Cánceres y otros tumores (C00 a D48).",
    "Respiratorias": "Enfermedades del sistema respiratorio (J00 a J99): neumonía, EPOC, asma, entre otras.",
    "COVID-19": "COVID-19 como causa básica (U07), desde 2020.",
    "Endocrinas y metabólicas": "Diabetes, deshidratación, trastornos de líquidos y otras (E00 a E90).",
    "Digestivas": "Enfermedades del sistema digestivo (K00 a K93): cirrosis, entre otras.",
    "Genitourinarias": "Enfermedades del riñón y de las vías urinarias, entre otras (N00 a N99).",
    "Mentales y del sistema nervioso": "Demencias, alzhéimer, trastornos mentales y del sistema nervioso (F00 a G99).",
    "Infecciosas": "Enfermedades infecciosas y parasitarias (A00 a B99), incluida la septicemia.",
    "Causas externas": "Accidentes, caídas, ahogamientos, suicidios y agresiones (S00 a Y98).",
    "Otras": "Las demás causas, incluidas las mal definidas.",
  },
  lugar: {
    "Casa": "Murió en su casa.",
    "Hospital o clínica": "Murió en un establecimiento de salud. No dice en cuál.",
    "Otro": "Vía pública, lugar de trabajo, hogar de ancianos u otro lugar.",
  },
  edad: { "0 a 64": "Menores de 65 años.", "65 a 79": "Personas mayores de 65 a 79 años.", "80 o más": "Personas de 80 años o más, el grupo más afectado por el calor." },
};

/** Términos que usa la pantalla. */
export const GLOSARIO: [string, string][] = [
  ["Verano", "La temporada cálida: del 1 de noviembre al 31 de marzo. «Verano 2019-20» va de noviembre de 2019 a marzo de 2020."],
  ["Día de calor extremo", "Día cuya temperatura máxima supera el percentil 95 de los veranos de ese lugar: uno de los 5 % más calurosos."],
  ["Ola de calor", "Tres o más días seguidos con la máxima sobre el percentil 90 del lugar."],
  ["Muertes atribuibles al calor", "Las muertes que no habrían ocurrido sin el calor de esos días. Es una estimación estadística: no es un conteo de certificados."],
  ["Rango", "Intervalo de 95 %: la cifra real está, con alta probabilidad, entre esos dos valores."],
  ["Umbral", "Temperatura desde la cual las muertes empiezan a subir en esa región."],
];
