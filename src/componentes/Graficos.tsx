"use client";
import { useState, type ReactNode } from "react";

const W = 760, IZQ = 46, DER = 12;
const ticks = (max: number, n = 4) => {
  if (!(max > 0)) return [0];
  const paso = Math.pow(10, Math.floor(Math.log10(max / n))), m = max / n / paso;
  const p = (m >= 5 ? 5 : m >= 2 ? 2 : 1) * paso;
  return Array.from({ length: Math.floor(max / p) + 1 }, (_, i) => +(i * p).toFixed(6));
};
const f = (v: number, d = 0) => v.toLocaleString("es-CL", { maximumFractionDigits: d });

function Flotante({ x, children }: { x: number; children: ReactNode }) {
  return <div className="graf-tip" style={x > 0.6 ? { right: `${(1 - x) * 100}%` } : { left: `${x * 100}%` }}>{children}</div>;
}

/** Dos paneles alineados por verano: barras arriba y línea con su rango abajo. Un clic elige el verano. */
export function SerieVeranos({ etiquetas, barras, linea, lo, hi, rotuloBarras, rotuloLinea, dec = 0, sel, alElegir }: {
  etiquetas: string[]; barras: (number | null)[]; linea: (number | null)[]; lo: (number | null)[]; hi: (number | null)[];
  rotuloBarras: string; rotuloLinea: string; dec?: number; sel: number | null; alElegir?: (i: number) => void;
}) {
  const [h, setH] = useState<number | null>(null);
  const n = etiquetas.length, A1 = 96, A2 = 170, SEP = 34, H = A1 + SEP + A2 + 30;
  const ancho = (W - IZQ - DER) / n, cx = (i: number) => IZQ + ancho * (i + 0.5);
  const maxB = Math.max(1, ...barras.map((v) => v ?? 0)), tb = ticks(maxB, 3), topeB = Math.max(maxB, tb[tb.length - 1]);
  const maxL = Math.max(1e-9, ...hi.map((v) => v ?? 0), ...linea.map((v) => v ?? 0)), tl = ticks(maxL, 4), topeL = Math.max(maxL, tl[tl.length - 1]);
  const yB = (v: number) => A1 - (v / topeB) * (A1 - 14), y0 = A1 + SEP, yL = (v: number) => y0 + A2 - (Math.max(0, v) / topeL) * (A2 - 10);
  const tramos: number[][] = [];
  linea.forEach((v, i) => { if (v == null) return; const u = tramos[tramos.length - 1]; if (u && u[u.length - 1] === i - 1) u.push(i); else tramos.push([i]); });
  const cada = Math.ceil(n / 12);
  return (
    <div className="graf-caja" onMouseLeave={() => setH(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="grafico" role="img" aria-label={`${rotuloBarras} y ${rotuloLinea} por verano`}>
        <text x={0} y={10} style={{ fontWeight: 650 }}>{rotuloBarras}</text>
        {tb.map((t) => <g key={t}><line className="guia" x1={IZQ} x2={W - DER} y1={yB(t)} y2={yB(t)} /><text x={IZQ - 6} y={yB(t) + 4} textAnchor="end">{f(t)}</text></g>)}
        {barras.map((v, i) => v != null && <rect key={i} x={cx(i) - ancho * 0.36} width={ancho * 0.72} y={yB(v)} height={Math.max(0, A1 - yB(v))} rx={Math.min(3, ancho * 0.2)} fill="var(--n2)" opacity={sel == null || sel === i ? 1 : 0.45} />)}
        <text x={0} y={y0 - 12} style={{ fontWeight: 650 }}>{rotuloLinea}</text>
        {tl.map((t) => <g key={t}><line className="guia" x1={IZQ} x2={W - DER} y1={yL(t)} y2={yL(t)} /><text x={IZQ - 6} y={yL(t) + 4} textAnchor="end">{f(t, dec)}</text></g>)}
        {tramos.map((u, k) => <g key={k}>
          <path d={`M${u.map((i) => `${cx(i)},${yL(hi[i] ?? 0)}`).join("L")}L${[...u].reverse().map((i) => `${cx(i)},${yL(lo[i] ?? 0)}`).join("L")}Z`} fill="var(--banda)" />
          <path d={`M${u.map((i) => `${cx(i)},${yL(linea[i]!)}`).join("L")}`} fill="none" stroke="var(--tinta)" strokeWidth={2} strokeLinejoin="round" />
        </g>)}
        {linea.map((v, i) => v != null && <circle key={i} cx={cx(i)} cy={yL(v)} r={sel === i ? 5 : n > 30 ? 2.5 : 3.5} fill="var(--tinta)" stroke="var(--panel)" strokeWidth={sel === i ? 2 : 1} />)}
        {etiquetas.map((e, i) => i % cada === 0 && <text key={i} x={cx(i)} y={H - 8} textAnchor="middle">{e}</text>)}
        {h != null && <line x1={cx(h)} x2={cx(h)} y1={12} y2={y0 + A2} stroke="var(--texto-3)" strokeDasharray="3 3" />}
        {etiquetas.map((_, i) => <rect key={i} x={IZQ + ancho * i} width={ancho} y={0} height={H} fill="transparent" style={{ cursor: alElegir ? "pointer" : "default" }} onMouseEnter={() => setH(i)} onClick={() => alElegir?.(i)} />)}
      </svg>
      {h != null && <Flotante x={cx(h) / W}>
        <b>Verano {etiquetas[h]}</b>
        <div>{rotuloBarras}: {barras[h] == null ? "sin dato" : f(barras[h]!, 1)}</div>
        <div>{rotuloLinea}: {linea[h] == null ? "sin dato" : `${f(linea[h]!, dec)} (${f(Math.max(0, lo[h] ?? 0), dec)} a ${f(Math.max(0, hi[h] ?? 0), dec)})`}</div>
      </Flotante>}
    </div>
  );
}

/** Detalle diario de un verano: temperatura máxima arriba (con el umbral de calor extremo) y casos del día abajo. */
export function DetalleDiario({ inicio, tmax, calor, p95, valores, rotuloValores, rotuloArriba, arriba }: {
  inicio: string; tmax: number[] | null; calor: number[]; p95: number | null; valores: number[]; rotuloValores: string; rotuloArriba?: string; arriba?: number[];
}) {
  const [h, setH] = useState<number | null>(null);
  const serie = tmax ?? arriba ?? [], n = Math.max(serie.length, valores.length);
  const A1 = 120, A2 = 130, SEP = 34, H = A1 + SEP + A2 + 28, ancho = (W - IZQ - DER) / n, cx = (i: number) => IZQ + ancho * (i + 0.5);
  const minT = tmax ? Math.floor(Math.min(...serie, p95 ?? 99) - 1) : 0, maxT = Math.ceil(Math.max(...serie, p95 ?? 0) + 1);
  const yT = (v: number) => A1 - ((v - minT) / (maxT - minT || 1)) * (A1 - 14);
  const maxV = Math.max(1, ...valores), tv = ticks(maxV, 3), topeV = Math.max(maxV, tv[tv.length - 1]), y0 = A1 + SEP, yV = (v: number) => y0 + A2 - (v / topeV) * (A2 - 8);
  const fecha = (i: number) => { const d = new Date(inicio + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + i); return d; };
  const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const esCalor = new Set(calor);
  const tt = tmax ? ticks(maxT - minT, 3).map((t) => t + minT) : ticks(maxT, 3);
  return (
    <div className="graf-caja" onMouseLeave={() => setH(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="grafico" role="img" aria-label="Detalle diario del verano">
        <text x={0} y={10} style={{ fontWeight: 650 }}>{tmax ? "Temperatura máxima (°C)" : rotuloArriba}</text>
        {calor.map((i) => <rect key={i} x={IZQ + ancho * i} width={ancho + 0.3} y={14} height={y0 + A2 - 14} fill="var(--n2)" opacity={0.16} />)}
        {tt.map((t) => <g key={t}><line className="guia" x1={IZQ} x2={W - DER} y1={yT(t)} y2={yT(t)} /><text x={IZQ - 6} y={yT(t) + 4} textAnchor="end">{f(t)}</text></g>)}
        {tmax ? <path d={`M${serie.map((v, i) => `${cx(i)},${yT(v)}`).join("L")}`} fill="none" stroke="var(--n2)" strokeWidth={2} strokeLinejoin="round" />
          : serie.map((v, i) => v > 0 && <rect key={i} x={cx(i) - ancho * 0.4} width={ancho * 0.8} y={yT(v)} height={A1 - yT(v)} fill="var(--n2)" />)}
        {tmax && p95 != null && <g><line x1={IZQ} x2={W - DER} y1={yT(p95)} y2={yT(p95)} stroke="var(--texto-2)" strokeDasharray="5 4" /><text x={W - DER} y={yT(p95) - 4} textAnchor="end">calor extremo: sobre {f(p95, 1)} °C</text></g>}
        <text x={0} y={y0 - 12} style={{ fontWeight: 650 }}>{rotuloValores}</text>
        {tv.map((t) => <g key={t}><line className="guia" x1={IZQ} x2={W - DER} y1={yV(t)} y2={yV(t)} /><text x={IZQ - 6} y={yV(t) + 4} textAnchor="end">{f(t)}</text></g>)}
        {valores.map((v, i) => v > 0 && <rect key={i} x={cx(i) - ancho * 0.38} width={Math.max(1, ancho * 0.76)} y={yV(v)} height={y0 + A2 - yV(v)} fill={esCalor.has(i) ? "var(--tinta)" : "var(--barra)"} />)}
        {Array.from({ length: n }, (_, i) => fecha(i)).map((d, i) => d.getUTCDate() === 1 && <text key={i} x={cx(i)} y={H - 8}>{MES[d.getUTCMonth()]} {d.getUTCFullYear()}</text>)}
        {h != null && <line x1={cx(h)} x2={cx(h)} y1={14} y2={y0 + A2} stroke="var(--texto-3)" strokeDasharray="3 3" />}
        <rect x={IZQ} width={W - IZQ - DER} y={0} height={H} fill="transparent" onMouseMove={(e) => { const r = (e.currentTarget as SVGRectElement).getBoundingClientRect(); setH(Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * n)))); }} />
      </svg>
      {h != null && <Flotante x={cx(h) / W}>
        <b>{fecha(h).getUTCDate()} {MES[fecha(h).getUTCMonth()]} {fecha(h).getUTCFullYear()}</b>{esCalor.has(h) && <span> · calor extremo</span>}
        {serie[h] != null && <div>{tmax ? `Máxima: ${f(serie[h], 1)} °C` : `${rotuloArriba}: ${f(serie[h])}`}</div>}
        <div>{rotuloValores}: {f(valores[h] ?? 0)}</div>
      </Flotante>}
    </div>
  );
}

/** Curva de riesgo: aumento de casos según la temperatura, con su banda de incertidumbre, el umbral y el corte de calor extremo. */
export function CurvaRiesgo({ x, rr, lo, hi, umbral, p95, unidad }: { x: number[]; rr: number[]; lo: number[]; hi: number[]; umbral: number | null; p95: number | null; unidad: string }) {
  const [h, setH] = useState<number | null>(null);
  const H = 268, A = 200, ARR = 18, pc = (v: number) => (v - 1) * 100;
  const maxY = Math.max(5, ...hi.map(pc)), minY = Math.min(0, ...lo.map(pc)), ty = ticks(maxY, 4);
  const px = (v: number) => IZQ + ((v - x[0]) / (x[x.length - 1] - x[0])) * (W - IZQ - DER), py = (v: number) => ARR + A - ((v - minY) / (maxY - minY)) * A;
  const marcas = ticks(x[x.length - 1] - x[0], 6).map((t) => Math.ceil(x[0]) + t).filter((t) => t <= x[x.length - 1]);
  return (
    <div className="graf-caja" onMouseLeave={() => setH(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="grafico" role="img" aria-label="Curva de riesgo según la temperatura">
        <text x={0} y={10} style={{ fontWeight: 650 }}>Aumento de casos respecto de un día sin calor (%)</text>
        {ty.map((t) => <g key={t}><line className="guia" x1={IZQ} x2={W - DER} y1={py(t)} y2={py(t)} /><text x={IZQ - 6} y={py(t) + 4} textAnchor="end">{f(t)}</text></g>)}
        <path d={`M${x.map((v, i) => `${px(v)},${py(pc(hi[i]))}`).join("L")}L${[...x.keys()].reverse().map((i) => `${px(x[i])},${py(pc(lo[i]))}`).join("L")}Z`} fill="var(--banda)" />
        <path d={`M${x.map((v, i) => `${px(v)},${py(pc(rr[i]))}`).join("L")}`} fill="none" stroke="var(--tinta)" strokeWidth={2} />
        {umbral != null && <g><line x1={px(umbral)} x2={px(umbral)} y1={ARR} y2={ARR + A} stroke="var(--texto-2)" strokeDasharray="5 4" /><text x={px(umbral) + 5} y={ARR + 12}>umbral: {unidad === "°C" ? `${f(umbral, 1)} °C` : `percentil ${f(umbral)}`}</text></g>}
        {p95 != null && <g><line x1={px(p95)} x2={px(p95)} y1={ARR} y2={ARR + A} stroke="var(--n2)" strokeDasharray="5 4" /><text x={px(p95) + (px(p95) > W - 170 ? -5 : 5)} y={ARR + 28} textAnchor={px(p95) > W - 170 ? "end" : "start"} style={{ fill: "var(--texto)" }}>calor extremo{unidad === "°C" ? `: ${f(p95, 1)} °C` : ""}</text></g>}
        {marcas.map((t) => <text key={t} x={px(t)} y={ARR + A + 16} textAnchor="middle">{f(t)}</text>)}
        <text x={W - DER} y={H - 6} textAnchor="end">{unidad === "°C" ? "Promedio de la máxima del día y de los 3 anteriores (°C)" : "Percentil local de la temperatura"}</text>
        {h != null && <circle cx={px(x[h])} cy={py(pc(rr[h]))} r={4.5} fill="var(--tinta)" stroke="var(--panel)" strokeWidth={2} />}
        <rect x={IZQ} width={W - IZQ - DER} y={0} height={H} fill="transparent" onMouseMove={(e) => { const r = (e.currentTarget as SVGRectElement).getBoundingClientRect(); setH(Math.min(x.length - 1, Math.max(0, Math.round(((e.clientX - r.left) / r.width) * (x.length - 1))))); }} />
      </svg>
      {h != null && <Flotante x={px(x[h]) / W}>
        <b>{f(x[h], 1)} {unidad === "°C" ? "°C" : "(percentil)"}</b>
        <div>{rr[h] <= 1 ? "Sin aumento estimado" : `+${f(pc(rr[h]), 1)} % (${f(Math.max(0, pc(lo[h])), 1)} a ${f(pc(hi[h]), 1)} %)`}</div>
      </Flotante>}
    </div>
  );
}

/** Ranking horizontal con rango: barra hasta la estimación y línea del intervalo. */
export function BarrasRango({ filas, dec = 0, alElegir }: { filas: { cod: string; nombre: string; valor: number; lo: number; hi: number; nota?: string; href?: string }[]; dec?: number; alElegir?: (cod: string) => void }) {
  const max = Math.max(1e-9, ...filas.map((x) => Math.max(x.hi, x.valor)));
  return (
    <div className="rank">
      {filas.map((x) => (
        <div key={x.cod} className="rank-fila" title={x.nota}>
          {x.href ? <a href={x.href}>{x.nombre}</a> : <button className="enlace-btn" onClick={() => alElegir?.(x.cod)}>{x.nombre}</button>}
          <div className="rank-barra"><i style={{ width: `${(Math.max(0, x.valor) / max) * 100}%` }} /><b style={{ left: `${(Math.max(0, x.lo) / max) * 100}%`, width: `${((Math.max(0, x.hi) - Math.max(0, x.lo)) / max) * 100}%` }} /></div>
          <span className="tab">{f(Math.max(0, x.valor), dec)} <small>({f(Math.max(0, x.lo), dec)} a {f(Math.max(0, x.hi), dec)})</small></span>
        </div>
      ))}
    </div>
  );
}

/** Perfil: porcentaje de cada categoría en días de calor extremo frente a días normales. */
export function PerfilBarras({ cat, calor, normal }: { cat: string[]; calor: number[]; normal: number[] }) {
  const tc = calor.reduce((a, b) => a + b, 0), tn = normal.reduce((a, b) => a + b, 0);
  const filas = cat.map((c, i) => ({ c, a: tc ? (calor[i] / tc) * 100 : 0, b: tn ? (normal[i] / tn) * 100 : 0 })).filter((x) => x.a + x.b > 0);
  const max = Math.max(1, ...filas.map((x) => Math.max(x.a, x.b)));
  return (
    <div className="perfil">
      {filas.map((x) => (
        <div key={x.c} className="perfil-fila" title={`${x.c}: ${f(x.a, 1)} % en días de calor extremo, ${f(x.b, 1)} % en días normales`}>
          <span>{x.c}</span>
          <div><i className="calor" style={{ width: `${(x.a / max) * 100}%` }} /><i className="normal" style={{ width: `${(x.b / max) * 100}%` }} /></div>
          <span className="tab"><b>{f(x.a, 1)} %</b><br /><small>{f(x.b, 1)} %</small></span>
          <span className={`dif tab ${x.a - x.b > 0.5 ? "sube" : ""}`}>{Math.abs(x.a - x.b) < 0.05 ? "" : x.a - x.b > 0 ? "+" : "−"}{f(Math.abs(x.a - x.b), 1)}</span>
        </div>
      ))}
    </div>
  );
}
