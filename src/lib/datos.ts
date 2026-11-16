/** Lectura de los archivos fijos que genera el proceso externo (datos/ y config/). No usa la base. */
import fs from "node:fs";
import path from "node:path";
import type { Curva } from "./riesgo";

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

export type Pob = { total: number; e0_64: number; e65_74: number; e75_84: number; e85_mas: number };
export type Comuna = {
  cod: string; nombre: string; cod_region: string; region: string; pob: Pob; mayores60: number; n_manzanas: number;
  viviendas: number; viviendas_hacinadas: number; ninos_0_5: number; discapacidad: number; hogares_solo_mayores: number;
  punto_clima: [number, number] | null; bbox: [number, number, number, number] | null; isla: boolean;
};
export type Region = { cod: string; nombre: string; n_comunas: number; pob: Pob; mayores60: number; bbox: [number, number, number, number] | null };
export const comunas = () => leer<Comuna[]>("datos/comunas.json", []);
export const regiones = () => leer<Region[]>("datos/regiones.json", []);
export type Provincia = { cod: string; nombre: string; cod_region: string; comunas: string[] };
export const provincias = () => leer<Provincia[]>("datos/provincias.json", []);

export type Hospital = { cod: string; antiguo: string | null; nombre: string; ss: string; comuna: string; lat: number; lon: number; complejidad: string | null; con_urgencias: boolean; area: string[] };
export type Territorio = {
  regla: string; catalogo: string; servicios: Record<string, string>;
  comunas: Record<string, { ss: string; hospital: string; dist_km: number; regla: string }>; hospitales: Record<string, Hospital>;
};
export const territorio = () => leer<Territorio>("datos/territorio.json", { regla: "", catalogo: "", servicios: {}, comunas: {}, hospitales: {} });

export type CurvaModelo = { umbral: number; umbral_p: number; rr: number[]; lo: number[]; hi: number[]; fuente: string; eventos: number };
export type BandaValidacion = { banda: string; dias_region: number; observadas: number; esperadas: number; exceso_observado: number; exceso_predicho: number; predicho_lo: number; predicho_hi: number; razon_observada: number | null; razon_observada_ic: [number, number] | null; razon_predicha: number | null };
export type Modelo = {
  version: string; ajustado: string; temporadas: [number, number]; defunciones_hasta: string; temperatura: string;
  curvas: Record<string, string>; desde: Record<string, number>;
  regiones: Record<string, { grilla: number[]; cuantiles_x: number[]; cuantiles_tmax: number[]; p95_tmax: number; p90_tmax: number; curvas: Record<string, CurvaModelo> }>;
  validacion: { sin_temporadas: string[]; bandas: BandaValidacion[]; total_sobre_umbral: { exceso_observado: number; exceso_predicho: number; predicho_lo: number; predicho_hi: number } };
  uc: Record<string, { estudio_uc: number; en_olas: [number, number, number]; ano_completo_calido: [number, number, number] }>;
  sensibilidad: Record<string, [number, number, number]>;
};
export const modelo = () => leer<Modelo | null>("datos/modelo.json", null);

/** Curva de una región lista para el cálculo de riesgo. */
export function curvaDe(region: string, clave = "M_T"): Curva | null {
  const r = modelo()?.regiones[region];
  const c = r?.curvas[clave];
  return r && c ? { x: r.grilla, rr: c.rr, lo: c.lo, hi: c.hi, umbral: c.umbral } : null;
}

export type BaseRiesgo = { temporadas: number[]; nota: string; comunas: Record<string, { m: number[]; m65: number[]; h: number[] }> };
export const baseRiesgo = () => leer<BaseRiesgo>("datos/riesgo_base.json", { temporadas: [], nota: "", comunas: {} });
export const climaComunas = () => leer<{ comunas: Record<string, { q: number[]; temporadas: number }> }>("datos/clima_comunas.json", { comunas: {} });

export type ConfigRiesgo = { version: string; niveles: string[]; cortes_exceso: number[]; regla: string; dias_confianza_alta: number; dias_pronostico: number; tendencia_grados: number; tope_vulnerabilidad: number; manzana: string };
export const configRiesgo = () => leer<ConfigRiesgo>("config/riesgo.json", { version: "", niveles: ["Bajo", "Moderado", "Alto", "Muy alto"], cortes_exceso: [0.02, 0.05, 0.1], regla: "", dias_confianza_alta: 7, dias_pronostico: 16, tendencia_grados: 0.5, tope_vulnerabilidad: 3, manzana: "" });

export type NivelDx = { nivel: number; nombre: string; diagnosticos: string; codigos: string[]; evidencia: string };
export const diagnosticos = () => leer<{ version: string; nota: string; niveles: NivelDx[] }>("config/diagnosticos.json", { version: "", nota: "", niveles: [] });

export type Fuente = { id: string; nombre: string; institucion: string; enlace: string; descarga: string; que: string; transformacion: string; condiciones: string };
export const fuentes = () => leer<{ version: string; fuentes: Fuente[] }>("config/fuentes.json", { version: "", fuentes: [] });

export type Tendencia = { corrida: string; modelo: string; fuente: string; hasta: string; regiones: Record<string, { capital: string; meses: Record<string, { anomalia: number }> }> };
export const tendenciaEstacional = () => leer<Tendencia | null>("datos/proyeccion_mensual.json", null);

export type Indice = { temporadas: number[]; defunciones_hasta: string; urgencias_desde: number; niveles_desde: number; poblacion_desde: number; modelo: string; ajustado: string; lugares: Record<string, number> };
export const indiceHistoria = () => leer<Indice | null>("public/historia/indice.json", null);
export const historiaPais = () => leer<{ temporadas: number[]; series: Record<string, (number | null)[][]>; clima: { calor: number[] } } | null>("public/historia/pais.json", null);

/** El módulo AURA solo se muestra si está activado: sus datos no se publican sin autorización de su equipo. */
export const moduloAura = () => process.env.MODULO_AURA === "1" && fs.existsSync(path.join(RAIZ, "public/teselas/manzanas_13_aura.pmtiles"));
export const auraComunas = () => (moduloAura() ? Object.keys(leer<{ comunas: Record<string, unknown> }>("datos/aura.json", { comunas: {} }).comunas) : []);
