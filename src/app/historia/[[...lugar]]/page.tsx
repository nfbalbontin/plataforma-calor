import { notFound } from "next/navigation";
import { Historia } from "@/componentes/Historia";
import { indiceHistoria } from "@/lib/datos";
import { archivoDe } from "@/lib/historia";

export const metadata = { title: "Análisis histórico · Calor y mortalidad en Chile" };

/** Módulo Historia: la misma pantalla para Chile, región, comuna y hospital. */
export default async function Pagina({ params }: { params: Promise<{ lugar?: string[] }> }) {
  const { lugar } = await params;
  const archivo = archivoDe(lugar?.[0], lugar?.[1]);
  const indice = indiceHistoria();
  if (!archivo || !indice || (lugar && lugar.length !== 2)) notFound();
  return <Historia key={archivo} archivo={archivo} hasta={indice.defunciones_hasta} />;
}
