"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type ExpressionSpecification, type Map as Mapa } from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import type { ConfigRiesgo } from "@/lib/datos";
import { fmt, temporadaTexto, type Lugar } from "@/lib/historia";
import { simularRiesgo, type Insumos, type Riesgo, type SerieRiesgo } from "@/lib/calculo";
import { nivelDe, riesgoDia, textoRango, type Rango } from "@/lib/riesgo";
import { cortes } from "./MapaValores";
import { Tabla } from "./Tabla";

type ComunaL = { cod: string; nombre: string; reg: string; bbox: [number, number, number, number] | null; punto: [number, number] | null; pob: number; p65: number; p85: number; ninos: number; disc: number; hacinadas: number; viviendas: number; vulnProm: number; hospital: { cod: string; nombre: string; km: number } | null };
type RegionL = { cod: string; nombre: string; bbox: [number, number, number, number] | null };
type Tend = { mes: string; anomalia: number; cat: string };
type Manzana = Record<string, string | number | null>;
type Provincia = { cod: string; nombre: string; reg: string; comunas: string[] };
type Puntos = { x: number[]; y: number[]; p: number[]; m: number[]; n: number[]; d: number[] };
type Medida = "numero" | "tasa";
const POR = 100000;                       // la tasa del mapa de riesgo: por 100.000 habitantes (por día las cifras por 1.000 serían de milésimas)
const RAMPA = ["--seq1", "--seq2", "--seq3", "--seq4", "--seq5"];
const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const CHILE: [[number, number], [number, number]] = [[-75.8, -55.9], [-66.6, -17.4]];
const COLOR = ["--n0", "--n1", "--n2", "--n3"];
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"], MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const dia = (f: string) => { const d = new Date(f + "T12:00:00Z"); return { sem: DIAS[d.getUTCDay()], n: d.getUTCDate(), largo: `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}` }; };
const suma = (s: SerieRiesgo, a: number, b: number): Rango => { let m = 0, lo = 0, hi = 0; for (let i = a; i < b; i++) { m += s.m[i]; lo += s.lo[i]; hi += s.hi[i]; } return [m, lo, hi]; };
const por = (r: Rango, k: number): Rango => [r[0] * k, r[1] * k, r[2] * k];
const num = (v: number) => { const a = Math.abs(v); return fmt(Math.max(0, v), a < 1 ? 2 : a < 10 ? 1 : 0); };

export function MapaRiesgo({ riesgo, insumos, comunas, regiones, provincias, tendencia, tendenciaCorrida, cfg, aura }: {
  riesgo: Riesgo; insumos: Insumos; comunas: ComunaL[]; regiones: RegionL[]; provincias: Provincia[]; tendencia: Record<string, Tend[]>; tendenciaCorrida: string | null; cfg: ConfigRiesgo; aura: { comunas: string[] } | null;
}) {
  const caja = useRef<HTMLDivElement>(null), mapa = useRef<Mapa | null>(null);
  const [listo, setListo] = useState(false), [tema, setTema] = useState(0), [tamano, setTamano] = useState(0);
  const [d, setD] = useState(0), [reg, setReg] = useState<string | null>(null), [com, setCom] = useState<string | null>(null);
  const [mz, setMz] = useState<Manzana | null>(null), [conAura, setConAura] = useState(false), [zoom, setZoom] = useState(0);
  const [tip, setTip] = useState<{ x: number; y: number; t: string } | null>(null), [hist, setHist] = useState<Lugar | null>(null);
  const [pintar, setPintar] = useState<"valor" | "nivel">("valor"), [medida, setMedida] = useState<Medida>("numero");
  const [unidad, setUnidad] = useState<"comuna" | "provincia">("comuna");
  const [puntos, setPuntos] = useState<Puntos | null>(null), [difAura, setDifAura] = useState<(number | null)[] | null>(null);
  const [modo, setModo] = useState<"pronostico" | "simular">("pronostico"), [tsim, setTsim] = useState(32);
  const porCod = useMemo(() => new Map(comunas.map((c) => [c.cod, c])), [comunas]);
  useEffect(() => {
    const q = new URLSearchParams(location.search), c = q.get("comuna"), r = q.get("region") ?? c?.slice(0, 2) ?? null, n = Number(q.get("dia") ?? 0), t = Number(q.get("simular"));
    if (r && regiones.some((x) => x.cod === r)) setReg(r);
    if (c && porCod.has(c)) setCom(c);
    if (n > 0 && n < riesgo.fechas.length) setD(n);
    if (t >= 5 && t <= 45) { setModo("simular"); setTsim(t); }
    if (q.get("aura") === "1") setConAura(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escenario: pronóstico guardado o la misma temperatura en todo Chile
  const vista = useMemo(() => (modo === "simular" ? simularRiesgo(insumos, tsim, riesgo.fechas) : riesgo), [modo, tsim, insumos, riesgo]);
  const sim = modo === "simular";
  const c1 = com ? porCod.get(com) ?? null : null, r1 = reg ? regiones.find((r) => r.cod === reg) ?? null : null;
  const serie = c1 ? vista.comunas[c1.cod] : r1 ? vista.regiones[r1.cod] : vista.pais;
  const pobDe = useMemo(() => {
    const m = new Map<string, number>(); let tot = 0;
    for (const c of comunas) { m.set(c.cod, c.pob); m.set(c.reg, (m.get(c.reg) ?? 0) + c.pob); tot += c.pob; }
    m.set("00", tot); return m;
  }, [comunas]);
  const k = (pob: number) => (medida === "tasa" ? (pob ? POR / pob : 0) : 1);
  const pobAqui = pobDe.get(c1?.cod ?? r1?.cod ?? "00") ?? 0, kAqui = k(pobAqui);
  const enRM = !!aura;
  const auraAqui = !!(aura && conAura && c1 && aura.comunas.includes(c1.cod));

  // Unidades del nivel que se ve: regiones en Chile; comunas o provincias dentro de una región
  const unidades = useMemo(() => {
    const grupos = !reg ? regiones.map((r) => ({ cod: r.cod, nombre: r.nombre, comunas: comunas.filter((c) => c.reg === r.cod).map((c) => c.cod), region: true }))
      : unidad === "provincia" ? provincias.filter((x) => x.reg === reg).map((x) => ({ cod: x.cod, nombre: x.nombre, comunas: x.comunas, region: false }))
      : comunas.filter((c) => c.reg === reg).map((c) => ({ cod: c.cod, nombre: c.nombre, comunas: [c.cod], region: false }));
    return grupos.map((g) => {
      let m = 0, lo = 0, hi = 0, b = 0, pob = 0, max = 0;
      for (const cod of g.comunas) {
        const s = vista.comunas[cod]; pob += porCod.get(cod)?.pob ?? 0; if (!s) continue;
        m += s.m[d]; lo += s.lo[d]; hi += s.hi[d]; max = Math.max(max, s.n[d]);
        if (s.e[d] > 0) b += s.m[d] / s.e[d];
      }
      const rs = g.region ? vista.regiones[g.cod] : null;
      if (rs) { m = rs.m[d]; lo = rs.lo[d]; hi = rs.hi[d]; }
      const kk = medida === "tasa" ? (pob ? POR / pob : 0) : 1;
      return { ...g, r: [m * kk, lo * kk, hi * kk] as Rango, pob, nivel: rs ? rs.n[d] : g.comunas.length === 1 || !b ? max : nivelDe(m / b, cfg.cortes_exceso) };
    });
  }, [reg, unidad, d, vista, comunas, regiones, provincias, porCod, cfg, medida]);
  const cs = useMemo(() => (pintar === "nivel" ? [] : cortes(unidades.map((u) => u.r[0]))), [unidades, pintar]);
  const unidadDe = useMemo(() => { const m = new Map<string, (typeof unidades)[number]>(); for (const u of unidades) for (const c of u.comunas) m.set(c, u); return m; }, [unidades]);
  const rotuloMedida = medida === "tasa" ? "muertes potenciales por 100.000 habitantes" : "muertes potenciales";
  const st = useRef({ reg, com, d, vista, pintar, unidadDe, rotuloMedida }); st.current = { reg, com, d, vista, pintar, unidadDe, rotuloMedida };
  const alta = cfg.dias_confianza_alta, N = vista.fechas.length;

  useEffect(() => {
    if (!caja.current || mapa.current) return;
    const pr = new Protocol(); maplibregl.addProtocol("pmtiles", pr.tile);
    const m = new maplibregl.Map({ container: caja.current, bounds: CHILE, fitBoundsOptions: { padding: 30, bearing: caja.current.clientWidth > caja.current.clientHeight * 1.15 ? 90 : 0 }, minZoom: 1.5, maxZoom: 15, dragRotate: false, attributionControl: { compact: true },
      style: { version: 8, sources: { chile: { type: "vector", url: `pmtiles://${location.origin}/teselas/chile.pmtiles`, attribution: "Límites y manzanas: INE, Censo 2024 (CC BY-SA 4.0) · Temperatura: Open-Meteo (CC BY 4.0)" } },
        layers: [{ id: "relleno", type: "fill", source: "chile", "source-layer": "comunas", paint: { "fill-color": css("--sin") } },
          { id: "linea", type: "line", source: "chile", "source-layer": "comunas", paint: { "line-color": css("--mapa-linea"), "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.2, 9, 0.8, 13, 1.6] } },
          { id: "regiones", type: "line", source: "chile", "source-layer": "regiones", maxzoom: 9, paint: { "line-color": css("--mapa-linea"), "line-width": 1.4 } },
          { id: "sel", type: "line", source: "chile", "source-layer": "comunas", filter: ["==", ["get", "cod"], ""], paint: { "line-color": css("--tinta"), "line-width": 2 } }] } });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => setListo(true));
    m.on("zoom", () => setZoom(m.getZoom()));
    m.on("click", (e) => {
      const s = st.current;
      if (s.com) { const f = m.queryRenderedFeatures(e.point, { layers: ["mz", "mz-puntos"].filter((l) => m.getLayer(l)) })[0]; if (f && (f.layer.id === "mz-puntos" || String(f.properties.cod_comuna) === s.com)) { setMz(f.properties as Manzana); return; } }
      const f = m.queryRenderedFeatures(e.point, { layers: ["relleno"] })[0]; if (!f) return;
      const cod = String(f.properties.cod);
      setMz(null);
      if (!s.reg || cod.slice(0, 2) !== s.reg) { setReg(cod.slice(0, 2)); setCom(null); } else setCom(cod);
    });
    m.on("mousemove", (e) => {
      const s = st.current, f = m.queryRenderedFeatures(e.point, { layers: ["relleno"] })[0];
      if (!f) { setTip(null); m.getCanvas().style.cursor = ""; return; }
      const cod = String(f.properties.cod), u = s.unidadDe.get(cod);
      m.getCanvas().style.cursor = "pointer";
      if (!u) { setTip(null); return; }
      setTip({ x: e.point.x, y: e.point.y, t: `${u.nombre}: ${textoRango(u.r)} ${s.rotuloMedida} · riesgo ${cfg.niveles[u.nivel].toLowerCase()}` });
    });
    m.on("mouseout", () => setTip(null));
    mapa.current = m;
    // Si cambia el tamaño del contenedor (celular, giro de pantalla), el mapa se ajusta y vuelve a encuadrar
    const ro = new ResizeObserver(() => { m.resize(); setTamano((x) => x + 1); });
    ro.observe(caja.current);
    const t = () => setTema((x) => x + 1); window.addEventListener("calor:tema", t);
    return () => { ro.disconnect(); window.removeEventListener("calor:tema", t); m.remove(); mapa.current = null; maplibregl.removeProtocol("pmtiles"); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Colores: por muertes potenciales (relativo al nivel que se ve) o por nivel de riesgo
  useEffect(() => {
    const m = mapa.current; if (!m || !listo) return;
    const relativo = pintar === "valor";
    const grupos: string[][] = [[], [], [], [], []];
    for (const u of unidades) {
      const i = relativo ? cs.filter((c) => u.r[0] >= c).length : u.nivel;
      if (reg) grupos[i].push(...u.comunas.filter((c) => vista.comunas[c])); else if (vista.regiones[u.cod]) grupos[i].push(u.cod);
    }
    const e: unknown[] = ["match", reg ? ["get", "cod"] : ["slice", ["get", "cod"], 0, 2]];
    grupos.forEach((g, i) => { if (g.length) e.push(g, css(relativo ? RAMPA[cs.length ? i : 2] : COLOR[i])); });
    e.push(reg ? css("--fuera") : css("--sin"));
    m.setPaintProperty("relleno", "fill-color", (com ? css("--fuera") : e.length > 3 ? e : css("--sin")) as ExpressionSpecification);
    m.setPaintProperty("relleno", "fill-opacity", com ? ["case", ["==", ["get", "cod"], com], 0.3, 0.95] : 0.95);
    for (const l of ["linea", "regiones"]) m.setPaintProperty(l, "line-color", css("--mapa-linea"));
    m.setPaintProperty("sel", "line-color", css("--tinta"));
    m.setFilter("sel", ["==", ["get", "cod"], com ?? ""]);
  }, [reg, com, vista, unidades, cs, pintar, listo, tema]);

  useEffect(() => {
    const m = mapa.current; if (!m || !listo) return;
    const b = c1?.bbox ?? r1?.bbox;
    if (!b) { m.fitBounds(CHILE, { padding: 30, bearing: caja.current!.clientWidth > caja.current!.clientHeight * 1.15 ? 90 : 0, duration: 500 }); return; }
    m.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 40, bearing: 0, duration: 500 });
  }, [c1, r1, listo, tamano]);

  // Exceso de riesgo de una manzana: el de su comuna o, con AURA, el de la temperatura de la comuna más su diferencia
  const curvaRM = insumos.curvas["13"]?.M ?? null;
  const excesoMz = (s: SerieRiesgo, dif: number | null | undefined, conCalorUrbano: boolean) => {
    if (!conCalorUrbano || !curvaRM || s.x?.[d] == null || dif == null) return s.e[d];
    return riesgoDia(s.x[d]! + dif, curvaRM).rr - 1;
  };

  // Manzanas de la comuna: índice relativo = aumento de riesgo x población vulnerable respecto del promedio comunal
  useEffect(() => {
    const m = mapa.current; if (!m || !listo) return;
    for (const l of ["mz", "mz-linea", "mz-sel", "mz-puntos"]) if (m.getLayer(l)) m.removeLayer(l);
    for (const f of ["mz", "mz-puntos"]) if (m.getSource(f)) m.removeSource(f);
    if (!c1) return;
    const s = vista.comunas[c1.cod]; if (!s) return;
    const paso = (indice: unknown) => ["step", indice, css(COLOR[0]), cfg.cortes_exceso[0], css(COLOR[1]), cfg.cortes_exceso[1], css(COLOR[2]), cfg.cortes_exceso[2], css(COLOR[3])] as ExpressionSpecification;
    const conAuraTemp = auraAqui && curvaRM && s.x?.[d] != null;
    const curvaExpr = (temp: unknown): unknown => {
      const paradas: number[] = [];
      curvaRM!.x.forEach((x, i) => paradas.push(x, x <= curvaRM!.umbral ? 0 : Math.max(0, curvaRM!.rr[i] - 1)));
      return ["interpolate", ["linear"], temp, ...paradas];
    };
    if (puntos) {
      m.addSource("mz-puntos", { type: "geojson", data: { type: "FeatureCollection", features: puntos.x.map((x, i) => ({ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [x, puntos.y[i]] },
        properties: { poblacion: puntos.p[i], mayores: puntos.m[i], ninos_0_5: puntos.n[i], discapacidad: puntos.d[i], v: puntos.m[i] + puntos.n[i] + puntos.d[i], dif_temp_dia: difAura?.[i] ?? null } })) } });
      const exP = conAuraTemp && difAura ? ["case", ["==", ["get", "dif_temp_dia"], null], s.e[d], curvaExpr(["+", s.x![d]!, ["get", "dif_temp_dia"]])] : s.e[d];
      m.addLayer({ id: "mz-puntos", type: "circle", source: "mz-puntos", maxzoom: 12, paint: {
        "circle-color": paso(["*", exP, ["min", cfg.tope_vulnerabilidad, ["/", ["get", "v"], Math.max(1, c1.vulnProm)]]]),
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 1.6, 8, 2.4, 10, 3.2, 12, 5], "circle-stroke-color": css("--mapa-linea"), "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 8, 0, 11, 0.6] } });
    }
    const vuln: unknown = ["min", cfg.tope_vulnerabilidad, ["/", ["+", ["coalesce", ["to-number", ["get", "mayores"]], 0], ["coalesce", ["to-number", ["get", "ninos_0_5"]], 0], ["coalesce", ["to-number", ["get", "discapacidad"]], 0]], Math.max(1, c1.vulnProm)]];
    const exceso = conAuraTemp ? curvaExpr(["+", s.x![d]!, ["coalesce", ["to-number", ["get", "dif_temp_dia"]], 0]]) : s.e[d];
    m.addSource("mz", { type: "vector", url: `pmtiles://${location.origin}/teselas/manzanas_${c1.reg}${auraAqui ? "_aura" : ""}.pmtiles` });
    m.addLayer({ id: "mz", type: "fill", source: "mz", "source-layer": "manzanas", minzoom: 12, filter: ["==", ["get", "cod_comuna"], c1.cod],
      paint: { "fill-color": paso(["*", exceso, vuln]), "fill-opacity": 0.92 } }, "linea");
    m.addLayer({ id: "mz-linea", type: "line", source: "mz", "source-layer": "manzanas", minzoom: 13, filter: ["==", ["get", "cod_comuna"], c1.cod], paint: { "line-color": css("--mapa-linea"), "line-width": 0.5 } }, "linea");
    m.addLayer({ id: "mz-sel", type: "line", source: "mz", "source-layer": "manzanas", minzoom: 12, filter: ["==", ["get", "cod_manzana"], String(mz?.cod_manzana ?? "")], paint: { "line-color": css("--tinta"), "line-width": 3 } });
  }, [c1, d, auraAqui, mz, puntos, difAura, vista, cfg, listo, tema]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setPuntos(null); setDifAura(null);
    if (!c1) return;
    let vivo = true;
    fetch(`/manzanas/${c1.cod}.json`).then((r) => (r.ok ? r.json() : null)).then((x) => vivo && setPuntos(x)).catch(() => {});
    if (aura?.comunas.includes(c1.cod)) fetch(`/manzanas_aura/${c1.cod}.json`).then((r) => (r.ok ? r.json() : null)).then((x) => vivo && x && setDifAura(x.dif)).catch(() => {});
    return () => { vivo = false; };
  }, [c1, aura]);

  useEffect(() => {
    setHist(null);
    const archivo = c1 ? `c_${c1.cod}` : r1 ? `r_${r1.cod}` : null;
    if (!archivo) return;
    let vivo = true;
    fetch(`/historia/${archivo}.json`).then((r) => r.json()).then((x) => vivo && setHist(x)).catch(() => {});
    return () => { vivo = false; };
  }, [c1, r1]);

  // Efecto de la capa AURA en la comuna elegida: manzanas por nivel sin y con calor urbano
  const efectoAura = useMemo(() => {
    if (!c1 || !puntos || !difAura || !aura?.comunas.includes(c1.cod)) return null;
    const s = vista.comunas[c1.cod]; if (!s) return null;
    const sin = [0, 0, 0, 0], con = [0, 0, 0, 0];
    let suben = 0, bajan = 0, mayoresSuben = 0, conDato = 0;
    puntos.x.forEach((_, i) => {
      const v = Math.min(cfg.tope_vulnerabilidad, (puntos.m[i] + puntos.n[i] + puntos.d[i]) / Math.max(1, c1.vulnProm));
      const a = nivelDe(excesoMz(s, null, false) * v, cfg.cortes_exceso), b = nivelDe(excesoMz(s, difAura[i], true) * v, cfg.cortes_exceso);
      sin[a]++; con[b]++; if (difAura[i] != null) conDato++;
      if (b > a) { suben++; mayoresSuben += puntos.m[i]; } else if (b < a) bajan++;
    });
    const difs = difAura.filter((x): x is number => x != null).sort((p, q) => p - q);
    return { sin, con, suben, bajan, mayoresSuben, total: puntos.x.length, conDato, p10: difs[Math.floor(difs.length * 0.1)] ?? 0, p90: difs[Math.floor(difs.length * 0.9)] ?? 0 };
  }, [c1, puntos, difAura, aura, vista, d, cfg]); // eslint-disable-line react-hooks/exhaustive-deps

  const s7 = por(suma(serie, 0, Math.min(alta, N)), kAqui), s16 = por(suma(serie, Math.min(alta, N), N), kAqui), h7 = por(serie.h7, kAqui);
  const vuln = mz ? (Number(mz.mayores ?? 0) + Number(mz.ninos_0_5 ?? 0) + Number(mz.discapacidad ?? 0)) : 0;
  const mzExceso = mz && c1 && vista.comunas[c1.cod] ? excesoMz(vista.comunas[c1.cod], mz.dif_temp_dia == null ? null : Number(mz.dif_temp_dia), auraAqui) * Math.min(cfg.tope_vulnerabilidad, vuln / Math.max(1, c1.vulnProm)) : 0;
  const nivelMz = nivelDe(mzExceso, cfg.cortes_exceso);
  const hs = hist?.series.M_T_A, iT = hist ? hist.temporadas.length : 0;
  const kh = (i: number) => (medida === "tasa" ? (hist?.pobT?.[i] ? POR / hist.pobT[i]! : 0) : 1);
  const veranos = Array.from({ length: Math.min(6, iT) }, (_, j) => iT - 1 - j);
  const olas = hist ? [...hist.episodios].filter((e) => e.obs >= 20).sort((a, b) => b.ini.localeCompare(a.ini)).slice(0, 4) : [];
  const tend = tendencia[reg ?? ""] ?? null;
  const f = dia(vista.fechas[d]);
  const unidadTxt = !reg ? "Regiones" : unidad === "provincia" ? "Provincias" : "Comunas";
  const sufijo = medida === "tasa" ? " por 100.000 habitantes" : "";

  return (
    <div className="explorador">
      <div className="mapa-caja">
        <div ref={caja} className="mapa" role="application" aria-label="Mapa de riesgo por calor" />
        <div className="mapa-controles">
          <div className="segmento" role="group" aria-label="Dónde estás" data-tour="mapa-lugar">
            <button aria-pressed={!reg} onClick={() => { setReg(null); setCom(null); setMz(null); }}>Chile</button>
            {r1 && <button aria-pressed={!com} onClick={() => { setCom(null); setMz(null); }}>{r1.nombre}</button>}
            {c1 && <button aria-pressed>{c1.nombre}</button>}
          </div>
          <div className="segmento" role="group" aria-label="Temperatura" data-tour="mapa-modo">
            <button aria-pressed={!sim} onClick={() => setModo("pronostico")}>Pronóstico</button>
            <button aria-pressed={sim} onClick={() => setModo("simular")}>Simular temperatura</button>
          </div>
          {sim && <label className="deslizador"><span>Máxima de</span><input type="range" min={10} max={42} step={0.5} value={tsim} onChange={(e) => setTsim(Number(e.target.value))} aria-label="Temperatura máxima simulada" /><output>{fmt(tsim, 1)} °C</output></label>}
          <div className="segmento" role="group" aria-label="Medida" data-tour="mapa-medida">
            <button aria-pressed={medida === "numero"} onClick={() => setMedida("numero")}>Número</button>
            <button aria-pressed={medida === "tasa"} onClick={() => setMedida("tasa")}>Por 100.000 habitantes</button>
          </div>
          {!c1 && <div className="segmento" role="group" aria-label="Pintar por" data-tour="mapa-pintar">
            <button aria-pressed={pintar === "valor"} onClick={() => setPintar("valor")}>Muertes potenciales</button>
            <button aria-pressed={pintar === "nivel"} onClick={() => setPintar("nivel")}>Nivel de riesgo</button>
          </div>}
          {reg && !c1 && <div className="segmento" role="group" aria-label="Ver por">
            <button aria-pressed={unidad === "comuna"} onClick={() => setUnidad("comuna")}>Comunas</button>
            <button aria-pressed={unidad === "provincia"} onClick={() => setUnidad("provincia")}>Provincias</button>
          </div>}
          {enRM && <div className="segmento" role="group" aria-label="Capa de calor urbano AURA" data-tour="mapa-aura" title="AURA estima la temperatura de verano de cada manzana de la Región Metropolitana">
            <button aria-pressed={!conAura} onClick={() => setConAura(false)}>Sin AURA</button><button aria-pressed={conAura} onClick={() => { setConAura(true); if (reg !== "13") { setReg("13"); setCom(null); setMz(null); } }}>Con calor urbano (AURA)</button>
          </div>}
        </div>
        {tip && <div className="tooltip-mapa" style={{ left: tip.x, top: tip.y }}>{tip.t}</div>}
        <div className="leyenda">
          {!c1 && pintar === "valor" ? <>
            <b>{medida === "tasa" ? "Muertes potenciales por 100.000 habitantes" : "Muertes potenciales"}, {sim ? `con ${fmt(tsim, 1)} °C` : f.largo}</b>
            {cs.length ? RAMPA.slice(0, cs.length + 1).map((c, i) => <div key={c} className="fila"><i className="cuadro" style={{ background: `var(${c})` }} />{i === 0 ? `menos de ${num(cs[0])}` : i === cs.length ? `${num(cs[i - 1])} o más` : `${num(cs[i - 1])} a ${num(cs[i])}`}</div>)
              : <div className="fila"><i className="cuadro" style={{ background: "var(--seq3)" }} />sin diferencias</div>}
            <div style={{ marginTop: 6 }}>Color relativo: compara las {unidadTxt.toLowerCase()} entre sí.</div>
          </> : <>
            <b>Riesgo: aumento esperado de muertes</b>
            {cfg.niveles.map((n, i) => <div key={n} className="fila"><i className="cuadro" style={{ background: `var(${COLOR[i]})` }} />{n}: {i === 0 ? `menos de ${cfg.cortes_exceso[0] * 100} %` : i === 3 ? `${cfg.cortes_exceso[2] * 100} % o más` : `${cfg.cortes_exceso[i - 1] * 100} a ${cfg.cortes_exceso[i] * 100} %`}</div>)}
            {c1 && <div style={{ marginTop: 6 }}>{zoom < 12 ? "Cada punto es una manzana: índice relativo, no muertes. Más cerca se ve su forma." : "Manzanas: índice relativo, no muertes."}{auraAqui ? " Incluye el calor urbano de AURA." : ""}</div>}
          </>}
        </div>
      </div>

      <aside className="lateral">
        {sim ? <p className="aviso">Escenario simulado: máxima de {fmt(tsim, 1)} °C en todas las comunas, todos los días. Muertes habituales de cada mes según la fecha elegida.</p>
          : <p className="chico">Pronóstico del {dia(riesgo.emision).largo}{riesgo.actualizado ? `, cargado a las ${new Date(riesgo.actualizado).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Santiago" })} h` : ""}.</p>}
        {!sim && riesgo.vencido && <p className="aviso" style={{ marginTop: 6 }}>No se pudo actualizar la temperatura hoy. Se muestra el último pronóstico guardado.</p>}
        <div className="titulo-fila" style={{ marginTop: 10 }}>
          <h2>{c1?.nombre ?? r1?.nombre ?? "Chile"}</h2>
          <span className={`riesgo r${serie.n[d]}`}>{cfg.niveles[serie.n[d]]}</span>
        </div>
        <dl className="dl" style={{ marginTop: 6 }}>
          {!sim && <><dt>Día</dt><dd>{f.largo}</dd></>}
          {!sim && serie.t[d] != null && <><dt>Máxima{r1 && !c1 ? " en la capital regional" : ""}</dt><dd>{fmt(serie.t[d]!, 1)} °C</dd></>}
          <dt>Aumento de muertes esperadas</dt><dd>{serie.e[d] > 0 ? `+${fmt(serie.e[d] * 100, 1)} %` : "0 %"}</dd>
          <dt>Muertes potenciales ese día{sufijo}</dt><dd>{textoRango(por([serie.m[d], serie.lo[d], serie.hi[d]], kAqui))}</dd>
        </dl>

        {!sim && <div className="seccion" data-tour="dias">
          <h3>Riesgo de cada día</h3>
          <div className="tira" style={{ marginTop: 6 }}>
            {vista.fechas.map((x, i) => { const kd = dia(x); return <button key={x} className={`r${serie.n[i]}${i >= alta ? " orientativo" : ""}`} aria-pressed={i === d} onClick={() => setD(i)} title={`${kd.largo}: riesgo ${cfg.niveles[serie.n[i]].toLowerCase()}${serie.t[i] != null ? `, máxima ${fmt(serie.t[i]!, 1)} °C` : ""}${i >= alta ? " (orientativo)" : ""}`}>{kd.sem}<b>{kd.n}</b></button>; })}
          </div>
          <p className="chico" style={{ marginTop: 6 }}>Días 1 a {alta}: confianza alta. Días {alta + 1} a {N}: orientativos, se ven más tenues.</p>
        </div>}

        <div className="seccion" data-tour="potenciales">
          <h3>{sim ? `Si durara ${alta} días` : "Muertes y hospitalizaciones potenciales"}{sufijo}</h3>
          <dl className="dl" style={{ marginTop: 6 }}>
            <dt>Muertes, {sim ? `${alta} días` : `próximos ${alta} días`}</dt><dd>{textoRango(s7)}</dd>
            {!sim && <><dt>Muertes, días {alta + 1} a {N} (orientativo)</dt><dd>{textoRango(s16)}</dd></>}
            <dt>Hospitalizaciones, {sim ? `${alta} días` : `próximos ${alta} días`}</dt><dd>{textoRango(h7)}</dd>
          </dl>
          {c1 && <p className="chico" style={{ marginTop: 6 }}>{vista.comunas[c1.cod]?.propia ? "Compara con la historia de temperatura de la propia comuna." : "Usa la curva y la temperatura de la capital regional: la comuna aún no tiene serie histórica propia."}</p>}
        </div>

        {mz && c1 && <div className="seccion tarjeta">
          <div className="titulo-fila"><h3>Manzana{mz.cod_manzana ? ` ${String(mz.cod_manzana).slice(-6)}` : ""}</h3><button className="enlace-btn" onClick={() => setMz(null)}>Cerrar</button></div>
          <dl className="dl" style={{ marginTop: 6 }}>
            <dt>Índice relativo de riesgo</dt><dd><span className={`riesgo r${nivelMz}`}>{cfg.niveles[nivelMz]}</span></dd>
            <dt>Población</dt><dd>{fmt(Number(mz.poblacion ?? 0))}</dd>
            <dt>Personas mayores</dt><dd>{fmt(Number(mz.mayores ?? 0))}</dd>
            <dt>Niños de 0 a 5</dt><dd>{fmt(Number(mz.ninos_0_5 ?? 0))}</dd>
            <dt>Personas con discapacidad</dt><dd>{fmt(Number(mz.discapacidad ?? 0))}</dd>
            {mz.viviendas_hacinadas != null && <><dt>Viviendas hacinadas</dt><dd>{fmt(Number(mz.viviendas_hacinadas))}</dd></>}
            {mz.dif_temp_dia != null && aura?.comunas.includes(c1.cod) && <><dt>Calor urbano (AURA)</dt><dd>{Number(mz.dif_temp_dia) >= 0 ? "+" : "−"}{fmt(Math.abs(Number(mz.dif_temp_dia)), 1)} °C</dd></>}
            <dt>Población vulnerable / promedio comunal</dt><dd>{fmt(vuln / Math.max(1, c1.vulnProm), 1)} veces</dd>
          </dl>
        </div>}

        {efectoAura && <div className="seccion" data-tour="aura-efecto">
          <h3>Calor urbano en {c1!.nombre} (AURA)</h3>
          <p className="chico" style={{ marginTop: 4 }}><b>Qué es AURA:</b> un modelo de la Universidad de Chile que estima la temperatura de verano de cada manzana de la Región Metropolitana. Dentro de una misma comuna hay manzanas más calurosas (más cemento, menos árboles) y más frescas.</p>
          <dl className="dl" style={{ marginTop: 10 }}>
            <dt>Las manzanas más frescas de la comuna</dt><dd>{fmt(efectoAura.p10, 1)} °C</dd>
            <dt>Las manzanas más calurosas de la comuna</dt><dd>+{fmt(efectoAura.p90, 1)} °C</dd>
          </dl>
          <p className="chico" style={{ marginTop: 4 }}>Respecto del promedio de la comuna en un día de verano (el 10 % más fresco y el 10 % más caluroso).</p>
          <table className="tabla-mini" style={{ marginTop: 10 }}>
            <thead><tr><th>Manzanas por nivel</th><th className="n">Sin AURA</th><th className="n">Con AURA</th></tr></thead>
            <tbody>{cfg.niveles.map((n, i) => <tr key={n}><td><span className={`riesgo r${i}`}>{n}</span></td><td className="n">{fmt(efectoAura.sin[i])}</td><td className="n">{fmt(efectoAura.con[i])}</td></tr>)}</tbody>
          </table>
          <dl className="dl" style={{ marginTop: 8 }}>
            <dt>Manzanas con más riesgo por ser más calurosas</dt><dd>{fmt(efectoAura.suben)}</dd>
            <dt>Personas mayores que viven en ellas</dt><dd>{fmt(efectoAura.mayoresSuben)}</dd>
            <dt>Manzanas con menos riesgo por ser más frescas</dt><dd>{fmt(efectoAura.bajan)}</dd>
          </dl>
          <details className="glosario" style={{ marginTop: 8 }}><summary>Cómo leer esto</summary>
            <p style={{ marginTop: 6 }}>Sin AURA, todas las manzanas de la comuna tienen la misma temperatura, y su nivel depende solo de cuánta gente vulnerable vive en ellas (personas mayores, niños pequeños, personas con discapacidad).</p>
            <p style={{ marginTop: 6 }}>Con AURA, a cada manzana se le suma o resta su diferencia de temperatura. Una manzana «sube de nivel» cuando, por ser más calurosa que su comuna, pasa por ejemplo de moderado a alto; «baja» cuando es más fresca. Así se ven los puntos donde el calor urbano concentra el riesgo.</p>
            <p style={{ marginTop: 6 }}>{fmt(efectoAura.conDato)} de {fmt(efectoAura.total)} manzanas tienen dato. Fuente: AURA (2026), Universidad de Chile, FONDEF IT23I0095.</p>
          </details>
        </div>}
        {enRM && reg === "13" && !c1 && <p className="chico" style={{ marginTop: 10 }}><b>Calor urbano (AURA):</b> estima qué manzanas de Santiago son más calurosas o más frescas que el promedio de su comuna. Elige una comuna para ver dónde concentra el riesgo.</p>}

        {c1 && <div className="seccion">
          <h3>Ficha de {c1.nombre}</h3>
          <dl className="dl" style={{ marginTop: 6 }}>
            {c1.hospital && <><dt>Hospital de referencia</dt><dd><a href={`/historia/hospital/${c1.hospital.cod}`}>{c1.hospital.nombre}</a></dd><dt>Distancia</dt><dd>{fmt(c1.hospital.km, 1)} km</dd></>}
            <dt>Población</dt><dd>{fmt(c1.pob)}</dd>
            <dt>65 años o más</dt><dd>{fmt(c1.p65)}</dd>
            <dt>85 años o más</dt><dd>{fmt(c1.p85)}</dd>
            <dt>Niños de 0 a 5</dt><dd>{fmt(c1.ninos)}</dd>
            <dt>Personas con discapacidad</dt><dd>{fmt(c1.disc)}</dd>
            <dt>Viviendas hacinadas</dt><dd>{fmt(c1.hacinadas)} de {fmt(c1.viviendas)}</dd>
          </dl>
        </div>}

        {!c1 && <div className="seccion" data-tour="lugares">
          <h3>{unidadTxt}, {sim ? `con ${fmt(tsim, 1)} °C` : f.largo}</h3>
          <div style={{ marginTop: 6 }}><Tabla mini filas={unidades} clave={(u) => u.cod} buscar={(u) => u.nombre} placeholder={`Buscar ${!reg ? "región" : unidad}…`}
            orden={{ col: pintar === "nivel" ? 1 : 2, asc: false }}
            columnas={[
              { titulo: !reg ? "Región" : unidad === "provincia" ? "Provincia" : "Comuna", valor: (u) => u.nombre,
                celda: (u) => unidad === "comuna" || !reg ? <button className="enlace-btn" onClick={() => { if (reg) setCom(u.cod); else setReg(u.cod); setMz(null); }}>{u.nombre}</button> : u.nombre },
              { titulo: "Riesgo", valor: (u) => u.nivel * 1e6 + u.r[0], celda: (u) => <span className={`riesgo r${u.nivel}`}>{cfg.niveles[u.nivel]}</span> },
              { titulo: `Muertes potenciales${sufijo}`, n: true, valor: (u) => u.r[0], celda: (u) => textoRango(u.r) },
            ]} /></div>
          {reg && <p className="chico" style={{ marginTop: 6 }}>Mientras una comuna no tenga serie de temperatura propia comparte el nivel de la capital regional; lo que la distingue es su población y cuánto muere habitualmente.</p>}
        </div>}

        {(c1 || r1) && <div className="seccion">
          <h3>Análisis histórico de {c1?.nombre ?? r1?.nombre}</h3>
          <p className="chico">Muertes atribuibles al calor{sufijo} en {c1 ? "la comuna" : "la región"}.</p>
          {!hist ? <p className="tenue">Cargando…</p> : !hs ? <p className="tenue">Sin datos.</p> : <>
            {veranos.some((i) => (hs[0][i] ?? 0) >= 50) ? <table className="tabla-mini" style={{ marginTop: 6 }}>
              <thead><tr><th>Verano</th><th className="n">Muertes atribuibles (rango)</th></tr></thead>
              <tbody>{veranos.filter((i) => (hs[0][i] ?? 0) >= 50).map((i) => <tr key={i}><td>{temporadaTexto(hist.temporadas[i])}</td>
                <td className="n">{textoRango(por([hs[1][i] ?? 0, hs[2][i] ?? 0, hs[3][i] ?? 0], kh(i)))}</td></tr>)}</tbody>
            </table> : <p className="tenue" style={{ marginTop: 6 }}>Muy pocos casos por verano para estimar.</p>}
            {olas.length > 0 && <table className="tabla-mini" style={{ marginTop: 10 }}>
              <thead><tr><th>Ola de calor</th><th className="n">Máxima</th><th className="n">Atribuibles (rango)</th></tr></thead>
              <tbody>{olas.map((e) => <tr key={e.ini}><td>{e.ini.slice(8)}/{e.ini.slice(5, 7)}/{e.ini.slice(0, 4)} · {e.dias} días</td><td className="n">{fmt(e.tmax, 1)} °C</td>
                <td className="n">{textoRango(por([e.an, e.lo, e.hi], kh(hist.temporadas.indexOf(e.t))))}</td></tr>)}</tbody>
            </table>}
            <p style={{ marginTop: 10 }}><a className="boton sec" href={c1 ? `/historia/comuna/${c1.cod}` : `/historia/region/${r1!.cod}`}>Ver el análisis histórico de {c1?.nombre ?? r1?.nombre}</a></p>
          </>}
        </div>}

        {tend && tend.length > 0 && !c1 && <div className="seccion">
          <h3>Tendencia del verano en {r1?.nombre}</h3>
          <table className="tabla-mini" style={{ marginTop: 6 }}>
            <thead><tr><th>Mes</th><th>Tendencia</th><th className="n">Respecto de lo normal</th></tr></thead>
            <tbody>{tend.map((t) => <tr key={t.mes}><td>{MESES[Number(t.mes.slice(5)) - 1]} {t.mes.slice(0, 4)}</td><td>{t.cat}</td><td className="n">{t.anomalia >= 0 ? "+" : "−"}{fmt(Math.abs(t.anomalia), 1)} °C</td></tr>)}</tbody>
          </table>
          <p className="chico" style={{ marginTop: 6 }}>Pronóstico estacional{tendenciaCorrida ? ` del ${dia(tendenciaCorrida.slice(0, 10)).largo}` : ""}: solo tendencia, sin cifra de muertes.</p>
        </div>}
        {!reg && <p className="chico" style={{ marginTop: 14 }}>{cfg.regla} Un clic en una región muestra sus comunas; un clic en una comuna, sus manzanas y su ficha.</p>}
      </aside>
    </div>
  );
}
