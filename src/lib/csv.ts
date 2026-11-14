/** CSV en UTF-8 con BOM, para que Excel lea bien las tildes. */
export function aCsv(columnas: string[], filas: (string | number | boolean | null | undefined)[][]): string {
  const celda = (v: string | number | boolean | null | undefined) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [columnas, ...filas].map((f) => f.map(celda).join(",")).join("\n") + "\n";
}
export function respuestaCsv(nombre: string, texto: string): Response {
  return new Response(texto, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${nombre}"`, "Cache-Control": "public, s-maxage=900" } });
}
