import type { ReactNode } from "react";
import { CORTE_NIVEL, TEXTO_NIVEL, type Nivel } from "@/lib/niveles";
import type { EstadoFuente } from "@/lib/fuentes";

/** Nivel con número y texto: nunca solo color (RF-13). */
export function NivelChip({ nivel, incierto, grande, conTexto }: { nivel: number | null | undefined; incierto?: boolean; grande?: boolean; conTexto?: boolean }) {
  const n = nivel == null ? "x" : String(nivel);
  const texto = nivel == null ? "Sin umbral local todavía" : `Nivel ${nivel}: ${TEXTO_NIVEL[nivel as Nivel]} (${CORTE_NIVEL[nivel as Nivel].toLowerCase()})`;
  return (
    <span className="fila" style={{ gap: 6, display: "inline-flex" }}>
      <span className={`nivel n${n}${grande ? " grande" : ""}${incierto ? " incierto" : ""}`} title={texto + (incierto ? ". Incierto: a menos de 1 °C de un corte." : "")} aria-label={texto}>
        {nivel == null ? "–" : nivel}
      </span>
      {conTexto && <span>{nivel == null ? "Sin umbral" : TEXTO_NIVEL[nivel as Nivel]}{incierto ? " (incierto)" : ""}</span>}
    </span>
  );
}

export type Traza = { fuente: string; fecha?: string | null; metodo: string; tipo: "registro" | "estimación" | "proyección"; enlace?: string };

/** Cifra con su nota de trazabilidad: fuente, fecha, método y tipo (RF-22). */
export function Cifra({ valor, traza, unidad }: { valor: ReactNode; traza: Traza; unidad?: string }) {
  return (
    <details className="cifra">
      <summary title="Ver fuente y método">
        <span className="valor">{valor}</span>{unidad && <span className="tenue">{unidad}</span>}
        <span className="tipo">{traza.tipo}</span>
      </summary>
      <div className="nota" role="note">
        <div><b>Tipo:</b> {traza.tipo}</div>
        <div><b>Fuente:</b> {traza.enlace ? <a href={traza.enlace} target="_blank" rel="noreferrer">{traza.fuente}</a> : traza.fuente}</div>
        {traza.fecha && <div><b>Fecha del dato:</b> {traza.fecha}</div>}
        <div><b>Método:</b> {traza.metodo}</div>
      </div>
    </details>
  );
}

export function Kpi({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return <div className="tarjeta kpi"><div>{children}</div><div className="rot">{rotulo}</div></div>;
}

/** Marca junto a las cifras cuando la fuente de la que dependen está vencida (RF-36). */
export function AvisoFuentes({ fuentes }: { fuentes: EstadoFuente[] }) {
  if (fuentes.length === 0) return null;
  return (
    <div className="aviso" role="status">
      {fuentes.map((f) => (
        <div key={f.id}>
          Fuente <b>{f.nombre}</b> {f.estado === "sin carga" ? "sin carga" : `vencida: última carga hace ${f.dias_desde} días (plazo ${f.tolerancia_dias})`}. Las cifras de este bloque pueden estar desactualizadas. <a href="/estado">Ver estado</a>
        </div>
      ))}
    </div>
  );
}

export function Puntos({ confianza }: { confianza: string | null }) {
  const n = confianza === "alta" ? 3 : confianza === "media" ? 2 : confianza === "baja" ? 1 : 0;
  return <span className="puntos" aria-hidden="true">{"●".repeat(n)}<i>{"●".repeat(3 - n)}</i></span>;
}
