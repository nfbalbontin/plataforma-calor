import { redirect } from "next/navigation";
import { NivelChip } from "@/componentes/Basicos";
import { esAdmin } from "@/lib/admin";
import { TIPOS_CARGA } from "@/lib/cargas";
import { alertas, cargas, ultimaEjecucion, vigentes } from "@/lib/consultas";
import { comunas, medidas, regiones } from "@/lib/datos";
import { estadoFuentes } from "@/lib/fuentes";
import { fechaHora } from "@/lib/tiempo";
import { anularAlerta, cerrarSesion, confirmarCarga, crearAlerta, descartarCarga, ejecutarTarea, marcarRevisionAlertas, revertirCarga, subirArchivo } from "./acciones";

export const dynamic = "force-dynamic";

export default async function Admin({ searchParams }: { searchParams: Promise<{ bien?: string; mal?: string }> }) {
  const sp = await searchParams;
  const mensaje = sp.mal ? <p className="aviso mal seccion" role="alert">{sp.mal}</p> : sp.bien ? <p className="aviso bien seccion" role="status">{sp.bien}</p> : null;
  if (!(await esAdmin())) redirect("/login");
  const [todas, historial, estados, ejec] = await Promise.all([alertas(), cargas(), estadoFuentes(), ultimaEjecucion()]);
  const vig = new Set(vigentes(todas).map((a) => a.id));
  const pendientes = historial.filter((c) => c.estado === "pendiente");
  const problemas = estados.filter((e) => e.estado === "vencida" || e.estado === "sin carga");
  const cat = medidas();
  const res = (c: { resumen: string | null }) => { try { return c.resumen ? JSON.parse(c.resumen) : null; } catch { return null; } };

  return (
    <div className="pagina">
      <div className="fila entre">
        <h1>Carga y edición de datos</h1>
        <form action={cerrarSesion}><button className="boton sec" type="submit">Cerrar sesión</button></form>
      </div>
      {mensaje}

      <section className="seccion">
        <h2>Qué necesita atención</h2>
        {problemas.length === 0 ? <p className="aviso bien">Todas las fuentes con plazo están al día.</p> : (
          <div className="aviso">{problemas.map((p) => <div key={p.id}><b>{p.nombre}</b>: {p.estado}{p.dias_desde != null ? ` (última carga hace ${p.dias_desde} días; plazo ${p.tolerancia_dias})` : ""}. {p.tipo === "formulario" ? "Ingrésala o marca la revisión más abajo." : p.tipo === "api" ? "Ejecuta la tarea diaria." : "Carga el archivo correspondiente."}</div>)}</div>
        )}
      </section>

      <section className="seccion">
        <h2>Tarea diaria de clima</h2>
        <p className="para">Pide a Open-Meteo la temperatura de ayer y el pronóstico de 5 días para las comunas, recalcula niveles y anota los cambios. En producción corre sola una vez al día.</p>
        <form action={ejecutarTarea} className="fila"><button className="boton" type="submit">Ejecutar ahora</button><span className="chico">Última ejecución: {ejec?.fin ? `${fechaHora(ejec.fin)} · ${ejec.ok ? "correcta" : "con falla"}` : "nunca"}</span></form>
      </section>

      <section className="seccion">
        <h2>Alertas oficiales</h2>
        <p className="para">Se ingresan a mano porque Senapred y la DMC no tienen un servicio consultable. Usa el nombre exacto de la escala del organismo y enlaza al original. Una alerta vencida deja de mostrarse sola.</p>
        <form action={crearAlerta} className="tarjeta">
          <div className="campos">
            <div><label htmlFor="organismo">Organismo</label><select id="organismo" name="organismo" required><option>Senapred</option><option>Dirección Meteorológica de Chile</option><option>Delegación Presidencial RM</option></select></div>
            <div><label htmlFor="tipo">Tipo (escala del organismo)</label><input id="tipo" name="tipo" list="tipos" required placeholder="Alerta Amarilla" />
              <datalist id="tipos"><option>Alerta Temprana Preventiva</option><option>Alerta Amarilla</option><option>Alerta Roja</option><option>Aviso por altas temperaturas</option><option>Alerta por altas temperaturas</option><option>Alarma por altas temperaturas</option><option>Código Rojo</option></datalist></div>
            <div><label htmlFor="territorio_tipo">Territorio</label><select id="territorio_tipo" name="territorio_tipo"><option value="region">Región</option><option value="comuna">Comuna</option><option value="pais">Todo el país</option></select></div>
            <div><label htmlFor="territorio_cod">Código de región o comuna</label><input id="territorio_cod" name="territorio_cod" list="territorios" placeholder="13 o 13101" />
              <datalist id="territorios">{regiones().map((r) => <option key={r.cod} value={r.cod}>{r.nombre}</option>)}{comunas().map((c) => <option key={c.cod} value={c.cod}>{c.nombre}</option>)}</datalist></div>
            <div><label htmlFor="inicio">Inicio (hora de Chile)</label><input id="inicio" name="inicio" type="datetime-local" required /></div>
            <div><label htmlFor="termino">Término (hora de Chile)</label><input id="termino" name="termino" type="datetime-local" required /></div>
            <div style={{ gridColumn: "1 / -1" }}><label htmlFor="enlace">Enlace al original</label><input id="enlace" name="enlace" type="url" required placeholder="https://senapred.cl/…" /></div>
          </div>
          <p style={{ marginTop: 12 }} className="fila"><button className="boton" type="submit">Ingresar alerta</button></p>
        </form>
        <form action={marcarRevisionAlertas} style={{ marginTop: 10 }}><button className="boton sec" type="submit">Revisé las fuentes oficiales y no hay cambios</button></form>
        <div className="tabla-caja" style={{ marginTop: 12 }}>
          <table>
            <thead><tr><th>Estado</th><th>Organismo</th><th>Tipo</th><th>Territorio</th><th>Inicio</th><th>Término</th><th>Enlace</th><th /></tr></thead>
            <tbody>
              {todas.length === 0 && <tr><td colSpan={8} className="chico">No hay alertas ingresadas.</td></tr>}
              {todas.map((a) => (
                <tr key={a.id}>
                  <td>{a.anulada ? <span className="pildora">anulada</span> : vig.has(a.id) ? <span className="pildora verde">vigente</span> : a.inicio > new Date().toISOString() ? <span className="pildora">futura</span> : <span className="pildora">vencida</span>}</td>
                  <td>{a.organismo}</td><td>{a.tipo}</td><td>{a.territorio_nombre}</td><td className="chico">{fechaHora(a.inicio)}</td><td className="chico">{fechaHora(a.termino)}</td>
                  <td><a href={a.enlace} target="_blank" rel="noreferrer">original</a></td>
                  <td>{!a.anulada && <form action={anularAlerta}><input type="hidden" name="id" value={a.id} /><button className="boton sec" type="submit">Anular</button></form>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="seccion">
        <h2>Carga de archivos</h2>
        <p className="para">Cada tipo valida nombre, columnas, codificación y fechas. Primero ves el resumen y las diferencias; los datos se reemplazan solo cuando confirmas, y toda carga se puede revertir.</p>
        <form action={subirArchivo} className="tarjeta">
          <div className="campos">
            <div><label htmlFor="tipo-archivo">Tipo de archivo</label><select id="tipo-archivo" name="tipo">{TIPOS_CARGA.map((t) => <option key={t.id} value={t.id}>{t.nombre}{t.inmediato ? "" : " (fuera de Vercel)"}</option>)}</select></div>
            <div><label htmlFor="archivo">Archivo</label><input id="archivo" name="archivo" type="file" required /></div>
          </div>
          <ul className="chico" style={{ margin: "10px 0 0", paddingLeft: 18 }}>{TIPOS_CARGA.map((t) => <li key={t.id}><b>{t.nombre}:</b> {t.formato}</li>)}</ul>
          <p style={{ marginTop: 12 }}><button className="boton" type="submit">Validar archivo</button></p>
        </form>
        {pendientes.map((c) => { const r = res(c); return (
          <div className="tarjeta" style={{ marginTop: 12, borderColor: "var(--aviso)" }} key={c.id}>
            <h3>Pendiente de confirmar: {c.archivo}</h3>
            <dl className="dl" style={{ maxWidth: 520 }}>
              <dt>Filas</dt><dd>{r?.filas}</dd><dt>Regiones</dt><dd>{r?.regiones}</dd><dt>Meses</dt><dd>{r?.meses}</dd><dt>Suma de muertes adicionales</dt><dd>{r?.total}</dd>
              <dt>Diferencias con la carga vigente</dt><dd>{r?.diferencias?.primera ? "primera carga de este tipo" : `${r?.diferencias?.cambiadas} cambiadas, ${r?.diferencias?.agregadas} nuevas, ${r?.diferencias?.eliminadas} eliminadas; suma anterior ${r?.diferencias?.total_antes}`}</dd>
            </dl>
            <div className="fila" style={{ marginTop: 10 }}>
              <form action={confirmarCarga}><input type="hidden" name="id" value={c.id} /><button className="boton" type="submit">Confirmar y reemplazar</button></form>
              <form action={descartarCarga}><input type="hidden" name="id" value={c.id} /><button className="boton sec" type="submit">Descartar</button></form>
            </div>
          </div>
        ); })}
        <h3 style={{ marginTop: 18 }}>Registro de cargas</h3>
        <div className="tabla-caja" style={{ marginTop: 6 }}>
          <table>
            <thead><tr><th>N.º</th><th>Fecha</th><th>Tipo</th><th>Archivo</th><th>Estado</th><th className="n">Filas</th><th>Detalle</th><th /></tr></thead>
            <tbody>
              {historial.length === 0 && <tr><td colSpan={8} className="chico">Sin cargas registradas.</td></tr>}
              {historial.map((c) => { const r = res(c); return (
                <tr key={c.id}><td>{c.id}</td><td className="chico">{fechaHora(c.fecha)}</td><td>{c.tipo}</td><td>{c.archivo}</td>
                  <td><span className={`pildora${c.estado === "vigente" ? " verde" : c.estado === "rechazada" ? " ambar" : ""}`}>{c.estado}</span></td><td className="n">{c.filas}</td>
                  <td className="chico">{r?.errores ? r.errores.slice(0, 2).join(" ") : r ? `${r.meses}; suma ${r.total}` : ""}{c.reemplaza ? ` · reemplazó a la n.º ${c.reemplaza}` : ""}</td>
                  <td>{c.estado === "vigente" && <form action={revertirCarga}><input type="hidden" name="id" value={c.id} /><button className="boton sec" type="submit">Revertir</button></form>}</td></tr>
              ); })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="seccion">
        <h2>Catálogo de medidas y umbrales</h2>
        <p className="para">Son archivos versionados del repositorio (config/medidas.json y config/umbrales.json): se cambian con un cambio registrado en GitHub, no desde aquí. Versión vigente del catálogo: {cat.version}.</p>
        <div className="fila">{[0, 1, 2, 3].map((n) => <span key={n} className="pildora"><NivelChip nivel={n} /> {(cat.niveles[String(n)] ?? []).length} medidas</span>)}<a className="boton sec" href="/panel#medidas">Ver catálogo</a></div>
      </section>
    </div>
  );
}
