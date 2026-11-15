"use client";
import { useEffect, useRef, useState } from "react";
import maplibregl, { type ExpressionSpecification, type Map as Mapa } from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";

const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

/** Mapa de comunas coloreado por clase de robustez. Lee las teselas directo; no consulta la base. */
export function MapaClases({ clases, bbox, alPinchar }: { clases: Record<string, string | null>; bbox: [number, number, number, number] | null; alPinchar?: (cod: string) => void }) {
  const caja = useRef<HTMLDivElement>(null), mapa = useRef<Mapa | null>(null);
  const [listo, setListo] = useState(false), [tema, setTema] = useState(0);
  const pinchar = useRef(alPinchar); pinchar.current = alPinchar;
  useEffect(() => {
    if (!caja.current || mapa.current) return;
    const pr = new Protocol(); maplibregl.addProtocol("pmtiles", pr.tile);
    const m = new maplibregl.Map({ container: caja.current, bounds: [[-75.8, -55.9], [-66.6, -17.4]], fitBoundsOptions: { padding: 20, bearing: caja.current.clientWidth > caja.current.clientHeight * 1.15 ? 90 : 0 }, minZoom: 1.5, maxZoom: 12, dragRotate: false, attributionControl: { compact: true },
      style: { version: 8, sources: { chile: { type: "vector", url: `pmtiles://${location.origin}/teselas/chile.pmtiles`, attribution: "Límites: INE, Censo 2024 (CC BY-SA 4.0)" } },
        layers: [{ id: "relleno", type: "fill", source: "chile", "source-layer": "comunas", paint: { "fill-color": css("--sin") } }, { id: "linea", type: "line", source: "chile", "source-layer": "comunas", paint: { "line-color": css("--mapa-linea"), "line-width": 0.4 } }] } });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => setListo(true));
    m.on("click", (e) => { const f = m.queryRenderedFeatures(e.point, { layers: ["relleno"] })[0]; if (f) pinchar.current?.(String(f.properties.cod)); });
    mapa.current = m;
    const t = () => setTema((x) => x + 1); window.addEventListener("calor:tema", t);
    return () => { window.removeEventListener("calor:tema", t); m.remove(); mapa.current = null; maplibregl.removeProtocol("pmtiles"); };
  }, []);
  useEffect(() => {
    const m = mapa.current; if (!m || !listo) return;
    const color: Record<string, string> = { robusta: css("--rob-robusta"), depende: css("--rob-depende"), no: css("--pri-media") };
    const grupos: Record<string, string[]> = {};
    for (const [cod, c] of Object.entries(clases)) if (c && color[c]) (grupos[c] ??= []).push(cod);
    const e: unknown[] = ["match", ["get", "cod"]];
    for (const [c, cods] of Object.entries(grupos)) e.push(cods, color[c]);
    e.push(css("--sin"));
    m.setPaintProperty("relleno", "fill-color", (e.length === 3 ? css("--sin") : e) as ExpressionSpecification);
    m.setPaintProperty("linea", "line-color", css("--mapa-linea"));
  }, [clases, listo, tema]);
  useEffect(() => {
    const m = mapa.current; if (!m || !listo) return;
    if (bbox) m.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 30, bearing: 0, duration: 600 });
    else m.fitBounds([[-75.8, -55.9], [-66.6, -17.4]], { padding: 20, bearing: caja.current!.clientWidth > caja.current!.clientHeight * 1.15 ? 90 : 0, duration: 600 });
  }, [bbox, listo]);
  return <div style={{ position: "relative", height: 380, borderRadius: 10, overflow: "hidden", border: "1px solid var(--borde-suave)" }}><div ref={caja} className="mapa" role="application" aria-label="Mapa de comunas por clase de robustez" /></div>;
}
