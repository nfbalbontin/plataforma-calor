import { Ayuda } from "@/componentes/Ayuda";
import { comunas, establecimientos, regiones, urgEstablecimientos } from "@/lib/datos";
import { num } from "@/lib/tiempo";
import { TOUR_ESTABLECIMIENTOS } from "@/lib/tours";

export const dynamic = "force-dynamic";

/** Hospitales y centros de salud: tipo, urgencia y atenciones de 65+ en días de calor. */
export default async function Establecimientos({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const reg = sp.region ?? "13", com = sp.comuna ?? "", tipo = sp.tipo ?? "hospital", solo = sp.solo ?? "";
  const ue = urgEstablecimientos();
  const u = new Map((ue?.establecimientos ?? []).map((e) => [e.id, e]));
  const nombreCom = Object.fromEntries(comunas().map((c) => [c.cod, c.nombre]));
  const filas = establecimientos().establecimientos
    .filter((e) => e.reg === reg && (!com || e.com === com) && (tipo === "todos" || /hospital/i.test(e.tipo)))
    .map((e) => ({ e, u: u.get(e.cod) ?? (e.cod_antiguo ? u.get(e.cod_antiguo) : undefined) }))
    .filter((x) => (solo === "urgencia" ? x.e.urg : solo === "alza" ? (x.u?.dias_alza ?? 0) > 0 : true))
    .sort((a, b) => ((b.u?.dias_alza ?? -1) - (a.u?.dias_alza ?? -1)) || ((b.u?.m65_prom ?? -1) - (a.u?.m65_prom ?? -1)));
  const hayEpisodios = ue?.regiones_con_episodios.includes(reg);
  return (
    <div className="pagina">
      <div className="titulo-fila"><h1>Hospitales y centros de salud</h1><Ayuda pasos={TOUR_ESTABLECIMIENTOS} /></div>
      <form method="get" className="filtros seccion" data-tour="filtros-est">
        <div><label htmlFor="e-reg">Región</label><select id="e-reg" name="region" defaultValue={reg}>{regiones().map((r) => <option key={r.cod} value={r.cod}>{r.nombre}</option>)}</select></div>
        <div><label htmlFor="e-com">Comuna</label><select id="e-com" name="comuna" defaultValue={com}><option value="">Todas</option>{comunas().filter((c) => c.cod_region === reg).map((c) => <option key={c.cod} value={c.cod}>{c.nombre}</option>)}</select></div>
        <div><label htmlFor="e-tipo">Tipo</label><select id="e-tipo" name="tipo" defaultValue={tipo}><option value="hospital">Hospitales</option><option value="todos">Todos los establecimientos</option></select></div>
        <div><label htmlFor="e-solo">Mostrar</label><select id="e-solo" name="solo" defaultValue={solo}><option value="">Todos</option><option value="urgencia">Con servicio de urgencia</option><option value="alza">Con alza en días de calor</option></select></div>
        <button className="boton" type="submit">Filtrar</button>
        <span className="chico">{filas.length} establecimientos</span>
      </form>
      {!hayEpisodios && <p className="aviso info" style={{ marginTop: 10 }}>Esta región aún no tiene episodios de calor calculados; la columna de días de calor queda vacía.</p>}
      <section className="seccion" data-tour="tabla-est">
        <div className="tabla-caja">
          <table>
            <thead><tr><th>Establecimiento</th><th>Tipo</th><th>Comuna</th><th>Urgencia</th><th className="n">65+ al día</th><th className="n">Último día: 65+ / habitual</th><th className="n">Días de calor con alza</th><th className="n">65+ en días de calor</th></tr></thead>
            <tbody>
              {filas.length === 0 && <tr><td colSpan={8} className="chico">Ningún establecimiento cumple el filtro.</td></tr>}
              {filas.slice(0, 400).map(({ e, u: x }) => (
                <tr key={e.cod}>
                  <td>{e.nombre}<br /><span className="chico">{e.sistema}</span></td><td className="chico">{e.tipo}</td>
                  <td><a href={`/comuna/${e.com}`}>{nombreCom[e.com] ?? e.com}</a></td><td>{e.urg ? "Sí" : "No"}</td>
                  <td className="n">{x ? num(x.m65_prom, 1) : "no informa"}</td>
                  <td className="n">{x?.ult_m65 != null ? `${num(x.ult_m65)} / ${num(x.ult_hab, 1)}` : ""}</td>
                  <td className="n">{x && x.dias_calor ? `${x.dias_alza} de ${x.dias_calor}` : ""}</td>
                  <td className="n">{x?.razon_calor != null ? `${num(x.razon_calor * 100)} % de lo habitual` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details className="metodo"><summary>Qué muestra y qué no</summary><p>{ue?.metodo} {ue?.nota} Fuente: DEIS, establecimientos (versión del 10-11-2026) y atenciones de urgencia.</p></details>
      </section>
    </div>
  );
}
