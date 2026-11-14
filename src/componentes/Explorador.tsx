"use client";
/**
 * Mapa por región, provincia, comuna y manzana (RF-01). Lee teselas PMTiles directo; los niveles salen de
 * /api/niveles (ruta en caché). El ámbito elegido define qué se agrega y qué estadísticas se muestran.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type ExpressionSpecification, type Map as Mapa } from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import { agregar, NOMBRE_ESTADO, resumen } from "@/lib/alerta";
import { Ayuda, type Paso } from "./Ayuda";
import { NivelChip } from "./Basicos";

export type ComunaLigera = {
  cod: string; nombre: string; cod_region: string; cod_prov: string; bbox: [number, number, number, number] | null; isla: boolean;
  pob: number; pob65: number; mayores_alta: number; n_alta: number; n_media: number; n_mz: number;
  dep: number | null; oxi: number | null; est: number; hosp: number; rz: number | null; def: number | null; esp: number | null;
  mz: [number | null, number | null, number | null, number | null, number | null] | null; // 60+ por manzana: prom, DE, máx; % de 60+: prom, DE
  au: [number | null, number | null, number] | null; // AURA: verano día, verano noche, cobertura
};
export type Territorio = { cod: string; nombre: string; cod_region?: string };
type Datos = Record<string, [number | null, number | null, number | null, number | null, number, number | null]>;
type Niveles = { fecha: string; tipo: string; datos: Datos };
type Est = { cod: string; nombre: string; tipo: string; com: string; lat: number; lon: number; urg: boolean; sistema: string; u?: { m65: number | null; ult: number | null; hab: number | null; dc: number; da: number } };
type Manzana = Record<string, string | number | undefined> & { lng: number; lat: number };
type Ambito = { tipo: "pais" | "region" | "provincia" | "comuna"; cod: string };
type Unidad = "region" | "provincia" | "comuna" | "manzana";

const COLOR = ["#1d2c78", "#f5a623", "#f26a21", "#d81e3a"];
const RAMPA = ["#2f4fd1", "#7f9cf5", "#f1e3a0", "#f5a623", "#f26a21", "#d81e3a"];
const CHILE: [[number, number], [number, number]] = [[-75.8, -55.9], [-66.6, -17.4]];
const CLASE: Record<string, string> = { alta: "Alta", media: "Media", sin: "Sin prioridad" };
const UNIDADES: Record<Ambito["tipo"], Unidad[]> = { pais: ["region", "provincia", "comuna"], region: ["provincia", "comuna"], provincia: ["comuna"], comuna: ["manzana"] };
const NOMBRE_UNIDAD: Record<Unidad, string> = { region: "región", provincia: "provincia", comuna: "comuna", manzana: "manzana" };
const fmt = (n: number | null | undefined, d = 0) => (n == null || Number.isNaN(n) ? "sin dato" : n.toLocaleString("es-CL", { minimumFractionDigits: d, maximumFractionDigits: d }));
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const corta = (f: string) => { const d = new Date(f + "T12:00:00Z"); return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`; };
const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const conf = (i: number) => (i <= 2 ? "alta" : i <= 4 ? "media" : i <= 7 ? "baja" : "muy baja");

function distanciaM(a: [number, number], b: [number, number]) {
  const R = 6371000, r = Math.PI / 180, dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Barra apilada de comunas por nivel; el detalle numérico va en el título y en la fila. */
export function BarraNiveles({ n, sin }: { n: number[]; sin: number }) {
  const total = n.reduce((a, b) => a + b, 0) + sin;
  const texto = `Nivel 0: ${n[0]} · 1: ${n[1]} · 2: ${n[2]} · 3: ${n[3]} · sin umbral: ${sin}`;
  return (
    <span className="dist" role="img" aria-label={texto} title={texto}>
      {n.map((x, i) => (x ? <i key={i} style={{ width: `${(x / total) * 100}%`, background: `var(--n${i})` }} /> : null))}
    </span>
  );
}
export function EstadoPill({ e }: { e: number | null | undefined }) {
  return <span className={`estado e${e ?? "x"}`}>{e == null ? "Sin umbral" : NOMBRE_ESTADO[e]}</span>;
}

export function Explorador(p: {
  comunas: ComunaLigera[]; regiones: Territorio[]; provincias: Territorio[];
  hoy: string | null; futuras: string[]; pasadas: string[]; versionUmbral: string; conUmbral: number;
  aura: boolean; auraComunas?: string[]; auraZonas?: Record<string, string>; fraccion: number; cobertura: number;
  episodio?: { id: string; nombre: string; fechas: string[]; niveles: Record<string, Record<string, number>> } | null;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const mapa = useRef<Mapa | null>(null);
  const regionCargada = useRef<string | null>(null);
  const establecimientos = useRef<Record<string, Est[]>>({});
  const [listo, setListo] = useState(false);
  const [tema, setTema] = useState(0);
  const [vista, setVista] = useState<"pasado" | "presente" | "futuro">(p.episodio ? "pasado" : "presente");
  const [fecha, setFecha] = useState<string | null>(p.episodio ? p.episodio.fechas[0] : p.hoy);
  const [niveles, setNiveles] = useState<Niveles | null>(null);
  const [ambito, setAmbito] = useState<Ambito>({ tipo: "pais", cod: "CL" });
  const [unidad, setUnidad] = useState<Unidad>("region");
  const [nivelMin, setNivelMin] = useState(0);
  const [manzana, setManzana] = useState<Manzana | null>(null);
  const [estSel, setEstSel] = useState<Est | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; texto: string } | null>(null);
  const [zoom, setZoom] = useState(4);
  const [estListos, setEstListos] = useState(0);
  const [regMz, setRegMz] = useState<string | null>(null);
  const [capaMz, setCapaMz] = useState<"prioridad" | "dia" | "noche">("prioridad");
  const conAura = p.aura && regMz === "13";

  const porCod = useMemo(() => new Map(p.comunas.map((c) => [c.cod, c])), [p.comunas]);
  const nomReg = useMemo(() => new Map(p.regiones.map((r) => [r.cod, r.nombre])), [p.regiones]);
  const nomProv = useMemo(() => new Map(p.provincias.map((r) => [r.cod, r.nombre])), [p.provincias]);

  const ir = useCallback((a: Ambito) => { setAmbito(a); setUnidad(UNIDADES[a.tipo][0]); setManzana(null); setEstSel(null); }, []);
  const miembros = useMemo(() => p.comunas.filter((c) => ambito.tipo === "pais" || (ambito.tipo === "region" && c.cod_region === ambito.cod)
    || (ambito.tipo === "provincia" && c.cod_prov === ambito.cod) || (ambito.tipo === "comuna" && c.cod === ambito.cod)), [p.comunas, ambito]);
  const nombreAmbito = ambito.tipo === "pais" ? "Chile" : ambito.tipo === "region" ? `Región ${nomReg.get(ambito.cod) ?? ""}`
    : ambito.tipo === "provincia" ? `Provincia de ${nomProv.get(ambito.cod) ?? ""}` : porCod.get(ambito.cod)?.nombre ?? "";

  const agregado = useCallback((cs: ComunaLigera[], i: 0 | 5) => agregar(cs.map((c) => ({ valor: niveles?.datos[c.cod]?.[i], peso: c.pob65 })), p.fraccion, p.cobertura), [niveles, p.fraccion, p.cobertura]);
  const grupos = useMemo(() => {
    const g = new Map<string, ComunaLigera[]>();
    for (const c of miembros) { const k = unidad === "region" ? c.cod_region : unidad === "provincia" ? c.cod_prov : c.cod; if (!g.has(k)) g.set(k, []); g.get(k)!.push(c); }
    return [...g.entries()].map(([cod, cs]) => {
      const n = [0, 0, 0, 0]; let sin = 0;
      for (const c of cs) { const v = niveles?.datos[c.cod]?.[0]; if (v == null) sin++; else n[v]++; }
      const nombre = unidad === "region" ? nomReg.get(cod) ?? cod : unidad === "provincia" ? nomProv.get(cod) ?? cod : cs[0].nombre;
      return { cod, nombre, cs, n, sin, nivel: agregado(cs, 0), pob65: cs.reduce((a, c) => a + c.pob65, 0) };
    }).sort((a, b) => ((b.nivel ?? -1) - (a.nivel ?? -1)) || b.pob65 - a.pob65);
  }, [miembros, niveles, unidad, nomReg, nomProv, agregado]);
  const total = useMemo(() => {
    const n = [0, 0, 0, 0]; let sin = 0;
    for (const c of miembros) { const v = niveles?.datos[c.cod]?.[0]; if (v == null) sin++; else n[v]++; }
    return { n, sin, estado: agregado(miembros, 5) };
  }, [miembros, niveles, agregado]);
  const estado = useRef({ unidad, niveles, porCod, grupos });
  estado.current = { unidad, niveles, porCod, grupos };

  // Niveles de la fecha elegida, sin recargar la página.
  useEffect(() => {
    if (!fecha) return;
    if (p.episodio && p.episodio.niveles[fecha]) {
      const datos: Datos = {};
      for (const [cod, n] of Object.entries(p.episodio.niveles[fecha])) datos[cod] = [n, null, null, null, 0, n];
      setNiveles({ fecha, tipo: "serie histórica", datos });
      return;
    }
    let vivo = true;
    fetch(`/api/niveles?fecha=${fecha}`).then((r) => r.json()).then((j) => { if (vivo) setNiveles(j); }).catch(() => { if (vivo) setNiveles({ fecha, tipo: "sin conexión", datos: {} }); });
    return () => { vivo = false; };
  }, [fecha, p.episodio]);

  useEffect(() => { const f = () => setTema((t) => t + 1); window.addEventListener("calor:tema", f); return () => window.removeEventListener("calor:tema", f); }, []);
  // Acciones que dispara el recorrido de ayuda.
  useEffect(() => {
    const f = (e: Event) => {
      const d = (e as CustomEvent).detail as Record<string, string>;
      if (d.ambito) { const [tipo, cod] = d.ambito.split(":"); ir({ tipo: tipo as Ambito["tipo"], cod }); }
      if (d.unidad) setUnidad(d.unidad as Unidad);
      if (d.vista === "presente") { setVista("presente"); setFecha(p.hoy); }
      if (d.vista === "futuro") { setVista("futuro"); setFecha(p.futuras[3] ?? p.hoy); }
    };
    window.addEventListener("calor:tour", f);
    return () => window.removeEventListener("calor:tour", f);
  }, [ir, p.hoy, p.futuras]);

  const asegurarRegion = useCallback((reg: string) => {
    const m = mapa.current; if (!m || regionCargada.current === reg) return;
    for (const id of ["mz-sel", "mz-linea", "mz-relleno", "est-puntos"]) if (m.getLayer(id)) m.removeLayer(id);
    for (const id of ["mz", "est"]) if (m.getSource(id)) m.removeSource(id);
    regionCargada.current = reg;
    setRegMz(reg);
    const conModulo = p.aura && reg === "13";
    m.addSource("mz", { type: "vector", url: `pmtiles://${location.origin}/teselas/manzanas_${reg}${conModulo ? "_aura" : ""}.pmtiles`,
      attribution: conModulo ? "Manzanas: INE, Censo 2024 · Calor por manzana: AURA (2026)" : "Manzanas: INE, Censo 2024 (CC BY-SA 4.0)" });
    m.addLayer({ id: "mz-relleno", type: "fill", source: "mz", "source-layer": "manzanas", minzoom: 10, paint: { "fill-color": css("--pri-sin"), "fill-opacity": 0.88 } }, "comunas-linea");
    m.addLayer({ id: "mz-linea", type: "line", source: "mz", "source-layer": "manzanas", minzoom: 12, paint: { "line-color": css("--mapa-linea"), "line-width": 0.6 } }, "comunas-linea");
    m.addLayer({ id: "mz-sel", type: "line", source: "mz", "source-layer": "manzanas", minzoom: 12, filter: ["==", ["get", "cod_manzana"], ""], paint: { "line-color": css("--tinta"), "line-width": 3 } });
    const pintarEst = (lista: Est[]) => {
      if (regionCargada.current !== reg || m.getSource("est")) return;
      m.addSource("est", { type: "geojson", data: { type: "FeatureCollection", features: lista.map((e) => ({ type: "Feature", geometry: { type: "Point", coordinates: [e.lon, e.lat] }, properties: { cod: e.cod, nombre: e.nombre, tipo: e.tipo, urg: e.urg, hosp: /hospital/i.test(e.tipo) } })) } });
      // Los hospitales se ven desde lejos; el resto de los establecimientos, al acercarse.
      m.addLayer({ id: "est-puntos", type: "circle", source: "est", minzoom: 8.5,
        paint: { "circle-radius": ["case", ["==", ["get", "hosp"], true], 6, 4], "circle-color": ["case", ["==", ["get", "urg"], true], "#ff5a4f", "#4fd1a1"],
          "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.5,
          "circle-opacity": ["step", ["zoom"], ["case", ["==", ["get", "hosp"], true], 1, 0], 11.5, 1],
          "circle-stroke-opacity": ["step", ["zoom"], ["case", ["==", ["get", "hosp"], true], 1, 0], 11.5, 1] } });
    };
    if (establecimientos.current[reg]) pintarEst(establecimientos.current[reg]);
    else fetch(`/datos/establecimientos_${reg}.json`).then((r) => r.json()).then((l: Est[]) => { establecimientos.current[reg] = l; setEstListos((n) => n + 1); pintarEst(l); }).catch((e) => console.error("[establecimientos]", e));
  }, [p.aura]);

  // Inicio del mapa
  useEffect(() => {
    if (!caja.current || mapa.current) return;
    const protocolo = new Protocol();
    maplibregl.addProtocol("pmtiles", protocolo.tile);
    const m = new maplibregl.Map({
      container: caja.current, bounds: CHILE, fitBoundsOptions: { padding: 30, bearing: caja.current.clientWidth > caja.current.clientHeight * 1.15 ? 90 : 0 },
      maxZoom: 17, minZoom: 1.5, attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false,
      style: {
        version: 8,
        sources: { chile: { type: "vector", url: `pmtiles://${location.origin}/teselas/chile.pmtiles`, attribution: "Límites: INE, Censo 2024 (CC BY-SA 4.0) · Temperatura: Open-Meteo (CC BY 4.0)" } },
        layers: [
          { id: "fondo", type: "background", paint: { "background-color": "rgba(0,0,0,0)" } },
          { id: "comunas-relleno", type: "fill", source: "chile", "source-layer": "comunas", paint: { "fill-color": css("--sin"), "fill-opacity": 0.95 } },
          { id: "comunas-linea", type: "line", source: "chile", "source-layer": "comunas", paint: { "line-color": css("--mapa-linea"), "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.2, 8, 0.8, 12, 1.5] } },
          { id: "regiones-linea", type: "line", source: "chile", "source-layer": "regiones", maxzoom: 9, paint: { "line-color": css("--mapa-linea"), "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.8, 8, 2] } },
          { id: "ambito-sel", type: "line", source: "chile", "source-layer": "comunas", filter: ["==", ["get", "cod"], ""], paint: { "line-color": css("--tinta"), "line-width": 1.6 } },
        ],
      },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapa.current = m;
    m.on("load", () => setListo(true));
    m.on("zoom", () => setZoom(m.getZoom()));
    m.on("moveend", () => {
      if (m.getZoom() < 8.3) return;
      const c = m.queryRenderedFeatures(m.project(m.getCenter()), { layers: ["comunas-relleno"] })[0];
      if (c?.properties?.region) asegurarRegion(String(c.properties.region));
    });
    m.on("mousemove", (e) => {
      const capas = ["comunas-relleno"]; if (m.getLayer("est-puntos")) capas.unshift("est-puntos");
      const f = m.queryRenderedFeatures(e.point, { layers: capas })[0];
      m.getCanvas().style.cursor = f ? "pointer" : "";
      if (!f) { setTip(null); return; }
      if (f.layer.id === "est-puntos") { setTip({ x: e.point.x, y: e.point.y, texto: `${f.properties.nombre} · ${f.properties.tipo}` }); return; }
      const s = estado.current, c = s.porCod.get(String(f.properties.cod));
      if (!c) { setTip(null); return; }
      const g = s.grupos.find((x) => x.cs.includes(c));
      const v = s.niveles?.datos[c.cod];
      const texto = !g ? c.nombre : s.unidad === "comuna" || s.unidad === "manzana"
        ? `${c.nombre} · ${v?.[0] != null ? `nivel ${v[0]}` : "sin umbral"}${v?.[1] != null ? ` · ${fmt(v[1], 1)} °C media` : ""}`
        : `${s.unidad === "region" ? "Región" : "Provincia de"} ${g.nombre} · ${g.nivel != null ? `nivel ${g.nivel}` : "sin umbral"} · ${g.cs.length} comunas`;
      setTip({ x: e.point.x, y: e.point.y, texto });
    });
    m.on("mouseout", () => setTip(null));
    m.on("click", (e) => {
      if (m.getLayer("est-puntos")) {
        const ef = m.queryRenderedFeatures(e.point, { layers: ["est-puntos"] }).find((x) => m.getZoom() >= 11.5 || x.properties.hosp);
        if (ef) { const l = establecimientos.current[regionCargada.current ?? ""] ?? []; setEstSel(l.find((x) => x.cod === String(ef.properties.cod)) ?? null); return; }
      }
      if (m.getZoom() >= 12 && m.getLayer("mz-relleno")) {
        const mz = m.queryRenderedFeatures(e.point, { layers: ["mz-relleno"] })[0];
        if (mz) { setAmbito({ tipo: "comuna", cod: String(mz.properties.cod_comuna) }); setUnidad("manzana"); setEstSel(null); setManzana({ ...(mz.properties as Record<string, string | number>), lng: e.lngLat.lng, lat: e.lngLat.lat }); return; }
      }
      const f = m.queryRenderedFeatures(e.point, { layers: ["comunas-relleno"] })[0];
      const c = f && estado.current.porCod.get(String(f.properties.cod)); if (!c) return;
      const u = estado.current.unidad;
      ir(u === "region" ? { tipo: "region", cod: c.cod_region } : u === "provincia" ? { tipo: "provincia", cod: c.cod_prov } : { tipo: "comuna", cod: c.cod });
    });
    return () => { m.remove(); mapa.current = null; maplibregl.removeProtocol("pmtiles"); };
  }, [asegurarRegion, ir]);

  // Colores: cada comuna toma el nivel agregado de su grupo (región, provincia o ella misma).
  useEffect(() => {
    const m = mapa.current; if (!m || !listo) return;
    const sin = css("--sin"), porColor = new Map<string, string[]>();
    for (const g of grupos) {
      if (g.nivel == null || g.nivel < nivelMin) continue;
      const color = COLOR[g.nivel];
      if (!porColor.has(color)) porColor.set(color, []);
      porColor.get(color)!.push(...g.cs.map((c) => c.cod));
    }
    const e: unknown[] = ["match", ["get", "cod"]];
    for (const [color, cods] of porColor) e.push(cods, color);
    e.push(sin);
    m.setPaintProperty("comunas-relleno", "fill-color", (e.length === 3 ? sin : e) as ExpressionSpecification);
    const cods = miembros.map((c) => c.cod);
    const dentro: unknown = ambito.tipo === "pais" ? true : ["in", ["get", "cod"], ["literal", cods]];
    m.setPaintProperty("comunas-relleno", "fill-opacity", ["interpolate", ["linear"], ["zoom"], 9.5, ["case", dentro, 0.95, 0.25], 11, ["case", dentro, 0.3, 0.1], 12.5, ["case", dentro, 0.12, 0.05]] as unknown as ExpressionSpecification);
    m.setFilter("ambito-sel", (ambito.tipo === "pais" ? ["==", ["get", "cod"], ""] : ["in", ["get", "cod"], ["literal", cods]]) as maplibregl.FilterSpecification);
    for (const id of ["comunas-linea", "regiones-linea"]) m.setPaintProperty(id, "line-color", css("--mapa-linea"));
    m.setPaintProperty("ambito-sel", "line-color", css("--tinta"));
  }, [grupos, nivelMin, listo, ambito, miembros, tema]);

  // Capa de manzanas: prioridad o temperatura estimada (comuna + diferencia fija de AURA, supuesto S7)
  const escalaMz = useMemo(() => {
    if (!conAura || capaMz === "prioridad" || !niveles) return null;
    const i = capaMz === "dia" ? 2 : 3, pares: (string | number)[] = [], ts: number[] = [];
    for (const cod of p.auraComunas ?? []) { const t = niveles.datos[cod]?.[i]; if (t != null) { pares.push(cod, t); ts.push(t); } }
    if (ts.length === 0) return null;
    return { pares, lo: Math.floor(Math.min(...ts) - 1.5), hi: Math.ceil(Math.max(...ts) + 1.5), campo: capaMz === "dia" ? "dif_temp_dia" : "dif_temp_noche" };
  }, [conAura, capaMz, niveles, p.auraComunas]);
  useEffect(() => {
    const m = mapa.current; if (!m || !listo || !m.getLayer("mz-relleno")) return;
    m.setPaintProperty("mz-linea", "line-color", css("--mapa-linea"));
    if (!escalaMz) { m.setPaintProperty("mz-relleno", "fill-color", ["match", ["get", "clase_prioridad"], "alta", css("--pri-alta"), "media", css("--pri-media"), css("--pri-sin")]); return; }
    const { pares, lo, hi, campo } = escalaMz, paso = (hi - lo) / 5;
    const t = ["+", ["get", campo], ["match", ["get", "cod_comuna"], ...pares, -99]];
    m.setPaintProperty("mz-relleno", "fill-color", ["case", ["all", ["has", campo], [">", t, -50]],
      ["interpolate", ["linear"], t, lo, RAMPA[0], lo + paso, RAMPA[1], lo + 2 * paso, RAMPA[2], lo + 3 * paso, RAMPA[3], lo + 4 * paso, RAMPA[4], hi, RAMPA[5]], css("--sin")] as unknown as ExpressionSpecification);
  }, [escalaMz, listo, regMz, tema]);

  // Encuadre según el ámbito
  useEffect(() => {
    const m = mapa.current; if (!m || !listo) return;
    if (ambito.tipo === "pais") { const h = caja.current!.clientWidth > caja.current!.clientHeight * 1.15; m.fitBounds(CHILE, { bearing: h ? 90 : 0, padding: 30, duration: 700 }); return; }
    const cs = miembros.filter((c) => c.bbox && (!c.isla || miembros.length === 1));
    if (cs.length === 0) return;
    const b = cs.reduce((a, c) => [Math.min(a[0], c.bbox![0]), Math.min(a[1], c.bbox![1]), Math.max(a[2], c.bbox![2]), Math.max(a[3], c.bbox![3])], [180, 90, -180, -90]);
    asegurarRegion(cs[0].cod_region);
    if (!manzana) m.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 40, bearing: 0, duration: 700, maxZoom: 13.5 });
  }, [ambito, listo]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const m = mapa.current; if (!m || !listo || !m.getLayer("mz-sel")) return;
    m.setFilter("mz-sel", ["==", ["get", "cod_manzana"], manzana ? String(manzana.cod_manzana) : ""]);
  }, [manzana, listo]);
  useEffect(() => {
    if (!listo) return;
    const ini = new URLSearchParams(location.search).get("comuna");
    if (ini && porCod.has(ini)) ir({ tipo: "comuna", cod: ini });
    else if (p.episodio) ir({ tipo: "region", cod: p.episodio.id.slice(0, 2) });
  }, [listo]); // eslint-disable-line react-hooks/exhaustive-deps

  const c1 = ambito.tipo === "comuna" ? porCod.get(ambito.cod) ?? null : null;
  const v1 = c1 ? niveles?.datos[c1.cod] : null;
  const cercanos = useMemo(() => {
    if (!manzana || !c1) return null;
    const lista = establecimientos.current[c1.cod_region];
    return lista ? lista.map((e) => ({ ...e, d: distanciaM([manzana.lng, manzana.lat], [e.lon, e.lat]) })).filter((e) => e.d <= 1000).sort((a, b) => a.d - b.d) : null;
  }, [manzana, c1, estListos]); // eslint-disable-line react-hooks/exhaustive-deps

  const elegirVista = (v: typeof vista) => {
    setVista(v);
    setFecha(v === "presente" ? p.hoy : v === "futuro" ? p.futuras[1] ?? p.hoy : p.episodio ? p.episodio.fechas[0] : p.pasadas[p.pasadas.length - 1] ?? null);
  };
  const regSel = ambito.tipo === "region" ? ambito.cod : ambito.tipo === "pais" ? "" : miembros[0]?.cod_region ?? "";
  const provSel = ambito.tipo === "provincia" ? ambito.cod : ambito.tipo === "comuna" ? miembros[0]?.cod_prov ?? "" : "";
  const st = (i: 1 | 2 | 3) => resumen(miembros.map((c) => niveles?.datos[c.cod]?.[i]));
  const suma = (f: (c: ComunaLigera) => number | null) => miembros.reduce((a, c) => a + (f(c) ?? 0), 0);
  const conRz = miembros.filter((c) => c.rz != null);
  const conDef = miembros.filter((c) => c.def != null && c.esp != null);
  const iFut = fecha ? p.futuras.indexOf(fecha) : -1;
  const pct65 = resumen(miembros.map((c) => (c.pob ? (c.pob65 / c.pob) * 100 : null)));

  return (
    <div className="explorador">
      <div className="mapa-caja">
        <div ref={caja} className="mapa" role="application" aria-label="Mapa de Chile con el nivel de calor" />
        <div className="mapa-controles">
          <div className="segmento" role="group" aria-label="Vista" data-tour="vista">
            {(["pasado", "presente", "futuro"] as const).map((x) => <button key={x} aria-pressed={vista === x} onClick={() => elegirVista(x)}>{x[0].toUpperCase() + x.slice(1)}</button>)}
          </div>
          {vista === "pasado" && <div className="segmento" role="group" aria-label="Fecha">{(p.episodio ? p.episodio.fechas : p.pasadas).map((f) => <button key={f} aria-pressed={fecha === f} onClick={() => setFecha(f)}>{corta(f)}</button>)}</div>}
          {vista === "futuro" && (
            <select aria-label="Día del pronóstico" value={fecha ?? ""} onChange={(e) => setFecha(e.target.value)}>
              {p.futuras.slice(1).map((f, i) => <option key={f} value={f}>+{i + 1} · {corta(f)} · confianza {conf(i + 1)}</option>)}
            </select>
          )}
          <span data-tour="filtros" className="fila" style={{ gap: 6 }}>
            <select aria-label="Región" value={regSel} onChange={(e) => ir(e.target.value ? { tipo: "region", cod: e.target.value } : { tipo: "pais", cod: "CL" })}>
              <option value="">Todas las regiones</option>{p.regiones.map((r) => <option key={r.cod} value={r.cod}>{r.nombre}</option>)}
            </select>
            {regSel && <select aria-label="Provincia" value={provSel} onChange={(e) => ir(e.target.value ? { tipo: "provincia", cod: e.target.value } : { tipo: "region", cod: regSel })}>
              <option value="">Todas las provincias</option>{p.provincias.filter((x) => x.cod_region === regSel).map((x) => <option key={x.cod} value={x.cod}>{x.nombre}</option>)}
            </select>}
            {regSel && <select aria-label="Comuna" value={c1?.cod ?? ""} onChange={(e) => ir(e.target.value ? { tipo: "comuna", cod: e.target.value } : provSel ? { tipo: "provincia", cod: provSel } : { tipo: "region", cod: regSel })}>
              <option value="">Todas las comunas</option>{p.comunas.filter((x) => x.cod_region === regSel && (!provSel || x.cod_prov === provSel)).sort((a, b) => a.nombre.localeCompare(b.nombre)).map((x) => <option key={x.cod} value={x.cod}>{x.nombre}</option>)}
            </select>}
            <select aria-label="Nivel mínimo" value={nivelMin} onChange={(e) => setNivelMin(Number(e.target.value))}>
              <option value={0}>Todos los niveles</option><option value={1}>Nivel 1 o más</option><option value={2}>Nivel 2 o más</option><option value={3}>Solo nivel 3</option>
            </select>
          </span>
          <div className="segmento" role="group" aria-label="Ver por" data-tour="unidad">
            {UNIDADES[ambito.tipo].map((u) => <button key={u} aria-pressed={unidad === u} onClick={() => setUnidad(u)}>Por {NOMBRE_UNIDAD[u]}</button>)}
          </div>
          {conAura && zoom >= 9.8 && (
            <div className="segmento" role="group" aria-label="Capa de manzanas">
              {([["prioridad", "Prioridad"], ["dia", "Temp. día"], ["noche", "Temp. noche"]] as const).map(([k, t]) => <button key={k} aria-pressed={capaMz === k} onClick={() => setCapaMz(k)}>{t}</button>)}
            </div>
          )}
          {p.episodio && <a className="pildora" style={{ background: "var(--flotante)" }} href="/pasado">Episodio {p.episodio.nombre} · salir</a>}
        </div>
        {tip && <div className="tooltip-mapa" style={{ left: tip.x, top: tip.y }}>{tip.texto}</div>}
        <div className="leyenda" data-tour="leyenda">
          <div className="fila" style={{ gap: 8, marginTop: 0 }}>
            <b style={{ color: "var(--texto)" }}>Nivel</b>
            {[0, 1, 2, 3].map((n) => <span key={n} className="fila" style={{ gap: 4 }}><span className="cuadro" style={{ background: `var(--n${n})` }} />{n}</span>)}
            <span className="fila" style={{ gap: 4 }}><span className="cuadro" style={{ background: "var(--sin)" }} />sin umbral</span>
          </div>
          {zoom >= 9.8 && (escalaMz ? (
            <div className="fila" style={{ gap: 6 }}><b style={{ color: "var(--texto)" }}>Manzanas</b><span>{escalaMz.lo}°</span><span style={{ flex: 1, minWidth: 80, height: 10, borderRadius: 3, background: `linear-gradient(90deg, ${RAMPA.join(",")})` }} /><span>{escalaMz.hi}°</span></div>
          ) : (
            <div className="fila" style={{ gap: 8 }}><b style={{ color: "var(--texto)" }}>Manzanas</b>
              {(["alta", "media", "sin"] as const).map((k) => <span key={k} className="fila" style={{ gap: 4 }}><span className="cuadro" style={{ background: `var(--pri-${k})` }} />{k === "sin" ? "sin prioridad" : k}</span>)}
            </div>
          ))}
          {zoom >= 8.5 && <div className="fila" style={{ gap: 8 }}><b style={{ color: "var(--texto)" }}>Salud</b><span className="fila" style={{ gap: 4 }}><span className="cuadro" style={{ background: "#ff5a4f", borderRadius: 99 }} />con urgencia</span><span className="fila" style={{ gap: 4 }}><span className="cuadro" style={{ background: "#4fd1a1", borderRadius: 99 }} />sin urgencia</span></div>}
        </div>
      </div>

      <aside className="lateral" aria-live="polite" data-tour="lateral">
        <div className="fila entre">
          <div className="chico">
            <button className="enlace-btn" onClick={() => ir({ tipo: "pais", cod: "CL" })}>Chile</button>
            {regSel && <> › <button className="enlace-btn" onClick={() => ir({ tipo: "region", cod: regSel })}>{nomReg.get(regSel)}</button></>}
            {provSel && <> › <button className="enlace-btn" onClick={() => ir({ tipo: "provincia", cod: provSel })}>{nomProv.get(provSel)}</button></>}
            {c1 && <> › {c1.nombre}</>}
          </div>
          <Ayuda pasos={PASOS_MAPA} />
        </div>
        {estSel ? <FichaEst e={estSel} comuna={porCod.get(estSel.com)?.nombre ?? ""} cerrar={() => setEstSel(null)} />
          : manzana && c1 ? <FichaManzana mz={manzana} comuna={c1} cercanos={cercanos} aura={p.aura} zonas={p.auraZonas ?? {}} tcom={v1 ? { tmax: v1[2], tmin: v1[3] } : null} fecha={fecha} cerrar={() => setManzana(null)} />
            : (
              <>
                <div className="fila entre" style={{ marginTop: 8 }}>
                  <h2>{nombreAmbito}</h2>
                  <EstadoPill e={c1 ? v1?.[5] : total.estado} />
                </div>
                <div className="chico">{fecha ? corta(fecha) : "sin fecha"} · {niveles?.tipo ?? "cargando"}{iFut > 0 ? ` · confianza ${conf(iFut)}` : ""}</div>
                {!p.hoy && <div className="aviso seccion">Sin clima guardado. Ejecuta la tarea diaria en <a href="/admin">Carga</a>.</div>}

                <section className="seccion" data-tour="distribucion">
                  <h3>{c1 ? "Nivel de la comuna y manzanas por prioridad" : `Comunas por nivel, por ${NOMBRE_UNIDAD[unidad]}`}</h3>
                  {c1 ? (
                    <>
                      <div className="fila" style={{ margin: "6px 0" }}><NivelChip nivel={v1?.[0] ?? null} incierto={!!v1?.[4]} grande /><span>{v1?.[1] != null ? `Media ${fmt(v1[1], 1)} °C · máx. ${fmt(v1[2], 1)} °C · mín. ${fmt(v1[3], 1)} °C` : "Sin temperatura para esta fecha"}</span></div>
                      <span className="dist" title={`Alta: ${c1.n_alta} · media: ${c1.n_media} · sin prioridad: ${c1.n_mz - c1.n_alta - c1.n_media}`}>
                        <i style={{ width: `${(c1.n_alta / c1.n_mz) * 100}%`, background: "var(--pri-alta)" }} /><i style={{ width: `${(c1.n_media / c1.n_mz) * 100}%`, background: "var(--pri-media)" }} /><i style={{ flex: 1, background: "var(--pri-sin)" }} />
                      </span>
                      <div className="chico" style={{ marginTop: 4 }}>Manzanas: {fmt(c1.n_alta)} de prioridad alta, {fmt(c1.n_media)} media, de {fmt(c1.n_mz)}. Acércate y pincha una.</div>
                    </>
                  ) : (
                    <>
                      <div className="fila" style={{ margin: "6px 0", gap: 6 }}>
                        {[0, 1, 2, 3].map((n) => <span key={n} className="fila" style={{ gap: 3 }}><NivelChip nivel={n} /><b>{total.n[n]}</b></span>)}
                        <span className="fila" style={{ gap: 3 }}><NivelChip nivel={null} /><b>{total.sin}</b></span>
                      </div>
                      <BarraNiveles n={total.n} sin={total.sin} />
                      <div style={{ marginTop: 8, maxHeight: 330, overflowY: "auto" }}>
                        {grupos.map((g) => (
                          <div className="dist-fila" key={g.cod}>
                            <button onClick={() => ir(unidad === "region" ? { tipo: "region", cod: g.cod } : unidad === "provincia" ? { tipo: "provincia", cod: g.cod } : { tipo: "comuna", cod: g.cod })} title={g.nombre}>{g.nombre}</button>
                            {unidad === "comuna" ? <span className="chico">{niveles?.datos[g.cod]?.[1] != null ? `${fmt(niveles.datos[g.cod][1], 1)} °C` : ""}</span> : <BarraNiveles n={g.n} sin={g.sin} />}
                            <NivelChip nivel={g.nivel} />
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </section>

                <section className="seccion" data-tour="estadisticas">
                  <h3>Estadísticas de {nombreAmbito}</h3>
                  {!c1 && (
                    <table className="tabla-mini">
                      <thead><tr><th>Entre sus {miembros.length} comunas</th><th className="n">Promedio</th><th className="n">Desv. est.</th><th className="n">Mín.</th><th className="n">Máx.</th></tr></thead>
                      <tbody>
                        {([["Temperatura media (°C)", 1], ["Temperatura máxima (°C)", 2], ["Temperatura mínima (°C)", 3]] as const).map(([t, i]) => { const s = st(i); return <tr key={t}><td>{t}</td><td className="n">{fmt(s?.prom, 1)}</td><td className="n">{s?.de == null ? "–" : fmt(s.de, 1)}</td><td className="n">{fmt(s?.min, 1)}</td><td className="n">{fmt(s?.max, 1)}</td></tr>; })}
                        <tr><td>Población de 65+ (%)</td><td className="n">{fmt(pct65?.prom, 1)}</td><td className="n">{pct65?.de == null ? "–" : fmt(pct65.de, 1)}</td><td className="n">{fmt(pct65?.min, 1)}</td><td className="n">{fmt(pct65?.max, 1)}</td></tr>
                      </tbody>
                    </table>
                  )}
                  {c1?.mz && (
                    <table className="tabla-mini">
                      <thead><tr><th>Entre sus manzanas</th><th className="n">Promedio</th><th className="n">Desv. est.</th><th className="n">Máx.</th></tr></thead>
                      <tbody>
                        <tr><td>Personas de 60+ por manzana</td><td className="n">{fmt(c1.mz[0], 1)}</td><td className="n">{fmt(c1.mz[1], 1)}</td><td className="n">{fmt(c1.mz[2])}</td></tr>
                        <tr><td>Porcentaje de 60+ (%)</td><td className="n">{c1.mz[3] == null ? "sin dato" : fmt(c1.mz[3] * 100, 1)}</td><td className="n">{c1.mz[4] == null ? "–" : fmt(c1.mz[4] * 100, 1)}</td><td className="n" /></tr>
                        {c1.au && <tr><td>Verano AURA, día / noche (°C)</td><td className="n">{fmt(c1.au[0], 1)} / {fmt(c1.au[1], 1)}</td><td className="n" /><td className="n" /></tr>}
                      </tbody>
                    </table>
                  )}
                  <dl className="dl" style={{ marginTop: 8 }}>
                    <dt>Población</dt><dd>{fmt(suma((c) => c.pob))}</dd>
                    <dt>65 años o más</dt><dd>{fmt(suma((c) => c.pob65))}</dd>
                    <dt>60+ en manzanas de prioridad alta</dt><dd>{fmt(suma((c) => c.mayores_alta))}</dd>
                    <dt>Dependencia severa en domicilio</dt><dd>{fmt(suma((c) => c.dep))}</dd>
                    <dt>Oxígeno dependientes</dt><dd>{fmt(suma((c) => c.oxi))}</dd>
                    <dt>Establecimientos de salud (hospitales)</dt><dd>{fmt(suma((c) => c.est))} ({fmt(suma((c) => c.hosp))})</dd>
                    <dt>{c1 ? "Urgencias de 65+ respecto de lo habitual" : "Comunas con urgencias de 65+ sobre lo habitual"}</dt>
                    <dd>{c1 ? (c1.rz == null ? "sin dato" : `${fmt(c1.rz * 100)} %`) : `${conRz.filter((c) => c.rz! >= 1.15).length} de ${conRz.length}`}</dd>
                    <dt>Defunciones del último mes / habitual</dt><dd>{conDef.length ? `${fmt(conDef.reduce((a, c) => a + c.def!, 0))} / ${fmt(conDef.reduce((a, c) => a + c.esp!, 0))}` : "sin dato"}</dd>
                  </dl>
                </section>
                {c1 && (
                  <div className="fila seccion">
                    <a className="boton" href={`/comuna/${c1.cod}`}>Ficha de la comuna</a>
                    <a className="boton sec" href={p.aura && p.auraComunas?.includes(c1.cod) ? `/descargas/manzanas_aura/${c1.cod}.csv` : `/descargas/manzanas/${c1.cod}.csv`} download>Manzanas (CSV)</a>
                  </div>
                )}
                <details className="metodo"><summary>Cómo se calcula</summary>
                  <p>Nivel 1 desde el percentil 90 local de la temperatura media del período cálido, 2 desde el 95 y 3 desde el 99 (umbrales {p.versionUmbral}; {p.conUmbral} comunas con umbral). Una región o provincia toma el nivel más alto que alcanzan comunas con al menos el {Math.round(p.fraccion * 100)} % de sus personas de 65+. <a href="/metodologia">Metodología</a></p>
                </details>
              </>
            )}
      </aside>
    </div>
  );
}

const PASOS_MAPA: Paso[] = [
  { titulo: "Ejemplo: de Chile a una comuna", texto: "Este recorrido baja desde el país hasta una comuna y muestra cómo leer sus cifras. Avanza con «Siguiente».", evento: { ambito: "pais:CL", vista: "presente" } },
  { sel: "[data-tour=vista]", titulo: "Pasado, presente o futuro", texto: "Elige el día: los últimos 7 días, hoy o cualquiera de los próximos 15." },
  { sel: "[data-tour=distribucion]", titulo: "Distribución por nivel", texto: "Siempre visible. A nivel país agrupa las comunas por región: cada barra muestra cuántas hay en nivel 0, 1, 2 y 3." },
  { sel: "[data-tour=filtros]", titulo: "Filtros", texto: "Elige región, provincia o comuna, o deja solo los niveles altos. Ahora se abre la Región Metropolitana.", evento: { ambito: "region:13" } },
  { sel: "[data-tour=unidad]", titulo: "Agrupar por provincia o por comuna", texto: "Dentro de una región puedes agrupar por provincia o por comuna. El mapa y la lista cambian juntos.", evento: { unidad: "comuna" } },
  { sel: "[data-tour=estadisticas]", titulo: "Estadísticas de lo seleccionado", texto: "Promedio, desviación estándar, mínimo y máximo de la temperatura entre sus comunas, y los totales de población, dependientes y establecimientos." },
  { sel: "[data-tour=lateral]", titulo: "Una comuna", texto: "Al pinchar una comuna se ven su nivel, sus manzanas por prioridad y sus estadísticas. Acércate para pinchar una manzana o un hospital.", evento: { ambito: "comuna:13101" } },
  { sel: "[data-tour=leyenda]", titulo: "Leyenda", texto: "Colores de nivel, de prioridad de manzanas y de establecimientos de salud." },
];

function FichaEst({ e, comuna, cerrar }: { e: Est; comuna: string; cerrar: () => void }) {
  return (
    <>
      <div className="fila entre" style={{ marginTop: 8 }}><h2 style={{ fontSize: 17 }}>{e.nombre}</h2><button className="boton sec" onClick={cerrar}>Cerrar</button></div>
      <div className="chico">{e.tipo} · {comuna} · {e.sistema}</div>
      <dl className="dl seccion">
        <dt>Servicio de urgencia</dt><dd>{e.urg ? "Sí" : "No"}</dd>
        {e.u ? (
          <>
            <dt>Urgencias de 65+ al día (4 semanas)</dt><dd>{fmt(e.u.m65, 1)}</dd>
            <dt>Último día: 65+ atendidos / habitual</dt><dd>{fmt(e.u.ult)} / {fmt(e.u.hab, 1)}</dd>
            <dt>Días de calor con alza de 15 % o más</dt><dd>{e.u.dc ? `${e.u.da} de ${e.u.dc}` : "sin episodios en la región"}</dd>
          </>
        ) : <><dt>Atenciones de urgencia</dt><dd>no informa</dd></>}
      </dl>
      <p className="chico seccion">El DEIS no publica en qué establecimiento ocurre cada defunción; se muestra la atención de urgencia. <a href="/establecimientos">Ver todos</a></p>
    </>
  );
}

function FichaManzana({ mz, comuna, cercanos, aura, zonas, tcom, fecha, cerrar }: {
  mz: Manzana; comuna: ComunaLigera; cercanos: (Est & { d: number })[] | null; aura: boolean; zonas: Record<string, string>;
  tcom: { tmax: number | null; tmin: number | null } | null; fecha: string | null; cerrar: () => void;
}) {
  const pob = Number(mz.poblacion ?? 0);
  const n = (k: string) => (mz[k] == null ? null : Number(mz[k]));
  const dDia = aura ? n("dif_temp_dia") : null, dNoche = aura ? n("dif_temp_noche") : null;
  const signo = (x: number) => `${x >= 0 ? "+" : "−"}${fmt(Math.abs(x), 1)}`;
  const tipo = mz.tipo === "entidad_rural" ? "Entidad rural" : mz.tipo === "manzana_aldea" ? "Manzana de aldea" : "Manzana urbana";
  return (
    <>
      <div className="fila entre" style={{ marginTop: 8 }}><h2 className="tab" style={{ fontSize: 17 }}>{tipo} {String(mz.cod_manzana)}</h2><button className="boton sec" onClick={cerrar}>Volver</button></div>
      <div className="chico">{comuna.nombre} · prioridad {(CLASE[String(mz.clase_prioridad)] ?? "sin prioridad").toLowerCase()}</div>
      <dl className="dl seccion">
        <dt>Población</dt><dd>{fmt(pob)}</dd>
        <dt>Personas de 60 años o más</dt><dd>{n("mayores") == null ? "reservado" : fmt(n("mayores"))}</dd>
        <dt>Porcentaje de 60 años o más</dt><dd>{pob < 20 || n("pct_mayores") == null ? "no se muestra" : `${fmt(n("pct_mayores")! * 100, 1)} %`}</dd>
        <dt>Niños de 0 a 5 años</dt><dd>{n("ninos_0_5") == null ? "reservado" : fmt(n("ninos_0_5"))}</dd>
        <dt>Personas con discapacidad</dt><dd>{n("discapacidad") == null ? "reservado" : fmt(n("discapacidad"))}</dd>
        <dt>Viviendas hacinadas</dt><dd>{fmt(n("viviendas_hacinadas"))}</dd>
        <dt>Hogares solo de personas mayores</dt><dd>{fmt(n("hogares_solo_mayores"))}</dd>
      </dl>
      {dDia != null && (
        <dl className="dl seccion">
          <dt>Temperatura estimada de día{fecha ? ` · ${corta(fecha)}` : ""}</dt><dd>{tcom?.tmax != null ? `${fmt(tcom.tmax + dDia, 1)} °C` : "sin dato"}</dd>
          <dt className="chico">comuna {tcom?.tmax != null ? fmt(tcom.tmax, 1) : "–"} °C {signo(dDia)}</dt><dd />
          <dt>Temperatura estimada de noche</dt><dd>{tcom?.tmin != null && dNoche != null ? `${fmt(tcom.tmin + dNoche, 1)} °C` : "sin dato"}</dd>
          <dt>Isla de calor (verano)</dt><dd>{n("isla_calor") == null ? "sin dato" : `${signo(n("isla_calor")!)} °C`}</dd>
          <dt>Humidex de verano</dt><dd>{fmt(n("humidex"), 1)}</dd>
          <dt>Cambio al 2050, verano de día</dt><dd>{n("delta_2050_dia") == null ? "sin dato" : `${signo(n("delta_2050_dia")!)} °C`}</dd>
          <dt>Uso de suelo principal</dt><dd>{mz.uso_principal ? String(mz.uso_principal) : "sin dato"}</dd>
          <dt>Zona climática local</dt><dd>{mz.zona_climatica ? (zonas[String(mz.zona_climatica)] ?? String(mz.zona_climatica)) : "sin dato"}</dd>
        </dl>
      )}
      <section className="seccion">
        <h3>Establecimientos de salud a menos de 1 km</h3>
        {cercanos == null ? <p className="chico">Cargando…</p> : cercanos.length === 0 ? <p className="chico">Ninguno.</p> : (
          <ul className="lista-simple">{cercanos.slice(0, 10).map((e) => <li key={e.cod}><span>{e.nombre}<br /><span className="chico">{e.tipo}{e.urg ? " · con urgencia" : ""}</span></span><span className="chico tab" style={{ marginLeft: "auto" }}>{Math.round(e.d)} m</span></li>)}</ul>
        )}
      </section>
      <details className="metodo"><summary>Fuente y supuestos</summary>
        <p>INE, Censo 2024. Con menos de 20 habitantes no se muestran porcentajes; las celdas reservadas quedan vacías. Esta ficha nunca muestra muertes.{dDia != null ? " Calor por manzana: AURA (2026). Temperatura de la manzana = valor de su comuna + diferencia fija respecto del promedio comunal de verano (supuesto S7); puede no cumplirse en días extremos." : comuna.cod_region === "13" ? "" : " Fuera de la RM no hay dato de calor por manzana."}</p>
      </details>
    </>
  );
}
