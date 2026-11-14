/** Sesión de administrador con clave única (S11, RNF-09). La clave vive solo en variables de entorno. */
import crypto from "node:crypto";
import { cookies, headers } from "next/headers";

const COOKIE = "calor_admin";
const DURACION_MS = 8 * 3600 * 1000;
const intentos = new Map<string, number[]>();

function firma(vence: number): string {
  return crypto.createHmac("sha256", process.env.ADMIN_CLAVE ?? "").update(`admin:${vence}`).digest("hex");
}

export async function esAdmin(): Promise<boolean> {
  if (!process.env.ADMIN_CLAVE) return false;
  const v = (await cookies()).get(COOKIE)?.value;
  if (!v) return false;
  const [vence, f] = v.split(".");
  if (!vence || !f || Number(vence) < Date.now()) return false;
  const esperada = firma(Number(vence));
  return f.length === esperada.length && crypto.timingSafeEqual(Buffer.from(f), Buffer.from(esperada));
}

/** Devuelve null si entra, o el motivo del rechazo. Máximo 5 intentos fallidos cada 15 minutos por dirección. */
export async function entrar(clave: string): Promise<string | null> {
  const real = process.env.ADMIN_CLAVE;
  if (!real) return "La clave de administrador no está configurada en el servidor.";
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const ahora = Date.now();
  const previos = (intentos.get(ip) ?? []).filter((t) => ahora - t < 15 * 60000);
  if (previos.length >= 5) return "Demasiados intentos. Espera 15 minutos.";
  const a = crypto.createHash("sha256").update(clave).digest(), b = crypto.createHash("sha256").update(real).digest();
  if (!crypto.timingSafeEqual(a, b)) {
    intentos.set(ip, [...previos, ahora]);
    return "Clave incorrecta.";
  }
  intentos.delete(ip);
  const vence = ahora + DURACION_MS;
  (await cookies()).set(COOKIE, `${vence}.${firma(vence)}`, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: DURACION_MS / 1000 });
  return null;
}

export async function salir() { (await cookies()).delete(COOKIE); }
