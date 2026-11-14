/** Lecturas de la base para las páginas. Todas toleran que la base falle (RNF-05). */
import { configAlerta } from "./datos";
import { q, seguro } from "./db";
import { estadoComuna, rachaCalor, type Estado } from "./alerta";
import { hoyChile, sumarDias } from "./tiempo";

export type Celda = {
  fecha: string; nivel: number | null; tmean: number | null; tmax: number | null; tmin: number | null;
  incierto: boolean; confianza: string | null; tipo: "observado" | "pronóstico"; estado: Estado | null;
};
export type DiaObservado = {
  cod_comuna: string; fecha: string; tmean: number | null; tmax: number | null; tmin: number | null;
  acum_dia: number | null; acum_noche: number | null; dias_moderado: number | null; nivel: number | null; version_umbral: string | null; actualizado: string | null;
};

export async function ultimaEmision(): Promise<string | null> {
  return seguro(async () => (await q<{ f: string | null }>("select max(fecha_emision) f from pronostico"))[0]?.f ?? null, null);
}

/** Nivel de hoy y de los 5 días siguientes para todas las comunas, según la última emisión. */
export async function semaforo(): Promise<{ emision: string | null; fechas: string[]; porComuna: Record<string, Celda[]> }> {
  const emision = await ultimaEmision();
  if (!emision) return { emision: null, fechas: [], porComuna: {} };
  const filas = await seguro(() => q<{ cod_comuna: string; fecha_objetivo: string; tmean: number; tmax: number; tmin: number; nivel: number | null; confianza: string; incierto: boolean }>(
    "select cod_comuna, fecha_objetivo, tmean, tmax, tmin, nivel, confianza, incierto from pronostico where fecha_emision = $1 order by cod_comuna, fecha_objetivo", [emision]), []);
  const porComuna: Record<string, Celda[]> = {};
  const fechas = new Set<string>();
  for (const f of filas) {
    fechas.add(f.fecha_objetivo);
    (porComuna[f.cod_comuna] ??= []).push({ fecha: f.fecha_objetivo, nivel: f.nivel, tmean: f.tmean, tmax: f.tmax, tmin: f.tmin, incierto: !!f.incierto, confianza: f.confianza, tipo: "pronóstico", estado: null });
  }
  // Estado de alerta de cada día: usa los días observados previos para contar los días seguidos de calor.
  const cfg = configAlerta();
  const previos = await seguro(() => q<{ cod_comuna: string; fecha: string; nivel: number | null }>(
    "select cod_comuna, fecha, nivel from comuna_dia where fecha >= $1 and fecha < $2 order by fecha", [sumarDias(emision, -6), emision]), []);
  const obs: Record<string, (number | null)[]> = {};
  for (const p of previos) (obs[p.cod_comuna] ??= []).push(p.nivel);
  for (const [cod, celdas] of Object.entries(porComuna)) {
    const serie = [...(obs[cod] ?? []), ...celdas.map((c) => c.nivel)];
    const base = serie.length - celdas.length;
    celdas.forEach((c, i) => {
      c.estado = estadoComuna(c.nivel, rachaCalor(serie.slice(0, base + i + 1)), celdas.slice(i + 1).map((x) => x.nivel), cfg.dias_seguidos_alerta, cfg.dias_anticipacion);
    });
  }
  return { emision, fechas: [...fechas].sort(), porComuna };
}

/** Niveles de una fecha para pintar el mapa: observados si la fecha ya pasó, pronosticados si no. */
export async function nivelesFecha(fecha: string) {
  const emision = await ultimaEmision();
  const hoy = emision ?? hoyChile();
  // Cada comuna: [nivel, media, máxima, mínima, incierto, estado de alerta]
  if (fecha >= hoy) {
    const s = await semaforo();
    const i = s.fechas.indexOf(fecha);
    const datos = i < 0 ? {} : Object.fromEntries(Object.entries(s.porComuna).filter(([, c]) => c[i]).map(([cod, c]) => [cod, [c[i].nivel, c[i].tmean, c[i].tmax, c[i].tmin, c[i].incierto ? 1 : 0, c[i].estado]]));
    return { fecha, tipo: "pronóstico" as const, emision, datos };
  }
  const cfg = configAlerta();
  const filas = await seguro(() => q<DiaObservado>("select cod_comuna, fecha, tmean, tmax, tmin, nivel from comuna_dia where fecha between $1 and $2 order by fecha", [sumarDias(fecha, -6), fecha]), []);
  const serie: Record<string, DiaObservado[]> = {};
  for (const f of filas) (serie[f.cod_comuna] ??= []).push(f);
  const datos = Object.fromEntries(Object.entries(serie).filter(([, d]) => d[d.length - 1].fecha === fecha).map(([cod, d]) => {
    const u = d[d.length - 1];
    return [cod, [u.nivel, u.tmean, u.tmax, u.tmin, 0, estadoComuna(u.nivel, rachaCalor(d.map((x) => x.nivel)), [], cfg.dias_seguidos_alerta, 0)]];
  }));
  return { fecha, tipo: "observado" as const, emision, datos };
}

export async function diasComuna(cod: string, dias = 14): Promise<DiaObservado[]> {
  return seguro(() => q<DiaObservado>("select * from comuna_dia where cod_comuna = $1 and fecha >= $2 order by fecha", [cod, sumarDias(hoyChile(), -dias)]), []);
}

export async function ultimoDiaTodas(): Promise<Record<string, DiaObservado>> {
  const filas = await seguro(() => q<DiaObservado>(
    "select d.* from comuna_dia d join (select cod_comuna, max(fecha) f from comuna_dia group by 1) u on u.cod_comuna = d.cod_comuna and u.f = d.fecha"), []);
  return Object.fromEntries(filas.map((f) => [f.cod_comuna, f]));
}

export type Alerta = {
  id: number; organismo: string; tipo: string; territorio_tipo: "pais" | "region" | "comuna"; territorio_cod: string;
  territorio_nombre: string; inicio: string; termino: string; enlace: string; creado: string; anulada: boolean;
};
export async function alertas(): Promise<Alerta[]> {
  return seguro(() => q<Alerta>("select * from alerta_oficial order by inicio desc"), []);
}
/** Una alerta vencida deja de mostrarse como vigente (RF-18). */
export function vigentes(lista: Alerta[], ahora = new Date()): Alerta[] {
  const t = ahora.toISOString();
  return lista.filter((a) => !a.anulada && a.inicio <= t && a.termino > t);
}
export function alertasDeComuna(lista: Alerta[], cod: string, codRegion: string): Alerta[] {
  return lista.filter((a) => a.territorio_tipo === "pais" || (a.territorio_tipo === "region" && a.territorio_cod === codRegion) || (a.territorio_tipo === "comuna" && a.territorio_cod === cod));
}

export type Cambio = { id: number; fecha: string; cod_comuna: string; nivel_anterior: number | null; nivel_nuevo: number; valor: number | null; version_umbral: string | null; creado: string };
export async function cambios(limite = 200): Promise<Cambio[]> {
  return seguro(() => q<Cambio>("select * from cambio_nivel order by fecha desc, id desc limit $1", [limite]), []);
}

export type EstadoFila = { fuente: string; ultima_carga: string | null; ultimo_dato: string | null; resultado: string | null; detalle: string | null };
export async function estadosGuardados(): Promise<Record<string, EstadoFila>> {
  const filas = await seguro(() => q<EstadoFila>("select * from fuente_estado"), []);
  return Object.fromEntries(filas.map((f) => [f.fuente, f]));
}

export type Carga = { id: number; tipo: string; archivo: string | null; fecha: string; estado: string; filas: number | null; resumen: string | null; contenido: string | null; reemplaza: number | null };
export async function cargas(tipo?: string): Promise<Carga[]> {
  return seguro(() => tipo ? q<Carga>("select * from carga where tipo = $1 order by id desc", [tipo]) : q<Carga>("select id, tipo, archivo, fecha, estado, filas, resumen, reemplaza from carga order by id desc limit 100"), []);
}
export async function cargaVigente(tipo: string): Promise<Carga | null> {
  return seguro(async () => (await q<Carga>("select * from carga where tipo = $1 and estado = 'vigente' order by id desc limit 1", [tipo]))[0] ?? null, null);
}
export async function ultimaEjecucion() {
  return seguro(async () => (await q<{ inicio: string; fin: string; ok: boolean; detalle: string }>("select * from ejecucion where tarea = 'diaria' order by id desc limit 1"))[0] ?? null, null);
}
