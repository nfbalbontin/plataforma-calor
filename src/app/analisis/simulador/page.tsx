import { Ayuda } from "@/componentes/Ayuda";
import { Simulador } from "@/componentes/Simulador";
import { baseAnalisis } from "@/lib/analisis";
import { regiones } from "@/lib/datos";
import { TOUR_SIMULADOR } from "@/lib/tours";

export const revalidate = 3600;

export default function PaginaSimulador() {
  const b = baseAnalisis();
  return (
    <div className="pagina">
      <div className="titulo-fila"><h1>Simulador de políticas: días de calor, edad y áreas verdes</h1><span className="fila"><a className="boton sec" href="/analisis">Paneles de análisis</a><Ayuda pasos={TOUR_SIMULADOR} /></span></div>
      <p className="aviso-fijo seccion" role="note"><b>Escenarios hipotéticos; no es un pronóstico.</b> Las muertes se muestran por región y como rango.</p>
      <section className="seccion">
        {!b ? <p className="aviso">Faltan los insumos del motor (pipeline/p9_motor.py).</p>
          : <Simulador p={b.p} regiones={regiones().map((r) => { const x = b.ins.regiones[r.cod]; return { cod: r.cod, nombre: r.nombre, pob: x.pob, tasa: x.tasa, clima: x.clima ? { ...x.clima, excesos: [], hist_mes: undefined } : null }; })} />}
      </section>
    </div>
  );
}
