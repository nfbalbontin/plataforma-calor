/**
 * Motor de cálculo común de los paneles de análisis. Una sola fórmula para todos:
 *   muertes = población_tramo × tasa_base_diaria_tramo × (RR ^ max(0, T − umbral) − 1)
 * sumado sobre los días y los tramos. Toda cifra de muertes se entrega como rango (bajo, alto).
 * Funciones puras: sirven igual en el servidor y en el navegador. Parámetros: config/parametros_motor.json.
 */
export const TRAMOS = ["0 a 14", "15 a 64", "65 a 74", "75 o más"] as const;
export type Clima = { umbral: number; t_prom: number; mes_calido: number; n_anos: number; temporadas: string; dias_ano: number; excesos: number[]; normal_mes: Record<string, number>; hist_mes?: Record<string, [number, number][]> };
export type InsumoRegion = { pob: number[]; tasa: number[]; clima: Clima | null };
export type InsumoComuna = { reg: string; pob: number[]; clima: Clima | null; validacion: [number, number, number] | null };
export type Insumos = { tramos: string[]; anos_tasa: number[]; dias_tasa: number; umbrales: string; nota_clima: string; regiones: Record<string, InsumoRegion>; comunas: Record<string, InsumoComuna>; verde_aura: Record<string, unknown> | null };
export type Parametros = {
  version: string; fecha: string; formula: string; tramos: string[];
  rr: { bajo: number; alto: number; fuente: string; enlace: string; advertencia: string; unidad: string };
  coef_verde: { bajo: number; alto: number; unidad: string; fuente_bajo: string; fuente_alto: string; advertencia: string; enlace_bajo: string };
  valor_vida_estadistica: { clp: number; fuente: string; enlace: string; advertencia: string };
  efectividad: { por_defecto: number; bajo: number; alto: number; fuente: string; enlace: string; advertencia: string };
  umbral: { variable: string; percentil: number; periodo: string; fuente: string };
  tasa_base: { definicion: string; fuente: string };
  robustez: { fraccion_superior: number; clases: Record<Robustez, string>; regla: string };
};
export type Rango = [number, number];
export type Robustez = "robusta" | "depende" | "no";

/** Fracción adicional de muertes en un día con `exceso` grados sobre el umbral. */
export const factor = (rr: number, exceso: number) => (exceso > 0 ? Math.pow(rr, exceso) - 1 : 0);
/** Suma del factor sobre una lista de excesos diarios (uno por día sobre el umbral). */
export const sumaFactor = (rr: number, excesos: number[]) => excesos.reduce((a, e) => a + factor(rr, e), 0);
/** Muertes por tramo dado el factor acumulado de los días. */
export const muertesPorTramo = (pob: number[], tasa: number[], sf: number) => pob.map((p, i) => p * tasa[i] * sf);
export const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const ordenar = (a: number, b: number): Rango => (a <= b ? [a, b] : [b, a]);

/** Clasificación de robustez: la misma en toda la plataforma (sección 0.3). */
export function robustez(cumpleBajo: boolean, cumpleAlto: boolean): Robustez {
  return cumpleBajo && cumpleAlto ? "robusta" : cumpleBajo || cumpleAlto ? "depende" : "no";
}

/** Clima que usa una comuna: el propio o, si no tiene serie, el de la capital de su región. */
export function climaDe(ins: Insumos, cod: string): { clima: Clima | null; propio: boolean } {
  const c = ins.comunas[cod];
  if (!c) return { clima: null, propio: false };
  return c.clima ? { clima: c.clima, propio: true } : { clima: ins.regiones[c.reg]?.clima ?? null, propio: false };
}

/** Muertes atribuibles al calor en un año promedio del período histórico, como rango. */
export function muertesAnuales(pob: number[], tasa: number[], clima: Clima, p: Parametros): { rango: Rango; porTramo: [number[], number[]] } {
  const b = muertesPorTramo(pob, tasa, sumaFactor(p.rr.bajo, clima.excesos) / clima.n_anos);
  const a = muertesPorTramo(pob, tasa, sumaFactor(p.rr.alto, clima.excesos) / clima.n_anos);
  return { rango: [suma(b), suma(a)], porTramo: [b, a] };
}
export function muertesAnualesComuna(ins: Insumos, cod: string, p: Parametros) {
  const c = ins.comunas[cod], { clima } = climaDe(ins, cod);
  return c && clima ? muertesAnuales(c.pob, ins.regiones[c.reg].tasa, clima, p) : null;
}
export function muertesAnualesRegion(ins: Insumos, reg: string, p: Parametros) {
  const r = ins.regiones[reg];
  return r?.clima ? muertesAnuales(r.pob, r.tasa, r.clima, p) : null;
}

// ---------------- Panel 1: dónde actuar ----------------
export type FilaDonde = { cod: string; reg: string; pob65: number; dias: number | null; indicador: number | null; muertes: Rango | null; clase: Robustez | null; climaPropio: boolean; validacion: [number, number, number] | null };
/**
 * Indicador = población de 65+ × días promedio al año sobre el umbral (no usa RR).
 * Robustez: la comuna queda en el 20 % superior de muertes esperadas con RR bajo y con RR alto.
 */
export function rankingDonde(ins: Insumos, p: Parametros): FilaDonde[] {
  const filas: FilaDonde[] = Object.entries(ins.comunas).map(([cod, c]) => {
    const { clima, propio } = climaDe(ins, cod), m = muertesAnualesComuna(ins, cod, p), pob65 = c.pob[2] + c.pob[3];
    return { cod, reg: c.reg, pob65, dias: clima?.dias_ano ?? null, indicador: clima ? pob65 * clima.dias_ano : null, muertes: m?.rango ?? null, clase: null, climaPropio: propio, validacion: c.validacion };
  });
  const con = filas.filter((f) => f.muertes);
  const k = Math.max(1, Math.round(con.length * p.robustez.fraccion_superior));
  const top = (i: 0 | 1) => new Set([...con].sort((a, b) => b.muertes![i] - a.muertes![i] || a.cod.localeCompare(b.cod)).slice(0, k).map((f) => f.cod));
  const tb = top(0), ta = top(1);
  for (const f of con) f.clase = robustez(tb.has(f.cod), ta.has(f.cod));
  return filas.sort((a, b) => (b.indicador ?? -1) - (a.indicador ?? -1));
}

// ---------------- Panel 2: simulador de políticas ----------------
export type EntradaSim = { regiones: string[]; edad: number[] | null; dias: number | null; grados: number; verde: number };
export type ResultadoRegion = { reg: string; sinClima: boolean; dias: number; t: number; umbral: number; exceso: number; supera: boolean; sin: Rango; con: Rango; evitadas: Rango; sinTramo: [number[], number[]]; conTramo: [number[], number[]] };
export type ResultadoSim = { error: string | null; regiones: ResultadoRegion[]; sin: Rango; con: Rango; evitadas: Rango; clase: Robustez; avisos: string[] };

/**
 * Escenario hipotético: `dias` días al año con máxima = promedio del mes más cálido + `grados`,
 * y un cambio de `verde` puntos porcentuales de áreas verdes (ΔT = coef_verde × Δ puntos).
 * Escenario bajo = RR bajo y coeficiente bajo; alto = RR alto y coeficiente alto.
 */
export function simular(e: EntradaSim, ins: Insumos, p: Parametros): ResultadoSim {
  const vacio = (error: string): ResultadoSim => ({ error, regiones: [], sin: [0, 0], con: [0, 0], evitadas: [0, 0], clase: "no", avisos: [] });
  if (e.regiones.length === 0) return vacio("Elige al menos una región.");
  if (e.edad && (e.edad.some((x) => !Number.isFinite(x) || x < 0) || Math.abs(suma(e.edad) - 100) > 0.05)) return vacio(`Los porcentajes por edad deben sumar 100 (suman ${Math.round(suma(e.edad ?? []) * 10) / 10}).`);
  const esc: [number, number][] = [[p.rr.bajo, p.coef_verde.bajo], [p.rr.alto, p.coef_verde.alto]];
  const regs: ResultadoRegion[] = [];
  const avisos: string[] = [];
  for (const reg of e.regiones) {
    const r = ins.regiones[reg];
    if (!r) continue;
    if (!r.clima) { regs.push({ reg, sinClima: true, dias: 0, t: 0, umbral: 0, exceso: 0, supera: false, sin: [0, 0], con: [0, 0], evitadas: [0, 0], sinTramo: [[0, 0, 0, 0], [0, 0, 0, 0]], conTramo: [[0, 0, 0, 0], [0, 0, 0, 0]] }); continue; }
    const total = suma(r.pob);
    const pob = e.edad ? e.edad.map((x) => (total * x) / 100) : r.pob;
    const dias = Math.max(0, e.dias ?? r.clima.dias_ano);
    const t = r.clima.t_prom + e.grados, exceso = t - r.clima.umbral;
    const sinT = esc.map(([rr]) => muertesPorTramo(pob, r.tasa, dias * factor(rr, e.grados > 0 ? exceso : 0))) as [number[], number[]];
    const conT = esc.map(([rr, coef]) => muertesPorTramo(pob, r.tasa, dias * factor(rr, e.grados > 0 ? exceso + coef * e.verde : 0))) as [number[], number[]];
    const sin: Rango = [suma(sinT[0]), suma(sinT[1])], con: Rango = [suma(conT[0]), suma(conT[1])];
    regs.push({ reg, sinClima: false, dias, t, umbral: r.clima.umbral, exceso, supera: exceso > 0 && e.grados > 0, sin, con, evitadas: [sin[0] - con[0], sin[1] - con[1]], sinTramo: sinT, conTramo: conT });
  }
  const tot = (f: (r: ResultadoRegion) => Rango): Rango => [suma(regs.map((r) => f(r)[0])), suma(regs.map((r) => f(r)[1]))];
  const evitadas = tot((r) => r.evitadas);
  if (regs.some((r) => r.sinClima)) avisos.push("Hay regiones sin serie histórica de temperatura: no entran al cálculo.");
  if (regs.some((r) => !r.sinClima && !r.supera)) avisos.push("La temperatura simulada no supera el umbral de la región en al menos una región: ahí el resultado es 0.");
  return { error: null, regiones: regs, sin: tot((r) => r.sin), con: tot((r) => r.con), evitadas, clase: robustez(evitadas[0] > 1e-9, evitadas[1] > 1e-9), avisos };
}
/** Rango para mostrar: de menor a mayor, sin importar qué escenario lo produjo. */
export const paraMostrar = (r: Rango): Rango => ordenar(r[0], r[1]);

// ---------------- Panel 3: proyección mensual ----------------
export type MesProyectado = { dias: number; rango: Rango; media: Rango };
/** Excesos de un miembro del ensamble en un mes: `directos` son días pronosticados uno a uno; `historicos`, los días de ese mes en `nAnos` años pasados con la anomalía del miembro sumada. */
export type MiembroMes = { directos: number[]; historicos: number[] };
/** Días históricos de un mes desplazados por la anomalía pronosticada: devuelve los grados de exceso sobre el umbral. */
export function excesosConAnomalia(hist: [number, number][], desdeDia: number, anomalia: number, umbral: number): number[] {
  const e: number[] = [];
  for (const [dia, t] of hist) if (dia >= desdeDia && t + anomalia > umbral) e.push(t + anomalia - umbral);
  return e;
}
/**
 * Muertes esperadas de un mes. Rango = percentil 10 de los miembros con RR bajo a percentil 90 con RR alto.
 * `media` (promedio del ensamble con cada RR) es lo que se usa para clasificar la robustez.
 */
export function proyectarMes(pob: number[], tasa: number[], miembros: MiembroMes[], nAnos: number, p: Parametros): MesProyectado {
  if (miembros.length === 0) return { dias: 0, rango: [0, 0], media: [0, 0] };
  const base = suma(pob.map((x, i) => x * tasa[i]));
  const por = (rr: number) => miembros.map((m) => base * (sumaFactor(rr, m.directos) + sumaFactor(rr, m.historicos) / nAnos)).sort((a, b) => a - b);
  const pct = (v: number[], q: number) => { const pos = q * (v.length - 1), lo = Math.floor(pos); return v[lo] + (v[Math.min(lo + 1, v.length - 1)] - v[lo]) * (pos - lo); };
  const b = por(p.rr.bajo), a = por(p.rr.alto);
  return { dias: suma(miembros.map((m) => m.directos.length + m.historicos.length / nAnos)) / miembros.length, rango: [pct(b, 0.1), pct(a, 0.9)], media: [suma(b) / b.length, suma(a) / a.length] };
}

// ---------------- Panel 4: cuánto invertir ----------------
export type ResultadoInversion = { necesarias: number; evitadas: Rango; clase: Robustez };
/** Muertes que la medida debe evitar = costo / valor de una vida estadística; se compara con lo evitado en cada escenario. */
export function inversion(costo: number, vve: number, evitadas: Rango): ResultadoInversion {
  const necesarias = costo / vve;
  return { necesarias, evitadas, clase: robustez(evitadas[0] >= necesarias, evitadas[1] >= necesarias) };
}

export const fmtRango = (r: Rango, dec = 0) => {
  const [a, b] = paraMostrar(r);
  const f = (n: number) => n.toLocaleString("es-CL", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return `${f(a)} a ${f(b)}`;
};
