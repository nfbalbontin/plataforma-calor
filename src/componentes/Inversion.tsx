"use client";
import { useEffect, useMemo, useState } from "react";
import { fmtRango, inversion, type Parametros, type Rango } from "@/lib/motor";
import { Rob } from "./Robustez";

type Terr = { cod: string; nombre: string; grupo: string; muertes: Rango | null };
const clp = (n: number) => `$ ${Math.round(n).toLocaleString("es-CL")}`;
const f = (n: number, d = 2) => n.toLocaleString("es-CL", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Panel 4: muertes que la medida debe evitar para justificar su costo, contra lo que evita en cada escenario. */
export function Inversion({ territorios, p }: { territorios: Terr[]; p: Parametros }) {
  const [cod, setCod] = useState("13");
  const [costo, setCosto] = useState(1_000_000_000);
  const [ef, setEf] = useState(Math.round(p.efectividad.por_defecto * 1000) / 10);
  const [pre, setPre] = useState<Rango | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(location.search), b = Number(q.get("bajo")), a = Number(q.get("alto"));
    if (q.get("desde") === "simulador" && Number.isFinite(b) && Number.isFinite(a)) setPre([b, a]);
    if (q.get("t") && territorios.some((t) => t.cod === q.get("t"))) setCod(q.get("t")!);
  }, [territorios]);
  const t = territorios.find((x) => x.cod === cod);
  const evitadas: Rango | null = pre ?? (t?.muertes ? [t.muertes[0] * (ef / 100), t.muertes[1] * (ef / 100)] : null);
  const r = useMemo(() => (evitadas && costo > 0 ? inversion(costo, p.valor_vida_estadistica.clp, evitadas) : null), [evitadas, costo, p]);
  const vve = p.valor_vida_estadistica.clp;
  return (
    <div className="grilla dos-lateral">
      <div className="tarjeta" data-tour="inv-entradas">
        <h3>Entradas</h3>
        {pre ? (
          <div className="aviso info" style={{ marginBottom: 12 }}>Muertes evitadas tomadas del simulador: <b>{fmtRango(pre, 2)}</b> al año. <button className="enlace-btn" onClick={() => setPre(null)}>Usar un territorio y una efectividad</button></div>
        ) : (
          <>
            <label htmlFor="i-terr">Región o comuna</label>
            <select id="i-terr" value={cod} onChange={(e) => setCod(e.target.value)} style={{ marginBottom: 12 }}>
              {["Regiones", "Comunas"].map((g) => <optgroup key={g} label={g}>{territorios.filter((x) => x.grupo === g).map((x) => <option key={x.cod} value={x.cod} disabled={!x.muertes}>{x.nombre}{x.muertes ? "" : " (sin clima)"}</option>)}</optgroup>)}
            </select>
            <div className="control"><label htmlFor="i-ef">Efectividad esperada: muertes evitadas</label><output>{f(ef, 1)} %</output>
              <input id="i-ef" type="range" min={0} max={100} step={0.5} value={ef} onChange={(e) => setEf(Number(e.target.value))} /></div>
          </>
        )}
        <label htmlFor="i-costo">Costo anual de la medida (CLP)</label>
        <input id="i-costo" type="number" min={0} step={10_000_000} value={costo} onChange={(e) => setCosto(Number(e.target.value))} />
        <div className="chico" style={{ marginTop: 4 }}>{clp(costo)}</div>
      </div>
      <div data-tour="inv-resultado">
        {!r || !evitadas ? <p className="aviso">Este territorio no tiene serie de temperatura todavía, o el costo es cero.</p> : (
          <>
            <div className="grilla g3">
              <div className="tarjeta kpi"><div className="valor">{f(r.necesarias)}</div><div className="rot">Muertes al año que la medida debe evitar para justificarse</div></div>
              <div className="tarjeta kpi"><div className="valor">{fmtRango(evitadas, 2)}</div><div className="rot">Muertes al año que evitaría (escenario bajo a alto)</div></div>
              <div className="tarjeta kpi"><Rob clase={r.clase} /><div className="rot" style={{ marginTop: 8 }}>{r.clase === "robusta" ? "Se justifica aun con el escenario bajo." : r.clase === "depende" ? "Solo el escenario alto supera el umbral." : "Ningún escenario supera el umbral."}</div></div>
            </div>
            <h3 style={{ marginTop: 14 }}>Cálculo completo</h3>
            <div className="formula">
              {clp(costo)} ÷ {clp(vve)} = <b>{f(r.necesarias)}</b> muertes por evitar · evita {pre ? <>{f(evitadas[0])} a {f(evitadas[1])} (simulador)</> : <>{f(ef, 1)} % × {fmtRango(t!.muertes!, 2)} = <b>{f(evitadas[0])} a {f(evitadas[1])}</b></>} · bajo {evitadas[0] >= r.necesarias ? "≥" : "<"} {f(r.necesarias)}, alto {evitadas[1] >= r.necesarias ? "≥" : "<"} {f(r.necesarias)}
            </div>
          </>
        )}
        <table className="tabla-mini supuestos" style={{ marginTop: 14 }}>
          <thead><tr><th>Supuesto</th><th>Valor y fuente</th></tr></thead>
          <tbody>
            <tr><td>Valor de una vida estadística</td><td>{clp(vve)}. {p.valor_vida_estadistica.fuente} {p.valor_vida_estadistica.advertencia}</td></tr>
            <tr><td>Efectividad por defecto</td><td>{f(p.efectividad.por_defecto * 100, 1)} % (rango {f(p.efectividad.bajo * 100, 1)} a {f(p.efectividad.alto * 100, 1)} %). {p.efectividad.fuente} {p.efectividad.advertencia}</td></tr>
            <tr><td>Muertes atribuibles del territorio</td><td>Promedio anual del período histórico con el motor, con RR {p.rr.bajo.toLocaleString("es-CL")} (bajo) y {p.rr.alto.toLocaleString("es-CL")} (alto). Es la misma cifra del panel «Dónde actuar».</td></tr>
            <tr><td>Costo</td><td>Se compara un costo anual con las muertes evitadas en un año promedio. No descuenta ni considera otros beneficios.</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
