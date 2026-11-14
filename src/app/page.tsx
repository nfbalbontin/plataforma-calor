import { SECCIONES } from "@/lib/secciones";

/** Inicio: video de presentación y para qué sirve cada sección. */
export default function Inicio() {
  return (
    <div className="pagina">
      <div className="titulo-fila">
        <h1>Plataforma de calor extremo y salud · Chile</h1>
        <span className="fila"><a className="boton" href="/mapa">Abrir el mapa</a><a className="boton sec" href="/tutorial">Ver tutorial</a></span>
      </div>
      <p className="sub">Muestra dónde hay calor inusual, a quién afecta más y qué se observa en muertes y urgencias, para decidir medidas cada día.</p>
      <section className="seccion"><video src="/video/lanzamiento.mp4" controls preload="metadata" aria-label="Video de presentación de la plataforma" /></section>
      <section className="seccion">
        <h2>Secciones</h2>
        <div className="grilla g3" style={{ marginTop: 10 }}>
          {SECCIONES.map(([href, nombre, para]) => (
            <a key={href} href={href} className="tarjeta" style={{ textDecoration: "none", color: "inherit" }}>
              <h3>{nombre}</h3><p className="chico">{para}</p>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
