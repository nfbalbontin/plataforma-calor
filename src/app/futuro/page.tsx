import { Ayuda } from "@/componentes/Ayuda";
import { AvisoFuentes, Cifra, NivelChip } from "@/componentes/Basicos";
import { BarraNiveles } from "@/componentes/Explorador";
import { BarrasH } from "@/componentes/Graficos";
import { agregar } from "@/lib/alerta";
import type { FilaImpactLab } from "@/lib/cargas";
import { cargaVigente, semaforo } from "@/lib/consultas";
import { aura, comunas, configAlerta, impactlabSemilla, modulo, regiones } from "@/lib/datos";
import { conProblema, estadoFuentes } from "@/lib/fuentes";
import { confianza } from "@/lib/niveles";
import { fechaCorta, fechaLarga, num } from "@/lib/tiempo";
import { TOUR_FUTURO } from "@/lib/tours";

export const revalidate = 1800;

export default async function Futuro() {
  const [sem, estados, carga] = await Promise.all([semaforo(), estadoFuentes(), cargaVigente("impactlab")]);
  const il = impactlabSemilla(), au = aura(), cfg = configAlerta().territorio;
  const cs = comunas();
  const nombreReg = Object.fromEntries(regiones().map((r) => [r.cod, r.nombre]));
  const p65 = (c: (typeof cs)[number]) => c.pob.e65_74 + c.pob.e75_84 + c.pob.e85_mas;
  const nivelDe = (lista: typeof cs, i: number) => agregar(lista.map((c) => ({ valor: sem.porComuna[c.cod]?.[i]?.nivel, peso: p65(c) })), cfg.fraccion_poblacion, cfg.cobertura_minima);
  const dist = (lista: typeof cs, i: number) => { const n = [0, 0, 0, 0]; let sin = 0; for (const c of lista) { const v = sem.porComuna[c.cod]?.[i]?.nivel; if (v == null) sin++; else n[v]++; } return { n, sin }; };
  const mensual = carga?.contenido ? (JSON.parse(carga.contenido) as FilaImpactLab[]) : null;
  const meses = mensual ? [...new Set(mensual.map((m) => m.mes))].sort() : [];
  const trazaIL = { fuente: "Climate Impact Lab, El Niño Heat Mortality Tracker", enlace: "https://impactlab.org/el-nino-heat-mortality-tracker/", tipo: "proyección" as const };
  const auCom = au ? cs.filter((c) => au.comunas[c.cod]?.delta_2050_dia != null).sort((a, b) => au.comunas[b.cod].delta_2050_dia! - au.comunas[a.cod].delta_2050_dia!) : [];

  return (
    <div className="pagina">
      <div className="titulo-fila"><h1>Pronóstico de 15 días, temporada y clima al 2050</h1><Ayuda pasos={TOUR_FUTURO} /></div>

      <section className="seccion" data-tour="dias">
        <h2>Nivel pronosticado por región, hoy y los próximos {Math.max(sem.fechas.length - 1, 0)} días</h2>
        <AvisoFuentes fuentes={conProblema(estados, ["open-meteo"])} />
        {sem.fechas.length === 0 ? <p className="aviso" style={{ marginTop: 8 }}>Sin pronóstico guardado.</p> : (
          <div className="tabla-caja" style={{ marginTop: 8 }}>
            <table>
              <thead>
                <tr><th>Territorio</th>{sem.fechas.map((f, i) => <th key={f} style={{ textAlign: "center" }}>{i === 0 ? "Hoy" : `+${i}`}<br /><span style={{ fontWeight: 400, textTransform: "none" }}>{fechaCorta(f)}</span></th>)}</tr>
                <tr><th>Confianza</th>{sem.fechas.map((f, i) => <th key={f} style={{ textAlign: "center", fontWeight: 400, textTransform: "none" }}>{confianza(i)}</th>)}</tr>
              </thead>
              <tbody>
                <tr><td><b>Chile</b></td>{sem.fechas.map((f, i) => <td key={f} style={{ textAlign: "center" }}><NivelChip nivel={nivelDe(cs, i)} /></td>)}</tr>
                <tr><td className="chico">Comunas por nivel</td>{sem.fechas.map((f, i) => { const d = dist(cs, i); return <td key={f}><BarraNiveles n={d.n} sin={d.sin} /></td>; })}</tr>
                {regiones().map((r) => ({ r, lista: cs.filter((c) => c.cod_region === r.cod) })).sort((a, b) => Number(nivelDe(b.lista, 0) != null) - Number(nivelDe(a.lista, 0) != null)).map(({ r, lista }) => { return (
                  <tr key={r.cod}><td>{r.nombre}</td>{sem.fechas.map((f, i) => <td key={f} style={{ textAlign: "center" }}><NivelChip nivel={nivelDe(lista, i)} /></td>)}</tr>
                ); })}
              </tbody>
            </table>
          </div>
        )}
        <details className="metodo"><summary>Cómo se lee</summary><p>Cada casilla es el nivel de la región: el más alto que alcanzan comunas con al menos el {Math.round(cfg.fraccion_poblacion * 100)} % de sus personas de 65 años o más. «–» significa que faltan umbrales en la región. Open-Meteo pronostica hasta 16 días; desde el día 8 la confianza es muy baja. <a href="/mapa">Ver por comuna en el mapa</a> · <a href="/api/descargas/semaforo">CSV</a></p></details>
      </section>

      <section className="seccion" data-tour="temporada">
        <h2>Muertes adicionales proyectadas hasta marzo de 2027 (Climate Impact Lab)</h2>
        {!modulo("MODULO_IMPACTLAB") ? <p className="aviso info">Módulo desactivado.</p> : !il ? <p className="aviso">Sin datos cargados.</p> : (
          <>
            <AvisoFuentes fuentes={conProblema(estados, ["impactlab"])} />
            <div className="grilla g3" style={{ marginTop: 10 }}>
              {il.periodos.map((p) => (
                <div className="tarjeta kpi" key={p.id}>
                  <Cifra valor={num(il.nacional[p.id])} traza={{ ...trazaIL, fecha: `versión ${il.version} del ${fechaLarga(il.fecha_version)}`, metodo: `Chile, ${p.nombre.toLowerCase()}: ${p.tipo}. Carleton et al. (2022). Cifra central sin rango publicado; no se recalcula.` }} />
                  <div className="rot">Chile · {p.nombre}</div>
                </div>
              ))}
            </div>
            <div className="grilla g2" style={{ marginTop: 12 }}>
              <div className="tarjeta"><h3>Por región, junio de 2026 a marzo de 2027</h3>
                <BarrasH unidad="muertes adicionales proyectadas" filas={[...il.regiones].sort((a, b) => b.valores.total - a.valores.total).map((r) => ({ nombre: nombreReg[r.cod_region] ?? r.cod_region, valor: r.valores.total, nota: `jun-sep ${r.valores.jun_sep}; oct-mar ${r.valores.oct_mar}` }))} /></div>
              <div className="tarjeta"><h3>Chile por mes</h3><BarrasH unidad="muertes adicionales proyectadas" filas={il.nacional_mensual.map((m) => ({ nombre: m.mes, valor: m.muertes }))} /></div>
            </div>
            {mensual && (
              <div className="tabla-caja" style={{ marginTop: 12 }}>
                <table><thead><tr><th>Región · {carga?.archivo}</th>{meses.map((m) => <th key={m} className="n">{m}</th>)}</tr></thead>
                  <tbody>{regiones().map((r) => <tr key={r.cod}><td>{r.nombre}</td>{meses.map((m) => <td key={m} className="n">{mensual.find((x) => x.cod_region === r.cod && x.mes === m)?.muertes ?? ""}</td>)}</tr>)}</tbody></table>
              </div>
            )}
            <details className="metodo"><summary>Qué es esta cifra</summary><p>Proyección, no registro. {il.nota}</p></details>
          </>
        )}
      </section>

      <section className="seccion" data-tour="clima2050">
        <h2>Cambio de la temperatura de verano al 2050 por comuna de la RM (AURA)</h2>
        {!au || auCom.length === 0 ? <p className="aviso info">Requiere el módulo AURA de la RM.</p> : (
          <>
            <div className="tabla-caja" style={{ marginTop: 8, maxHeight: 420, overflowY: "auto" }}>
              <table><thead><tr><th>Comuna</th><th className="n">Verano de día hoy</th><th className="n">Cambio de día al 2050</th><th className="n">Cambio de noche al 2050</th></tr></thead>
                <tbody>{auCom.map((c) => { const a = au.comunas[c.cod]; return <tr key={c.cod}><td><a href={`/comuna/${c.cod}`}>{c.nombre}</a></td><td className="n">{num(a.temp_dia_prom, 1)} °C</td><td className="n">+{num(a.delta_2050_dia, 2)} °C</td><td className="n">+{num(a.delta_2050_noche, 2)} °C</td></tr>; })}</tbody></table>
            </div>
            <details className="metodo"><summary>Qué es esta cifra</summary><p>Escenario de AURA al 2050, promedio de las manzanas de cada comuna: no es un pronóstico. {au.cita} Extracción del {au.extraccion}.</p></details>
          </>
        )}
      </section>
    </div>
  );
}
