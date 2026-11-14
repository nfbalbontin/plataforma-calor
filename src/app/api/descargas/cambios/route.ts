import { cambios } from "@/lib/consultas";
import { aCsv, respuestaCsv } from "@/lib/csv";
import { comunas } from "@/lib/datos";

export const dynamic = "force-dynamic";
export async function GET() {
  const nombre = Object.fromEntries(comunas().map((c) => [c.cod, c.nombre]));
  const filas = (await cambios(100000)).map((c) => [c.fecha, c.cod_comuna, nombre[c.cod_comuna], c.nivel_anterior, c.nivel_nuevo, c.valor, c.version_umbral, c.creado]);
  return respuestaCsv("registro_cambios_nivel.csv", aCsv(["fecha", "cod_comuna", "comuna", "nivel_anterior", "nivel_nuevo", "temperatura_media_c", "version_umbrales", "registrado"], filas));
}
