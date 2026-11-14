/**
 * Tarea diaria ligera (RF-05 a RF-08, RF-17): clima de Open-Meteo, niveles, calor acumulado,
 * pronóstico de 5 días y registro de cambios de nivel.
 * Si la fuente falla: reintenta, conserva el último dato y marca la fuente como desactualizada.
 */
import { comunas, umbrales } from "./datos";
import { ahoraIso, q } from "./db";
import { calorAcumulado, confianza, diasCalorModerado, esIncierto, nivelEstimado } from "./niveles";
import { diasEntre, hoyChile, sumarDias } from "./tiempo";

const API = "https://api.open-meteo.com/v1/forecast";
const LOTE = 50;
/** Open-Meteo pronostica hasta 16 días: hoy y 15 más. */
export const DIAS_PRONOSTICO = 16;

type Diario = { time: string[]; temperature_2m_mean: (number | null)[]; temperature_2m_max: (number | null)[]; temperature_2m_min: (number | null)[] };
type Respuesta = { daily: Diario };

async function pedir(puntos: [number, number][], diasAtras: number): Promise<Respuesta[]> {
  const url = `${API}?latitude=${puntos.map((p) => p[1]).join(",")}&longitude=${puntos.map((p) => p[0]).join(",")}` +
    `&daily=temperature_2m_mean,temperature_2m_max,temperature_2m_min&timezone=auto&past_days=${diasAtras}&forecast_days=${DIAS_PRONOSTICO}`;
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

export type ResumenTarea = {
  hoy: string; comunas_ok: number; comunas_falla: number; cambios: number; version_umbral: string;
  con_umbral: number; duracion_s: number; error?: string;
};

export async function tareaDiaria(diasAtras = 5): Promise<ResumenTarea> {
  const t0 = Date.now();
  const inicio = ahoraIso();
  const hoy = hoyChile();
  const um = umbrales();
  const lista = comunas().filter((c) => c.punto_clima);
  const res: ResumenTarea = { hoy, comunas_ok: 0, comunas_falla: 0, cambios: 0, version_umbral: um.version, con_umbral: 0, duracion_s: 0 };

  // Historia ya guardada, para el calor moderado sostenido.
  const previas = await q<{ cod_comuna: string; fecha: string; tmean: number | null; tmax: number | null; tmin: number | null }>(
    "select cod_comuna, fecha, tmean, tmax, tmin from comuna_dia where fecha >= $1 order by fecha", [sumarDias(hoy, -60)]);
  const historia = new Map<string, Map<string, { tmean: number | null; tmax: number | null; tmin: number | null }>>();
  for (const p of previas) {
    if (!historia.has(p.cod_comuna)) historia.set(p.cod_comuna, new Map());
    historia.get(p.cod_comuna)!.set(p.fecha, p);
  }
  // Nivel vigente anterior de cada comuna: el del día 0 de la última emisión previa.
  const anteriores = new Map<string, number | null>();
  for (const a of await q<{ cod_comuna: string; nivel: number | null }>(
    `select p.cod_comuna, p.nivel from pronostico p
     join (select cod_comuna, max(fecha_emision) f from pronostico where fecha_emision < $1 group by 1) u
       on u.cod_comuna = p.cod_comuna and u.f = p.fecha_emision and p.fecha_objetivo = p.fecha_emision`, [hoy])) anteriores.set(a.cod_comuna, a.nivel);

  const filasDia: unknown[][] = [], filasPron: unknown[][] = [], filasCambio: unknown[][] = [];
  let ultimoError = "";
  for (let i = 0; i < lista.length; i += LOTE) {
    const lote = lista.slice(i, i + LOTE);
    let datos: Respuesta[];
    try {
      datos = await pedir(lote.map((c) => c.punto_clima!), diasAtras);
    } catch (e) {
      res.comunas_falla += lote.length;
      ultimoError = (e as Error).message;
      continue;
    }
    lote.forEach((c, k) => {
      const d = datos[k]?.daily;
      if (!d) { res.comunas_falla++; return; }
      const u = um.comunas[c.cod] ?? null;
      if (u) res.con_umbral++;
      const serie = historia.get(c.cod) ?? new Map();
      d.time.forEach((f, j) => serie.set(f, { tmean: d.temperature_2m_mean[j], tmax: d.temperature_2m_max[j], tmin: d.temperature_2m_min[j] }));
      const fechas = [...serie.keys()].sort();
      for (const f of d.time) {
        const v = serie.get(f)!;
        const dif = diasEntre(hoy, f);
        const nivel = nivelEstimado(v.tmean, u);
        if (dif < 0) {
          // Días observados: se recalculan calor acumulado y días de calor moderado hasta esa fecha.
          const hasta = fechas.filter((x) => x <= f);
          const contiguas: string[] = [];
          for (let n = hasta.length - 1; n >= 0; n--) {
            if (contiguas.length && diasEntre(hasta[n], contiguas[0]) !== 1) break;
            contiguas.unshift(hasta[n]);
          }
          const acum = calorAcumulado(contiguas.slice(-3).map((x) => serie.get(x)!), u);
          const mod = diasCalorModerado(contiguas.map((x) => serie.get(x)!.tmean), u);
          filasDia.push([c.cod, f, v.tmean, v.tmax, v.tmin, acum?.dia ?? null, acum?.noche ?? null, mod, nivel, u ? um.version : null, "open-meteo", inicio]);
        } else if (dif < DIAS_PRONOSTICO) {
          filasPron.push([c.cod, hoy, f, v.tmean, v.tmax, v.tmin, nivel, confianza(dif), esIncierto(v.tmean, u), u ? um.version : null]);
          if (dif === 0 && nivel != null) {
            const ayer = serie.get(sumarDias(hoy, -1));
            const anterior = anteriores.has(c.cod) ? anteriores.get(c.cod)! : nivelEstimado(ayer?.tmean, u);
            if (anterior != null && anterior !== nivel) filasCambio.push([hoy, c.cod, anterior, nivel, v.tmean, um.version, inicio]);
          }
        }
      }
      res.comunas_ok++;
    });
    await new Promise((ok) => setTimeout(ok, 250));
  }

  await insertar("comuna_dia", ["cod_comuna", "fecha", "tmean", "tmax", "tmin", "acum_dia", "acum_noche", "dias_moderado", "nivel", "version_umbral", "fuente", "actualizado"], filasDia,
    `on conflict (cod_comuna, fecha) do update set tmean=excluded.tmean, tmax=excluded.tmax, tmin=excluded.tmin, acum_dia=excluded.acum_dia,
     acum_noche=excluded.acum_noche, dias_moderado=excluded.dias_moderado, nivel=excluded.nivel, version_umbral=excluded.version_umbral,
     fuente=excluded.fuente, actualizado=excluded.actualizado`);
  await insertar("pronostico", ["cod_comuna", "fecha_emision", "fecha_objetivo", "tmean", "tmax", "tmin", "nivel", "confianza", "incierto", "version_umbral"], filasPron,
    `on conflict (cod_comuna, fecha_emision, fecha_objetivo) do update set tmean=excluded.tmean, tmax=excluded.tmax, tmin=excluded.tmin,
     nivel=excluded.nivel, confianza=excluded.confianza, incierto=excluded.incierto, version_umbral=excluded.version_umbral`);
  // El registro de cambios no se edita: un cambio por comuna y día, y nunca se reescribe.
  await insertar("cambio_nivel", ["fecha", "cod_comuna", "nivel_anterior", "nivel_nuevo", "valor", "version_umbral", "creado"], filasCambio,
    "on conflict (cod_comuna, fecha) do nothing");
  res.cambios = filasCambio.length;
  // Se conservan 90 días de pronósticos y tres años de días observados.
  await q("delete from pronostico where fecha_emision < $1", [sumarDias(hoy, -90)]);
  await q("delete from comuna_dia where fecha < $1", [sumarDias(hoy, -1096)]);

  const ok = res.comunas_ok > 0;
  const resultado = res.comunas_falla === 0 ? "correcta" : ok ? "parcial" : "falla";
  if (ok) {
    await q(`insert into fuente_estado (fuente, ultima_carga, ultimo_dato, resultado, detalle) values ('open-meteo', $1, $2, $3, $4)
             on conflict (fuente) do update set ultima_carga=excluded.ultima_carga, ultimo_dato=excluded.ultimo_dato, resultado=excluded.resultado, detalle=excluded.detalle`,
      [inicio, sumarDias(hoy, -1), resultado, `${res.comunas_ok} comunas; ${res.comunas_falla} sin respuesta${ultimoError ? ` (${ultimoError})` : ""}`]);
  } else {
    // Falla total: se conserva el último dato y solo se anota el intento. El respaldo de la DMC requiere registro y no está configurado.
    await q(`insert into fuente_estado (fuente, resultado, detalle) values ('open-meteo', 'falla', $1)
             on conflict (fuente) do update set resultado='falla', detalle=excluded.detalle`,
      [`Intento del ${inicio}: ${ultimoError}. Respaldo DMC sin configurar; se conserva el último dato.`]);
    res.error = ultimoError;
  }
  res.duracion_s = Math.round((Date.now() - t0) / 100) / 10;
  await q("insert into ejecucion (tarea, inicio, fin, ok, detalle) values ('diaria', $1, $2, $3, $4)", [inicio, ahoraIso(), ok, JSON.stringify(res)]);
  return res;
}
