"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type ExpressionSpecification, type Map as Mapa } from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import type { ConfigRiesgo } from "@/lib/datos";
import { fmt, temporadaTexto, type Lugar } from "@/lib/historia";
import type { Riesgo, SerieRiesgo } from "@/lib/pronostico";
import { textoRango, type Curva, type Rango } from "@/lib/riesgo";

type ComunaL = { cod: string; nombre: string; reg: string; bbox: [number, number, number, number] | null; punto: [number, number] | null; pob: number; p65: number; p85: number; ninos: number; disc: number; hacinadas: number; viviendas: number; vulnProm: number; hospital: { cod: string; nombre: string; km: number } | null };
type RegionL = { cod: string; nombre: string; bbox: [number, number, number, number] | null };
type Tend = { mes: string; anomalia: number; cat: string };
type Manzana = Record<string, string | number | null>;
const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const CHILE: [[number, number], [number, number]] = [[-75.8, -55.9], [-66.6, -17.4]];
const COLOR = ["--n0", "--n1", "--n2", "--n3"];
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"], MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const dia = (f: string) => { const d = new Date(f + "T12:00:00Z"); return { sem: DIAS[d.getUTCDay()], n: d.getUTCDate(), largo: `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}` }; };
const suma = (s: SerieRiesgo, a: number, b: number): Rango => { let m = 0, lo = 0, hi = 0; for (let i = a; i < b; i++) { m += s.m[i]; lo += s.lo[i]; hi += s.hi[i]; } return [m, lo, hi]; };

export function MapaRiesgo({ riesgo, comunas, regiones, tendencia, tendenciaCorrida, cfg, aura }: {
  riesgo: Riesgo; comunas: ComunaL[]; regiones: RegionL[]; tendencia: Record<string, Tend[]>; tendenciaCorrida: string | null; cfg: ConfigRiesgo; aura: { comunas: string[]; curva: Curva | null } | null;
}) {
  const caja = useRef<HTMLDivElement>(null), mapa = useRef<Mapa | null>(null);
  const [listo, setListo] = useState(false), [tema, setTema] = useState(0);
  const [d, setD] = useState(0), [reg, setReg] = useState<string | null>(null), [com, setCom] = useState<string | null>(null);
  const [mz, setMz] = useState<Manzana | null>(null), [conAura, setConAura] = useState(false), [zoom, setZoom] = useState(0);
  const [tip, setTip] = useState<{ x: number; y: number; t: string } | null>(null), [hist, setHist] = useState<Lugar | null>(null);
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
  const st = useRef({ reg, com, d, riesgo, porCod, regiones }); st.current = { reg, com, d, riesgo, porCod, regiones };
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
      if (s.com && m.getLayer("mz")) { const f = m.queryRenderedFeatures(e.point, { layers: ["mz"] })[0]; if (f && String(f.properties.cod_comuna) === s.com) { setMz(f.properties as Manzana); return; } }
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
      setTip({ x: e.point.x, y: e.point.y, t: `${nombre ?? cod}: riesgo ${x ? cfg.niveles[x.n[s.d]].toLowerCase() : "sin dato"}` });
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
    const grupos: string[][] = [[], [], [], []];
    if (reg) { for (const c of comunas) if (c.reg === reg && riesgo.comunas[c.cod]) grupos[riesgo.comunas[c.cod].n[d]].push(c.cod); }
    else for (const [r, s] of Object.entries(riesgo.regiones)) grupos[s.n[d]].push(r);
    const e: unknown[] = ["match", reg ? ["get", "cod"] : ["slice", ["get", "cod"], 0, 2]];
    grupos.forEach((g, i) => { if (g.length) e.push(g, css(COLOR[i])); });
    e.push(reg ? css("--fuera") : css("--sin"));
    m.setPaintProperty("relleno", "fill-color", (e.length > 3 ? e : css("--sin")) as ExpressionSpecification);
    m.setPaintProperty("relleno", "fill-opacity", com ? ["case", ["==", ["get", "cod"], com], 0.35, 0.9] : 0.95);
    for (const l of ["linea", "regiones"]) m.setPaintProperty(l, "line-color", css("--mapa-linea"));
    m.setPaintProperty("sel", "line-color", css("--tinta"));
    m.setFilter("sel", ["==", ["get", "cod"], com ?? ""]);
  }, [d, reg, com, riesgo, comunas, listo, tema]);

  // Encadre: Chile, región o comuna
  useEffect(() => {
    const m = mapa.current; if (!m || !listo) return;
    const b = c1?.bbox ?? r1?.bbox;
    if (!b) { m.fitBounds(CHILE, { padding: 30, bearing: caja.current!.clientWidth > caja.current!.clientHeight * 1.15 ? 90 : 0, duration: 500 }); return; }
    m.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 40, bearing: 0, duration: 500 });
    if (c1?.punto) m.once("moveend", () => { if (m.getZoom() < 12) m.easeTo({ center: c1.punto!, zoom: 12, duration: 400 }); });
  }, [c1, r1, listo]);

  // Manzanas de la comuna: índice relativo = aumento de riesgo x población vulnerable respecto del promedio comunal
  useEffect(() => {
    const m = mapa.current; if (!m || !listo) return;
    for (const l of ["mz", "mz-linea", "mz-sel"]) if (m.getLayer(l)) m.removeLayer(l);
    if (m.getSource("mz")) m.removeSource("mz");
    if (!c1) return;
    const s = riesgo.comunas[c1.cod]; if (!s) return;
    const vuln: unknown = ["min", cfg.tope_vulnerabilidad, ["/", ["+", ["coalesce", ["to-number", ["get", "mayores"]], 0], ["coalesce", ["to-number", ["get", "ninos_0_5"]], 0], ["coalesce", ["to-number", ["get", "discapacidad"]], 0]], Math.max(1, c1.vulnProm)]];
    let exceso: unknown = s.e[d];
    if (auraAqui && aura?.curva && s.x?.[d] != null) {
      const cv = aura.curva, paradas: number[] = [];
      cv.x.forEach((x, i) => paradas.push(x, x <= cv.umbral ? 0 : Math.max(0, cv.rr[i] - 1)));
      exceso = ["interpolate", ["linear"], ["+", s.x[d], ["coalesce", ["to-number", ["get", "dif_temp_dia"]], 0]], ...paradas];
    }
    m.addSource("mz", { type: "vector", url: `pmtiles://${location.origin}/teselas/manzanas_${c1.reg}${auraAqui ? "_aura" : ""}.pmtiles` });
    m.addLayer({ id: "mz", type: "fill", source: "mz", "source-layer": "manzanas", minzoom: 12, filter: ["==", ["get", "cod_comuna"], c1.cod],
      paint: { "fill-color": ["step", ["*", exceso, vuln], css(COLOR[0]), cfg.cortes_exceso[0], css(COLOR[1]), cfg.cortes_exceso[1], css(COLOR[2]), cfg.cortes_exceso[2], css(COLOR[3])] as ExpressionSpecification, "fill-opacity": 0.92 } }, "linea");
    m.addLayer({ id: "mz-linea", type: "line", source: "mz", "source-layer": "manzanas", minzoom: 13, filter: ["==", ["get", "cod_comuna"], c1.cod], paint: { "line-color": css("--mapa-linea"), "line-width": 0.5 } }, "linea");
    m.addLayer({ id: "mz-sel", type: "line", source: "mz", "source-layer": "manzanas", minzoom: 12, filter: ["==", ["get", "cod_manzana"], String(mz?.cod_manzana ?? "")], paint: { "line-color": css("--tinta"), "line-width": 3 } });
  }, [c1, d, auraAqui, aura, mz, riesgo, cfg, listo, tema]);

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
          {aura && c1 && aura.comunas.includes(c1.cod) && <div className="segmento" role="group" aria-label="Capa de calor urbano AURA">
            <button aria-pressed={!conAura} onClick={() => setConAura(false)}>Sin calor urbano</button><button aria-pressed={conAura} onClick={() => setConAura(true)}>Con calor urbano (AURA)</button>
          </div>}
        </div>
        {tip && <div className="tooltip-mapa" style={{ left: tip.x, top: tip.y }}>{tip.t}</div>}
        <div className="leyenda">
          <b>Riesgo: aumento esperado de muertes</b>
          {cfg.niveles.map((n, i) => <div key={n} className="fila"><i className="cuadro" style={{ background: `var(${COLOR[i]})` }} />{n}: {i === 0 ? `menos de ${cfg.cortes_exceso[0] * 100} %` : i === 3 ? `${cfg.cortes_exceso[2] * 100} % o más` : `${cfg.cortes_exceso[i - 1] * 100} a ${cfg.cortes_exceso[i] * 100} %`}</div>)}
          {c1 && <div style={{ marginTop: 6 }}>{zoom < 12 ? "Acércate para ver las manzanas." : "Manzanas: índice relativo, no muertes."}</div>}
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
          <div className="titulo-fila"><h3>Manzana {String(mz.cod_manzana).slice(-6)}</h3><button className="enlace-btn" onClick={() => setMz(null)}>Cerrar</button></div>
          <dl className="dl" style={{ marginTop: 6 }}>
            <dt>Índice relativo de riesgo</dt><dd><span className={`riesgo r${nivelMz}`}>{cfg.niveles[nivelMz]}</span></dd>
            <dt>Población</dt><dd>{fmt(Number(mz.poblacion ?? 0))}</dd>
            <dt>Personas mayores</dt><dd>{fmt(Number(mz.mayores ?? 0))}</dd>
            <dt>Niños de 0 a 5</dt><dd>{fmt(Number(mz.ninos_0_5 ?? 0))}</dd>
            <dt>Personas con discapacidad</dt><dd>{fmt(Number(mz.discapacidad ?? 0))}</dd>
            <dt>Viviendas hacinadas</dt><dd>{fmt(Number(mz.viviendas_hacinadas ?? 0))}</dd>
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

        {(c1 || r1) && <div className="seccion">
          <h3>Historia del lugar</h3>
          {!hist ? <p className="tenue">Cargando…</p> : !hs ? <p className="tenue">Sin datos.</p> : <>
            <table className="tabla-mini" style={{ marginTop: 6 }}>
              <thead><tr><th>Verano</th><th className="n">Muertes atribuibles (rango)</th></tr></thead>
              <tbody>{Array.from({ length: Math.min(6, iT) }, (_, k) => iT - 1 - k).map((i) => <tr key={i}><td>{temporadaTexto(hist.temporadas[i])}</td>
                <td className="n">{(hs[0][i] ?? 0) < 50 ? "datos insuficientes" : `${fmt(Math.max(0, hs[1][i] ?? 0), 1)} (${fmt(Math.max(0, hs[2][i] ?? 0), 1)} a ${fmt(Math.max(0, hs[3][i] ?? 0), 1)})`}</td></tr>)}</tbody>
            </table>
            {hist.episodios.length > 0 && <table className="tabla-mini" style={{ marginTop: 10 }}>
              <thead><tr><th>Ola de calor</th><th className="n">Máxima</th><th className="n">En exceso (rango)</th></tr></thead>
              <tbody>{[...hist.episodios].sort((a, b) => b.ini.localeCompare(a.ini)).slice(0, 4).map((e) => <tr key={e.ini}><td>{e.ini.slice(8)}/{e.ini.slice(5, 7)}/{e.ini.slice(0, 4)} · {e.dias} días</td><td className="n">{fmt(e.tmax, 1)} °C</td>
                <td className="n">{e.obs < 20 ? "datos insuficientes" : `${fmt(Math.max(0, e.an), 1)} (${fmt(Math.max(0, e.lo), 1)} a ${fmt(Math.max(0, e.hi), 1)})`}</td></tr>)}</tbody>
            </table>}
            <p style={{ marginTop: 10 }}><a className="boton sec" href={c1 ? `/historia/comuna/${c1.cod}` : `/historia/region/${r1!.cod}`}>Ver la historia completa</a></p>
          </>}
        </div>}

        {!c1 && <div className="seccion">
          <h3>{reg ? "Comunas" : "Regiones"}, próximos {alta} días</h3>
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
