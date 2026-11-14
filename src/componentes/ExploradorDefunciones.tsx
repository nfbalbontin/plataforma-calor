"use client";
import { useEffect, useMemo, useState } from "react";

type Punto = { t: string; ini: string; obs: number | null; esp: number | null; bajo: number | null; alto: number | null; calor: number; prov: boolean };
type Resp = { escala: string; nota: string; serie: Punto[]; resumen: { periodos: number; con_calor: number; con_calor_sobre: number; hay_episodios: boolean }; error?: string };
const fmt = (n: number | null | undefined) => (n == null ? "sin dato" : n.toLocaleString("es-CL"));
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/** Defunciones observadas contra lo esperado, con filtros. Marca los períodos con episodio de calor. */
export function ExploradorDefunciones({ regiones, comunas, anos }: { regiones: { cod: string; nombre: string }[]; comunas: { cod: string; nombre: string; cod_region: string }[]; anos: number[] }) {
  const [region, setRegion] = useState("13");
  const [comuna, setComuna] = useState("");
  const [edad, setEdad] = useState("total");
  const [ano, setAno] = useState(String(anos[anos.length - 1]));
  const [mes, setMes] = useState("");
  const [escala, setEscala] = useState("semana");
  const [r, setR] = useState<Resp | null>(null);
  const [sel, setSel] = useState<Punto | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get("region")) setRegion(q.get("region")!);
  }, []);
  useEffect(() => {
    let vivo = true;
    setSel(null);
    fetch(`/api/defunciones?terr=${comuna || region}&edad=${edad}&ano=${ano}&mes=${mes}&escala=${escala}`).then((x) => x.json()).then((j) => { if (vivo) setR(j); }).catch(() => { if (vivo) setR(null); });
    return () => { vivo = false; };
  }, [region, comuna, edad, ano, mes, escala]);
  useEffect(() => {
    const f = (e: Event) => { const d = (e as CustomEvent).detail as Record<string, string>; if (d.region) { setRegion(d.region); setComuna(""); } if (d.escala) setEscala(d.escala); if (d.edad) setEdad(d.edad); if (d.ano != null) setAno(d.ano); if (d.mes != null) setMes(d.mes); };
    window.addEventListener("calor:tour", f);
    return () => window.removeEventListener("calor:tour", f);
  }, []);

  const s = r?.serie ?? [];
  const W = 940, H = 300, ml = 46, mr = 10, mt = 12, mb = 28;
  const g = useMemo(() => {
    const max = Math.max(1, ...s.map((p) => Math.max(p.obs ?? 0, p.alto ?? 0)));
    const paso = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000].find((x) => (max * 1.05) / x <= 5) ?? 100000;
    const tope = Math.ceil((max * 1.05) / paso) * paso;
    return { tope, marcas: Array.from({ length: tope / paso + 1 }, (_, i) => i * paso), ancho: (W - ml - mr) / Math.max(s.length, 1) };
  }, [s]);
  const x = (i: number) => ml + i * g.ancho, y = (v: number) => mt + (H - mt - mb) * (1 - v / g.tope);
  const conEsp = s.map((p, i) => ({ p, i })).filter((d) => d.p.esp != null);
  const banda = conEsp.length > 1 ? `M${conEsp.map((d) => `${x(d.i) + g.ancho / 2},${y(d.p.alto!)}`).join(" L")} L${[...conEsp].reverse().map((d) => `${x(d.i) + g.ancho / 2},${y(d.p.bajo!)}`).join(" L")} Z` : "";
  const cadaN = Math.max(1, Math.ceil(s.length / 12));
  const nombreTerr = comuna ? comunas.find((c) => c.cod === comuna)?.nombre : regiones.find((x) => x.cod === region)?.nombre;
  const sobre = s.filter((p) => p.calor > 0);

  return (
    <div>
      <div className="filtros" data-tour="filtros-def">
        <div><label htmlFor="d-reg">Región</label><select id="d-reg" value={region} onChange={(e) => { setRegion(e.target.value); setComuna(""); }}>{regiones.map((x) => <option key={x.cod} value={x.cod}>{x.nombre}</option>)}</select></div>
        <div><label htmlFor="d-com">Comuna</label><select id="d-com" value={comuna} disabled={region === "00"} onChange={(e) => { setComuna(e.target.value); if (e.target.value && (escala === "dia" || escala === "semana")) setEscala("mes"); }}>
          <option value="">Todas</option>{comunas.filter((c) => c.cod_region === region).map((c) => <option key={c.cod} value={c.cod}>{c.nombre}</option>)}</select></div>
        <div><label htmlFor="d-edad">Edad</label><select id="d-edad" value={edad} onChange={(e) => setEdad(e.target.value)}><option value="total">Todas</option><option value="e0_64">0 a 64 años</option><option value="e65_79">65 a 79 años</option><option value="e80_mas">80 años o más</option></select></div>
        <div><label htmlFor="d-ano">Año</label><select id="d-ano" value={ano} onChange={(e) => setAno(e.target.value)}><option value="">Todos</option>{[...anos].reverse().map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
        <div><label htmlFor="d-mes">Mes</label><select id="d-mes" value={mes} onChange={(e) => setMes(e.target.value)}><option value="">Todos</option>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
        <div><label htmlFor="d-esc">Agrupar por</label><select id="d-esc" value={escala} onChange={(e) => setEscala(e.target.value)}>
          <option value="dia" disabled={!!comuna}>Día</option><option value="semana" disabled={!!comuna}>Semana</option><option value="mes">Mes</option><option value="ano">Año</option></select></div>
      </div>
      <div className="tarjeta" style={{ marginTop: 12 }} data-tour="grafico-def">
        <div className="fila entre"><h3>Defunciones de {nombreTerr} por {r?.escala === "dia" ? "día" : r?.escala === "ano" ? "año" : r?.escala ?? escala}</h3>
          <span className="chico">{r?.nota}</span></div>
        <div className="leyenda-graf">
          <span><span className="cuadro" style={{ background: "var(--barra)" }} />Observadas</span>
          <span><span className="cuadro" style={{ background: "var(--n3)" }} />Con episodio de calor</span>
          <span><span className="cuadro" style={{ background: "var(--barra)", opacity: 0.45 }} />Provisional</span>
          <span><span className="cuadro" style={{ background: "var(--banda)", borderTop: "2px solid var(--linea-esp)" }} />Esperadas y rango</span>
          <span><span className="cuadro" style={{ background: "transparent", border: "2px solid var(--tinta)" }} />Sobre el rango</span>
        </div>
        {r?.error ? <p className="aviso">{r.error}</p> : s.length === 0 ? <p className="chico">Sin datos para este filtro.</p> : (
          <svg className="grafico" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Defunciones observadas y esperadas según el filtro">
            {g.marcas.map((m) => <g key={m}><line className="guia" x1={ml} x2={W - mr} y1={y(m)} y2={y(m)} /><text x={ml - 6} y={y(m) + 4} textAnchor="end">{m.toLocaleString("es-CL")}</text></g>)}
            {banda && <path d={banda} fill="var(--banda)" />}
            {s.map((p, i) => p.obs == null ? null : (
              <rect key={p.ini + i} x={x(i) + 0.5} y={y(p.obs)} width={Math.max(1, g.ancho - 1.5)} height={y(0) - y(p.obs)} rx={Math.min(3, g.ancho / 3)}
                fill={p.calor > 0 ? "var(--n3)" : "var(--barra)"} opacity={p.prov ? 0.45 : 1}
                stroke={p.alto != null && p.obs > p.alto ? "var(--tinta)" : "none"} strokeWidth={1.5} style={{ cursor: "pointer" }} onClick={() => setSel(p)}>
                <title>{`${p.t}: ${fmt(p.obs)} observadas${p.esp != null ? `; esperadas ${fmt(p.esp)} (${fmt(p.bajo)} a ${fmt(p.alto)})` : ""}${p.calor ? `; ${p.calor} día(s) de episodio de calor` : ""}${p.prov ? "; provisional" : ""}`}</title>
              </rect>
            ))}
            {conEsp.length > 1 && <path d={conEsp.map((d, k) => `${k ? "L" : "M"}${x(d.i) + g.ancho / 2},${y(d.p.esp!)}`).join(" ")} fill="none" stroke="var(--linea-esp)" strokeWidth={2} />}
            <line className="eje" x1={ml} x2={W - mr} y1={y(0)} y2={y(0)} />
            {s.map((p, i) => (i % cadaN === 0 ? <text key={i} x={x(i) + g.ancho / 2} y={H - 9} textAnchor="middle">{p.t.replace("semana ", "s").replace(" de ", " ")}</text> : null))}
          </svg>
        )}
        {sel && <p className="aviso info" style={{ marginTop: 8 }}><b>{sel.t}:</b> {fmt(sel.obs)} defunciones observadas{sel.esp != null ? `; esperadas ${fmt(sel.esp)}, rango ${fmt(sel.bajo)} a ${fmt(sel.alto)}` : ""}{sel.calor ? `; ${sel.calor} día(s) de episodio de calor` : ""}{sel.prov ? "; cifra provisional" : ""}.</p>}
      </div>
      <div className="tarjeta" style={{ marginTop: 12 }} data-tour="calor-def">
        <h3>Períodos con episodio de calor en {nombreTerr}</h3>
        {!r?.resumen.hay_episodios ? <p className="chico">Aún no hay episodios de calor calculados para este territorio: falta su serie histórica de temperatura. Hoy solo la Región Metropolitana la tiene.</p>
          : sobre.length === 0 ? <p className="chico">Ningún período del filtro coincide con un episodio de calor.</p> : (
            <>
              <p className="chico">{r.resumen.con_calor} de {r.resumen.periodos} períodos coinciden con un episodio de calor; en {r.resumen.con_calor_sobre} las defunciones superaron el rango esperado.</p>
              <div className="tabla-caja" style={{ marginTop: 6, maxHeight: 260, overflowY: "auto" }}>
                <table>
                  <thead><tr><th>Período</th><th className="n">Días de calor</th><th className="n">Observadas</th><th className="n">Esperadas</th><th className="n">Rango</th><th>Resultado</th></tr></thead>
                  <tbody>{sobre.map((p) => <tr key={p.ini}><td>{p.t}</td><td className="n">{p.calor}</td><td className="n">{fmt(p.obs)}</td><td className="n">{fmt(p.esp)}</td><td className="n">{p.bajo != null ? `${fmt(p.bajo)} a ${fmt(p.alto)}` : ""}</td>
                    <td>{p.alto == null ? "sin referencia" : p.obs! > p.alto ? <b>sobre el rango</b> : "dentro del rango"}</td></tr>)}</tbody>
                </table>
              </div>
            </>
          )}
      </div>
    </div>
  );
}
