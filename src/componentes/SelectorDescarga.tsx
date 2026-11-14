"use client";
import { useState } from "react";

export function SelectorDescarga({ comunas, conCalor = [] }: { comunas: { cod: string; nombre: string; region: string }[]; conCalor?: string[] }) {
  const [cod, setCod] = useState(comunas.find((c) => c.cod === "13101")?.cod ?? comunas[0]?.cod ?? "");
  return (
    <div className="fila">
      <div style={{ minWidth: 280 }}><label htmlFor="sel-comuna">Comuna</label>
        <select id="sel-comuna" value={cod} onChange={(e) => setCod(e.target.value)}>{comunas.map((c) => <option key={c.cod} value={c.cod}>{c.nombre} · {c.region}</option>)}</select></div>
      <a className="boton" style={{ marginTop: 18 }} href={`/descargas/${conCalor.includes(cod) ? "manzanas_aura" : "manzanas"}/${cod}.csv`} download>Descargar CSV</a>
      {conCalor.includes(cod) && <span className="chico" style={{ marginTop: 18 }}>Incluye la diferencia de temperatura de AURA (módulo en prueba).</span>}
    </div>
  );
}
