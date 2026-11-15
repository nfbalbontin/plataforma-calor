import { Ayuda } from "@/componentes/Ayuda";
import { Inversion } from "@/componentes/Inversion";
import { baseAnalisis, muertesAnualesTodas } from "@/lib/analisis";
import { comunas, regiones } from "@/lib/datos";
import { TOUR_INVERSION } from "@/lib/tours";

export const revalidate = 3600;

export default function PaginaInversion() {
  const b = baseAnalisis(), m = muertesAnualesTodas();
  const territorios = [
    ...regiones().map((r) => ({ cod: r.cod, nombre: `Región ${r.nombre}`, grupo: "Regiones", muertes: m[r.cod] ?? null })),
    ...comunas().map((c) => ({ cod: c.cod, nombre: `${c.nombre} (${c.region})`, grupo: "Comunas", muertes: m[c.cod] ?? null })).sort((a, c) => a.nombre.localeCompare(c.nombre)),
  ];
  return (
    <div className="pagina">
      <div className="titulo-fila"><h1>Cuánto invertir: muertes que una medida debe evitar para justificar su costo</h1><span className="fila"><a className="boton sec" href="/analisis">Paneles de análisis</a><Ayuda pasos={TOUR_INVERSION} /></span></div>
      <section className="seccion">{!b ? <p className="aviso">Faltan los insumos del motor.</p> : <Inversion territorios={territorios} p={b.p} />}</section>
    </div>
  );
}
