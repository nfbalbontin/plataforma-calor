import { Ayuda } from "@/componentes/Ayuda";
import { LeyendaRob } from "@/componentes/Robustez";
import { TablaDonde } from "@/componentes/TablaDonde";
import { baseAnalisis, filasDonde } from "@/lib/analisis";
import { comunas, regiones } from "@/lib/datos";
import { TOUR_DONDE } from "@/lib/tours";

export const revalidate = 3600;

export default function Donde() {
  const b = baseAnalisis();
  const bbox = Object.fromEntries(comunas().map((c) => [c.cod, c.bbox]));
  const filas = filasDonde().map((f) => ({ ...f, bbox: bbox[f.cod] ?? null }));
  const propias = filas.filter((f) => f.climaPropio).length, sin = filas.filter((f) => f.dias == null).length;
  return (
    <div className="pagina">
      <div className="titulo-fila"><h1>Dónde actuar: comunas por personas mayores y días de calor</h1><span className="fila"><a className="boton sec" href="/analisis">Paneles de análisis</a><Ayuda pasos={TOUR_DONDE} /></span></div>
      <p className="sub">Indicador = personas de 65 años o más × días al año con la máxima sobre el umbral local. No usa riesgo relativo ni muertes.</p>
      <div className="seccion"><LeyendaRob /></div>
      {!b ? <p className="aviso seccion">Faltan los insumos del motor (pipeline/p9_motor.py).</p> : (
        <>
          <section className="seccion"><TablaDonde filas={filas} regiones={regiones().map((r) => ({ cod: r.cod, nombre: r.nombre }))} /></section>
          <section className="seccion">
            <table className="tabla-mini supuestos" style={{ maxWidth: 900 }}>
              <thead><tr><th>Supuesto</th><th>Valor</th></tr></thead>
              <tbody>
                <tr><td>Umbral</td><td>Percentil {b.p.umbral.percentil} local de la {b.p.umbral.variable}, {b.p.umbral.periodo} ({b.ins.umbrales})</td></tr>
                <tr><td>Clase de robustez</td><td>Comuna en el {Math.round(b.p.robustez.fraccion_superior * 100)} % superior de muertes esperadas con RR {b.p.rr.bajo.toLocaleString("es-CL")} y con RR {b.p.rr.alto.toLocaleString("es-CL")} por °C</td></tr>
                <tr><td>Clima de cada comuna</td><td>{propias} comunas con serie propia; {filas.length - propias - sin} usan la serie de la capital de su región; {sin} sin serie todavía</td></tr>
                <tr><td>Validación</td><td>Defunciones de residentes en los días de episodio de calor de su región desde 2010 (sin marzo 2020 a diciembre 2022), contra lo habitual del mes</td></tr>
              </tbody>
            </table>
            <details className="metodo"><summary>Límite de este indicador</summary><p>El umbral es un percentil local, así que casi todas las comunas tienen un número parecido de días sobre él y el orden lo decide sobre todo la población de 65 años o más. Las diferencias de días vienen de comparar temporadas recientes con el período base. La columna de olas de calor compara con lo habitual sin corregir tendencia.</p></details>
          </section>
        </>
      )}
    </div>
  );
}
