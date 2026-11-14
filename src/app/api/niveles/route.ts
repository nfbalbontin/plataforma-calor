import { NextResponse } from "next/server";
import { nivelesFecha } from "@/lib/consultas";
import { hoyChile } from "@/lib/tiempo";

/** Niveles de una fecha para pintar el mapa. Las fechas pasadas ya no cambian: caché larga. */
export async function GET(req: Request) {
  const fecha = new URL(req.url).searchParams.get("fecha") ?? hoyChile();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return NextResponse.json({ error: "fecha inválida" }, { status: 400 });
  const datos = await nivelesFecha(fecha);
  const pasada = fecha < hoyChile();
  // El navegador siempre revalida; solo la red de distribución guarda copias (las fechas pasadas, por más tiempo).
  return NextResponse.json(datos, { headers: {
    "Cache-Control": "public, max-age=0, must-revalidate",
    "CDN-Cache-Control": pasada ? "s-maxage=86400, stale-while-revalidate=604800" : "s-maxage=900, stale-while-revalidate=3600",
  } });
}
