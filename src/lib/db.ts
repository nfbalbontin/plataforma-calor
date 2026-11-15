/**
 * Base de datos: Postgres (Neon) si existe DATABASE_URL; si no, PGlite local en .datos/pglite.
 * Solo guarda la temperatura, que es lo único que cambia día a día: días observados recientes y pronóstico.
 * La base histórica y el modelo son archivos fijos (src/lib/datos.ts), así el sitio sigue visible aunque la base falle.
 */
import path from "node:path";
import fs from "node:fs";

type Fila = Record<string, unknown>;
type Motor = { consultar: (sql: string, params?: unknown[]) => Promise<Fila[]> };

const g = globalThis as unknown as { __calorDb?: Promise<Motor> };

const ESQUEMA = `
create table if not exists comuna_dia (
  cod_comuna text not null, fecha text not null,
  tmean real, tmax real, tmin real,
  acum_dia real, acum_noche real, dias_moderado integer,
  nivel smallint, version_umbral text, fuente text, actualizado text,
  primary key (cod_comuna, fecha));
create table if not exists pronostico (
  cod_comuna text not null, fecha_emision text not null, fecha_objetivo text not null,
  tmean real, tmax real, tmin real, nivel smallint, confianza text, incierto boolean, version_umbral text,
  primary key (cod_comuna, fecha_emision, fecha_objetivo));
create table if not exists fuente_estado (
  fuente text primary key, ultima_carga text, ultimo_dato text, resultado text, detalle text);
create table if not exists ejecucion (
  id serial primary key, tarea text not null, inicio text not null, fin text, ok boolean, detalle text);
create index if not exists pronostico_emision on pronostico (fecha_emision);
create index if not exists comuna_dia_fecha on comuna_dia (fecha);
`;

async function abrir(): Promise<Motor> {
  const url = process.env.DATABASE_URL;
  let motor: Motor;
  if (url) {
    const postgres = (await import("postgres")).default;
    const sql = postgres(url, { max: 3, prepare: false });
    motor = { consultar: async (t, p = []) => (await sql.unsafe(t, p as never[])) as unknown as Fila[] };
    for (const s of ESQUEMA.split(";").map((x) => x.trim()).filter(Boolean)) await sql.unsafe(s);
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const dir = path.join(process.cwd(), ".datos", "pglite");
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    const pg = new PGlite(dir);
    await pg.exec(ESQUEMA);
    motor = { consultar: async (t, p = []) => (await pg.query(t, p as never[])).rows as Fila[] };
  }
  return motor;
}

export async function q<T = Fila>(sql: string, params: unknown[] = []): Promise<T[]> {
  if (!g.__calorDb) g.__calorDb = abrir().catch((e) => { g.__calorDb = undefined; throw e; });
  const motor = await g.__calorDb;
  return (await motor.consultar(sql, params)) as T[];
}

/** Ejecuta una lectura y, si la base falla, devuelve el valor de respaldo (RNF-05). */
export async function seguro<T>(fn: () => Promise<T>, respaldo: T): Promise<T> {
  try { return await fn(); } catch (e) { console.error("[base]", (e as Error).message); return respaldo; }
}

export const ahoraIso = () => new Date().toISOString();
