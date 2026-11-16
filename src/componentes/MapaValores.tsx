"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type ExpressionSpecification, type Map as Mapa } from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";

const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const CHILE: [[number, number], [number, number]] = [[-75.8, -55.9], [-66.6, -17.4]];
const RAMPA = ["--seq1", "--seq2", "--seq3", "--seq4", "--seq5"];

/** Cortes por cuantiles para pintar en hasta cinco clases de un solo tono. */
export function cortes(valores: (number | null)[]): number[] {
  const v = valores.filter((x): x is number => x != null && x > 0).sort((a, b) => a - b);
  if (v.length < 2) return [];
  const k = Math.min(5, v.length), out: number[] = [];
  for (let i = 1; i < k; i++) { const c = v[Math.floor((i * v.length) / k)]; if (!out.includes(c)) out.push(c); }
  return out;
}

/** Mapa de regiones o comunas pintado por un valor. Lee las teselas directo; un clic baja de nivel. */
export function MapaValores({ modo, valores, nombres, bbox, formato, alPinchar, alto = 420 }: {
  modo: "region" | "comuna"; valores: Record<string, number | null>; nombres: Record<string, string>;
  bbox: [number, number, number, number] | null; formato: (v: number) => string; alPinchar?: (cod: string) => void; alto?: number;
}) {
  const caja = useRef<HTMLDivElement>(null), mapa = useRef<Mapa | null>(null);
  const [listo, setListo] = useState(false), [tema, setTema] = useState(0), [tamano, setTamano] = useState(0), [tip, setTip] = useState<{ x: number; y: number; t: string } | null>(null);
  const ref = useRef({ modo, valores, nombres, formato, alPinchar }); ref.current = { modo, valores, nombres, formato, alPinchar };
  const cs = useMemo(() => cortes(Object.values(valores)), [valores]);
  const llave = (cod: string) => (ref.current.modo === "region" ? cod.slice(0, 2) : cod);
  useEffect(() => {
    if (!caja.current || mapa.current) return;
    const pr = new Protocol(); maplibregl.addProtocol("pmtiles", pr.tile);
    const horizontal = caja.current.clientWidth > caja.current.clientHeight * 1.15;
    const m = new maplibregl.Map({ container: caja.current, bounds: CHILE, fitBoundsOptions: { padding: 20, bearing: horizontal ? 90 : 0 }, minZoom: 1.5, maxZoom: 12, dragRotate: false, attributionControl: { compact: true },
      style: { version: 8, sources: { chile: { type: "vector", url: `pmtiles://${location.origin}/teselas/chile.pmtiles`, attribution: "Límites: INE, Censo 2024 (CC BY-SA 4.0)" } },
        layers: [{ id: "relleno", type: "fill", source: "chile", "source-layer": "comunas", paint: { "fill-color": css("--sin") } },
          { id: "linea", type: "line", source: "chile", "source-layer": "comunas", paint: { "line-color": css("--mapa-linea"), "line-width": 0.3 } },
          { id: "regiones", type: "line", source: "chile", "source-layer": "regiones", paint: { "line-color": css("--mapa-linea"), "line-width": 1.2 } }] } });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => setListo(true));
    m.on("click", (e) => { const f = m.queryRenderedFeatures(e.point, { layers: ["relleno"] })[0]; const k = f && llave(String(f.properties.cod)); if (k && k in ref.current.valores) ref.current.alPinchar?.(k); });
    m.on("mousemove", (e) => {
      const f = m.queryRenderedFeatures(e.point, { layers: ["relleno"] })[0], k = f && llave(String(f.properties.cod));
      if (!k || !(k in ref.current.valores)) { setTip(null); m.getCanvas().style.cursor = ""; return; }
      const v = ref.current.valores[k];
      m.getCanvas().style.cursor = "pointer";
      setTip({ x: e.point.x, y: e.point.y, t: `${ref.current.nombres[k] ?? k}: ${v == null ? "datos insuficientes" : ref.current.formato(v)}` });
    });
    m.on("mouseout", () => setTip(null));
    mapa.current = m;
    const ro = new ResizeObserver(() => { m.resize(); setTamano((x) => x + 1); });
    ro.observe(caja.current);
    const t = () => setTema((x) => x + 1); window.addEventListener("calor:tema", t);
    return () => { ro.disconnect(); window.removeEventListener("calor:tema", t); m.remove(); mapa.current = null; maplibregl.removeProtocol("pmtiles"); };
  }, []);
  useEffect(() => {
    const m = mapa.current; if (!m || !listo) return;
    const grupos: string[][] = RAMPA.map(() => []), sinDato: string[] = [];
    for (const [cod, v] of Object.entries(valores)) { if (v == null) sinDato.push(cod); else grupos[cs.filter((c) => v >= c).length].push(cod); }
    const campo = modo === "region" ? ["slice", ["get", "cod"], 0, 2] : ["get", "cod"];
    const e: unknown[] = ["match", campo];
    grupos.forEach((g, i) => { if (g.length) e.push(g, css(RAMPA[cs.length ? i : 2])); });
    if (sinDato.length) e.push(sinDato, css("--sin"));
    e.push(css("--fuera"));
    m.setPaintProperty("relleno", "fill-color", (e.length > 3 ? e : css("--fuera")) as ExpressionSpecification);
    m.setPaintProperty("linea", "line-color", css("--mapa-linea")); m.setPaintProperty("regiones", "line-color", css("--mapa-linea"));
    m.setPaintProperty("linea", "line-opacity", modo === "region" ? 0 : 1);
  }, [valores, modo, cs, listo, tema]);
  useEffect(() => {
    const m = mapa.current; if (!m || !listo) return;
    if (bbox) m.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 30, bearing: 0, duration: 0 });
    else m.fitBounds(CHILE, { padding: 20, bearing: caja.current!.clientWidth > caja.current!.clientHeight * 1.15 ? 90 : 0, duration: 0 });
  }, [bbox, listo, tamano]);
  return (
    <div>
      <div style={{ position: "relative", height: alto, borderRadius: 10, overflow: "hidden", border: "1px solid var(--borde-suave)" }}>
        <div ref={caja} className="mapa" role="application" aria-label="Mapa por lugar" />
        {tip && <div className="tooltip-mapa" style={{ left: tip.x, top: tip.y }}>{tip.t}</div>}
      </div>
      <div className="leyenda-graf" style={{ marginTop: 8 }}>
        {cs.length ? RAMPA.slice(0, cs.length + 1).map((c, i) => <span key={c}><i className="cuadro" style={{ background: `var(${c})` }} />{i === 0 ? `menos de ${formato(cs[0])}` : i === cs.length ? `${formato(cs[i - 1])} o más` : `${formato(cs[i - 1])} a ${formato(cs[i])}`}</span>) : null}
        <span><i className="cuadro" style={{ background: "var(--sin)" }} />datos insuficientes</span>
      </div>
    </div>
  );
}
