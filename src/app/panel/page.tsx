import { Ayuda } from "@/componentes/Ayuda";
import { AvisoFuentes, NivelChip } from "@/componentes/Basicos";
import { EstadoPill } from "@/componentes/Explorador";
import { TablaSemaforo, type FilaSemaforo } from "@/componentes/TablaSemaforo";
import { alertas, alertasDeComuna, cambios, estadosGuardados, semaforo, ultimaEjecucion, vigentes } from "@/lib/consultas";
import { comunas, configAlerta, dependencia, medidas, prioridadDe, provincias, regiones, umbrales } from "@/lib/datos";
import { conProblema, estadoFuentes } from "@/lib/fuentes";
import { senalComuna } from "@/lib/impacto";
import { TEXTO_NIVEL, type Nivel } from "@/lib/niveles";
import { fechaHora, fechaLarga, num } from "@/lib/tiempo";
import { TOUR_PANEL } from "@/lib/tours";

export const revalidate = 900;

export default async function Panel() {
  const [sem, todas, registro, estados, guardados, ejec] = await Promise.all([semaforo(), alertas(), cambios(300), estadoFuentes(), estadosGuardados(), ultimaEjecucion()]);
  const vig = vigentes(todas), dep = dependencia(), cat = medidas(), um = umbrales(), cfg = configAlerta();
  const prov: Record<string, { cod: string; nombre: string }> = {};
  for (const p of provincias()) for (const c of p.comunas) prov[c] = p;
  const filas: FilaSemaforo[] = comunas().map((c) => {
    const ns = sem.porComuna[c.cod] ?? [];
    const of = alertasDeComuna(vig, c.cod, c.cod_region)[0] ?? null;
    const hoy = ns[0]?.nivel ?? null;
    return {
      cod: c.cod, nombre: c.nombre, cod_region: c.cod_region, region: c.region, cod_prov: prov[c.cod]?.cod ?? "", provincia: prov[c.cod]?.nombre ?? "",
      pob65: c.pob.e65_74 + c.pob.e75_84 + c.pob.e85_mas,
      niveles: ns.slice(0, 6).map((n) => ({ nivel: n.nivel, incierto: n.incierto, tmax: n.tmax, estado: n.estado })),
      alerta: of ? { organismo: of.organismo, tipo: of.tipo, enlace: of.enlace } : null,
      discrepancia: hoy != null && hoy >= 2 && !of ? `Nivel ${hoy} sin alerta oficial ingresada` : hoy === 0 && of ? "Alerta oficial vigente con nivel 0" : null,
      mayores_alta: prioridadDe(c).mayores_alta, dep_severa: dep?.comunas[c.cod]?.dep_severa ?? null, senal65: senalComuna(c.cod)?.m65.senal.estado ?? null,
    };
  });
  const activas = filas.filter((f) => (f.niveles[0]?.nivel ?? 0) >= 1).sort((a, b) => (b.niveles[0].nivel! - a.niveles[0].nivel!) || b.mayores_alta - a.mayores_alta);
  const nDisc = filas.filter((f) => f.discrepancia).length;
  const conNivel = filas.filter((f) => f.niveles[0]?.nivel != null).length;
  const nombre = Object.fromEntries(comunas().map((c) => [c.cod, c.nombre]));
  const revAlertas = guardados["alertas-oficiales"]?.ultima_carga ?? null;

  return (
    <div className="pagina">
      <div className="titulo-fila"><h1>Panel operacional: nivel por comuna, alertas y medidas</h1><Ayuda pasos={TOUR_PANEL} /></div>
      <div className="fila seccion" data-tour="resumen">
        <span className="pildora">Clima: {ejec?.fin ? fechaHora(ejec.fin) : "sin ejecución"}</span>
        <span className="pildora">Alertas oficiales revisadas: {revAlertas ? fechaHora(revAlertas) : "nunca"}</span>
        <span className="pildora">{conNivel} de {filas.length} comunas con nivel</span>
        {nDisc > 0 ? <span className="pildora roja">{nDisc} discrepancias</span> : <span className="pildora verde">Sin discrepancias</span>}
      </div>
      <div style={{ marginTop: 8 }}><AvisoFuentes fuentes={conProblema(estados, ["open-meteo", "alertas-oficiales", "deis-urgencias", "deis-rem"])} /></div>

      <section className="seccion">
        <h2>Semáforo de hoy y los próximos 5 días</h2>
        {sem.fechas.length === 0 ? <p className="aviso">Sin pronóstico guardado. Ejecuta la tarea diaria en <a href="/admin">Carga</a>.</p>
          : <TablaSemaforo filas={filas} fechas={sem.fechas} regiones={regiones().map((r) => ({ cod: r.cod, nombre: r.nombre }))} fraccion={cfg.territorio.fraccion_poblacion} cobertura={cfg.territorio.cobertura_minima} />}
        <details className="metodo"><summary>Cómo leer la tabla</summary>
          <p>Nivel 0 sin calor inusual, 1 inusual, 2 muy inusual, 3 extremo; «–» es comuna sin umbral ({um.base}). Borde punteado: nivel incierto. Discrepancia: nivel 2 o 3 sin alerta oficial, o alerta oficial con nivel 0. La alerta propia no es oficial; su regla está en <a href="/metodologia">Metodología</a>. <a href="/api/descargas/semaforo">Descargar en CSV</a> · emisión del {sem.emision ? fechaLarga(sem.emision) : "sin dato"}.</p>
        </details>
      </section>

      <section className="seccion" data-tour="activas">
        <h2>Comunas con nivel 1 o más hoy: {activas.length}</h2>
        {activas.length === 0 ? <p className="chico">Ninguna entre las comunas con umbral.</p> : (
          <div className="grilla g2" style={{ marginTop: 8 }}>
            {activas.slice(0, 30).map((a) => (
              <div className="tarjeta" key={a.cod}>
                <div className="fila entre"><h3><a href={`/comuna/${a.cod}`}>{a.nombre}</a></h3><span className="fila"><NivelChip nivel={a.niveles[0].nivel} incierto={a.niveles[0].incierto} /><EstadoPill e={a.niveles[0].estado} /></span></div>
                <div className="chico">Urgencias 65+: {a.senal65 ?? "sin dato"} · dependencia severa: {num(a.dep_severa)} · 60+ prioritarias: {num(a.mayores_alta)}</div>
                <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13.5 }}>
                  {(cat.niveles[String(a.niveles[0].nivel)] ?? []).map((m, i) => <li key={i}>{m.medida} <span className="chico">({m.responsable}; {m.plazo.toLowerCase()})</span></li>)}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="seccion" id="medidas">
        <h2>Catálogo de medidas por nivel</h2>
        <div className="tabla-caja" style={{ marginTop: 8 }}>
          <table>
            <thead><tr><th>Nivel</th><th>Medida</th><th>Responsable</th><th>Plazo</th></tr></thead>
            <tbody>
              {[0, 1, 2, 3].flatMap((n) => (cat.niveles[String(n)] ?? []).map((m, i) => (
                <tr key={`${n}-${i}`}><td><NivelChip nivel={n} /> <span className="chico">{TEXTO_NIVEL[n as Nivel]}</span></td><td>{m.medida}</td><td>{m.responsable}</td><td>{m.plazo}</td></tr>
              )))}
            </tbody>
          </table>
        </div>
        <details className="metodo"><summary>Respaldo y estado del catálogo</summary><p>{cat.estado} Versión {cat.version}. {Object.values(cat.referencias).map((r) => r.cita).join(" · ")}</p></details>
      </section>

      <section className="seccion" data-tour="registro">
        <h2>Registro de cambios de nivel</h2>
        <div className="tabla-caja" style={{ maxHeight: 380, overflowY: "auto", marginTop: 8 }}>
          <table>
            <thead><tr><th>Fecha</th><th>Comuna</th><th>Nivel anterior</th><th>Nivel nuevo</th><th className="n">Temperatura media</th><th>Umbrales</th></tr></thead>
            <tbody>
              {registro.length === 0 && <tr><td colSpan={6} className="chico">Sin cambios registrados.</td></tr>}
              {registro.map((r) => <tr key={r.id}><td>{fechaLarga(r.fecha)}</td><td><a href={`/comuna/${r.cod_comuna}`}>{nombre[r.cod_comuna] ?? r.cod_comuna}</a></td><td><NivelChip nivel={r.nivel_anterior} /></td><td><NivelChip nivel={r.nivel_nuevo} /></td><td className="n">{num(r.valor, 1)} °C</td><td className="chico">{r.version_umbral}</td></tr>)}
            </tbody>
          </table>
        </div>
        <p className="chico" style={{ marginTop: 6 }}>No se edita. <a href="/api/descargas/cambios">Descargar en CSV</a></p>
      </section>
    </div>
  );
}
