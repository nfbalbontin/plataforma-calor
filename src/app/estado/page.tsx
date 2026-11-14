import { Ayuda } from "@/componentes/Ayuda";
import { ultimaEjecucion } from "@/lib/consultas";
import { umbrales } from "@/lib/datos";
import { estadoFuentes } from "@/lib/fuentes";
import { fechaHora } from "@/lib/tiempo";
import { TOUR_ESTADO } from "@/lib/tours";

export const revalidate = 900;
const CLASE: Record<string, string> = { "al día": "verde", vencida: "roja", "sin carga": "ambar" };

export default async function Estado() {
  const [estados, ejec] = await Promise.all([estadoFuentes(), ultimaEjecucion()]);
  const um = umbrales();
  const mal = estados.filter((e) => e.estado === "vencida" || e.estado === "sin carga");
  return (
    <div className="pagina">
      <div className="titulo-fila"><h1>Estado de las fuentes de datos</h1><Ayuda pasos={TOUR_ESTADO} /></div>
      <div className="fila seccion">
        {mal.length === 0 ? <span className="pildora verde">Fuentes con plazo al día</span> : <span className="pildora roja">{mal.length} fuentes con problema</span>}
        <span className="pildora">Tarea diaria: {ejec?.fin ? `${fechaHora(ejec.fin)} · ${ejec.ok ? "correcta" : "con falla"}` : "sin ejecuciones"}</span>
        <span className="pildora">Umbrales {um.version}</span>
      </div>
      <section className="seccion" data-tour="tabla-estado">
        <div className="tabla-caja">
          <table>
            <thead><tr><th>Fuente</th><th>Estado</th><th>Última carga</th><th>Último dato</th><th>API o descarga</th><th>Frecuencia</th><th className="n">Plazo (días)</th><th>Cobertura</th></tr></thead>
            <tbody>
              {estados.map((e) => (
                <tr key={e.id}>
                  <td><b>{e.nombre}</b><br /><span className="chico">{e.titular}</span></td>
                  <td><span className={`pildora ${CLASE[e.estado] ?? ""}`}>{e.estado}</span></td>
                  <td className="chico">{e.ultima_carga ? fechaHora(e.ultima_carga) : "nunca"}</td>
                  <td className="chico">{e.ultimo_dato ?? ""}</td><td className="chico" style={{ wordBreak: "break-word", maxWidth: 320 }}>{e.conexion}</td>
                  <td className="chico">{e.frecuencia}</td><td className="n">{e.tolerancia_dias ?? "–"}</td><td className="chico">{e.cobertura}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="chico" style={{ marginTop: 8 }}>{um.base}</p>
      </section>
    </div>
  );
}
