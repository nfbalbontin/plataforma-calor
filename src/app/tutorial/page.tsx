import { SECCIONES } from "@/lib/secciones";

const PASOS: [string, string][] = [
  ["Abre el mapa", "Parte en Chile completo. Los colores van de 0 (sin calor inusual) a 3 (calor extremo); el gris es una comuna que aún no tiene umbral."],
  ["Elige el día", "Con «Pasado», «Presente» y «Futuro» cambias la fecha: los últimos 7 días, hoy o cualquiera de los próximos 15."],
  ["Baja de nivel", "Pincha una región, luego una provincia o comuna, y por último una manzana. O usa los filtros de región, provincia y comuna."],
  ["Lee la distribución y las estadísticas", "A la derecha siempre están cuántas comunas hay en cada nivel y el promedio, la desviación estándar, el mínimo y el máximo de lo seleccionado."],
  ["Revisa el panel", "El panel ordena las comunas por nivel y muestra la alerta oficial, la alerta propia y las medidas de cada nivel."],
  ["Compara con lo observado", "En «Impacto» filtras defunciones por región, comuna, edad, año y mes; los períodos con episodio de calor van en rojo."],
  ["Pincha cualquier cifra", "Las cifras subrayadas abren su fuente, fecha, método y si son registro, estimación o proyección."],
];

/** Cómo se usa la plataforma y acceso al ejemplo guiado de cada sección. */
export default function Tutorial() {
  return (
    <div className="pagina">
      <h1>Tutorial: cómo usar la plataforma</h1>
      <section className="seccion"><video src="/video/lanzamiento.mp4" controls preload="metadata" aria-label="Video de presentación" style={{ maxWidth: 760 }} /></section>
      <section className="seccion">
        <h2>En siete pasos</h2>
        <ol style={{ paddingLeft: 20, color: "var(--texto-2)", maxWidth: "90ch" }}>
          {PASOS.map(([t, d]) => <li key={t} style={{ margin: "8px 0" }}><b style={{ color: "var(--texto)" }}>{t}.</b> {d}</li>)}
        </ol>
      </section>
      <section className="seccion">
        <h2>Ejemplo guiado de cada sección</h2>
        <p className="sub">Cada sección tiene un botón «Ayuda» que recorre un ejemplo. Desde aquí se abre directo.</p>
        <div className="grilla g3" style={{ marginTop: 10 }}>
          {SECCIONES.filter(([h]) => h !== "/tutorial").map(([href, nombre, para]) => (
            <div key={href} className="tarjeta">
              <h3>{nombre}</h3><p className="chico">{para}</p>
              <p style={{ marginTop: 10 }}><a className="boton sec" href={`${href}?ayuda=1`}>Iniciar ejemplo</a></p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
