/** Cálculos de los paneles de análisis en el servidor. Todo pasa por el motor común (src/lib/motor.ts). */
import { comunas, insumosMotor, parametrosMotor, proyeccionMensual, regiones } from "./datos";
import { excesosConAnomalia, muertesAnualesComuna, muertesAnualesRegion, proyectarMes, rankingDonde, robustez, type MiembroMes, type Rango, type Robustez } from "./motor";

export function baseAnalisis() {
  const ins = insumosMotor(), p = parametrosMotor();
  return ins && p ? { ins, p } : null;
}

/** Panel 1: una fila por comuna con indicador, días, muertes como rango, clase de robustez y validación. */
export function filasDonde() {
  const b = baseAnalisis();
  if (!b) return [];
  const nombre = Object.fromEntries(comunas().map((c) => [c.cod, c]));
  return rankingDonde(b.ins, b.p).map((f, i) => ({ ...f, pos: i + 1, nombre: nombre[f.cod]?.nombre ?? f.cod, region: nombre[f.cod]?.region ?? f.reg }));
}

/** Muertes atribuibles anuales (rango) de cada región y comuna: lo usa el Panel 4 y coincide con el Panel 1. */
export function muertesAnualesTodas(): Record<string, Rango> {
  const b = baseAnalisis();
  if (!b) return {};
  const m: Record<string, Rango> = {};
  for (const reg of Object.keys(b.ins.regiones)) { const x = muertesAnualesRegion(b.ins, reg, b.p); if (x) m[reg] = x.rango; }
  for (const cod of Object.keys(b.ins.comunas)) { const x = muertesAnualesComuna(b.ins, cod, b.p); if (x) m[cod] = x.rango; }
  return m;
}

export type MesRegion = { ym: string; desdeDia: number; diasMes: number; diasCubiertos: number; anomalia: number; normal: number | null; miembros: MiembroMes[] };
/** Panel 3: excesos por miembro del ensamble para cada mes de una región (días pronosticados + días históricos con la anomalía). */
export function mesesRegion(reg: string): { meses: MesRegion[]; nAnos: number } | null {
  const b = baseAnalisis(), pr = proyeccionMensual();
  const r = pr?.regiones[reg], clima = b?.ins.regiones[reg]?.clima;
  if (!b || !r || !clima?.hist_mes) return null;
  const meses: MesRegion[] = Object.entries(r.meses).sort(([a], [c]) => a.localeCompare(c)).map(([ym, m]) => {
    const mes = Number(ym.slice(5)), ano = Number(ym.slice(0, 4));
    const diasMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    const delMes = r.diario.filter(([f]) => f.startsWith(ym));
    const directos = delMes.filter(([, t]) => t > r.umbral).map(([, t]) => Math.round((t - r.umbral) * 10) / 10);
    const ultimo = delMes.length ? Number(delMes[delMes.length - 1][0].slice(8)) : 0;
    const primero = delMes.length ? Number(delMes[0][0].slice(8)) : 1;
    const desdeDia = ultimo + 1;
    const hist = clima.hist_mes![String(mes)] ?? [];
    return {
      ym, desdeDia, diasMes, diasCubiertos: diasMes - primero + 1, anomalia: m.anomalia, normal: m.normal == null ? null : (m.normal * (diasMes - primero + 1)) / diasMes,
      miembros: m.desvios.map((d) => ({ directos, historicos: excesosConAnomalia(hist, desdeDia, m.anomalia + d, r.umbral) })),
    };
  });
  return { meses, nAnos: clima.n_anos };
}

export type MesTerritorio = { ym: string; dias: number; normal: number | null; anomalia: number; rango: Rango; media: Rango; parcial: boolean };
/** Muertes esperadas por mes para una población dada (región, comuna o tramo), con el clima pronosticado de su región. */
export function proyeccionTerritorio(reg: string, pob: number[]): MesTerritorio[] {
  const b = baseAnalisis(), mr = mesesRegion(reg);
  if (!b || !mr) return [];
  const tasa = b.ins.regiones[reg].tasa;
  return mr.meses.map((m) => { const r = proyectarMes(pob, tasa, m.miembros, mr.nAnos, b.p); return { ym: m.ym, dias: r.dias, normal: m.normal, anomalia: m.anomalia, rango: r.rango, media: r.media, parcial: m.diasCubiertos < m.diasMes }; });
}

export type FilaPeligro = { cod: string; nombre: string; region: string; reg: string; mes: string | null; dias: number; cambio: number | null; muertes: Rango; tasa100k: Rango; pob75: number; clase: Robustez | null };
/** Ranking de comunas por muertes esperadas en todo el horizonte; robustez = queda en el 20 % superior con RR bajo y con RR alto (promedio del ensamble). */
export function rankingPeligro(tramos: boolean[] = [true, true, true, true]): FilaPeligro[] {
  const b = baseAnalisis();
  if (!b) return [];
  const nombreReg = Object.fromEntries(regiones().map((r) => [r.cod, r.nombre]));
  const cache = new Map<string, ReturnType<typeof mesesRegion>>();
  const filas: (FilaPeligro & { media: Rango })[] = [];
  for (const c of comunas()) {
    const i = b.ins.comunas[c.cod];
    if (!i) continue;
    if (!cache.has(i.reg)) cache.set(i.reg, mesesRegion(i.reg));
    if (!cache.get(i.reg)) continue;
    const pob = i.pob.map((x, k) => (tramos[k] ? x : 0));
    const meses = proyeccionTerritorio(i.reg, pob);
    const tot: Rango = [meses.reduce((a, m) => a + m.rango[0], 0), meses.reduce((a, m) => a + m.rango[1], 0)];
    const peor = meses.reduce<MesTerritorio | null>((a, m) => (!a || m.rango[1] > a.rango[1] ? m : a), null);
    const pt = pob.reduce((a, x) => a + x, 0);
    filas.push({ cod: c.cod, nombre: c.nombre, region: nombreReg[i.reg] ?? i.reg, reg: i.reg, mes: peor && peor.rango[1] > 0 ? peor.ym : null, dias: peor?.dias ?? 0,
      cambio: peor?.normal == null ? null : peor.dias - peor.normal, muertes: tot, tasa100k: pt ? [(tot[0] / pt) * 1e5, (tot[1] / pt) * 1e5] : [0, 0], pob75: i.pob[3], clase: null,
      media: [meses.reduce((a, m) => a + m.media[0], 0), meses.reduce((a, m) => a + m.media[1], 0)] });
  }
  const k = Math.max(1, Math.round(filas.length * b.p.robustez.fraccion_superior));
  const top = (j: 0 | 1) => new Set([...filas].sort((x, y) => y.media[j] - x.media[j] || x.cod.localeCompare(y.cod)).slice(0, k).map((f) => f.cod));
  const tb = top(0), ta = top(1);
  return filas.map(({ media, ...f }) => ({ ...f, clase: media[1] > 0 ? robustez(tb.has(f.cod), ta.has(f.cod)) : ("no" as Robustez) })).sort((x, y) => y.muertes[1] - x.muertes[1]);
}

/** Días desde la corrida del pronóstico estacional. Más de 10 es dato vencido. */
export function edadProyeccion(ahora = new Date()): number | null {
  const pr = proyeccionMensual();
  return pr ? (ahora.getTime() - Date.parse(pr.corrida)) / 86400000 : null;
}
