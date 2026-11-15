import { LeyendaRob } from "@/componentes/Robustez";
import { baseAnalisis, edadProyeccion } from "@/lib/analisis";
import { proyeccionMensual } from "@/lib/datos";
import { fechaHora } from "@/lib/tiempo";

export const revalidate = 3600;

const PANELES: [string, string, string, string][] = [
  ["¿Dónde actuar?", "/analisis/donde", "Dónde actuar", "Ranking de las 346 comunas por personas mayores y días de calor, con la robustez de esa prioridad."],
  ["¿Dónde actuar?", "/analisis/proyeccion", "Proyección mensual", "Muertes esperadas por mes con el pronóstico de 16 días y el estacional, y las comunas de mayor peligro."],
  ["¿Qué pasa si actuamos?", "/analisis/simulador", "Simulador de políticas", "Escenarios hipotéticos: días de calor, grados, edad de la población y áreas verdes."],
  ["¿Cuánto conviene invertir?", "/analisis/inversion", "Cuánto invertir", "Muertes que una medida debe evitar para justificar su costo, contra lo que evitaría."],
];

export default function Analisis() {
  const b = baseAnalisis(), pr = proyeccionMensual(), edad = edadProyeccion();
  const conClima = b ? Object.values(b.ins.regiones).filter((r) => r.clima).length : 0;
  return (
    <div className="pagina">
      <h1>Análisis de calor y mortalidad bajo incertidumbre</h1>
      <p className="sub">Cuatro paneles con un mismo motor de cálculo. Toda cifra de muertes va como rango, por región o comuna, con los supuestos al lado.</p>
      <section className="seccion grilla g2">
        {PANELES.map(([pregunta, href, nombre, para]) => (
          <a key={href} href={href} className="tarjeta" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="chico">{pregunta}</div><h3>{nombre}</h3><p className="chico">{para}</p>
          </a>
        ))}
      </section>
      <section className="seccion"><h2>Clasificación de robustez</h2><div style={{ marginTop: 8 }}><LeyendaRob /></div></section>
      {b && (
        <section className="seccion">
          <h2>Motor de cálculo</h2>
          <div className="formula" style={{ marginTop: 8 }}>{b.p.formula}</div>
          <table className="tabla-mini supuestos" style={{ marginTop: 10, maxWidth: 980 }}>
            <thead><tr><th>Parámetro</th><th>Bajo</th><th>Alto</th><th>Fuente</th></tr></thead>
            <tbody>
              <tr><td>Riesgo relativo por °C</td><td>{b.p.rr.bajo.toLocaleString("es-CL")}</td><td>{b.p.rr.alto.toLocaleString("es-CL")}</td><td>{b.p.rr.fuente}</td></tr>
              <tr><td>°C por punto de cobertura arbórea</td><td>{b.p.coef_verde.bajo.toLocaleString("es-CL")}</td><td>{b.p.coef_verde.alto.toLocaleString("es-CL")}</td><td>{b.p.coef_verde.fuente_bajo} {b.p.coef_verde.fuente_alto}</td></tr>
            </tbody>
          </table>
          <p className="chico" style={{ marginTop: 8 }}>Clima histórico disponible en {conClima} de 16 regiones. {pr ? `Pronóstico estacional del ${fechaHora(pr.corrida)}${edad != null && edad > 10 ? " (vencido)" : ""}.` : "Sin pronóstico estacional."} Versión {b.p.version}. <a href="/metodologia#motor">Todos los parámetros</a></p>
        </section>
      )}
    </div>
  );
}
