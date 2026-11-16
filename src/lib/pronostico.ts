/**
 * Temperatura viva: una tarea diaria consulta el pronóstico de Open-Meteo para todas las comunas y lo guarda.
 * Las visitas leen lo guardado y aplican la fórmula del modelo; nunca consultan la API.
 * Si la API falla se conserva el último pronóstico, con su fecha.
 */
import { baseRiesgo, climaComunas, comunas, configRiesgo, curvaDe, modelo, regiones } from "./datos";
import { ahoraIso, q, seguro } from "./db";
import { calcularRiesgo, type Insumos, type Riesgo } from "./calculo";
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

export type { Riesgo, SerieRiesgo } from "./calculo";

/** Insumos fijos del cálculo (curvas, muertes habituales, clima propio); también se mandan al navegador para simular. */
export function insumosRiesgo(): Insumos | null {
  const mod = modelo();
  if (!mod) return null;
  const cfg = configRiesgo(), base = baseRiesgo().comunas, clima = climaComunas().comunas;
  const curvas: Insumos["curvas"] = {};
  for (const r of regiones()) {
    const M = curvaDe(r.cod, "M_T");
    if (M && mod.regiones[r.cod]) curvas[r.cod] = { M, H: curvaDe(r.cod, "H_T"), qx: mod.regiones[r.cod].cuantiles_x };
  }
  return { cortes: cfg.cortes_exceso, diasAlta: cfg.dias_confianza_alta, curvas,
    base: Object.fromEntries(Object.entries(base).map(([k, v]) => [k, { m: v.m, h: v.h }])),
    clima: Object.fromEntries(Object.entries(clima).map(([k, v]) => [k, v.q])),
    comunas: comunas().map((c) => ({ cod: c.cod, reg: c.cod_region })) };
}

/** Riesgo de los próximos 16 días con el último pronóstico guardado. Devuelve null si nunca se ha cargado uno. */
export async function riesgoActual(): Promise<Riesgo | null> {
  return seguro(async () => {
    const [ult] = await q<{ f: string | null }>("select max(fecha_emision) f from pronostico");
    const emision = ult?.f, ins = insumosRiesgo();
    if (!emision || !ins) return null;
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
    return calcularRiesgo(ins, series, fechas, ATRAS, { emision, actualizado: estado?.ultima_carga ?? null, hoy: hoyChile(), vencido: emision < hoyChile() });
  }, null);
}
