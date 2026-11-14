import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { tareaDiaria } from "@/lib/ingesta";

export const maxDuration = 300;

/** Tarea diaria ligera. Exige el secreto en la cabecera Authorization (RNF-09). */
async function ejecutar(req: Request) {
  const secreto = process.env.TAREA_SECRETO ?? process.env.CRON_SECRET;
  const dado = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const ok = !!secreto && dado.length === secreto.length && crypto.timingSafeEqual(Buffer.from(dado), Buffer.from(secreto));
  if (!ok) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const dias = Math.min(31, Math.max(3, Number(new URL(req.url).searchParams.get("dias") ?? 5)));
  try {
    const resumen = await tareaDiaria(dias);
    revalidatePath("/", "layout");
    return NextResponse.json(resumen, { status: resumen.comunas_ok > 0 ? 200 : 502 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
export const GET = ejecutar;
export const POST = ejecutar;
