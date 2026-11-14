import { semaforo } from "@/lib/consultas";
import { aCsv, respuestaCsv } from "@/lib/csv";
import { comunas, umbrales } from "@/lib/datos";

export const dynamic = "force-dynamic";
export async function GET() {
  const s = await semaforo();
  const v = umbrales().version;
  const filas = comunas().flatMap((c) => (s.porComuna[c.cod] ?? []).map((n, i) => [s.emision, c.cod, c.nombre, c.cod_region, n.fecha, i, n.nivel, n.incierto, n.confianza, n.tmean, n.tmax, n.tmin, v]));
  return respuestaCsv(`semaforo_${s.emision ?? "sin_emision"}.csv`, aCsv(["fecha_emision", "cod_comuna", "comuna", "cod_region", "fecha_objetivo", "dias_adelante", "nivel_estimado", "incierto", "confianza", "tmean_c", "tmax_c", "tmin_c", "version_umbrales"], filas));
}
