/** Lectura de los archivos generados por el proceso externo (datos/ y config/). No usa la base. */
import fs from "node:fs";
import path from "node:path";
import type { Umbral } from "./niveles";

const RAIZ = process.cwd();
const cache = new Map<string, { mtime: number; valor: unknown }>();

function leer<T>(rel: string, porDefecto: T): T {
  const ruta = path.join(RAIZ, rel);
  try {
    const mtime = fs.statSync(ruta).mtimeMs;
    const c = cache.get(rel);
    if (c && c.mtime === mtime) return c.valor as T;
    const valor = JSON.parse(fs.readFileSync(ruta, "utf8")) as T;
    cache.set(rel, { mtime, valor });
    return valor;
  } catch {
    return porDefecto;
  }
}

export function fechaArchivo(rel: string): Date | null {
  try { return fs.statSync(path.join(RAIZ, rel)).mtime; } catch { return null; }
}

export type Pob = { total: number; e0_64: number; e65_74: number; e75_84: number; e85_mas: number };
export type Comuna = {
  cod: string; nombre: string; cod_region: string; region: string; pob: Pob;
  mayores60: number; n_manzanas: number; viviendas: number; viviendas_hacinadas: number;
  ninos_0_5: number; discapacidad: number; hogares_solo_mayores: number;
  prioridad: { n_alta: number; n_media: number; mayores_alta: number; mayores_media: number };
  punto_clima: [number, number] | null; punto_metodo: string; bbox: [number, number, number, number] | null; isla: boolean;
};
export type Region = { cod: string; nombre: string; n_comunas: number; pob: Pob; mayores60: number; mayores_alta: number; bbox: [number, number, number, number] | null };

export const comunas = () => leer<Comuna[]>("datos/comunas.json", []);
export const regiones = () => leer<Region[]>("datos/regiones.json", []);
export function comuna(cod: string) { return comunas().find((c) => c.cod === cod) ?? null; }
export function region(cod: string) { return regiones().find((r) => r.cod === cod) ?? null; }

export type Umbrales = {
  version: string; fecha: string; base: string; cortes: Record<string, number>;
  codigo_rojo: { aplica_region: string; cortes_tmax: number[]; nota: string };
  comunas: Record<string, Umbral & { n_dias: number; temporadas: string }>;
  nota?: string; variables?: string; periodo?: string; fuente?: string;
};
export const umbrales = () => leer<Umbrales>("config/umbrales.json", { version: "sin-umbrales", fecha: "", base: "", cortes: {}, codigo_rojo: { aplica_region: "13", cortes_tmax: [33, 34, 35], nota: "" }, comunas: {} });

export type Medida = { medida: string; responsable: string; plazo: string; respaldo: string };
export type Medidas = { version: string; fecha: string; estado: string; referencias: Record<string, { cita: string; enlace: string | null }>; niveles: Record<string, Medida[]> };
export const medidas = () => leer<Medidas>("config/medidas.json", { version: "", fecha: "", estado: "", referencias: {}, niveles: {} });

export type Fuente = {
  id: string; nombre: string; titular: string; que: string; uso: string; transformacion: string; licencia: string;
  conexion: string; cita: string; enlace: string; cobertura: string; frecuencia: string;
  tolerancia_dias: number | null; solo_temporada?: boolean; tipo: "archivo" | "api" | "formulario" | "calibracion"; modulo: string | null;
};
export type ConfigFuentes = {
  version: string; fecha: string; contacto: string; fuentes: Fuente[];
  propios: Record<string, { nombre: string; revision: string }>;
  metodos: { metodo: string; autoria: string; uso: string; no: string }[]; propio: string[];
};
export const configFuentes = () => leer<ConfigFuentes>("config/fuentes.json", { version: "", fecha: "", contacto: "", fuentes: [], propios: {}, metodos: [], propio: [] });
export const configPrioridad = () => leer<{ version: string; descripcion: string; clases: Record<string, string>; nota_rm: string }>("config/prioridad.json", { version: "", descripcion: "", clases: {}, nota_rm: "" });
export const configEpisodios = () => leer<{ version: string; definicion: string }>("config/episodios.json", { version: "", definicion: "" });

export type SemanaVig = {
  a: number; s: number; inicio: string; dias: number; provisional: boolean;
  total: number | null; e0_64: number | null; e65_79: number | null; e80_mas: number | null;
  total_esp: [number, number, number] | null; e0_64_esp: [number, number, number] | null;
  e65_79_esp: [number, number, number] | null; e80_mas_esp: [number, number, number] | null;
};
export type Vigilancia = { metodo: string; ultima_defuncion: string; cobertura: string; tramos: string[]; regiones: Record<string, SemanaVig[]> };
export const vigilancia = () => leer<Vigilancia | null>("datos/vigilancia.json", null);

export type Urgencias = { metodo: string; ultima_fecha: string; campos: string[]; comunas: Record<string, (string | number | null)[][]> };
export const urgencias = () => leer<Urgencias | null>("datos/urgencias.json", null);

export type ComunaMes = { metodo: string; campos: string[]; comunas: Record<string, (number | boolean | null)[][]> };
export const comunaMes = () => leer<ComunaMes | null>("datos/comuna_mes.json", null);

export type Centro = { id: string; nombre: string; com: string; dep_severa?: number | null; dep_severa_65?: number | null; oxigeno?: number | null; oxigeno_65?: number | null; ventilacion?: number | null; pm_autovalente_sin_riesgo?: number | null; pm_autovalente_con_riesgo?: number | null; pm_riesgo_dependencia?: number | null; pm_dep_leve?: number | null; pm_dep_moderada?: number | null; pm_dep_grave?: number | null; pm_dep_total?: number | null };
export type Dependencia = { corte: string; cobertura: string; nota: string; comunas: Record<string, { centros: Centro[]; dep_severa: number; oxigeno: number; pm_dependientes: number }> };
export const dependencia = () => leer<Dependencia | null>("datos/dependencia.json", null);

export type Episodio = {
  id: string; cod_region: string; inicio: string; termino: string; dias: number; tmean_max: number; tmax_max: number;
  def_obs: number | null; def_esp: [number, number, number] | null; nota?: string;
  niveles: Record<string, Record<string, number>>; // fecha -> cod_comuna -> nivel
};
export type Episodios = { version: string; definicion: string; umbrales: string; metodo_muertes: string; cobertura: string; desde: string; hasta: string; episodios: Episodio[] };
export const episodios = () => leer<Episodios | null>("datos/episodios.json", null);

export type ImpactLab = {
  version: string; fecha_version: string; transcrito: string; nota: string;
  periodos: { id: string; nombre: string; tipo: string }[];
  regiones: { cod_region: string; valores: Record<string, number> }[];
  nacional_mensual: { mes: string; muertes: number; tipo: string }[];
  nacional: Record<string, number>;
};
export const impactlabSemilla = () => leer<ImpactLab | null>("datos/impactlab.json", null);

export const modulo = (nombre: string) => process.env[nombre] === "1";

/** Módulo de la RM (AURA). Solo se lee si el módulo está activado; se puede retirar sin romper el resto (RNF-13). */
export type Aura = {
  version: string; extraccion: string; fuente: string; cita: string; metodo: string; supuesto_s7: string; regla_prioridad: string;
  resumen: Record<string, number>; zonas_climaticas: Record<string, string>;
  comunas: Record<string, {
    n_urbanas: number; n_con_aura: number; cobertura: number; aplica_prioridad: boolean;
    temp_dia_prom: number | null; temp_noche_prom: number | null; manzanas_aura: number | null;
    temp_dia_de?: number | null; delta_2050_dia?: number | null; delta_2050_noche?: number | null;
    prioridad: Comuna["prioridad"];
  }>;
};
export const aura = () => (modulo("MODULO_AURA") ? leer<Aura | null>("datos/aura.json", null) : null);
/** Prioridad de la comuna: con el módulo AURA activo, la clase alta exige además calor (S5). */
export function prioridadDe(c: Comuna): Comuna["prioridad"] & { conCalor: boolean } {
  const a = aura()?.comunas[c.cod];
  return a?.aplica_prioridad ? { ...a.prioridad, conCalor: true } : { ...c.prioridad, conCalor: false };
}

// ---- Provincias, estadísticas por comuna, defunciones filtrables, establecimientos y regla de alerta ----
export type Provincia = { cod: string; nombre: string; cod_region: string; comunas: string[] };
export const provincias = () => leer<Provincia[]>("datos/provincias.json", []);
export type MzStats = { n: number; pob_prom: number | null; pob_de: number | null; may_prom: number | null; may_de: number | null; may_max: number | null; pct_prom: number | null; pct_de: number | null };
export const manzanaStats = () => leer<Record<string, MzStats>>("datos/manzana_stats.json", {});
export type DefRegionDia = { inicio: string; fin: string; territorios: Record<string, Record<string, number[]>> };
export const defRegionDia = () => leer<DefRegionDia | null>("datos/def_region_dia.json", null);
export type DefComunaMes = { meses: string[]; completo_hasta: string; comunas: Record<string, Record<string, number[]>> };
export const defComunaMes = () => leer<DefComunaMes | null>("datos/def_comuna_mes.json", null);
export type CalorCertificado = { definicion: string; nota: string; total: number; filas: { a: number; m: number; cod_region: string; causa: string; n: number }[] };
export const calorCertificado = () => leer<CalorCertificado | null>("datos/def_calor_certificado.json", null);
export type UrgEst = { id: string; com: string; total_prom: number | null; m65_prom: number | null; hosp_prom: number | null; ult_fecha: string | null; ult_m65: number | null; ult_hab: number | null; dias_calor: number; dias_alza: number; razon_calor: number | null };
export type UrgEstablecimientos = { ultima_fecha: string; metodo: string; nota: string; regiones_con_episodios: string[]; establecimientos: UrgEst[] };
export const urgEstablecimientos = () => leer<UrgEstablecimientos | null>("datos/urg_establecimiento.json", null);
export type Establecimiento = { cod: string; cod_antiguo?: string | null; nombre: string; tipo: string; com: string; reg: string; lat: number | null; lon: number | null; urg: boolean; tipo_urg: string | null; sistema: string | null };
export const establecimientos = () => leer<{ cobertura: string; n: number; establecimientos: Establecimiento[] }>("datos/establecimientos.json", { cobertura: "", n: 0, establecimientos: [] });
export type EvidenciaAlerta = { territorio: string; periodo: string; metodo: string; umbrales: string; filas: ({ categoria: string } & Record<string, { dias: number; razon: number | null; ic: [number, number] | null }>)[] };
export const evidenciaAlerta = () => leer<EvidenciaAlerta | null>("datos/evidencia_alerta.json", null);
export type ConfigAlerta = { version: string; fecha: string; estados: string[]; comuna: { estado: number; regla: string; respaldo: string }[]; dias_seguidos_alerta: number; dias_anticipacion: number; territorio: { fraccion_poblacion: number; cobertura_minima: number; regla: string }; manzana: string; limites: string };
export const configAlerta = () => leer<ConfigAlerta>("config/alerta.json", { version: "", fecha: "", estados: [], comuna: [], dias_seguidos_alerta: 3, dias_anticipacion: 2, territorio: { fraccion_poblacion: 0.25, cobertura_minima: 0.5, regla: "" }, manzana: "", limites: "" });
