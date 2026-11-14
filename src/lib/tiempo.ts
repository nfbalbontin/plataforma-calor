/** Fechas como texto AAAA-MM-DD en hora de Chile continental. */

export function hoyChile(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);
}

export function sumarDias(fecha: string, n: number): string {
  const d = new Date(fecha + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);
}

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function fechaCorta(fecha: string): string {
  const d = new Date(fecha + "T12:00:00Z");
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()}`;
}

export function fechaLarga(fecha: string): string {
  const d = new Date(fecha + "T12:00:00Z");
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function fechaHora(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
}

/** Período cálido: noviembre a marzo (S9). */
export function esPeriodoCalido(fecha: string): boolean {
  const m = Number(fecha.slice(5, 7));
  return m >= 11 || m <= 3;
}

export const num = (n: number | null | undefined, dec = 0): string =>
  n == null || Number.isNaN(n) ? "sin dato" : n.toLocaleString("es-CL", { minimumFractionDigits: dec, maximumFractionDigits: dec });

/** Semana ISO como "año-semana"; la semana 53 se cuenta con la 52, igual que en la tabla de vigilancia. */
export function semanaIso(fecha: string): string {
  const d = new Date(fecha + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);
  const a = d.getUTCFullYear();
  const j = new Date(Date.UTC(a, 0, 4, 12));
  j.setUTCDate(j.getUTCDate() - ((j.getUTCDay() + 6) % 7) + 3);
  return `${a}-${Math.min(1 + Math.round((d.getTime() - j.getTime()) / 604800000), 52)}`;
}
