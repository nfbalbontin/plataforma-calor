"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { entrar, esAdmin, salir } from "@/lib/admin";
import { diferencias, validarImpactLab, type FilaImpactLab } from "@/lib/cargas";
import { cargaVigente } from "@/lib/consultas";
import { comuna, region } from "@/lib/datos";
import { ahoraIso, q } from "@/lib/db";
import { tareaDiaria } from "@/lib/ingesta";

const volver = (msg: string, tipo: "bien" | "mal" = "bien"): never => redirect(`/admin?${tipo}=${encodeURIComponent(msg)}`);
async function exigir() { if (!(await esAdmin())) redirect("/login?mal=" + encodeURIComponent("Sesión vencida. Ingresa la clave otra vez.")); }

export async function iniciarSesion(fd: FormData) {
  const error = await entrar(String(fd.get("clave") ?? ""));
  if (error) redirect(`/login?mal=${encodeURIComponent(error)}`);
  redirect("/admin");
}
export async function cerrarSesion() { await salir(); redirect("/login"); }

export async function ejecutarTarea() {
  await exigir();
  let msg: string;
  try {
    const r = await tareaDiaria(5);
    revalidatePath("/", "layout");
    msg = `Tarea diaria ejecutada: ${r.comunas_ok} comunas con clima, ${r.comunas_falla} sin respuesta, ${r.con_umbral} con nivel, ${r.cambios} cambios de nivel (${r.duracion_s} s).`;
    if (r.comunas_ok === 0) return volver(`La fuente no respondió: ${r.error}. Se conserva el último dato.`, "mal");
  } catch (e) { return volver(`Error en la tarea diaria: ${(e as Error).message}`, "mal"); }
  volver(msg);
}

/** Alertas oficiales: se ingresan a mano, con las escalas de cada organismo sin renombrar (RF-18). */
export async function crearAlerta(fd: FormData) {
  await exigir();
  const organismo = String(fd.get("organismo") ?? "").trim(), tipo = String(fd.get("tipo") ?? "").trim();
  const tt = String(fd.get("territorio_tipo") ?? ""), cod = String(fd.get("territorio_cod") ?? "").trim();
  const inicio = String(fd.get("inicio") ?? ""), termino = String(fd.get("termino") ?? ""), enlace = String(fd.get("enlace") ?? "").trim();
  if (!organismo || !tipo) return volver("Faltan el organismo o el tipo de alerta.", "mal");
  let nombre = "Todo el país";
  if (tt === "region") { const r = region(cod); if (!r) return volver(`La región «${cod}» no existe.`, "mal"); nombre = `Región ${r.nombre}`; }
  else if (tt === "comuna") { const c = comuna(cod); if (!c) return volver(`La comuna «${cod}» no existe.`, "mal"); nombre = c.nombre; }
  else if (tt !== "pais") return volver("Territorio no válido.", "mal");
  if (/c[óo]digo rojo/i.test(tipo) && !(tt !== "pais" && cod.startsWith("13"))) return volver("El Código Rojo aplica solo a la Región Metropolitana.", "mal");
  // Las horas del formulario son de Chile continental.
  const aIso = (v: string) => { const d = new Date(v + (v.length === 16 ? ":00" : "") + "-03:00"); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };
  const i = aIso(inicio), t = aIso(termino);
  if (!i || !t) return volver("Las fechas de inicio y término son obligatorias.", "mal");
  if (t <= i) return volver("El término debe ser posterior al inicio.", "mal");
  if (!/^https?:\/\/\S+\.\S+/.test(enlace)) return volver("El enlace al original debe ser una dirección web completa.", "mal");
  await q("insert into alerta_oficial (organismo, tipo, territorio_tipo, territorio_cod, territorio_nombre, inicio, termino, enlace, creado) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [organismo, tipo, tt, tt === "pais" ? "CL" : cod, nombre, i, t, enlace, ahoraIso()]);
  await marcar("alertas-oficiales", "Alerta ingresada");
  revalidatePath("/", "layout");
  volver(`Alerta «${tipo}» de ${organismo} ingresada para ${nombre}.`);
}
export async function anularAlerta(fd: FormData) {
  await exigir();
  await q("update alerta_oficial set anulada = true where id = $1", [Number(fd.get("id"))]);
  revalidatePath("/", "layout");
  volver("Alerta anulada. Queda en el historial y deja de mostrarse como vigente.");
}
async function marcar(fuente: string, detalle: string) {
  await q(`insert into fuente_estado (fuente, ultima_carga, resultado, detalle) values ($1, $2, 'correcta', $3)
           on conflict (fuente) do update set ultima_carga = excluded.ultima_carga, resultado = 'correcta', detalle = excluded.detalle`, [fuente, ahoraIso(), detalle]);
}
export async function marcarRevisionAlertas() {
  await exigir();
  await marcar("alertas-oficiales", "Revisión sin cambios");
  revalidatePath("/", "layout");
  volver("Revisión de alertas oficiales registrada.");
}

/** Paso 1: valida y deja la carga como pendiente con su resumen y diferencias. No reemplaza nada. */
export async function subirArchivo(fd: FormData) {
  await exigir();
  const tipo = String(fd.get("tipo") ?? "");
  const archivo = fd.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return volver("Elige un archivo.", "mal");
  if (tipo !== "impactlab") return volver("Ese tipo de archivo se procesa fuera de Vercel, en la tarea a pedido de GitHub Actions, que aún no está configurada.", "mal");
  const v = validarImpactLab(archivo.name, new Uint8Array(await archivo.arrayBuffer()));
  if (!v.ok) {
    await q("insert into carga (tipo, archivo, fecha, estado, filas, resumen) values ($1,$2,$3,'rechazada',0,$4)", [tipo, archivo.name, ahoraIso(), JSON.stringify({ errores: v.errores })]);
    return volver(`Archivo rechazado, no se cambió ningún dato. ${v.errores.join(" ")}`, "mal");
  }
  const vig = await cargaVigente(tipo);
  const dif = diferencias(v.filas, vig?.contenido ? (JSON.parse(vig.contenido) as FilaImpactLab[]) : null);
  await q("update carga set estado = 'descartada' where tipo = $1 and estado = 'pendiente'", [tipo]);
  await q("insert into carga (tipo, archivo, fecha, estado, filas, resumen, contenido, reemplaza) values ($1,$2,$3,'pendiente',$4,$5,$6,$7)",
    [tipo, archivo.name, ahoraIso(), v.filas.length, JSON.stringify({ ...v.resumen, diferencias: dif }), JSON.stringify(v.filas), vig?.id ?? null]);
  volver("Archivo válido. Revisa el resumen y confirma para reemplazar los datos.");
}
/** Paso 2: reemplaza los datos solo tras confirmar. */
export async function confirmarCarga(fd: FormData) {
  await exigir();
  const id = Number(fd.get("id"));
  const c = (await q<{ id: number; tipo: string; estado: string; reemplaza: number | null }>("select id, tipo, estado, reemplaza from carga where id = $1", [id]))[0];
  if (!c || c.estado !== "pendiente") return volver("Esa carga ya no está pendiente.", "mal");
  await q("update carga set estado = 'reemplazada' where tipo = $1 and estado = 'vigente'", [c.tipo]);
  await q("update carga set estado = 'vigente', fecha = $2 where id = $1", [id, ahoraIso()]);
  revalidatePath("/", "layout");
  volver("Carga confirmada: los datos fueron reemplazados. Se puede revertir desde el historial.");
}
export async function descartarCarga(fd: FormData) {
  await exigir();
  await q("update carga set estado = 'descartada' where id = $1 and estado = 'pendiente'", [Number(fd.get("id"))]);
  volver("Carga descartada. No se cambió ningún dato.");
}
/** Vuelve a la versión anterior (RNF-11). */
export async function revertirCarga(fd: FormData) {
  await exigir();
  const id = Number(fd.get("id"));
  const c = (await q<{ id: number; tipo: string; estado: string; reemplaza: number | null }>("select id, tipo, estado, reemplaza from carga where id = $1", [id]))[0];
  if (!c || c.estado !== "vigente") return volver("Solo se puede revertir la carga vigente.", "mal");
  await q("update carga set estado = 'revertida' where id = $1", [id]);
  if (c.reemplaza) await q("update carga set estado = 'vigente' where id = $1", [c.reemplaza]);
  revalidatePath("/", "layout");
  volver(c.reemplaza ? "Carga revertida: volvió a quedar vigente la versión anterior." : "Carga revertida: se vuelve a la transcripción inicial.");
}
