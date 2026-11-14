/** Gráficos SVG generados en el servidor. Cada marca trae su valor al pasar el cursor y hay una tabla alternativa. */
import type { SemanaVig } from "@/lib/datos";
import type { Umbral } from "@/lib/niveles";
import { fechaCorta, fechaLarga } from "@/lib/tiempo";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
type Tramo = "total" | "e0_64" | "e65_79" | "e80_mas";
const dec = (n: number | null | undefined) => (n == null ? "sin dato" : n.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

function escala(max: number) {
  const paso = [1, 2, 5, 10, 20, 50, 100, 200, 250, 500, 1000, 2000].find((p) => max / p <= 5) ?? 5000;
  const tope = Math.ceil(max / paso) * paso;
  return { tope, marcas: Array.from({ length: tope / paso + 1 }, (_, i) => i * paso) };
}

/** Defunciones semanales observadas contra lo esperado con su rango (RF-28). */
export function BarrasSemanales({ semanas, tramo, enEpisodio }: { semanas: SemanaVig[]; tramo: Tramo; enEpisodio: Set<string> }) {
  const W = 920, H = 280, ml = 44, mr = 12, mt = 14, mb = 30;
  const esp = (s: SemanaVig) => s[`${tramo}_esp` as const] as [number, number, number] | null;
  const max = Math.max(...semanas.map((s) => Math.max(s[tramo] ?? 0, esp(s)?.[2] ?? 0)), 1);
  const { tope, marcas } = escala(max * 1.05);
  const paso = (W - ml - mr) / semanas.length;
  const x = (i: number) => ml + i * paso;
  const y = (v: number) => mt + (H - mt - mb) * (1 - v / tope);
  const conEsp = semanas.map((s, i) => ({ i, e: esp(s) })).filter((d) => d.e);
  const banda = conEsp.length
    ? `M${conEsp.map((d) => `${x(d.i) + paso / 2},${y(d.e![2])}`).join(" L")} L${[...conEsp].reverse().map((d) => `${x(d.i) + paso / 2},${y(d.e![0])}`).join(" L")} Z` : "";
  const linea = conEsp.map((d, k) => `${k ? "L" : "M"}${x(d.i) + paso / 2},${y(d.e![1])}`).join(" ");
  return (
    <figure style={{ margin: 0 }}>
      <div className="leyenda-graf">
        <span><span className="cuadro" style={{ background: "#c9d2f2" }} />Observadas</span>
        <span><span className="cuadro" style={{ background: "#c9d2f2", opacity: 0.45, outline: "1px dashed #c9d2f2" }} />Provisionales (últimas 4 semanas)</span>
        <span><span className="cuadro" style={{ background: "var(--n3)" }} />Semana con episodio de calor</span>
        <span><span className="cuadro" style={{ background: "rgba(157,184,255,.25)", borderTop: "2px solid #9db8ff" }} />Esperadas: mediana y rango</span>
      </div>
      <svg className="grafico" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Defunciones semanales observadas y esperadas">
        {marcas.map((m) => <g key={m}><line className="guia" x1={ml} x2={W - mr} y1={y(m)} y2={y(m)} /><text x={ml - 6} y={y(m) + 4} textAnchor="end">{m.toLocaleString("es-CL")}</text></g>)}
        {banda && <path d={banda} fill="rgba(157,184,255,.18)" />}
        {semanas.map((s, i) => {
          const v = s[tramo]; if (v == null) return null;
          const e = esp(s); const ep = enEpisodio.has(`${s.a}-${s.s}`);
          return (
            <rect key={i} x={x(i) + 1} y={y(v)} width={Math.max(1, paso - 2)} height={y(0) - y(v)} rx={Math.min(3, paso / 3)}
              fill={ep ? "var(--n3)" : "#c9d2f2"} opacity={s.provisional ? 0.45 : 1} stroke={s.provisional ? "#c9d2f2" : "none"} strokeDasharray="3 2">
              <title>{`Semana ${s.s} de ${s.a} (desde el ${fechaLarga(s.inicio)}): ${v.toLocaleString("es-CL")} observadas${s.provisional ? " (provisional)" : ""}; esperadas ${e ? `${e[1].toLocaleString("es-CL")} (rango ${e[0].toLocaleString("es-CL")} a ${e[2].toLocaleString("es-CL")})` : "sin referencia"}${ep ? "; semana con episodio de calor" : ""}`}</title>
            </rect>
          );
        })}
        {linea && <path d={linea} fill="none" stroke="#9db8ff" strokeWidth={2} />}
        <line className="eje" x1={ml} x2={W - mr} y1={y(0)} y2={y(0)} />
        {semanas.map((s, i) => {
          const d = new Date(s.inicio + "T12:00:00Z");
          return d.getUTCDate() <= 7 ? <text key={i} x={x(i) + paso / 2} y={H - 10} textAnchor="middle">{MESES[d.getUTCMonth()]}{d.getUTCMonth() === 0 ? ` ${d.getUTCFullYear()}` : ""}</text> : null;
        })}
      </svg>
    </figure>
  );
}

export type PuntoTemp = { fecha: string; tmean: number | null; tmax: number | null; tmin: number | null; tipo: "observado" | "pronóstico" };

/** Temperatura observada y pronosticada de una comuna con sus cortes locales (RF-02). */
export function LineaTemperatura({ puntos, umbral }: { puntos: PuntoTemp[]; umbral: Umbral | null }) {
  const W = 920, H = 260, ml = 40, mr = 92, mt = 12, mb = 30;
  const vals = puntos.flatMap((p) => [p.tmax, p.tmin, p.tmean]).filter((v): v is number => v != null);
  if (vals.length === 0) return <p className="chico">Sin temperatura guardada todavía.</p>;
  const cortes = umbral ? [umbral.p90, umbral.p95, umbral.p99] : [];
  const lo = Math.floor(Math.min(...vals, ...cortes) - 1), hi = Math.ceil(Math.max(...vals, ...cortes) + 1);
  const x = (i: number) => ml + (W - ml - mr) * (puntos.length === 1 ? 0.5 : i / (puntos.length - 1));
  const y = (v: number) => mt + (H - mt - mb) * (1 - (v - lo) / (hi - lo));
  const obs = puntos.map((p, i) => ({ ...p, i })).filter((p) => p.tipo === "observado" && p.tmean != null);
  const pron = puntos.map((p, i) => ({ ...p, i })).filter((p) => p.tipo === "pronóstico" && p.tmean != null);
  const camino = (ps: { i: number; tmean: number | null }[]) => ps.map((p, k) => `${k ? "L" : "M"}${x(p.i)},${y(p.tmean!)}`).join(" ");
  const rango = puntos.map((p, i) => ({ ...p, i })).filter((p) => p.tmax != null && p.tmin != null);
  const banda = rango.length > 1 ? `M${rango.map((p) => `${x(p.i)},${y(p.tmax!)}`).join(" L")} L${[...rango].reverse().map((p) => `${x(p.i)},${y(p.tmin!)}`).join(" L")} Z` : "";
  const marcas = Array.from({ length: Math.floor((hi - lo) / 5) + 1 }, (_, k) => Math.ceil(lo / 5) * 5 + k * 5).filter((m) => m <= hi);
  const puente = obs.length && pron.length ? [obs[obs.length - 1], pron[0]] : [];
  return (
    <figure style={{ margin: 0 }}>
      <div className="leyenda-graf">
        <span><svg width="22" height="8"><line x1="0" x2="22" y1="4" y2="4" stroke="#fff" strokeWidth="2" /></svg>Media observada</span>
        <span><svg width="22" height="8"><line x1="0" x2="22" y1="4" y2="4" stroke="#fff" strokeWidth="2" strokeDasharray="4 3" /></svg>Media pronosticada</span>
        <span><span className="cuadro" style={{ background: "rgba(157,184,255,.22)" }} />Entre mínima y máxima</span>
      </div>
      <svg className="grafico" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Temperatura diaria observada y pronosticada con los cortes locales">
        {marcas.map((m) => <g key={m}><line className="guia" x1={ml} x2={W - mr} y1={y(m)} y2={y(m)} /><text x={ml - 6} y={y(m) + 4} textAnchor="end">{m}°</text></g>)}
        {banda && <path d={banda} fill="rgba(157,184,255,.16)" />}
        {umbral && ([["p90", umbral.p90, "var(--n1)", "Nivel 1"], ["p95", umbral.p95, "var(--n2)", "Nivel 2"], ["p99", umbral.p99, "var(--n3)", "Nivel 3"]] as const).map(([k, v, c, t]) => (
          <g key={k}><line x1={ml} x2={W - mr} y1={y(v)} y2={y(v)} stroke={c} strokeWidth={1.5} strokeDasharray="2 4" /><text x={W - mr + 6} y={y(v) + 4}>{t} · {v.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}°</text></g>
        ))}
        <path d={camino(obs)} fill="none" stroke="#fff" strokeWidth={2} />
        {puente.length === 2 && <path d={camino(puente)} fill="none" stroke="#fff" strokeWidth={2} strokeDasharray="4 4" />}
        <path d={camino(pron)} fill="none" stroke="#fff" strokeWidth={2} strokeDasharray="4 4" />
        {puntos.map((p, i) => p.tmean == null ? null : (
          <g key={p.fecha}>
            <circle cx={x(i)} cy={y(p.tmean)} r={4} fill={p.tipo === "observado" ? "#fff" : "#0c143a"} stroke="#fff" strokeWidth={2} />
            <rect x={x(i) - 14} y={mt} width={28} height={H - mt - mb} fill="transparent">
              <title>{`${fechaCorta(p.fecha)} (${p.tipo}): media ${dec(p.tmean)} °C, máxima ${dec(p.tmax)} °C, mínima ${dec(p.tmin)} °C`}</title>
            </rect>
            <text x={x(i)} y={H - 10} textAnchor="middle">{fechaCorta(p.fecha)}</text>
          </g>
        ))}
      </svg>
    </figure>
  );
}

/** Serie corta sin ejes, para ver la tendencia de un indicador. */
export function Chispa({ valores, base, titulo }: { valores: (number | null)[]; base?: number | null; titulo: string }) {
  const W = 120, H = 28;
  const v = valores.filter((x): x is number => x != null);
  if (v.length < 2) return <span className="chico">sin dato</span>;
  const lo = Math.min(...v, base ?? Infinity), hi = Math.max(...v, base ?? -Infinity);
  const y = (n: number) => 3 + (H - 6) * (1 - (n - lo) / (hi - lo || 1));
  let d = "", abierto = false;
  valores.forEach((n, i) => { if (n == null) { abierto = false; return; } d += `${abierto ? "L" : "M"}${(i / (valores.length - 1)) * W},${y(n)} `; abierto = true; });
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={titulo}>
      <title>{titulo}</title>
      {base != null && <line x1={0} x2={W} y1={y(base)} y2={y(base)} stroke="#7f8bbd" strokeDasharray="2 3" />}
      <path d={d} fill="none" stroke="#fff" strokeWidth={1.75} />
    </svg>
  );
}

/** Barras horizontales simples para comparar territorios. Admite valores negativos. */
export function BarrasH({ filas, unidad }: { filas: { nombre: string; valor: number; nota?: string }[]; unidad: string }) {
  const max = Math.max(...filas.map((f) => Math.abs(f.valor)), 1);
  const hayNeg = filas.some((f) => f.valor < 0);
  return (
    <div role="img" aria-label={`Barras por territorio, ${unidad}`}>
      {filas.map((f) => (
        <div key={f.nombre} style={{ display: "grid", gridTemplateColumns: "170px 1fr 48px", gap: 8, alignItems: "center", padding: "3px 0", fontSize: 13 }} title={`${f.nombre}: ${f.valor} ${unidad}${f.nota ? ` · ${f.nota}` : ""}`}>
          <span className="tenue">{f.nombre}</span>
          <span style={{ position: "relative", height: 12, display: "block" }}>
            <span style={{ position: "absolute", left: hayNeg ? "50%" : 0, top: 0, bottom: 0, width: 1, background: "var(--borde)" }} />
            <span style={{ position: "absolute", top: 0, bottom: 0, borderRadius: 3, background: f.valor < 0 ? "#7f8bbd" : "#c9d2f2",
              left: hayNeg ? (f.valor < 0 ? `${50 - (Math.abs(f.valor) / max) * 50}%` : "50%") : 0, width: `${(Math.abs(f.valor) / max) * (hayNeg ? 50 : 100)}%` }} />
          </span>
          <span className="tab" style={{ textAlign: "right", fontWeight: 700 }}>{f.valor.toLocaleString("es-CL")}</span>
        </div>
      ))}
    </div>
  );
}
