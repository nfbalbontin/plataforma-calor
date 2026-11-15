import type { Robustez } from "@/lib/motor";

export const TEXTO_ROB: Record<Robustez, string> = { robusta: "Robusta", depende: "Depende del supuesto", no: "No se sostiene" };
export const AYUDA_ROB: Record<Robustez, string> = {
  robusta: "Se cumple con el escenario bajo y con el alto: actuar sin esperar más datos.",
  depende: "Se cumple solo en uno de los dos escenarios: vigilar o mejorar el dato.",
  no: "No se cumple en ninguno de los dos escenarios.",
};

/** Etiqueta de robustez: la misma en todos los paneles. */
export function Rob({ clase }: { clase: Robustez | null | undefined }) {
  if (!clase) return <span className="chico">sin clima</span>;
  return <span className={`rob ${clase}`} title={AYUDA_ROB[clase]}>{TEXTO_ROB[clase]}</span>;
}

export function LeyendaRob() {
  return (
    <div className="fila" style={{ gap: 14 }}>
      {(["robusta", "depende", "no"] as const).map((c) => <span key={c} className="fila" style={{ gap: 6 }}><Rob clase={c} /><span className="chico">{AYUDA_ROB[c]}</span></span>)}
    </div>
  );
}
