import { Ayuda } from "@/componentes/Ayuda";
import { SelectorDescarga } from "@/componentes/SelectorDescarga";
import { aura, comunas, configFuentes } from "@/lib/datos";
import { TOUR_DATOS } from "@/lib/tours";

export const revalidate = 3600;

const TABLAS: { titulo: string; href: string; que: string; columnas: string; fuentes: string[]; licencia: string }[] = [
  { titulo: "Comunas: población y prioridad", href: "/api/descargas/comunas", que: "Una fila por comuna (346).", columnas: "población por tramo de edad; personas de 60+ sumadas desde las manzanas; número de manzanas y de manzanas de prioridad alta; personas de 60+ en ellas; hogares solo de personas mayores; punto donde se consulta el clima.", fuentes: ["censo-2024"], licencia: "CC BY-SA 4.0" },
  { titulo: "Semáforo: nivel de hoy y 5 días", href: "/api/descargas/semaforo", que: "Una fila por comuna y día objetivo de la última emisión.", columnas: "nivel estimado 0 a 3 (vacío si la comuna no tiene umbral), si es incierto, confianza, temperatura media, máxima y mínima, versión de umbrales.", fuentes: ["open-meteo"], licencia: "CC BY 4.0 (elaboración propia)" },
  { titulo: "Umbrales por comuna", href: "/api/descargas/umbrales", que: "Percentiles locales de la versión vigente.", columnas: "percentiles 50, 90, 95 y 99 de la temperatura media del período cálido; percentil 90 de la máxima y de la mínima; días y temporadas usados.", fuentes: ["open-meteo"], licencia: "CC BY 4.0 (elaboración propia)" },
  { titulo: "Registro de cambios de nivel", href: "/api/descargas/cambios", que: "Una fila por cambio de nivel de una comuna.", columnas: "fecha, comuna, nivel anterior y nuevo, temperatura media que lo gatilló, versión de umbrales.", fuentes: ["open-meteo"], licencia: "CC BY 4.0 (elaboración propia)" },
  { titulo: "Vigilancia de mortalidad por región y semana", href: "/api/descargas/vigilancia", que: "Una fila por región, semana ISO y tramo de edad, desde 2010.", columnas: "defunciones observadas; esperadas (mediana, mínimo y máximo de los años de referencia); marca de provisional.", fuentes: ["deis-defunciones"], licencia: "Datos abiertos del DEIS; términos por revisar" },
  { titulo: "Defunciones y urgencias por comuna y mes", href: "/api/descargas/comuna-mes", que: "Una fila por comuna y mes completo, desde 2010. Lo comunal se publica solo por mes.", columnas: "defunciones de residentes, de 65 o más, esperadas (mediana); urgencias totales y de 65 o más.", fuentes: ["deis-defunciones", "deis-urgencias"], licencia: "Datos abiertos del DEIS; términos por revisar" },
  { titulo: "Señal de urgencias por comuna", href: "/api/descargas/urgencias", que: "Último día con informe completo de cada comuna.", columnas: "atenciones totales, de 65 o más, circulatorias y respiratorias, cada una con su valor habitual; estado de la señal.", fuentes: ["deis-urgencias"], licencia: "Datos abiertos del DEIS; términos por revisar" },
  { titulo: "Personas dependientes por centro de salud", href: "/api/descargas/dependencia", que: "Una fila por centro de atención primaria, último corte.", columnas: "dependencia severa en atención domiciliaria, oxígeno dependientes, asistencia ventilatoria y personas mayores según funcionalidad.", fuentes: ["deis-rem", "deis-establecimientos"], licencia: "Datos abiertos del DEIS; términos por revisar" },
  { titulo: "Episodios de calor desde 2010", href: "/api/descargas/episodios", que: "Una fila por episodio y región.", columnas: "inicio, término, días, temperatura media y máxima más altas, defunciones observadas y esperadas con rango.", fuentes: ["open-meteo", "deis-defunciones"], licencia: "Elaboración propia" },
];

export default function Datos() {
  const cf = configFuentes();
  const cita = (id: string) => cf.fuentes.find((f) => f.id === id);
  return (
    <div className="pagina">
      <div className="titulo-fila"><h1>Descarga de datos en CSV</h1><Ayuda pasos={TOUR_DATOS} /></div>
      <p className="sub">Solo datos agregados. Cada tabla trae su diccionario y su cita.</p>

      <section className="seccion" data-tour="manzanas">
        <h2>Manzanas prioritarias por comuna</h2>
<p className="sub">Código de manzana, tipo, clase de prioridad, personas de 60 años o más y población.</p>
        <div className="tarjeta"><SelectorDescarga comunas={comunas().map((c) => ({ cod: c.cod, nombre: c.nombre, region: c.region }))} conCalor={Object.keys(aura()?.comunas ?? {})} />
          <p className="chico" style={{ marginTop: 10 }}>Cita: {cita("censo-2024")?.cita} Clase de prioridad: elaboración propia. Licencia CC BY-SA 4.0: se puede reutilizar citando al INE, indicando los cambios y compartiendo con la misma licencia.</p></div>
      </section>

      <section className="seccion" data-tour="tablas">
        <h2>Tablas</h2>
        <div className="grilla g2">
          {TABLAS.map((t) => (
            <div className="tarjeta" key={t.href}>
              <div className="fila entre"><h3>{t.titulo}</h3><a className="boton sec" href={t.href}>CSV</a></div>
              <p style={{ fontSize: 13.5 }}>{t.que}</p>
              <p className="chico" style={{ marginTop: 6 }}><b>Diccionario:</b> {t.columnas}</p>
              <p className="chico" style={{ marginTop: 6 }}><b>Cita:</b> {t.fuentes.map((id) => cita(id)?.cita).join(" · ")}</p>
              <p className="chico" style={{ marginTop: 6 }}><b>Licencia de la fuente:</b> {t.licencia}</p>
            </div>
          ))}
        </div>
        <p className="chico seccion">Los CSV vienen en UTF-8 con separador de coma. Las celdas vacías significan «sin dato», no cero. <a href="/metodologia">Metodología y datos utilizados</a></p>
      </section>
    </div>
  );
}
