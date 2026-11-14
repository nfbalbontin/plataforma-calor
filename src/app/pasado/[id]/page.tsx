import { notFound } from "next/navigation";
import { Explorador } from "@/componentes/Explorador";
import { episodios } from "@/lib/datos";
import { fechaLarga } from "@/lib/tiempo";
import { datosExplorador } from "@/lib/vistas";

export const revalidate = 3600;
export function generateStaticParams() { return []; }

/** Vista Pasado (RF-19): elegir un episodio pinta el mapa con los niveles de esos días. */
export default async function EpisodioMapa({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = episodios()?.episodios.find((x) => x.id === id);
  if (!e) notFound();
  const d = await datosExplorador();
  return (
    <div className="pagina ancha">
      <Explorador {...d} episodio={{ id: e.id, nombre: `${fechaLarga(e.inicio)} a ${fechaLarga(e.termino)}`, fechas: Object.keys(e.niveles).sort(), niveles: e.niveles }} />
    </div>
  );
}
