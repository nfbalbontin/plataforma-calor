/**
 * Validación de archivos de la sección de carga (RF-37, RNF-11).
 * Ningún archivo reemplaza datos sin pasar la validación de su tipo.
 */
export type FilaImpactLab = { version: string; cod_region: string; mes: string; muertes: number };
export type ResultadoValidacion =
  | { ok: false; errores: string[] }
  | { ok: true; filas: FilaImpactLab[]; resumen: { filas: number; regiones: number; meses: string; total: number; version: string } };

const REGIONES = Array.from({ length: 16 }, (_, i) => String(i + 1).padStart(2, "0"));
export const TIPOS_CARGA = [
  { id: "impactlab", nombre: "Climate Impact Lab: muertes adicionales por región y mes", inmediato: true,
    formato: "Nombre impactlab_chile_vDDMMAA.csv · UTF-8 · columnas version,cod_region,mes,muertes · mes como AAAA-MM · las 16 regiones" },
  { id: "rem", nombre: "REM Serie P (dependencia)", inmediato: false, formato: "SERIE_REM_<AÑO>.zip. Archivo grande: se procesa fuera de Vercel, en la tarea a pedido de GitHub Actions (pendiente de configurar)." },
  { id: "establecimientos", nombre: "Establecimientos de salud", inmediato: false, formato: "establecimientos_<AAAAMMDD>.csv. Se procesa fuera de Vercel (pendiente de configurar)." },
  { id: "deis", nombre: "Defunciones o urgencias del DEIS (respaldo de la carga automática)", inmediato: false, formato: "Zip del DEIS. Se procesa fuera de Vercel (pendiente de configurar)." },
] as const;

export function validarImpactLab(nombre: string, bytes: Uint8Array): ResultadoValidacion {
  const errores: string[] = [];
  const m = /^impactlab_chile_(v\d{6})\.csv$/i.exec(nombre);
  if (!m) errores.push(`Nombre de archivo no válido: «${nombre}». Debe ser impactlab_chile_vDDMMAA.csv.`);
  if (bytes.length > 1_000_000) errores.push("El archivo pesa más de 1 MB; este tipo no debería superar unas pocas decenas de KB.");
  let texto = "";
  try { texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { errores.push("La codificación no es UTF-8."); }
  if (errores.length) return { ok: false, errores };
  const lineas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lineas[0]?.trim() !== "version,cod_region,mes,muertes") return { ok: false, errores: [`Encabezado incorrecto: «${lineas[0] ?? ""}». Debe ser exactamente version,cod_region,mes,muertes.`] };
  const version = m![1].toLowerCase();
  const filas: FilaImpactLab[] = [];
  const vistas = new Set<string>();
  lineas.slice(1).forEach((l, i) => {
    const n = i + 2, c = l.split(",").map((x) => x.trim());
    if (c.length !== 4) { errores.push(`Línea ${n}: se esperaban 4 columnas y hay ${c.length}.`); return; }
    const [v, reg, mes, mu] = c;
    if (v.toLowerCase() !== version) errores.push(`Línea ${n}: la versión «${v}» no coincide con la del nombre del archivo (${version}).`);
    if (!REGIONES.includes(reg)) errores.push(`Línea ${n}: código de región «${reg}» no existe (use 01 a 16).`);
    if (!/^20(2\d|3[0-5])-(0[1-9]|1[0-2])$/.test(mes)) errores.push(`Línea ${n}: mes «${mes}» no tiene el formato AAAA-MM o está fuera de 2020-2035.`);
    const valor = Number(mu);
    if (mu === "" || !Number.isFinite(valor)) errores.push(`Línea ${n}: muertes «${mu}» no es un número.`);
    const llave = `${reg}|${mes}`;
    if (vistas.has(llave)) errores.push(`Línea ${n}: región ${reg} y mes ${mes} están repetidos.`);
    vistas.add(llave);
    filas.push({ version, cod_region: reg, mes, muertes: valor });
  });
  if (filas.length === 0) errores.push("El archivo no trae filas de datos.");
  const regs = new Set(filas.map((f) => f.cod_region));
  const faltan = REGIONES.filter((r) => !regs.has(r));
  if (faltan.length && filas.length) errores.push(`Faltan regiones: ${faltan.join(", ")}.`);
  const meses = [...new Set(filas.map((f) => f.mes))].sort();
  for (const r of regs) { const n = filas.filter((f) => f.cod_region === r).length; if (n !== meses.length) { errores.push(`La región ${r} trae ${n} meses y el archivo tiene ${meses.length} meses distintos.`); break; } }
  if (errores.length) return { ok: false, errores: errores.slice(0, 12) };
  return { ok: true, filas, resumen: { filas: filas.length, regiones: regs.size, meses: `${meses[0]} a ${meses[meses.length - 1]}`, total: Math.round(filas.reduce((a, f) => a + f.muertes, 0) * 10) / 10, version } };
}

/** Diferencias con la carga vigente, para mostrarlas antes de confirmar. */
export function diferencias(nuevas: FilaImpactLab[], previas: FilaImpactLab[] | null) {
  if (!previas) return { primera: true, agregadas: nuevas.length, eliminadas: 0, cambiadas: 0, total_antes: null as number | null };
  const a = new Map(previas.map((f) => [`${f.cod_region}|${f.mes}`, f.muertes]));
  const b = new Map(nuevas.map((f) => [`${f.cod_region}|${f.mes}`, f.muertes]));
  let agregadas = 0, cambiadas = 0, eliminadas = 0;
  for (const [k, v] of b) { if (!a.has(k)) agregadas++; else if (a.get(k) !== v) cambiadas++; }
  for (const k of a.keys()) if (!b.has(k)) eliminadas++;
  return { primera: false, agregadas, eliminadas, cambiadas, total_antes: Math.round(previas.reduce((s, f) => s + f.muertes, 0) * 10) / 10 };
}
