import { baseRiesgo, climaComunas, configRiesgo, diagnosticos, fuentes, indiceHistoria, modelo, territorio } from "@/lib/datos";
import { fmt, temporadaTexto } from "@/lib/historia";
import { fechaLarga } from "@/lib/tiempo";

export const metadata = { title: "Metodología y datos · Calor y mortalidad en Chile" };
const REPO = "https://github.com/nfbalbontin/plataforma-calor";
const pct = (rr: number) => `${rr >= 1 ? "+" : "−"}${fmt(Math.abs(rr - 1) * 100, 1)} %`;

/** De dónde sale cada cifra y a quién pertenece cada fuente. */
export default function Metodologia() {
  const m = modelo(), dx = diagnosticos(), terr = territorio(), cfg = configRiesgo(), indice = indiceHistoria();
  const hosp = Object.values(terr.hospitales), ref = hosp.filter((h) => h.area.length > 0);
  const dist = Object.values(terr.comunas).map((c) => c.dist_km).sort((a, b) => a - b);
  const propias = Object.keys(climaComunas().comunas).length;
  return (
    <div className="pagina metodo">
      <h1>Metodología y datos</h1>
      <p className="bajada">De dónde sale cada cifra, qué se hizo con cada fuente y qué no se puede afirmar.</p>

      <section className="seccion" data-tour="fuentes">
        <h2>Fuentes</h2>
        <div className="tabla-caja" style={{ marginTop: 10 }}><table>
          <thead><tr><th>Fuente</th><th>Institución</th><th>Qué se usa</th><th>Descarga</th><th>Condiciones de uso</th></tr></thead>
          <tbody>{fuentes().fuentes.map((f) => <tr key={f.id}><td><a href={f.enlace} target="_blank" rel="noreferrer"><b>{f.nombre}</b></a></td><td>{f.institucion}</td><td>{f.que}</td><td>{f.descarga}</td><td>{f.condiciones}</td></tr>)}</tbody>
        </table></div>
      </section>

      <section className="seccion">
        <h2>Transformaciones</h2>
        <p>Los archivos originales no se suben. De cada fuente se guarda una tabla depurada con lo mínimo.</p>
        {fuentes().fuentes.map((f) => <details key={f.id} className="tarjeta" style={{ marginTop: 8 }}><summary><b>{f.nombre}</b></summary><p>{f.transformacion}</p></details>)}
      </section>

      <section className="seccion">
        <h2>Diagnósticos relacionados con el calor</h2>
        <p>El indicador principal son las muertes por todas las causas: los certificados casi nunca anotan el calor. Los niveles se muestran como desglose. La insuficiencia cardíaca (I50) queda fuera a propósito.</p>
        <div className="tabla-caja" style={{ marginTop: 10 }}><table>
          <thead><tr><th>Nivel</th><th>Diagnósticos</th><th>Códigos CIE-10</th><th>Evidencia</th></tr></thead>
          <tbody>{dx.niveles.map((n) => <tr key={n.nivel}><td><b>{n.nivel}. {n.nombre}</b></td><td>{n.diagnosticos}</td><td>{n.codigos.join(", ")}</td><td>{n.evidencia}</td></tr>)}</tbody>
        </table></div>
        <p className="chico" style={{ marginTop: 6 }}>Se aplica a la causa básica y a la causa externa de cada defunción, desde 1997 (CIE-10). Urgencias no trae diagnósticos: allí solo hay grupos amplios.</p>
      </section>

      <section className="seccion">
        <h2>Territorio: comuna, Servicio de Salud y hospital</h2>
        <p>{terr.regla}</p>
        <div className="grilla g4" style={{ marginTop: 10 }}>
          <div className="tarjeta kpi"><div className="valor">{Object.keys(terr.comunas).length}</div><div className="rot">comunas con hospital de referencia</div></div>
          <div className="tarjeta kpi"><div className="valor">{Object.keys(terr.servicios).length}</div><div className="rot">Servicios de Salud</div></div>
          <div className="tarjeta kpi"><div className="valor">{ref.length}</div><div className="rot">hospitales de referencia, de {hosp.length} con urgencia hospitalaria</div></div>
          <div className="tarjeta kpi"><div className="valor">{fmt(dist[Math.floor(dist.length / 2)], 1)} km</div><div className="rot">distancia mediana al hospital, en línea recta</div></div>
        </div>
        <p>Cada manzana hereda el hospital de su comuna. Las defunciones traen comuna de residencia, no hospital: por eso en cada hospital se muestran las muertes de residentes de su área. Si se consigue el mapa de derivación oficial de un Servicio, reemplaza a la regla de cercanía (archivo <code>config/derivacion.json</code>).</p>
      </section>

      {m && <section className="seccion" data-tour="modelo">
        <h2>Modelo estadístico</h2>
        <p>Un solo modelo convierte grados de temperatura en muertes y hospitalizaciones. Compara, dentro de cada verano, los días más calurosos con los días templados del mismo lugar, y mide cuánto suben los casos.</p>
        <div className="formula">Muertes potenciales = Σ<sub>d</sub> B<sub>d</sub> · (RR(T<sub>d</sub>) − 1)</div>
        <p>B son las muertes habituales del lugar en un día de esa época; RR es el riesgo relativo que la curva asigna a la temperatura T. Con la temperatura observada entrega las muertes atribuibles de Historia; con la pronosticada, las muertes potenciales del mapa de riesgo.</p>
        <div className="tabla-caja" style={{ marginTop: 10 }}><table><tbody>
          <tr><td><b>Qué se explica</b></td><td>Conteos diarios por región: muertes por todas las causas y por grupo de edad, muertes por nivel de diagnóstico, atenciones de urgencia y hospitalizaciones desde urgencia.</td></tr>
          <tr><td><b>Con qué</b></td><td>Promedio de la temperatura máxima del día y de los 3 días anteriores, en la capital regional.</td></tr>
          <tr><td><b>Método</b></td><td>Regresión de Poisson con sobredispersión. La curva es un spline cúbico natural con nudos en los percentiles 10, 50, 75, 90 y 97 de la temperatura local.</td></tr>
          <tr><td><b>Controles</b></td><td>Una curva estacional por temporada (que también recoge la tendencia de largo plazo), día de la semana y feriados.</td></tr>
          <tr><td><b>Período</b></td><td>Temporada cálida, 1 de noviembre a 31 de marzo, veranos {temporadaTexto(m.temporadas[0])} a {temporadaTexto(m.temporadas[1])}.</td></tr>
          <tr><td><b>Agrupación</b></td><td>Una curva por región, acercada a la curva nacional según cuánta información tiene. Las comunas usan la curva de su región. El nivel 1 tiene tan pocos casos que usa una sola curva nacional.</td></tr>
          <tr><td><b>Umbral de calor</b></td><td>La temperatura de menor riesgo entre los percentiles 50 y 95 de cada región; bajo ella el riesgo relativo es 1.</td></tr>
          <tr><td><b>Rango</b></td><td>Intervalo de 95 %: se sortean {indice?.modelo ? 400 : 400} veces los coeficientes de cada curva y se recalcula. Las regiones se sortean por separado.</td></tr>
          <tr><td><b>Grupos de edad y sexo</b></td><td>Cada grupo de edad tiene su curva; hombres y mujeres usan la de su grupo de edad. Por eso los grupos no suman exactamente el total.</td></tr>
        </tbody></table></div>

        <h3 style={{ marginTop: 22 }}>Validación con veranos reservados</h3>
        <p>El modelo se ajustó sin los veranos {m.validacion.sin_temporadas.join(", ")} y se comparó lo que predice con lo que ocurrió en ellos: predijo {fmt(m.validacion.total_sobre_umbral.exceso_predicho)} muertes en exceso (entre {fmt(m.validacion.total_sobre_umbral.predicho_lo)} y {fmt(m.validacion.total_sobre_umbral.predicho_hi)}) y se observaron {fmt(m.validacion.total_sobre_umbral.exceso_observado)}.</p>
        <div className="tabla-caja" style={{ marginTop: 10 }}><table>
          <thead><tr><th>Temperatura del día</th><th className="n">Días-región</th><th className="n">Aumento observado (rango)</th><th className="n">Aumento predicho</th><th className="n">Exceso observado</th><th className="n">Exceso predicho</th></tr></thead>
          <tbody>{m.validacion.bandas.slice(1).map((b) => <tr key={b.banda}><td>{b.banda}</td><td className="n">{fmt(b.dias_region)}</td>
            <td className="n">{b.razon_observada == null ? "sin dato" : pct(b.razon_observada)}{b.razon_observada_ic ? ` (${pct(b.razon_observada_ic[0])} a ${pct(b.razon_observada_ic[1])})` : ""}</td>
            <td className="n">{b.razon_predicha == null ? "sin dato" : pct(b.razon_predicha)}</td><td className="n">{fmt(b.exceso_observado)}</td><td className="n">{fmt(b.exceso_predicho)}</td></tr>)}</tbody>
        </table></div>
        <p className="chico" style={{ marginTop: 6 }}>Sobre el percentil 99 el modelo predice menos de lo observado: en los días más extremos puede quedarse corto.</p>

        <h3 style={{ marginTop: 22 }}>Comparación con el estudio UC</h3>
        <div className="tabla-caja" style={{ marginTop: 10 }}><table>
          <thead><tr><th>Año</th><th className="n">Estudio UC, olas de calor</th><th className="n">Este modelo, días de ola de calor (rango)</th><th className="n">Este modelo, todo el calor del año (rango)</th></tr></thead>
          <tbody>{Object.entries(m.uc).map(([a, u]) => <tr key={a}><td>{a}</td><td className="n">{fmt(u.estudio_uc)}</td><td className="n">{fmt(u.en_olas[0])} ({fmt(Math.max(0, u.en_olas[1]))} a {fmt(u.en_olas[2])})</td><td className="n">{fmt(u.ano_completo_calido[0])} ({fmt(Math.max(0, u.ano_completo_calido[1]))} a {fmt(u.ano_completo_calido[2])})</td></tr>)}</tbody>
        </table></div>
        <p className="chico" style={{ marginTop: 6 }}>Mismo orden de magnitud. Las definiciones de ola de calor no son iguales, así que las cifras no tienen por qué coincidir.</p>

        <h3 style={{ marginTop: 22 }}>Pruebas de sensibilidad</h3>
        <p>Aumento de muertes en un día del percentil 99 de temperatura respecto de uno del percentil 75, combinando las 16 regiones.</p>
        <div className="tabla-caja" style={{ marginTop: 10 }}><table>
          <thead><tr><th>Variante</th><th className="n">Aumento (rango)</th></tr></thead>
          <tbody>{Object.entries(m.sensibilidad).map(([k, v]) => <tr key={k}><td>{k}</td><td className="n">{pct(v[0])} ({pct(v[1])} a {pct(v[2])})</td></tr>)}</tbody>
        </table></div>
        <p className="chico" style={{ marginTop: 6 }}>Con rezagos más largos el efecto baja: parte de las muertes de los días de calor son muertes adelantadas en pocos días.</p>
      </section>}

      <section className="seccion">
        <h2>Mapa de riesgo</h2>
        <ul>
          <li><b>Peligro:</b> temperatura pronosticada frente a la historia local. {propias} comunas comparan con su propia serie; el resto usa la capital de su región.</li>
          <li><b>Daño esperado:</b> la fórmula del modelo con las muertes habituales de cada comuna por mes ({baseRiesgo().temporadas.map(temporadaTexto).join(", ")}).</li>
          <li><b>Niveles:</b> {cfg.regla}</li>
          <li><b>Manzana:</b> {cfg.manzana}</li>
          <li><b>Chile:</b> el rango combina los errores de las regiones en cuadratura, porque sus curvas son independientes.</li>
        </ul>
      </section>

      <section className="seccion" data-tour="limites">
        <h2>Límites</h2>
        <ul>
          <li><b>Muertes atribuibles:</b> son una estimación estadística con rango, no un listado de personas ni un conteo de certificados por calor.</li>
          <li><b>Temperatura:</b> es un valor de un modelo meteorológico en la capital regional, no una medición en cada barrio. Cuando termine la descarga por comuna, cada comuna usará la suya.</li>
          <li><b>Defunciones por hospital:</b> el archivo no dice en qué hospital ocurrió cada muerte.</li>
          <li><b>Urgencias:</b> solo distingue grupos amplios de causa y dos grupos de edad.</li>
          <li><b>Egresos hospitalarios:</b> no se usan, porque los datos abiertos no traen el día.</li>
          <li><b>Manzanas:</b> las diferencias entre manzanas reflejan población vulnerable, no temperatura (salvo con la capa AURA en la Región Metropolitana).</li>
          <li><b>Pronóstico:</b> después de 7 días es orientativo; el estacional es solo tendencia.</li>
          <li><b>Sector privado:</b> las clínicas no tienen territorio asignado.</li>
          <li><b>Cifras provisorias:</b> las defunciones de 2024 a 2026 pueden cambiar.</li>
        </ul>
      </section>

      <section className="seccion">
        <h2>Autoría y código</h2>
        <p>Nicolás Balbontín. Código y programas de depuración: <a href={REPO} target="_blank" rel="noreferrer">{REPO.replace("https://", "")}</a>. Datos históricos hasta el {indice ? fechaLarga(indice.defunciones_hasta) : "sin dato"}; modelo {m?.version}, ajustado el {m ? fechaLarga(m.ajustado) : "sin dato"}.</p>
      </section>
    </div>
  );
}
