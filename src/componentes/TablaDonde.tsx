"use client";
import { useMemo, useState } from "react";
import { fmtRango, type Rango, type Robustez } from "@/lib/motor";
import { MapaClases } from "./MapaClases";
import { Rob } from "./Robustez";

export type FilaD = { pos: number; cod: string; nombre: string; reg: string; region: string; pob65: number; dias: number | null; indicador: number | null; muertes: Rango | null; clase: Robustez | null; climaPropio: boolean; validacion: [number, number, number] | null; bbox: [number, number, number, number] | null };
const fmt = (n: number | null | undefined, d = 0) => (n == null ? "sin dato" : n.toLocaleString("es-CL", { minimumFractionDigits: d, maximumFractionDigits: d }));

/** Panel 1: ranking de comunas por población de 65+ × días sobre el umbral, con su clase de robustez. */
export function TablaDonde({ filas, regiones }: { filas: FilaD[]; regiones: { cod: string; nombre: string }[] }) {
  const [reg, setReg] = useState(""), [clase, setClase] = useState(""), [n, setN] = useState(25), [sel, setSel] = useState<string | null>(null);
  const vista = useMemo(() => filas.filter((f) => (!reg || f.reg === reg) && (!clase || f.clase === clase)), [filas, reg, clase]);
  const clases = useMemo(() => Object.fromEntries(filas.map((f) => [f.cod, !reg || f.reg === reg ? f.clase : null])), [filas, reg]);
  const bbox = useMemo(() => {
    if (!reg) return null;
    const bs = filas.filter((f) => f.reg === reg && f.bbox && !["05201", "05104"].includes(f.cod)).map((f) => f.bbox!);
    return bs.length ? (bs.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]) as [number, number, number, number]) : null;
  }, [filas, reg]);
  const cuenta = (c: Robustez) => vista.filter((f) => f.clase === c).length;
  return (
    <>
      <div className="filtros" data-tour="filtros-donde">
        <div><label htmlFor="dn-reg">Región</label><select id="dn-reg" value={reg} onChange={(e) => { setReg(e.target.value); setN(25); }}><option value="">Todas</option>{regiones.map((r) => <option key={r.cod} value={r.cod}>{r.nombre}</option>)}</select></div>
        <div><label htmlFor="dn-cl">Clase</label><select id="dn-cl" value={clase} onChange={(e) => setClase(e.target.value)}><option value="">Todas</option><option value="robusta">Robusta</option><option value="depende">Depende del supuesto</option><option value="no">No se sostiene</option></select></div>
        <span className="chico">{vista.length} comunas · {cuenta("robusta")} robustas · {cuenta("depende")} dependen del supuesto</span>
        <a className="boton sec" href="/api/descargas/analisis-donde">Descargar todo (CSV)</a>
      </div>
      <div className="grilla dos-tabla" style={{ marginTop: 12 }}>
        <div data-tour="mapa-donde">
          <MapaClases clases={clases} bbox={bbox} alPinchar={setSel} />
          <div className="fila chico" style={{ marginTop: 6 }}><Rob clase="robusta" /><Rob clase="depende" /><span className="fila" style={{ gap: 4 }}><span className="cuadro" style={{ background: "var(--pri-media)" }} />no se sostiene</span><span className="fila" style={{ gap: 4 }}><span className="cuadro" style={{ background: "var(--sin)" }} />fuera del filtro</span></div>
        </div>
        <div className="tabla-caja" style={{ maxHeight: 460, overflowY: "auto" }} data-tour="tabla-donde">
          <table>
            <thead><tr><th>N.º</th><th>Comuna</th><th className="n">65 o más</th><th className="n">Días al año sobre el umbral</th><th className="n">Indicador</th><th>¿En el 20 % superior?</th><th className="n">Muertes al año (rango)</th><th className="n">En olas de calor: observadas / habituales</th></tr></thead>
            <tbody>
              {vista.slice(0, n).map((f) => (
                <tr key={f.cod} style={sel === f.cod ? { outline: "2px solid var(--acento)" } : undefined}>
                  <td className="n">{f.pos}</td><td><a href={`/comuna/${f.cod}`}>{f.nombre}</a><br /><span className="chico">{f.region}{f.climaPropio ? "" : " · clima de la capital regional"}</span></td>
                  <td className="n">{fmt(f.pob65)}</td><td className="n">{fmt(f.dias, 1)}</td><td className="n"><b>{fmt(f.indicador)}</b></td>
                  <td><Rob clase={f.clase} /></td><td className="n">{f.muertes ? fmtRango(f.muertes, f.muertes[1] < 10 ? 1 : 0) : "sin dato"}</td>
                  <td className="n">{f.validacion ? `${fmt(f.validacion[0])} / ${fmt(f.validacion[1])} (${f.validacion[1] ? `${f.validacion[0] >= f.validacion[1] ? "+" : "−"}${fmt(Math.abs((f.validacion[0] / f.validacion[1] - 1) * 100), 0)} %` : "–"})` : "sin episodios"}</td>
                </tr>
              ))}
              {vista.length === 0 && <tr><td colSpan={8} className="chico">Ninguna comuna cumple el filtro.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {vista.length > n && <p style={{ marginTop: 8 }}><button className="boton sec" onClick={() => setN(n + 100)}>Ver más ({vista.length - n} restantes)</button></p>}
    </>
  );
}
