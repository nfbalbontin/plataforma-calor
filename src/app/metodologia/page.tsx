import { Ayuda } from "@/componentes/Ayuda";
import { aura, configAlerta, configEpisodios, configFuentes, configPrioridad, evidenciaAlerta, medidas, umbrales, vigilancia } from "@/lib/datos";
import { TOUR_METODOLOGIA } from "@/lib/tours";

export const revalidate = 3600;
const pct = (r: number | null) => (r == null ? "sin dato" : `${r >= 1 ? "+" : "−"}${Math.abs((r - 1) * 100).toLocaleString("es-CL", { maximumFractionDigits: 1 })} %`);

export default function Metodologia() {
  const cf = configFuentes(), um = umbrales(), pri = configPrioridad(), ep = configEpisodios(), vig = vigilancia(), cat = medidas(), au = aura();
  const al = configAlerta(), ev = evidenciaAlerta(), r = au?.resumen;
  return (
    <div className="pagina">
      <div className="titulo-fila"><h1>Metodología y fuentes de datos</h1><Ayuda pasos={TOUR_METODOLOGIA} /></div>
      <p className="sub">Titular de cada dato, API o descarga por la que llega, licencia, y cómo se calcula cada indicador.</p>

      <section className="seccion" data-tour="fuentes">
        <h2>Fuentes y conexión</h2>
        <div className="tabla-caja" style={{ marginTop: 8 }}>
          <table>
            <thead><tr><th>Fuente y titular</th><th>API o descarga</th><th>Uso</th><th>Qué se transformó</th><th>Licencia</th><th>Cita</th></tr></thead>
            <tbody>
              {cf.fuentes.map((f) => (
                <tr key={f.id}>
                  <td><a href={f.enlace} target="_blank" rel="noreferrer"><b>{f.nombre}</b></a><br /><span className="chico">{f.titular}</span></td>
                  <td className="chico" style={{ wordBreak: "break-word" }}>{f.conexion}</td><td>{f.uso}</td><td>{f.transformacion}</td><td>{f.licencia}</td><td className="chico">{f.cita}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="seccion" data-tour="regla">
        <h2>Regla de alerta propia</h2>
        <p className="sub">No es una alerta oficial. Versión {al.version}.</p>
        <div className="grilla g2" style={{ marginTop: 10 }}>
          <div className="tarjeta">
            <h3>Por comuna</h3>
            <table className="tabla-mini"><thead><tr><th>Estado</th><th>Cuándo</th></tr></thead>
              <tbody>{al.comuna.map((c) => <tr key={c.estado}><td><span className={`estado e${c.estado}`}>{al.estados[c.estado]}</span></td><td>{c.regla}</td></tr>)}</tbody></table>
          </div>
          <div className="tarjeta">
            <h3>Por provincia, región o país</h3><p style={{ fontSize: 13.5 }}>{al.territorio.regla}</p>
            <h3 style={{ marginTop: 10 }}>Por manzana</h3><p style={{ fontSize: 13.5 }}>{al.manzana}</p>
          </div>
        </div>
        {ev && (
          <>
            <h3 style={{ marginTop: 14 }}>Datos que la respaldan: defunciones de 65 años o más según el calor</h3>
            <div className="tabla-caja" style={{ marginTop: 6 }}>
              <table>
                <thead><tr><th>Día</th><th className="n">Días</th><th className="n">Mismo día</th><th className="n">Intervalo 95 %</th><th className="n">Día siguiente</th><th className="n">Dos días después</th></tr></thead>
                <tbody>{ev.filas.map((f) => <tr key={f.categoria}><td>{f.categoria}</td><td className="n">{f.rezago_0.dias}</td><td className="n"><b>{pct(f.rezago_0.razon)}</b></td>
                  <td className="n">{f.rezago_0.ic ? `${pct(f.rezago_0.ic[0])} a ${pct(f.rezago_0.ic[1])}` : ""}</td><td className="n">{pct(f.rezago_1.razon)}</td><td className="n">{pct(f.rezago_2.razon)}</td></tr>)}</tbody>
              </table>
            </div>
            <p className="chico" style={{ marginTop: 6 }}>{ev.territorio}; {ev.periodo}. {ev.metodo}</p>
          </>
        )}
        <p className="aviso info" style={{ marginTop: 8 }}>{al.limites}</p>
      </section>

      <section className="seccion">
        <h2>Cómo se calcula cada indicador</h2>
        <div className="grilla g2" style={{ marginTop: 8 }}>
          <div className="tarjeta"><h3>Nivel estimado (0 a 3)</h3><p style={{ fontSize: 13.5 }}>Percentil local de la temperatura media diaria de noviembre a marzo: nivel 1 desde el percentil 90, 2 desde el 95, 3 desde el 99. Punto: centro poblado de la comuna. Versión {um.version}. {um.base} El valor diario es del modelo de pronóstico y los percentiles del reanálisis ERA5; puede haber sesgo entre ambos.</p></div>
          <div className="tarjeta"><h3>Calor acumulado y moderado</h3><p style={{ fontSize: 13.5 }}>Acumulado: grados de la máxima (día) y de la mínima (noche) sobre su percentil 90 en los últimos 3 días. Moderado: días seguidos con la media sobre la mediana del período cálido.</p></div>
          <div className="tarjeta"><h3>Pronóstico</h3><p style={{ fontSize: 13.5 }}>Hasta 15 días. Confianza alta hasta el día 2, media en los días 3 y 4, baja del 5 al 7 y muy baja desde el 8. Un nivel a menos de 1 °C de un corte se marca incierto.</p></div>
          <div className="tarjeta"><h3>Manzanas prioritarias</h3><p style={{ fontSize: 13.5 }}>{pri.descripcion} Versión {pri.version}. Sin porcentajes en manzanas con menos de 20 habitantes.</p></div>
          <div className="tarjeta"><h3>Muertes esperadas y urgencias</h3><p style={{ fontSize: 13.5 }}>{vig?.metodo} No corrige por envejecimiento ni tendencia. Urgencias: cada valor contra la mediana del mismo día de la semana en las 8 semanas previas; comuna del establecimiento; solo red pública.</p></div>
          <div className="tarjeta"><h3>Episodios de calor</h3><p style={{ fontSize: 13.5 }}>{ep.definicion}</p></div>
          {au && r && <div className="tarjeta"><h3>Módulo de la RM (AURA)</h3><p style={{ fontSize: 13.5 }}>{au.metodo} {au.regla_prioridad} Cobertura: {r.censo_urbanas_con_aura.toLocaleString("es-CL")} de {r.censo_urbanas_rm.toLocaleString("es-CL")} manzanas urbanas. AURA no publica licencia de reutilización: su equipo debe autorizar el uso antes de publicar esta capa.</p></div>}
          <div className="tarjeta"><h3>Catálogo de medidas</h3><p style={{ fontSize: 13.5 }}>{cat.estado} Versión {cat.version}.</p></div>
        </div>
      </section>

      <section className="seccion">
        <h2>Métodos de terceros</h2>
        <div className="tabla-caja" style={{ marginTop: 8 }}>
          <table><thead><tr><th>Método</th><th>Autoría</th><th>Cómo se usa</th></tr></thead>
            <tbody>{cf.metodos.map((m) => <tr key={m.metodo}><td>{m.metodo}</td><td>{m.autoria}</td><td>{m.uso} {m.no}</td></tr>)}</tbody></table>
        </div>
      </section>

      <section className="seccion">
        <h2>Pendiente</h2>
        <ul>
          <li><b>Curva de riesgo y muertes atribuibles:</b> requieren calibrar un modelo con datos chilenos.</li>
          <li><b>Umbrales fuera de la RM:</b> la serie 1991-2020 se descarga por etapas por el límite de la API gratuita.</li>
          <li><b>Cargas automáticas del DEIS</b> y respaldo de la DMC.</li>
        </ul>
        <p className="chico" style={{ marginTop: 8 }}>Construida con ayuda de inteligencia artificial (Claude, de Anthropic). Contacto para correcciones: {cf.contacto}</p>
      </section>
    </div>
  );
}
