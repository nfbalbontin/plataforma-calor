import { notFound } from "next/navigation";
import { Ayuda } from "@/componentes/Ayuda";
import { AvisoFuentes, Cifra, Kpi, NivelChip, Puntos } from "@/componentes/Basicos";
import { EstadoPill } from "@/componentes/Explorador";
import { TOUR_COMUNA } from "@/lib/tours";
import { Chispa, LineaTemperatura, type PuntoTemp } from "@/componentes/Graficos";
import { alertas, alertasDeComuna, diasComuna, semaforo, vigentes } from "@/lib/consultas";
import { aura, comuna, comunas, dependencia, medidas, prioridadDe, umbrales } from "@/lib/datos";
import { conProblema, estadoFuentes } from "@/lib/fuentes";
import { mesesComuna, senalComuna } from "@/lib/impacto";
import { corteCodigoRojo, TEXTO_NIVEL, type Nivel } from "@/lib/niveles";
import { fechaCorta, fechaHora, fechaLarga, num } from "@/lib/tiempo";

export const revalidate = 1800;
export function generateStaticParams() { return []; }

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export default async function FichaComuna({ params }: { params: Promise<{ cod: string }> }) {
  const { cod } = await params;
  const c = comuna(cod);
  if (!c) notFound();
  const um = umbrales();
  const u = um.comunas[cod] ?? null;
  const [dias, sem, todas, estados] = await Promise.all([diasComuna(cod, 14), semaforo(), alertas(), estadoFuentes()]);
  const pron = sem.porComuna[cod] ?? [];
  const hoy = pron[0] ?? null;
  const ayer = dias[dias.length - 1] ?? null;
  const oficiales = alertasDeComuna(vigentes(todas), cod, c.cod_region);
  const puntos: PuntoTemp[] = [...dias.map((d) => ({ fecha: d.fecha, tmean: d.tmean, tmax: d.tmax, tmin: d.tmin, tipo: "observado" as const })),
    ...pron.map((p) => ({ fecha: p.fecha, tmean: p.tmean, tmax: p.tmax, tmin: p.tmin, tipo: "pronóstico" as const }))];
  const esRM = c.cod_region === um.codigo_rojo.aplica_region;
  const maxTmax = pron.reduce<{ v: number; f: string } | null>((m, p) => (p.tmax != null && (!m || p.tmax > m.v) ? { v: p.tmax, f: p.fecha } : m), null);
  const corteCR = corteCodigoRojo(maxTmax?.v, um.codigo_rojo.cortes_tmax);
  const senal = senalComuna(cod);
  const meses = mesesComuna(cod, 13);
  const ultMes = meses[meses.length - 1] ?? null;
  const dep = dependencia();
  const depCom = dep?.comunas[cod] ?? null;
  const cat = medidas();
  const nivelMedidas = hoy?.nivel ?? 0;
  const tOM = { fuente: "Open-Meteo (modelo en grilla, no medición)", enlace: "https://open-meteo.com/", fecha: ayer?.actualizado ? fechaHora(ayer.actualizado) : null };
  const tCenso = { fuente: "INE, Censo 2024 (CC BY-SA 4.0)", enlace: "https://censo2024.ine.gob.cl/resultados/", fecha: "Censo 2024", tipo: "registro" as const };
  const pob65 = c.pob.e65_74 + c.pob.e75_84 + c.pob.e85_mas;
  const au = aura();
  const auCom = au?.comunas[cod] ?? null;
  const pri = prioridadDe(c);
  const csvManzanas = auCom ? `/descargas/manzanas_aura/${c.cod}.csv` : `/descargas/manzanas/${c.cod}.csv`;
  const discrepa = hoy?.nivel != null && ((hoy.nivel >= 2 && oficiales.length === 0) || (hoy.nivel === 0 && oficiales.length > 0));

  return (
    <div className="pagina">
      <div className="titulo-fila">
        <h1>{c.nombre} · Región {c.region}</h1>
        <span className="fila"><a className="boton sec" href={`/mapa?comuna=${c.cod}`}>Ver en el mapa</a><a className="boton sec" href={csvManzanas} download>Manzanas (CSV)</a><Ayuda pasos={TOUR_COMUNA} /></span>
      </div>

      <section className="seccion grilla g2" data-tour="nivel">
        <div className="tarjeta">
          <div className="fila entre"><h3>Nivel estimado y alerta propia</h3><EstadoPill e={hoy?.estado} /></div>
          <div className="fila" style={{ marginTop: 10 }}>
            <NivelChip nivel={hoy?.nivel ?? null} incierto={hoy?.incierto} grande />
            <div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{hoy?.nivel != null ? `Nivel ${hoy.nivel} · ${TEXTO_NIVEL[hoy.nivel as Nivel]}` : "Sin umbral local todavía"}</div>
              <div className="chico">{hoy ? `Hoy, ${fechaLarga(hoy.fecha)}: media prevista ${num(hoy.tmean, 1)} °C` : "Sin ingesta de clima guardada"}{hoy?.incierto ? " · incierto: a menos de 1 °C de un corte" : ""}</div>
            </div>
          </div>
          {!u && <p className="aviso info" style={{ marginTop: 10 }}>La serie histórica de esta comuna aún no se descarga, así que no hay percentiles para calcular el nivel. Se muestra la temperatura.</p>}
          {u && <p className="chico" style={{ marginTop: 10 }}>Cortes locales de temperatura media: nivel 1 desde {num(u.p90, 1)} °C, nivel 2 desde {num(u.p95, 1)} °C, nivel 3 desde {num(u.p99, 1)} °C. Versión {um.version}; temporadas {u.temporadas}.</p>}
        </div>
        <div className="tarjeta">
          <div className="fila entre"><h3>Alerta oficial vigente</h3>{discrepa && <span className="pildora roja">Discrepancia</span>}</div>
          {oficiales.length === 0 ? (
            <><div style={{ fontSize: 20, fontWeight: 800, marginTop: 10 }}>Sin alerta oficial ingresada</div>
              <p className="chico">Las alertas de Senapred y la DMC se ingresan a mano; revisa siempre la fuente oficial.</p></>
          ) : oficiales.map((a) => (
            <div key={a.id} style={{ marginTop: 10 }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{a.tipo}</div>
              <div className="chico">{a.organismo} · {a.territorio_nombre} · desde {fechaHora(a.inicio)} hasta {fechaHora(a.termino)} · <a href={a.enlace} target="_blank" rel="noreferrer">ver original</a></div>
            </div>
          ))}
          {esRM && <p className="chico" style={{ marginTop: 10 }}><b>Código Rojo (solo RM):</b> {maxTmax ? <>la máxima prevista más alta es {num(maxTmax.v, 1)} °C ({fechaCorta(maxTmax.f)}); {corteCR === 0 ? `no alcanza el primer corte (${um.codigo_rojo.cortes_tmax[0]} °C)` : `alcanza el corte de ${um.codigo_rojo.cortes_tmax[corteCR - 1]} °C`}.</> : "sin pronóstico."} {um.codigo_rojo.nota}</p>}
        </div>
      </section>

      <section className="seccion" data-tour="pronostico">
        <h2>Pronóstico: hoy y los próximos {Math.max(pron.length - 1, 0)} días</h2>
        {pron.length === 0 ? <p className="aviso">Sin pronóstico guardado.</p> : (
          <div className="dias" style={{ gridTemplateColumns: `repeat(${pron.length}, minmax(112px, 1fr))` }}>
            {pron.map((p, i) => (
              <div key={p.fecha} className={`dia n${p.nivel ?? "x"}`}>
                <div className="chico">{i === 0 ? "Hoy" : fechaCorta(p.fecha)}</div>
                <div className="fila" style={{ margin: "6px 0" }}><NivelChip nivel={p.nivel} incierto={p.incierto} /><span className="t">{num(p.tmax, 0)}°</span><span className="chico">máx.</span></div>
                <div className="chico">media {num(p.tmean, 1)}° · mín. {num(p.tmin, 0)}°</div>
                <div className="chico"><Puntos confianza={p.confianza} /> Confianza {p.confianza}{p.incierto ? " · nivel incierto" : ""}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="seccion">
        <h2>Temperatura observada y pronosticada frente a los cortes locales</h2>
        <AvisoFuentes fuentes={conProblema(estados, ["open-meteo"])} />
        <div className="tarjeta"><LineaTemperatura puntos={puntos} umbral={u} /></div>
        <div className="grilla g4" style={{ marginTop: 14 }}>
          <Kpi rotulo={`Media de ayer${ayer ? ` (${fechaCorta(ayer.fecha)})` : ""}`}><Cifra valor={num(ayer?.tmean, 1)} unidad="°C" traza={{ ...tOM, tipo: "estimación", metodo: "Temperatura media diaria del modelo en el centro poblado de la comuna." }} /></Kpi>
          <Kpi rotulo="Máxima y mínima de ayer"><Cifra valor={`${num(ayer?.tmax, 1)} / ${num(ayer?.tmin, 1)}`} unidad="°C" traza={{ ...tOM, tipo: "estimación", metodo: "Máxima y mínima diarias del modelo en el centro poblado de la comuna." }} /></Kpi>
          <Kpi rotulo="Calor acumulado en 3 días: de día / de noche"><Cifra valor={u ? `${num(ayer?.acum_dia, 1)} / ${num(ayer?.acum_noche, 1)}` : "sin umbral"} unidad="°C" traza={{ ...tOM, tipo: "estimación", metodo: "Suma de los grados de la máxima (día) y de la mínima (noche) sobre su percentil 90 local en los últimos 3 días. Elaboración propia." }} /></Kpi>
          <Kpi rotulo="Días seguidos de calor moderado"><Cifra valor={u ? num(ayer?.dias_moderado) : "sin umbral"} traza={{ ...tOM, tipo: "estimación", metodo: "Días consecutivos con la media sobre la mediana del período cálido. Cuenta desde los días guardados en la plataforma." }} /></Kpi>
        </div>
      </section>

      <section className="seccion" data-tour="impacto">
        <h2>Defunciones del último mes y urgencias frente a lo habitual</h2>
        {!senal && !ultMes ? <p className="aviso info">Sin datos del DEIS para esta comuna.</p> : (
          <>
            <AvisoFuentes fuentes={conProblema(estados, ["deis-defunciones", "deis-urgencias"])} />
            <div className="grilla g4" style={{ marginTop: 10 }}>
              {ultMes && <Kpi rotulo={`Defunciones de residentes en ${MESES[ultMes.m - 1]} de ${ultMes.a}`}>
                <Cifra valor={num(ultMes.def_total)} traza={{ fuente: "DEIS, Ministerio de Salud", enlace: "https://deis.minsal.cl/", fecha: `${MESES[ultMes.m - 1]} de ${ultMes.a}${ultMes.a >= 2024 ? " (cifra preliminar)" : ""}`, tipo: "registro", metodo: "Defunciones por comuna de residencia, último mes completo." }} />
              </Kpi>}
              {ultMes && <Kpi rotulo="Lo habitual para ese mes">
                <Cifra valor={num(ultMes.def_esp)} traza={{ fuente: "Elaboración propia a partir del DEIS", tipo: "estimación", metodo: "Mediana del mismo mes en 2015-2019 y desde 2023, sin el año evaluado. No corrige por envejecimiento ni tendencia." }} />
              </Kpi>}
              {senal && <Kpi rotulo={`Urgencias de 65 años o más (${fechaCorta(senal.fecha)})`}>
                <Cifra valor={senal.m65.valor == null ? "sin dato" : num(senal.m65.valor)} traza={{ fuente: "DEIS, atenciones de urgencia", enlace: "https://deis.minsal.cl/", fecha: fechaLarga(senal.fecha), tipo: "registro", metodo: "Atenciones del día en los establecimientos de la comuna (red pública). La comuna es la del establecimiento, no la de residencia." }} />
                <div className="chico">{senal.m65.senal.estado}{senal.m65.senal.razon ? ` · ${num(senal.m65.senal.razon * 100)} % de lo habitual (${num(senal.m65.habitual, 0)})` : ""}</div>
              </Kpi>}
              {senal && <Kpi rotulo="Tendencia de 28 días, 65 años o más">
                <Chispa valores={senal.serie65} base={1} titulo="Atenciones de 65 años o más como proporción de lo habitual, últimos 28 días" />
                <div className="chico">Línea punteada: lo habitual</div>
              </Kpi>}
            </div>
            {senal && (
              <div className="tabla-caja" style={{ marginTop: 14 }}>
                <table>
                  <thead><tr><th>Señal de urgencias · {fechaLarga(senal.fecha)}</th><th className="n">Atenciones</th><th className="n">Habitual</th><th>Estado</th></tr></thead>
                  <tbody>
                    {([["Total", senal.total], ["65 años o más", senal.m65], ["Causas circulatorias", senal.circ], ["Causas respiratorias", senal.resp]] as const).map(([n, i]) => (
                      <tr key={n}><td>{n}</td><td className="n">{i.valor == null ? "sin dato" : num(i.valor)}</td><td className="n">{num(i.habitual, 0)}</td><td>{i.senal.estado}{i.senal.razon ? ` (${num(i.senal.razon * 100)} %)` : ""}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!senal && <p className="aviso info" style={{ marginTop: 10 }}>Urgencias: sin dato. Ningún establecimiento de urgencia de la red pública informa desde esta comuna.</p>}
            {senal && <p className="chico" style={{ marginTop: 6 }}>Habitual = mediana del mismo día de la semana en las 8 semanas previas. Informaron {num(senal.n_est)} de {num(senal.n_est_hab)} establecimientos habituales{senal.parcial ? "; día con informe parcial" : ""}. Si ningún establecimiento informó se muestra «sin dato», no cero.</p>}
          </>
        )}
      </section>

      <section className="seccion" data-tour="vulnerable">
        <h2>Población mayor y manzanas prioritarias</h2>
        <div className="grilla g4">
          <Kpi rotulo="Población total"><Cifra valor={num(c.pob.total)} traza={{ ...tCenso, metodo: "Población censada, ambos sexos." }} /></Kpi>
          <Kpi rotulo="65 años o más"><Cifra valor={num(pob65)} traza={{ ...tCenso, metodo: "Suma de los grupos quinquenales desde 65 años." }} /><div className="chico">65-74: {num(c.pob.e65_74)} · 75-84: {num(c.pob.e75_84)} · 85+: {num(c.pob.e85_mas)}</div></Kpi>
          <Kpi rotulo={`Personas de 60+ en ${num(pri.n_alta)} manzanas de prioridad alta${pri.conCalor ? " (mayores y calor)" : ""}`}><Cifra valor={num(pri.mayores_alta)} traza={{ fuente: pri.conCalor ? "Elaboración propia a partir de INE, Censo 2024, y AURA (2026)" : "Elaboración propia a partir de INE, Censo 2024", tipo: "estimación", fecha: "Censo 2024", metodo: pri.conCalor ? "Manzanas que están a la vez en el quintil superior de personas de 60 años o más y en el quintil superior de temperatura de verano de día de AURA, dentro de la comuna (supuesto S5)." : "Suma de personas de 60 años o más en las manzanas del quintil superior de la comuna (supuesto S5)." }} /></Kpi>
          <Kpi rotulo="Hogares compuestos solo de personas mayores"><Cifra valor={num(c.hogares_solo_mayores)} traza={{ ...tCenso, metodo: "Hogares en que todas las personas tienen 60 años o más, sumados desde las manzanas." }} /></Kpi>
        </div>
      </section>

      <section className="seccion">
        <h2>Personas dependientes por centro de atención primaria</h2>
        {!depCom ? <p className="aviso info">Ningún centro de atención primaria de esta comuna informa estos códigos en el último corte del REM.</p> : (
          <>
            <AvisoFuentes fuentes={conProblema(estados, ["deis-rem"])} />
            <div className="tabla-caja">
              <table>
                <thead><tr><th>Centro</th><th className="n">Dependencia severa en domicilio</th><th className="n">Oxígeno dependientes</th><th className="n">Asistencia ventilatoria</th><th className="n">Mayores con dependencia leve a total</th></tr></thead>
                <tbody>
                  {depCom.centros.map((x) => (
                    <tr key={x.id}><td>{x.nombre}</td><td className="n">{num(x.dep_severa)}</td><td className="n">{num(x.oxigeno)}</td><td className="n">{num(x.ventilacion)}</td>
                      <td className="n">{num((x.pm_dep_leve ?? 0) + (x.pm_dep_moderada ?? 0) + (x.pm_dep_grave ?? 0) + (x.pm_dep_total ?? 0))}</td></tr>
                  ))}
                  <tr><td><b>Total comuna</b></td><td className="n"><b>{num(depCom.dep_severa)}</b></td><td className="n"><b>{num(depCom.oxigeno)}</b></td><td className="n" /><td className="n"><b>{num(depCom.pm_dependientes)}</b></td></tr>
                </tbody>
              </table>
            </div>
            <p className="chico" style={{ marginTop: 6 }}>Registro del DEIS, REM Serie P (hojas P3 y P5), corte {dep?.corte}. {dep?.nota}</p>
          </>
        )}
      </section>

      <section className="seccion">
        <h2>Medidas para el nivel {nivelMedidas}</h2>
        <div className="tabla-caja">
          <table>
            <thead><tr><th>Medida</th><th>Responsable</th><th>Plazo</th><th>Respaldo</th></tr></thead>
            <tbody>{(cat.niveles[String(nivelMedidas)] ?? []).map((m, i) => <tr key={i}><td>{m.medida}</td><td>{m.responsable}</td><td>{m.plazo}</td><td className="chico">{cat.referencias[m.respaldo]?.cita ?? m.respaldo}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="chico" style={{ marginTop: 6 }}><a href="/panel#medidas">Ver el catálogo completo por nivel</a> · versión {cat.version}</p>
      </section>
      {auCom && au && (
        <section className="seccion">
          <h2>Temperatura de verano por manzana (AURA)</h2>
          <div className="grilla g4">
            <Kpi rotulo="Promedio de verano de día en la comuna"><Cifra valor={num(auCom.temp_dia_prom, 1)} unidad="°C" traza={{ fuente: au.cita, enlace: "https://auramodel.cl/plataforma", fecha: `extracción del ${au.extraccion}`, tipo: "estimación", metodo: "Promedio comunal publicado por AURA para el clima presente; se muestra sin modificar." }} /></Kpi>
            <Kpi rotulo="Promedio de verano de noche en la comuna"><Cifra valor={num(auCom.temp_noche_prom, 1)} unidad="°C" traza={{ fuente: au.cita, enlace: "https://auramodel.cl/plataforma", fecha: `extracción del ${au.extraccion}`, tipo: "estimación", metodo: "Promedio comunal publicado por AURA para el clima presente; se muestra sin modificar." }} /></Kpi>
            <Kpi rotulo={`Manzanas urbanas con dato de AURA (de ${num(auCom.n_urbanas)})`}><Cifra valor={`${num(auCom.cobertura * 100)} %`} traza={{ fuente: "Elaboración propia a partir de AURA (2026) e INE, Censo 2024", tipo: "estimación", metodo: au.metodo }} /></Kpi>
          </div>
          <p className="chico" style={{ marginTop: 8 }}>{au.supuesto_s7} {auCom.aplica_prioridad ? au.regla_prioridad : "En esta comuna la cobertura de AURA es baja y la prioridad usa solo la regla demográfica."} <a href={`/mapa?comuna=${c.cod}`}>Ver la capa de temperatura en el mapa</a></p>
        </section>
      )}
      <p className="chico seccion">Otras comunas de la región: {comunas().filter((x) => x.cod_region === c.cod_region && x.cod !== c.cod).slice(0, 60).map((x, i) => <span key={x.cod}>{i ? " · " : ""}<a href={`/comuna/${x.cod}`}>{x.nombre}</a></span>)}</p>
    </div>
  );
}
