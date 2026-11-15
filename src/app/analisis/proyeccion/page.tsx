import { Ayuda } from "@/componentes/Ayuda";
import { BarrasRango } from "@/componentes/Graficos";
import { Rob } from "@/componentes/Robustez";
import { baseAnalisis, edadProyeccion, proyeccionTerritorio, rankingPeligro } from "@/lib/analisis";
import { comunas, impactlabSemilla, proyeccionMensual, regiones } from "@/lib/datos";
import { fmtRango, TRAMOS, type Rango } from "@/lib/motor";
import { fechaHora, fechaLarga, num } from "@/lib/tiempo";
import { TOUR_PROYECCION } from "@/lib/tours";

export const dynamic = "force-dynamic";
const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const mesTxt = (ym: string) => `${MES[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`;
const d = (r: Rango) => (r[1] < 10 ? 1 : 0);

export default async function Proyeccion({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const b = baseAnalisis(), pr = proyeccionMensual(), il = impactlabSemilla();
  const conDatos = pr ? Object.keys(pr.regiones) : [];
  const reg = sp.region && conDatos.includes(sp.region) ? sp.region : conDatos.includes("13") ? "13" : conDatos[0] ?? "13";
  const com = sp.comuna && b?.ins.comunas[sp.comuna]?.reg === reg ? sp.comuna : "";
  const tramo = ["0", "1", "2", "3"].includes(sp.tramo ?? "") ? Number(sp.tramo) : -1;
  const orden = sp.orden === "tasa" ? "tasa" : "muertes";
  const tramos = [0, 1, 2, 3].map((i) => tramo < 0 || tramo === i);
  const nombreReg = Object.fromEntries(regiones().map((r) => [r.cod, r.nombre]));
  const nombreCom = Object.fromEntries(comunas().map((c) => [c.cod, c.nombre]));
  const edad = edadProyeccion();
  if (!b || !pr) return <div className="pagina"><h1>Proyección mensual de muertes esperadas por calor</h1><p className="aviso seccion">Aún no hay una corrida del pronóstico estacional (pipeline/p10_estacional.py).</p></div>;
  const pobBase = com ? b.ins.comunas[com].pob : b.ins.regiones[reg].pob;
  const meses = proyeccionTerritorio(reg, pobBase.map((x, i) => (tramos[i] ? x : 0)));
  const total: Rango = [meses.reduce((a, m) => a + m.rango[0], 0), meses.reduce((a, m) => a + m.rango[1], 0)];
  const ilReg = il?.regiones.find((r) => r.cod_region === reg);
  const ilMes = Object.fromEntries((il?.nacional_mensual ?? []).map((m) => [m.mes, m.muertes]));
  const ranking = rankingPeligro(tramos).filter((f) => !sp.solo || f.reg === reg).sort((x, y) => (orden === "tasa" ? y.tasa100k[1] - x.tasa100k[1] : y.muertes[1] - x.muertes[1]));
  const q = (extra: Record<string, string>) => `?${new URLSearchParams({ region: reg, ...(com ? { comuna: com } : {}), ...(tramo >= 0 ? { tramo: String(tramo) } : {}), ...(sp.solo ? { solo: "1" } : {}), orden, ...extra })}`;

  return (
    <div className="pagina">
      <div className="titulo-fila"><h1>Proyección mensual de muertes esperadas por calor</h1><span className="fila"><a className="boton sec" href="/analisis">Paneles de análisis</a><Ayuda pasos={TOUR_PROYECCION} /></span></div>
      <p className="aviso-fijo seccion" role="note"><b>Los pronósticos estacionales indican tendencias, no días puntuales.</b> Corrida del pronóstico: {fechaHora(pr.corrida)}.</p>
      {edad != null && edad > 10 && <p className="aviso mal" style={{ marginTop: 8 }} role="alert">Dato vencido: la última corrida del pronóstico tiene {Math.floor(edad)} días (plazo: 10).</p>}
      {pr.regiones_omitidas.length > 0 && <p className="aviso info" style={{ marginTop: 8 }}>Sin proyección todavía en {pr.regiones_omitidas.length} regiones, porque falta la serie histórica de su capital: {pr.regiones_omitidas.map((r) => nombreReg[r]).join(", ")}.</p>}

      <form method="get" className="filtros seccion" data-tour="pro-filtros">
        <div><label htmlFor="p-reg">Región</label><select id="p-reg" name="region" defaultValue={reg}>{conDatos.map((r) => <option key={r} value={r}>{nombreReg[r]}</option>)}</select></div>
        <div><label htmlFor="p-com">Comuna</label><select id="p-com" name="comuna" defaultValue={com}><option value="">Toda la región</option>{comunas().filter((c) => c.cod_region === reg).map((c) => <option key={c.cod} value={c.cod}>{c.nombre}</option>)}</select></div>
        <div><label htmlFor="p-tr">Edad</label><select id="p-tr" name="tramo" defaultValue={tramo < 0 ? "" : String(tramo)}><option value="">Todas</option>{TRAMOS.map((t, i) => <option key={t} value={i}>{t} años</option>)}</select></div>
        <button className="boton" type="submit">Aplicar</button>
      </form>

      <section className="seccion grilla dos-grafico">
        <div className="tarjeta" data-tour="pro-grafico">
          <h3>Muertes esperadas por mes en {com ? nombreCom[com] : `la Región ${nombreReg[reg]}`}{tramo >= 0 ? `, ${TRAMOS[tramo]} años` : ""}</h3>
          <BarrasRango unidad="muertes esperadas" filas={meses.map((m) => ({ t: mesTxt(m.ym) + (m.parcial ? " (resto)" : ""), bajo: m.rango[0], alto: m.rango[1], nota: `${num(m.dias, 1)} días sobre el umbral` }))} />
          <div className="tabla-caja" style={{ marginTop: 8 }}>
            <table>
              <thead><tr><th>Mes</th><th className="n">Muertes esperadas</th><th className="n">Días sobre el umbral</th><th className="n">Mes normal</th><th className="n">Anomalía pronosticada</th><th>Corrida</th></tr></thead>
              <tbody>{meses.map((m) => <tr key={m.ym}><td>{mesTxt(m.ym)}{m.parcial ? " (resto del mes)" : ""}</td><td className="n"><b>{fmtRango(m.rango, d(m.rango))}</b></td><td className="n">{num(m.dias, 1)}</td><td className="n">{num(m.normal, 1)}</td><td className="n">{m.anomalia >= 0 ? "+" : "−"}{num(Math.abs(m.anomalia), 1)} °C</td><td className="chico">{fechaLarga(pr.corrida.slice(0, 10))}</td></tr>)}
                <tr><td><b>Total del período</b></td><td className="n"><b>{fmtRango(total, d(total))}</b></td><td colSpan={4} /></tr></tbody>
            </table>
          </div>
        </div>
        <div className="tarjeta">
          <h3>Contraste: Climate Impact Lab</h3>
          {!il ? <p className="chico">Sin datos cargados.</p> : (
            <>
              <dl className="dl">
                <dt>Región {nombreReg[reg]}, octubre de 2026 a marzo de 2027</dt><dd>{ilReg ? num(ilReg.valores.oct_mar) : "sin dato"}</dd>
                <dt>Este panel, misma región, todas las edades</dt><dd>{(() => { const t = proyeccionTerritorio(reg, b.ins.regiones[reg].pob); const r: Rango = [t.reduce((a, m) => a + m.rango[0], 0), t.reduce((a, m) => a + m.rango[1], 0)]; return fmtRango(r, d(r)); })()}</dd>
              </dl>
              <table className="tabla-mini" style={{ marginTop: 8 }}><thead><tr><th>Mes</th><th className="n">Chile, Impact Lab</th></tr></thead>
                <tbody>{meses.map((m) => <tr key={m.ym}><td>{mesTxt(m.ym)}</td><td className="n">{ilMes[m.ym] ?? "sin dato"}</td></tr>)}</tbody></table>
              <p className="chico" style={{ marginTop: 8 }}>Versión {il.version} del {fechaLarga(il.fecha_version)}. El tracker publica el mes a mes solo para Chile y una cifra central sin rango; mide un cambio neto respecto de 1996-2025, no lo mismo que este panel.</p>
            </>
          )}
        </div>
      </section>

      <section className="seccion" data-tour="pro-ranking">
        <div className="titulo-fila"><h2>Lugares de mayor peligro: comunas por muertes esperadas</h2>
          <span className="fila"><a className="boton sec" href={q({ orden: orden === "tasa" ? "muertes" : "tasa" })}>Ordenar por {orden === "tasa" ? "muertes" : "tasa por 100 mil"}</a>
            <a className="boton sec" href={sp.solo ? q({}).replace("solo=1&", "").replace("&solo=1", "") : q({ solo: "1" })}>{sp.solo ? "Ver todo el país" : "Solo esta región"}</a>
            <a className="boton sec" href="/api/descargas/analisis-proyeccion">Descargar todo (CSV)</a></span></div>
        <div className="tabla-caja" style={{ marginTop: 8 }}>
          <table>
            <thead><tr><th>Comuna</th><th>Región</th><th>Mes de mayor riesgo</th><th className="n">Días sobre el umbral</th><th className="n">Cambio frente a un mes normal</th><th className="n">Muertes esperadas</th><th className="n">Por 100 mil</th><th className="n">75 años o más</th><th>¿En el 20 % superior?</th></tr></thead>
            <tbody>
              {ranking.slice(0, 20).map((f) => (
                <tr key={f.cod}><td><a href={`/comuna/${f.cod}`}>{f.nombre}</a></td><td className="chico">{f.region}</td><td>{f.mes ? mesTxt(f.mes) : "ninguno"}</td><td className="n">{num(f.dias, 1)}</td>
                  <td className="n">{f.cambio == null ? "sin dato" : `${f.cambio >= 0 ? "+" : "−"}${num(Math.abs(f.cambio), 1)} días`}</td><td className="n"><b>{fmtRango(f.muertes, d(f.muertes))}</b></td>
                  <td className="n">{fmtRango(f.tasa100k, 1)}</td><td className="n">{num(f.pob75)}</td><td><Rob clase={f.clase} /></td></tr>
              ))}
              {ranking.length === 0 && <tr><td colSpan={9} className="chico">Sin comunas con proyección.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="chico" style={{ marginTop: 6 }}>20 de {ranking.length} comunas{tramo >= 0 ? `, ${TRAMOS[tramo]} años` : ""}. Cada comuna usa el pronóstico de la capital de su región.</p>
      </section>

      <section className="seccion">
        <table className="tabla-mini supuestos" style={{ maxWidth: 980 }}>
          <thead><tr><th>Supuesto</th><th>Valor</th></tr></thead>
          <tbody>
            <tr><td>Temperaturas</td><td>{pr.modelo}. {pr.metodo}</td></tr>
            <tr><td>Rango</td><td>Percentil 10 de los miembros del ensamble con RR {b.p.rr.bajo.toLocaleString("es-CL")} a percentil 90 con RR {b.p.rr.alto.toLocaleString("es-CL")}</td></tr>
            <tr><td>Robustez</td><td>Comuna en el {Math.round(b.p.robustez.fraccion_superior * 100)} % superior de muertes esperadas (promedio del ensamble) con el RR bajo y con el alto</td></tr>
            <tr><td>Umbral y tasa base</td><td>Percentil {b.p.umbral.percentil} local de la máxima en la capital regional; {b.p.tasa_base.definicion.toLowerCase()}</td></tr>
            <tr><td>Cautela</td><td>El modelo estacional tiene una grilla de 36 km: en capitales costeras mezcla mar y tierra. Una anomalía de 2 °C o más desplaza casi todos los días sobre el umbral y abre mucho el rango. Las cifras son mayores que las del Climate Impact Lab porque miden cosas distintas: aquí, muertes atribuibles al calor sobre el umbral; allá, un cambio neto respecto de un año normal.</td></tr>
            <tr><td>Fuente</td><td>{pr.fuente}</td></tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
