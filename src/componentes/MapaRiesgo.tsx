"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type ExpressionSpecification, type Map as Mapa } from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import type { ConfigRiesgo } from "@/lib/datos";
import { fmt, temporadaTexto, type Lugar } from "@/lib/historia";
import type { Riesgo, SerieRiesgo } from "@/lib/pronostico";
import { nivelDe, textoRango, type Curva, type Rango } from "@/lib/riesgo";
import { cortes } from "./MapaValores";

type ComunaL = { cod: string; nombre: string; reg: string; bbox: [number, number, number, number] | null; punto: [number, number] | null; pob: number; p65: number; p85: number; ninos: number; disc: number; hacinadas: number; viviendas: number; vulnProm: number; hospital: { cod: string; nombre: string; km: number } | null };
type RegionL = { cod: string; nombre: string; bbox: [number, number, number, number] | null };
type Tend = { mes: string; anomalia: number; cat: string };
type Manzana = Record<string, string | number | null>;
type Provincia = { cod: string; nombre: string; reg: string; comunas: string[] };
type Puntos = { x: number[]; y: number[]; p: number[]; m: number[]; n: number[]; d: number[] };
type Pintar = "muertes" | "tasa" | "nivel";
const RAMPA = ["--seq1", "--seq2", "--seq3", "--seq4", "--seq5"];
const f2 = (v: number) => fmt(Math.max(0, v), v < 10 ? 2 : 1);
const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const CHILE: [[number, number], [number, number]] = [[-75.8, -55.9], [-66.6, -17.4]];
const COLOR = ["--n0", "--n1", "--n2", "--n3"];
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"], MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const dia = (f: string) => { const d = new Date(f + "T12:00:00Z"); return { sem: DIAS[d.getUTCDay()], n: d.getUTCDate(), largo: `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}` }; };
const suma = (s: SerieRiesgo, a: number, b: number): Rango => { let m = 0, lo = 0, hi = 0; for (let i = a; i < b; i++) { m += s.m[i]; lo += s.lo[i]; hi += s.hi[i]; } return [m, lo, hi]; };

export function MapaRiesgo({ riesgo, comunas, regiones, provincias, tendencia, tendenciaCorrida, cfg, aura }: {
  riesgo: Riesgo; comunas: ComunaL[]; regiones: RegionL[]; provincias: Provincia[]; tendencia: Record<string, Tend[]>; tendenciaCorrida: string | null; cfg: ConfigRiesgo; aura: { comunas: string[]; curva: Curva | null } | null;
}) {
  const caja = useRef<HTMLDivElement>(null), mapa = useRef<Mapa | null>(null);
  const [listo, setListo] = useState(false), [tema, setTema] = useState(0);
  const [d, setD] = useState(0), [reg, setReg] = useState<string | null>(null), [com, setCom] = useState<string | null>(null);
  const [mz, setMz] = useState<Manzana | null>(null), [conAura, setConAura] = useState(false), [zoom, setZoom] = useState(0);
  const [tip, setTip] = useState<{ x: number; y: number; t: string } | null>(null), [hist, setHist] = useState<Lugar | null>(null);
  const [pintar, setPintar] = useState<Pintar>("muertes"), [unidad, setUnidad] = useState<"comuna" | "provincia">("comuna"), [puntos, setPuntos] = useState<Puntos | null>(null);
  const porCod = useMemo(() => new Map(comunas.map((c) => [c.cod, c])), [comunas]);
  // Estado inicial desde el enlace: /riesgo?region=13&comuna=13101&dia=2
  useEffect(() => {
    const q = new URLSearchParams(location.search), c = q.get("comuna"), r = q.get("region") ?? c?.slice(0, 2) ?? null, n = Number(q.get("dia") ?? 0);
    if (r && regiones.some((x) => x.cod === r)) setReg(r);
    if (c && porCod.has(c)) setCom(c);
    if (n > 0 && n < riesgo.fechas.length) setD(n);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const c1 = com ? porCod.get(com) ?? null : null, r1 = reg ? regiones.find((r) => r.cod === reg) ?? null : null;
  const serie = c1 ? riesgo.comunas[c1.cod] : r1 ? riesgo.regiones[r1.cod] : riesgo.pais;
  const auraAqui = !!(aura && conAura && c1 && aura.comunas.includes(c1.cod));
  // Dentro de una región: impacto esperado de cada comuna o provincia el día elegido
  const unidades = useMemo(() => {
    if (!reg) return [];
    const grupos = unidad === "provincia" ? provincias.filter((x) => x.reg === reg).map((x) => ({ cod: x.cod, nombre: x.nombre, comunas: x.comunas }))
      : comunas.filter((c) => c.reg === reg).map((c) => ({ cod: c.cod, nombre: c.nombre, comunas: [c.cod] }));
    return grupos.map((g) => {
      let m = 0, lo = 0, hi = 0, b = 0, p65 = 0, max = 0;
      for (const cod of g.comunas) {
        const s = riesgo.comunas[cod], c = porCod.get(cod); if (!s || !c) continue;
        m += s.m[d]; lo += s.lo[d]; hi += s.hi[d]; p65 += c.p65; max = Math.max(max, s.n[d]);
        if (s.e[d] > 0) b += s.m[d] / s.e[d];
      }
      return { ...g, m, lo, hi, p65, tasa: p65 ? (m / p65) * 1e5 : 0, nivel: g.comunas.length === 1 || !b ? max : nivelDe(m / b, cfg.cortes_exceso) };
    });
  }, [reg, unidad, d, riesgo, comunas, provincias, porCod, cfg]);
  const valorDe = (u: { m: number; tasa: number }) => (pintar === "tasa" ? u.tasa : u.m);
  const cs = useMemo(() => (pintar === "nivel" ? [] : cortes(unidades.map(valorDe))), [unidades, pintar]); // eslint-disable-line react-hooks/exhaustive-deps
  const unidadDe = useMemo(() => { const m = new Map<string, (typeof unidades)[number]>(); for (const u of unidades) for (const c of u.comunas) m.set(c, u); return m; }, [unidades]);
  const st = useRef({ reg, com, d, riesgo, porCod, regiones, pintar, unidadDe }); st.current = { reg, com, d, riesgo, porCod, regiones, pintar, unidadDe };
  const alta = cfg.dias_confianza_alta, N = riesgo.fechas.length;

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
      const cod = String(f.properties.cod), enReg = s.reg && cod.slice(0, 2) === s.reg;
      const x = enReg ? s.riesgo.comunas[cod] : s.riesgo.regiones[cod.slice(0, 2)];
      const nombre = enReg ? s.porCod.get(cod)?.nombre : s.regiones.find((r) => r.cod === cod.slice(0, 2))?.nombre;
      m.getCanvas().style.cursor = "pointer";
      const u = enReg && s.pintar !== "nivel" ? s.unidadDe.get(cod) : null;
      setTip({ x: e.point.x, y: e.point.y, t: u ? `${u.nombre}: ${s.pintar === "tasa" ? `${f2(u.tasa)} muertes potenciales por 100.000 de 65+` : `${f2(u.m)} muertes potenciales (${f2(u.lo)} a ${f2(u.hi)})`}` : `${nombre ?? cod}: riesgo ${x ? cfg.niveles[x.n[s.d]].toLowerCase() : "sin dato"}` });
    });
    m.on("mouseout", () => setTip(null));
    mapa.current = m;
    const t = () => setTema((x) => x + 1); window.addEventListener("calor:tema", t);
    return () => { window.removeEventListener("calor:tema", t); m.remove(); mapa.current = null; maplibregl.removeProtocol("pmtiles"); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Colores de regiones y comunas según el día elegido
  useEffect(() => {
    const m = mapa.current; if (!m || !listo) return;
    const relativo = !!reg && pintar !== "nivel";
    const grupos: string[][] = [[], [], [], [], []];
    if (relativo) { for (const u of unidades) grupos[cs.filter((c) => valorDe(u) >= c).length].push(...u.comunas.filter((c) => riesgo.comunas[c])); }
    else if (reg) { for (const u of unidades) grupos[u.nivel].push(...u.comunas.filter((c) => riesgo.comunas[c])); }
    else for (const [r, s] of Object.entries(riesgo.regiones)) grupos[s.n[d]].push(r);
    const e: unknown[] = ["match", reg ? ["get", "cod"] : ["slice", ["get", "cod"], 0, 2]];
    grupos.forEach((g, i) => { if (g.length) e.push(g, css(relativo ? RAMPA[cs.length ? i : 2] : COLOR[i])); });
    e.push(reg ? css("--fuera") : css("--sin"));
    // Con una comuna elegida, el resto se atenúa: el color queda para sus manzanas
    m.setPaintProperty("relleno", "fill-color", (com ? css("--fuera") : e.length > 3 ? e : css("--sin")) as ExpressionSpecification);
    m.setPaintProperty("relleno", "fill-opacity", com ? ["case", ["==", ["get", "cod"], com], 0.3, 0.95] : 0.95);
    for (const l of ["linea", "regiones"]) m.setPaintProperty(l, "line-color", css("--mapa-linea"));
    m.setPaintProperty("sel", "line-color", css("--tinta"));
    m.setFilter("sel", ["==", ["get", "cod"], com ?? ""]);
  }, [d, reg, com, riesgo, unidades, cs, pintar, listo, tema]); // eslint-disable-line react-hooks/exhaustive-deps

  // Encadre: Chile, región o comuna
  useEffect(() => {
    const m = mapa.current; if (!m || !listo) return;
    const b = c1?.bbox ?? r1?.bbox;
    if (!b) { m.fitBounds(CHILE, { padding: 30, bearing: caja.current!.clientWidth > caja.current!.clientHeight * 1.15 ? 90 : 0, duration: 500 }); return; }
    m.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 40, bearing: 0, duration: 500 });
  }, [c1, r1, listo]);

  // Manzanas de la comuna: índice relativo = aumento de riesgo x población vulnerable respecto del promedio comunal
  useEffect(() => {
    const m = mapa.current; if (!m || !listo) return;
    for (const l of ["mz", "mz-linea", "mz-sel", "mz-puntos"]) if (m.getLayer(l)) m.removeLayer(l);
    for (const f of ["mz", "mz-puntos"]) if (m.getSource(f)) m.removeSource(f);
    if (!c1) return;
    const s = riesgo.comunas[c1.cod]; if (!s) return;
    const paso = (indice: unknown) => ["step", indice, css(COLOR[0]), cfg.cortes_exceso[0], css(COLOR[1]), cfg.cortes_exceso[1], css(COLOR[2]), cfg.cortes_exceso[2], css(COLOR[3])] as ExpressionSpecification;
    // Lejos (antes del nivel 12 no hay teselas de manzana): un punto por manzana, con la misma regla de color
    if (puntos) {
      m.addSource("mz-puntos", { type: "geojson", data: { type: "FeatureCollection", features: puntos.x.map((x, i) => ({ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [x, puntos.y[i]] },
        properties: { poblacion: puntos.p[i], mayores: puntos.m[i], ninos_0_5: puntos.n[i], discapacidad: puntos.d[i], v: puntos.m[i] + puntos.n[i] + puntos.d[i] } })) } });
      m.addLayer({ id: "mz-puntos", type: "circle", source: "mz-puntos", maxzoom: 12, paint: {
        "circle-color": paso(["*", s.e[d], ["min", cfg.tope_vulnerabilidad, ["/", ["get", "v"], Math.max(1, c1.vulnProm)]]]),
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 1.6, 8, 2.4, 10, 3.2, 12, 5], "circle-stroke-color": css("--mapa-linea"), "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 8, 0, 11, 0.6] } });
    }
    const vuln: unknown = ["min", cfg.tope_vulnerabilidad, ["/", ["+", ["coalesce", ["to-number", ["get", "mayores"]], 0], ["coalesce", ["to-number", ["get", "ninos_0_5"]], 0], ["coalesce", ["to-number", ["get", "discapacidad"]], 0]], Math.max(1, c1.vulnProm)]];
    let exceso: unknown = s.e[d];
    if (auraAqui && aura?.curva && s.x?.[d] != null) {
      const cv = aura.curva, paradas: number[] = [];
      cv.x.forEach((x, i) => paradas.push(x, x <= cv.umbral ? 0 : Math.max(0, cv.rr[i] - 1)));
      exceso = ["interpolate", ["linear"], ["+", s.x[d], ["coalesce", ["to-number", ["get", "dif_temp_dia"]], 0]], ...paradas];
    }
    m.addSource("mz", { type: "vector", url: `pmtiles://${location.origin}/teselas/manzanas_${c1.reg}${auraAqui ? "_aura" : ""}.pmtiles` });
    m.addLayer({ id: "mz", type: "fill", source: "mz", "source-layer": "manzanas", minzoom: 12, filter: ["==", ["get", "cod_comuna"], c1.cod],
      paint: { "fill-color": paso(["*", exceso, vuln]), "fill-opacity": 0.92 } }, "linea");
    m.addLayer({ id: "mz-linea", type: "line", source: "mz", "source-layer": "manzanas", minzoom: 13, filter: ["==", ["get", "cod_comuna"], c1.cod], paint: { "line-color": css("--mapa-linea"), "line-width": 0.5 } }, "linea");
    m.addLayer({ id: "mz-sel", type: "line", source: "mz", "source-layer": "manzanas", minzoom: 12, filter: ["==", ["get", "cod_manzana"], String(mz?.cod_manzana ?? "")], paint: { "line-color": css("--tinta"), "line-width": 3 } });
  }, [c1, d, auraAqui, aura, mz, puntos, riesgo, cfg, listo, tema]);

  // Puntos de manzana de la comuna elegida
  useEffect(() => {
    setPuntos(null);
    if (!c1) return;
    let vivo = true;
    fetch(`/manzanas/${c1.cod}.json`).then((r) => (r.ok ? r.json() : null)).then((x) => vivo && setPuntos(x)).catch(() => {});
    return () => { vivo = false; };
  }, [c1]);

  // Historia del lugar para la ficha
  useEffect(() => {
    setHist(null);
    const archivo = c1 ? `c_${c1.cod}` : r1 ? `r_${r1.cod}` : null;
    if (!archivo) return;
    let vivo = true;
    fetch(`/historia/${archivo}.json`).then((r) => r.json()).then((x) => vivo && setHist(x)).catch(() => {});
    return () => { vivo = false; };
  }, [c1, r1]);

  const s7 = suma(serie, 0, Math.min(alta, N)), s16 = suma(serie, Math.min(alta, N), N);
  const lista = (reg ? comunas.filter((c) => c.reg === reg).map((c) => ({ cod: c.cod, nombre: c.nombre, s: riesgo.comunas[c.cod] })) : regiones.map((r) => ({ cod: r.cod, nombre: r.nombre, s: riesgo.regiones[r.cod] })))
    .filter((x) => x.s).map((x) => ({ ...x, r: suma(x.s, 0, Math.min(alta, N)), max: Math.max(...x.s.n.slice(0, alta)) })).sort((a, b) => b.max - a.max || b.r[0] - a.r[0]);
  const vuln = mz ? (Number(mz.mayores ?? 0) + Number(mz.ninos_0_5 ?? 0) + Number(mz.discapacidad ?? 0)) : 0;
  const mzExceso = mz && c1 ? (() => {
    const s = riesgo.comunas[c1.cod]; let e = s.e[d];
    if (auraAqui && aura?.curva && s.x?.[d] != null) { const x = s.x[d]! + Number(mz.dif_temp_dia ?? 0), cv = aura.curva; let k = cv.x.findIndex((v) => v >= x); if (k < 0) k = cv.x.length - 1; e = x <= cv.umbral ? 0 : Math.max(0, cv.rr[k] - 1); }
    return e * Math.min(cfg.tope_vulnerabilidad, vuln / Math.max(1, c1.vulnProm));
  })() : 0;
  const nivelMz = cfg.cortes_exceso.filter((c) => mzExceso >= c).length;
  const hs = hist?.series.M_T_A, iT = hist ? hist.temporadas.length : 0;
  const veranos = Array.from({ length: Math.min(6, iT) }, (_, k) => iT - 1 - k);
  const total = hs ? [0, 1, 2, 3].map((k) => hs[k].reduce((a: number, v) => a + (v ?? 0), 0)) : null;
  // Solo las olas con casos suficientes para estimar; si ninguna los tiene, la tabla no se muestra
  const olas = hist ? [...hist.episodios].filter((e) => e.obs >= 20).sort((a, b) => b.ini.localeCompare(a.ini)).slice(0, 4) : [];
  const tend = tendencia[reg ?? ""] ?? null;
  const f = dia(riesgo.fechas[d]);

  return (
    <div className="explorador">
      <div className="mapa-caja">
        <div ref={caja} className="mapa" role="application" aria-label="Mapa de riesgo por calor" />
        <div className="mapa-controles">
          <div className="segmento" role="group" aria-label="Dónde estás">
            <button aria-pressed={!reg} onClick={() => { setReg(null); setCom(null); setMz(null); }}>Chile</button>
            {r1 && <button aria-pressed={!com} onClick={() => { setCom(null); setMz(null); }}>{r1.nombre}</button>}
            {c1 && <button aria-pressed>{c1.nombre}</button>}
          </div>
          {reg && !c1 && <div className="segmento" role="group" aria-label="Pintar por">
            <button aria-pressed={pintar === "muertes"} onClick={() => setPintar("muertes")}>Muertes potenciales</button>
            <button aria-pressed={pintar === "tasa"} onClick={() => setPintar("tasa")}>Por 100.000 de 65+</button>
            <button aria-pressed={pintar === "nivel"} onClick={() => setPintar("nivel")}>Nivel de riesgo</button>
          </div>}
          {reg && !c1 && <div className="segmento" role="group" aria-label="Ver por">
            <button aria-pressed={unidad === "comuna"} onClick={() => setUnidad("comuna")}>Comunas</button>
            <button aria-pressed={unidad === "provincia"} onClick={() => setUnidad("provincia")}>Provincias</button>
          </div>}
          {aura && c1 && aura.comunas.includes(c1.cod) && <div className="segmento" role="group" aria-label="Capa de calor urbano AURA">
            <button aria-pressed={!conAura} onClick={() => setConAura(false)}>Sin calor urbano</button><button aria-pressed={conAura} onClick={() => setConAura(true)}>Con calor urbano (AURA)</button>
          </div>}
        </div>
        {tip && <div className="tooltip-mapa" style={{ left: tip.x, top: tip.y }}>{tip.t}</div>}
        <div className="leyenda">
          {reg && !c1 && pintar !== "nivel" ? <>
            <b>{pintar === "tasa" ? "Muertes potenciales por 100.000 personas de 65+" : "Muertes potenciales"}, {f.largo}</b>
            {cs.length ? RAMPA.slice(0, cs.length + 1).map((c, i) => <div key={c} className="fila"><i className="cuadro" style={{ background: `var(${c})` }} />{i === 0 ? `menos de ${f2(cs[0])}` : i === cs.length ? `${f2(cs[i - 1])} o más` : `${f2(cs[i - 1])} a ${f2(cs[i])}`}</div>)
              : <div className="fila"><i className="cuadro" style={{ background: "var(--seq3)" }} />sin diferencias ese día</div>}
            <div style={{ marginTop: 6 }}>Color relativo: compara las {unidad === "provincia" ? "provincias" : "comunas"} de esta región entre sí.</div>
          </> : <>
            <b>Riesgo: aumento esperado de muertes</b>
            {cfg.niveles.map((n, i) => <div key={n} className="fila"><i className="cuadro" style={{ background: `var(${COLOR[i]})` }} />{n}: {i === 0 ? `menos de ${cfg.cortes_exceso[0] * 100} %` : i === 3 ? `${cfg.cortes_exceso[2] * 100} % o más` : `${cfg.cortes_exceso[i - 1] * 100} a ${cfg.cortes_exceso[i] * 100} %`}</div>)}
            {c1 && <div style={{ marginTop: 6 }}>{zoom < 12 ? "Cada punto es una manzana: índice relativo, no muertes. Más cerca se ve su forma." : "Manzanas: índice relativo, no muertes."}</div>}
          </>}
        </div>
      </div>

      <aside className="lateral">
        <p className="chico">Pronóstico del {dia(riesgo.emision).largo}{riesgo.actualizado ? `, cargado a las ${new Date(riesgo.actualizado).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Santiago" })} h` : ""}.</p>
        {riesgo.vencido && <p className="aviso" style={{ marginTop: 6 }}>No se pudo actualizar la temperatura hoy. Se muestra el último pronóstico guardado.</p>}
        <div className="titulo-fila" style={{ marginTop: 10 }}>
          <h2>{c1?.nombre ?? r1?.nombre ?? "Chile"}</h2>
          <span className={`riesgo r${serie.n[d]}`}>{cfg.niveles[serie.n[d]]}</span>
        </div>
        <p className="sub">{f.largo}{serie.t[d] != null ? ` · máxima ${fmt(serie.t[d]!, 1)} °C${r1 && !c1 ? " en la capital regional" : ""}` : ""} · {serie.e[d] > 0 ? `+${fmt(serie.e[d] * 100, 1)} % de muertes esperadas` : "sin aumento esperado"}</p>

        <div className="seccion">
          <h3>Riesgo de cada día</h3>
          <div className="tira" style={{ marginTop: 6 }}>
            {riesgo.fechas.map((x, i) => { const k = dia(x); return <button key={x} className={`r${serie.n[i]}${i >= alta ? " orientativo" : ""}`} aria-pressed={i === d} onClick={() => setD(i)} title={`${k.largo}: riesgo ${cfg.niveles[serie.n[i]].toLowerCase()}${serie.t[i] != null ? `, máxima ${fmt(serie.t[i]!, 1)} °C` : ""}${i >= alta ? " (orientativo)" : ""}`}>{k.sem}<b>{k.n}</b></button>; })}
          </div>
          <p className="chico" style={{ marginTop: 6 }}>Días 1 a {alta}: confianza alta. Días {alta + 1} a {N}: orientativos, se ven más tenues.</p>
        </div>

        <div className="seccion">
          <h3>Muertes potenciales por calor</h3>
          <dl className="dl" style={{ marginTop: 6 }}>
            <dt>Próximos {alta} días</dt><dd>{textoRango(s7)}</dd>
            <dt>Días {alta + 1} a {N} (orientativo)</dt><dd>{textoRango(s16)}</dd>
            <dt>Hospitalizaciones, próximos {alta} días</dt><dd>{textoRango(serie.h7, "hospitalizaciones adicionales")}</dd>
          </dl>
          {c1 && <p className="chico" style={{ marginTop: 6 }}>{riesgo.comunas[c1.cod]?.propia ? "Compara el pronóstico de la comuna con su propia historia de temperatura." : "Usa la temperatura de la capital regional: la comuna aún no tiene serie histórica propia."}</p>}
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
            {auraAqui && mz.dif_temp_dia != null && <><dt>Diferencia de temperatura (AURA)</dt><dd>{Number(mz.dif_temp_dia) >= 0 ? "+" : "−"}{fmt(Math.abs(Number(mz.dif_temp_dia)), 1)} °C</dd></>}
          </dl>
          <p className="chico" style={{ marginTop: 6 }}>Población vulnerable {fmt(vuln / Math.max(1, c1.vulnProm), 1)} veces el promedio de las manzanas de la comuna. A esta escala no se muestran muertes: el número sería menor que uno.</p>
        </div>}

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

        {reg && !c1 && <div className="seccion">
          <h3>{unidad === "provincia" ? "Provincias" : "Comunas"} por muertes potenciales, {f.largo}</h3>
          <table className="tabla-mini" style={{ marginTop: 6 }}>
            <thead><tr><th>{unidad === "provincia" ? "Provincia" : "Comuna"}</th><th>Riesgo</th><th className="n">Muertes (rango)</th><th className="n">Por 100.000 de 65+</th></tr></thead>
            <tbody>{[...unidades].sort((a, b) => (pintar === "nivel" ? b.nivel - a.nivel || b.m - a.m : valorDe(b) - valorDe(a))).map((u) => <tr key={u.cod}>
              <td>{unidad === "comuna" ? <button className="enlace-btn" onClick={() => { setCom(u.cod); setMz(null); }}>{u.nombre}</button> : u.nombre}</td>
              <td><span className={`riesgo r${u.nivel}`}>{cfg.niveles[u.nivel]}</span></td>
              <td className="n">{f2(u.m)} <small>({f2(u.lo)} a {f2(u.hi)})</small></td><td className="n">{f2(u.tasa)}</td></tr>)}</tbody>
          </table>
          <p className="chico" style={{ marginTop: 6 }}>Mientras una comuna no tenga serie de temperatura propia comparte el nivel de la capital regional; lo que la distingue es cuánta gente mayor tiene y cuánto muere habitualmente.</p>
        </div>}

        {(c1 || r1) && <div className="seccion">
          <h3>Historia de {c1?.nombre ?? r1?.nombre}</h3>
          <p className="chico">Muertes atribuibles al calor en {c1 ? "la comuna" : "la región"}, por verano y por ola de calor.</p>
          {!hist ? <p className="tenue">Cargando…</p> : !hs ? <p className="tenue">Sin datos.</p> : <>
            {veranos.some((i) => (hs[0][i] ?? 0) >= 50) ? <table className="tabla-mini" style={{ marginTop: 6 }}>
              <thead><tr><th>Verano</th><th className="n">Muertes atribuibles (rango)</th></tr></thead>
              <tbody>{veranos.map((i) => <tr key={i}><td>{temporadaTexto(hist.temporadas[i])}</td>
                <td className="n">{(hs[0][i] ?? 0) < 50 ? "datos insuficientes" : `${fmt(Math.max(0, hs[1][i] ?? 0), 1)} (${fmt(Math.max(0, hs[2][i] ?? 0), 1)} a ${fmt(Math.max(0, hs[3][i] ?? 0), 1)})`}</td></tr>)}</tbody>
            </table> : total && total[0] >= 50 ? <p style={{ marginTop: 6 }}>En los {hist.temporadas.length} veranos desde {temporadaTexto(hist.temporadas[0])}: <b>{fmt(Math.max(0, total[1]), 1)}</b> ({fmt(Math.max(0, total[2]), 1)} a {fmt(Math.max(0, total[3]), 1)}). Por verano hay muy pocos casos para estimar.</p>
              : <p className="tenue" style={{ marginTop: 6 }}>Muy pocos casos para estimar en este lugar.</p>}
            {olas.length > 0 && <table className="tabla-mini" style={{ marginTop: 10 }}>
              <thead><tr><th>Ola de calor</th><th className="n">Máxima</th><th className="n">En exceso (rango)</th></tr></thead>
              <tbody>{olas.map((e) => <tr key={e.ini}><td>{e.ini.slice(8)}/{e.ini.slice(5, 7)}/{e.ini.slice(0, 4)} · {e.dias} días</td><td className="n">{fmt(e.tmax, 1)} °C</td>
                <td className="n">{fmt(Math.max(0, e.an), 1)} ({fmt(Math.max(0, e.lo), 1)} a {fmt(Math.max(0, e.hi), 1)})</td></tr>)}</tbody>
            </table>}
            <p style={{ marginTop: 10 }}><a className="boton sec" href={c1 ? `/historia/comuna/${c1.cod}` : `/historia/region/${r1!.cod}`}>Ver la historia completa de {c1?.nombre ?? r1?.nombre}</a></p>
          </>}
        </div>}

        {!reg && <div className="seccion">
          <h3>Regiones, próximos {alta} días</h3>
          <table className="tabla-mini" style={{ marginTop: 6 }}>
            <thead><tr><th>{reg ? "Comuna" : "Región"}</th><th>Riesgo máximo</th><th className="n">Muertes potenciales</th></tr></thead>
            <tbody>{lista.map((x) => <tr key={x.cod}><td><button className="enlace-btn" onClick={() => { if (reg) setCom(x.cod); else setReg(x.cod); setMz(null); }}>{x.nombre}</button></td>
              <td><span className={`riesgo r${x.max}`}>{cfg.niveles[x.max]}</span></td><td className="n">{textoRango(x.r, "").replace("menos de 1 ", "menos de 1")}</td></tr>)}</tbody>
          </table>
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
