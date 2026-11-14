import { Explorador } from "@/componentes/Explorador";
import { datosExplorador } from "@/lib/vistas";

export const revalidate = 1800;

export default async function Mapa() {
  const d = await datosExplorador();
  return <div className="pagina ancha"><Explorador {...d} /></div>;
}
