"use client";
import { useEffect, useMemo, useState } from "react";
import { BarrasRango, CurvaRiesgo, DetalleDiario, PerfilBarras, SerieVeranos } from "./Graficos";
import { MapaValores } from "./MapaValores";
import {
  POR, EDADES, INDICADORES, SEXOS, claveCurva, claveSerie, edadesDe, esMuerte, fmt, grupos, rangoTexto, resumen, rutaDe, temporadaTexto, tendenciaDecada,
  type CurvasRegion, type Lugar,
} from "@/lib/historia";

type Diario = { temporadas: Record<string, { m: number[]; k: number[]; u?: number[][] }>; clima: string };
type ClimaDia = Record<string, { ini: string; n: number; tmax?: number[]; calor?: number[]; regiones_calor?: number[] }>;
const cache = new Map<string, Promise<unknown>>();
const traer = <T,>(nombre: string): Promise<T> => {
  if (!cache.has(nombre)) cache.set(nombre, fetch(`/historia/${nombre}.json`).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); }));
  return cache.get(nombre) as Promise<T>;
};
const NIVEL_INFERIOR: Record<string, string> = { pais: "región", region: "comuna", comuna: "hospital", hospital: "comuna de su área" };
const FECHA = (s: string) => { const [a, m, d] = s.split("-"); return `${Number(d)}/${Number(m)}/${a}`; };

/** Cifra con su rango: el valor grande y el rango al lado, sin frases. */
function Valor({ c, lo, hi, dec = 0 }: { c: number | null; lo: number | null; hi: number | null; dec?: number }) {
  if (c == null) return <div className="valor tenue">sin dato</div>;
  return <div className="valor">{fmt(Math.max(0, c), dec)} <span className="rango">({fmt(Math.max(0, lo ?? 0), dec)} – {fmt(Math.max(0, hi ?? 0), dec)})</span></div>;
}

export function Historia({ archivo, hasta }: { archivo: string; hasta: string }) {
  const [l, setL] = useState<Lugar | null>(null), [error, setError] = useState(false);
  const [curvas, setCurvas] = useState<Record<string, CurvasRegion> | null>(null);
  const [hijos, setHijos] = useState<Record<string, Lugar>>({});
  const [ind, setInd] = useState("M"), [edad, setEdad] = useState("T"), [sexo, setSexo] = useState("A");
  const [desde, setDesde] = useState(0), [fin, setFin] = useState(0);
  const [medida, setMedida] = useState<"tasa" | "numero">("numero"), [sel, setSel] = useState<number | null>(null);
  const [dia, setDia] = useState<{ d: Diario; c: ClimaDia } | null>(null), [todas, setTodas] = useState(false);

  useEffect(() => {
    let vivo = true;
    traer<Lugar>(archivo).then((x) => {
      if (!vivo) return;
      setL(x); setDesde(0); setFin(x.temporadas.length - 1);
      if (!x.series.M_T_A) setInd(x.series.H_T_A ? "H" : "U");
      Promise.all(x.hijos.map((h) => traer<Lugar>(h.archivo).then((d) => [h.cod, d] as const).catch(() => null)))
        .then((r) => { if (vivo) setHijos(Object.fromEntries(r.filter((y): y is readonly [string, Lugar] => !!y))); });
    }).catch(() => vivo && setError(true));
    traer<Record<string, CurvasRegion>>("curvas").then((c) => vivo && setCurvas(c)).catch(() => {});
    return () => { vivo = false; };
  }, [archivo]);
  useEffect(() => {
    if (sel == null || dia) return;
    let vivo = true;
    traer<Diario>(`dia/${archivo}`).then((d) => traer<ClimaDia>(`dia/${d.clima}`).then((c) => vivo && setDia({ d, c }))).catch(() => {});
    return () => { vivo = false; };
  }, [sel, dia, archivo]);

  const disp = useMemo(() => INDICADORES.filter(([k]) => l?.series[claveSerie(k, "T", "A")]), [l]);
  const edadOk = edadesDe(ind).includes(edad) ? edad : "T", sexoOk = esMuerte(ind) ? sexo : "A";
  const clave = claveSerie(ind, edadOk, sexoOk);
  const sust = INDICADORES.find(([k]) => k === ind)?.[2] ?? "muertes";
  const calc = useMemo(() => {
    if (!l || !l.series[clave]) return null;
    const s = l.series[clave], T = l.temporadas, r = resumen(l, clave, desde, fin);
    const gs = grupos(l, clave, desde, fin);
    const conTasa = medida === "tasa";
    const puntos = (gs ?? []).map((g) => {
      const x = resumen(l, clave, g.i0, g.i1)!, n = g.i1 - g.i0 + 1;
      let cal = 0; for (let i = g.i0; i <= g.i1; i++) cal += l.clima.calor[i];
      return { g, calor: cal / n, v: conTasa ? (x.tasa ?? 0) / n : x.an / n, lo: conTasa ? (x.tasaLo ?? 0) / n : x.lo / n, hi: conTasa ? (x.tasaHi ?? 0) / n : x.hi / n };
    });
    const anos = T.slice(desde, fin + 1);
    const tasaAnual = anos.map((_, k) => { const i = desde + k; return s[1][i] == null ? null : l.pobT?.[i] ? (s[1][i]! / l.pobT[i]!) * POR : null; });
    const numAnual = anos.map((_, k) => s[1][desde + k]);
    const calorAnual = anos.map((_, k) => l.clima.calor[desde + k]);
    return { r, gs, puntos, conTasa, tTasa: tendenciaDecada(anos, tasaAnual), tNum: tendenciaDecada(anos, numAnual), tCalor: tendenciaDecada(anos, calorAnual),
      calorProm: calorAnual.reduce((a, b) => a + b, 0) / calorAnual.length };
  }, [l, clave, desde, fin, medida, ind]);

  const ranking = useMemo(() => {
    if (!l) return [];
    return l.hijos.map((h) => {
      const d = hijos[h.cod], r = d ? resumen(d, clave, desde, fin) : null;
      const tasa = medida === "tasa" && r?.tasa != null;
      return { h, r, ok: !!r?.suficiente, tasa, valor: r ? (tasa ? r.tasa! : r.an) : 0, lo: r ? (tasa ? r.tasaLo! : r.lo) : 0, hi: r ? (tasa ? r.tasaHi! : r.hi) : 0 };
    }).sort((a, b) => Number(b.ok) - Number(a.ok) || b.valor - a.valor);
  }, [l, hijos, clave, desde, fin, ind, medida]);

  const detalle = useMemo(() => {
    if (sel == null || !l || !dia) return null;
    const t = String(l.temporadas[sel]), c = dia.c[t], d = dia.d.temporadas[t];
    if (!c) return null;
    const v = Array(c.n).fill(0);
    let hay = false;
    if (d) {
      if (ind === "M") for (let i = 0; i < d.m.length; i += 3) {
        const cel = d.m[i + 1], e = cel >> 1, sx = cel === 6 ? "I" : cel % 2 ? "M" : "H";
        if (cel === 6 ? edadOk === "T" && sexoOk === "A" : (edadOk === "T" || Number(edadOk) === e) && (sexoOk === "A" || sexoOk === sx)) { v[d.m[i]] += d.m[i + 2]; hay = true; }
      } else if (ind.startsWith("N")) { for (let i = 0; i < d.k.length; i += 3) if (d.k[i + 1] === Number(ind[1])) { v[d.k[i]] += d.k[i + 2]; hay = true; } }
      else if (d.u) { const col = (ind === "U" ? 1 : 3) + (edadOk === "65" ? 1 : 0); d.u[0].forEach((dos, j) => { v[dos] += d.u![col][j]; hay = true; }); }
    }
    return { c, v, hay };
  }, [sel, l, dia, ind, edadOk, sexoOk]);

  if (error) return <div className="pagina"><h1>Lugar no encontrado</h1><p className="sub"><a href="/historia">Volver a Chile</a></p></div>;
  if (!l) return <div className="pagina"><p className="tenue">Cargando…</p></div>;
  const T = l.temporadas, cur = curvas?.[l.curva], cc = cur?.curvas[claveCurva(ind, edadOk)];
  const nombreInd = (INDICADORES.find(([k]) => k === ind)?.[1] ?? "muertes").toLowerCase();
  const xLectura = cur ? (cur.unidad === "°C" ? l.clima.p95 : 95) : null;
  const iLectura = cur && xLectura != null ? cur.x.reduce((m, v, i) => (Math.abs(v - xLectura) < Math.abs(cur.x[m] - xLectura) ? i : m), 0) : -1;
  const lectura = cur && cc && iLectura >= 0 ? { x: cur.x[iLectura], rr: cc.rr[iLectura], lo: cc.lo[iLectura], hi: cc.hi[iLectura] } : null;
  const r = calc?.r, per = `${temporadaTexto(T[desde])} a ${temporadaTexto(T[fin])}`;
  const signo = (v: number, d = 1) => `${v >= 0 ? "+" : "−"}${fmt(Math.abs(v), d)}`;
  const perfil = l.perfil && Object.fromEntries(Object.entries(l.perfil).map(([k, p]) => {
    const suma = (m: number[][]) => p.cat.map((_, j) => m.slice(desde, fin + 1).reduce((a, fila) => a + fila[j], 0));
    return [k, { cat: p.cat, calor: suma(p.calor), normal: suma(p.normal) }];
  }));
  const diasCalor = l.clima.calor.slice(desde, fin + 1).reduce((a, b) => a + b, 0), diasTot = l.clima.dias.slice(desde, fin + 1).reduce((a, b) => a + b, 0);
  const mCalor = perfil?.edad.calor.reduce((a, b) => a + b, 0) ?? 0, mNormal = perfil?.edad.normal.reduce((a, b) => a + b, 0) ?? 0;
  const eps = l.episodios.filter((e) => e.t >= T[desde] && e.t <= T[fin] && e.obs >= 20).sort((a, b) => (l.tipo === "pais" ? b.an - a.an : b.ini.localeCompare(a.ini)));
  const nombres = Object.fromEntries(l.hijos.map((h) => [h.cod, h.nombre]));
  const conMapa = l.tipo !== "comuna" && l.hijos.length > 0;

  return (
    <div className="pagina">
      <nav className="ruta" aria-label="Dónde estás">
        {l.ruta.map((p, i) => i < l.ruta.length - 1 ? <span key={p.cod}><a href={rutaDe(p)}>{p.nombre}</a> ›</span> : <b key={p.cod}>{p.nombre}</b>)}
      </nav>
      <div className="titulo-fila">
        <h1>{l.tipo === "hospital" ? l.nombre : `Calor y ${esMuerte(ind) ? "muertes" : sust} en ${l.nombre}`}</h1>
        {l.ruta.length > 1 && <a className="boton sec" href={rutaDe(l.ruta[l.ruta.length - 2])}>↑ Subir a {l.ruta[l.ruta.length - 2].nombre}</a>}
      </div>
      <p className="sub">
        {l.tipo === "hospital" ? `Servicio de Salud ${l.servicio}. ${l.hijos.length ? `Las muertes son de residentes de su área (${l.hijos.length} ${l.hijos.length === 1 ? "comuna" : "comunas"}); el archivo no dice en qué hospital ocurrió cada muerte.` : "No es hospital de referencia de ninguna comuna según la regla de cercanía, así que no tiene muertes de un área."}`
          : l.tipo === "comuna" && l.hospital ? <>Hospital de referencia: <a href={`/historia/hospital/${l.hospital.cod}`}>{l.hospital.nombre}</a>, a {fmt(l.hospital.dist_km, 1)} km. </> : null}
        {" "}Defunciones hasta el {FECHA(hasta)}. {l.clima.punto ? `Temperatura de ${l.clima.punto}, capital regional.` : "Temperatura de cada capital regional."}
      </p>

      <div className="filtros barra-filtros">
        <div><label htmlFor="f-ind">Indicador</label><select id="f-ind" value={ind} onChange={(e) => { setInd(e.target.value); setSel(null); }}>{disp.map(([k, n]) => <option key={k} value={k}>{l.tipo === "hospital" && k === "M" ? "Muertes de residentes del área" : n}</option>)}</select></div>
        <div><label htmlFor="f-des">Desde el verano</label><select id="f-des" value={desde} onChange={(e) => { setDesde(Math.min(Number(e.target.value), fin)); setSel(null); }}>{T.map((t, i) => <option key={t} value={i}>{temporadaTexto(t)}</option>)}</select></div>
        <div><label htmlFor="f-has">Hasta el verano</label><select id="f-has" value={fin} onChange={(e) => { setFin(Math.max(Number(e.target.value), desde)); setSel(null); }}>{T.map((t, i) => <option key={t} value={i}>{temporadaTexto(t)}</option>)}</select></div>
        <div><label htmlFor="f-edad">Grupo de edad</label><select id="f-edad" value={edadOk} onChange={(e) => setEdad(e.target.value)}>{edadesDe(ind).map((k) => <option key={k} value={k}>{EDADES[k]}</option>)}</select></div>
        <div className="filtro-medida"><label>Mostrar</label><div className="segmento" role="group" aria-label="Medida"><button aria-pressed={medida === "numero"} onClick={() => setMedida("numero")}>Número</button><button aria-pressed={medida === "tasa"} onClick={() => setMedida("tasa")}>Por 1.000 habitantes</button></div></div>
        <div><label htmlFor="f-sexo">Sexo</label><select id="f-sexo" value={sexoOk} disabled={!esMuerte(ind)} onChange={(e) => setSexo(e.target.value)}>{Object.entries(SEXOS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></div>
      </div>
      {!esMuerte(ind) && <p className="chico" style={{ marginTop: 6 }}>Urgencias no trae sexo ni diagnóstico: solo grupos amplios de causa y dos grupos de edad. Datos desde el verano 2010-11.</p>}

      {/* 1. Tres cifras */}
      <section className="seccion grilla g3">
        <div className="tarjeta kpi">
          <div className="rot">{sust[0].toUpperCase() + sust.slice(1)} atribuibles al calor, {per}{calc?.conTasa ? ", por 1.000 habitantes" : ""}</div>
          {r?.suficiente ? <Valor c={calc!.conTasa ? r.tasa : r.an} lo={calc!.conTasa ? r.tasaLo : r.lo} hi={calc!.conTasa ? r.tasaHi : r.hi} dec={calc!.conTasa ? 2 : 0} />
            : <div className="valor tenue">Datos insuficientes</div>}
          {r?.suficiente && <div className="chico">{calc!.conTasa ? `${fmt(Math.max(0, r.an))} ${sust} en total` : `de ${fmt(r.obs)} ${sust} en temporada cálida`}</div>}
        </div>
        <div className="tarjeta kpi">
          <div className="rot">Cambio cada 10 años{calc?.conTasa ? ", por 1.000 habitantes" : ` en ${sust} atribuibles por verano`}</div>
          {r?.suficiente && (calc!.conTasa ? calc!.tTasa : calc!.tNum) != null
            ? <><div className="valor">{signo((calc!.conTasa ? calc!.tTasa : calc!.tNum)!, calc!.conTasa ? 3 : Math.abs(calc!.tNum!) >= 10 ? 0 : 1)}</div>
              <div className="chico">Días de calor extremo por verano: {calc!.tCalor != null ? signo(calc!.tCalor) : "sin dato"} cada 10 años</div></>
            : <><div className="valor tenue">Datos insuficientes</div><div className="chico">Se necesitan al menos 8 veranos y 50 casos.</div></>}
        </div>
        <div className="tarjeta kpi">
          <div className="rot">Días de calor extremo por verano</div>
          <div className="valor">{fmt(calc?.calorProm ?? null, 1)}</div>
          <div className="chico">{l.clima.p95 != null ? `Máxima sobre ${fmt(l.clima.p95, 1)} °C, el percentil 95 local` : "Promedio de las regiones, ponderado por personas mayores"}. Lo esperable por definición: 7,6.</div>
        </div>
      </section>

      {/* 2. Temperatura y casos en el tiempo */}
      <section className="seccion">
        <div className="titulo-fila">
          <h2>Días de calor extremo y {sust} atribuibles, por verano</h2>
        </div>
        {calc?.gs && r?.suficiente ? <div className="tarjeta" style={{ marginTop: 10 }}>
          <SerieVeranos etiquetas={calc.puntos.map((p) => p.g.etiqueta)} barras={calc.puntos.map((p) => p.calor)} linea={calc.puntos.map((p) => p.v)} lo={calc.puntos.map((p) => p.lo)} hi={calc.puntos.map((p) => p.hi)}
            rotuloBarras="Días de calor extremo" rotuloLinea={calc.conTasa ? `${sust[0].toUpperCase() + sust.slice(1)} atribuibles por 1.000 habitantes, por verano` : `${sust[0].toUpperCase() + sust.slice(1)} atribuibles por verano`} dec={calc.conTasa ? 3 : 0}
            sel={sel == null ? null : calc.puntos.findIndex((p) => sel >= p.g.i0 && sel <= p.g.i1)} alElegir={(i) => setSel(calc.puntos[i].g.i1 === sel ? null : calc.puntos[i].g.i1)} />
          <p className="chico">{calc.puntos.some((p) => p.g.i0 !== p.g.i1) ? "Pocos casos por verano: se agrupan de a cinco. " : ""}{calc.conTasa && T[desde] < 2002 ? "Antes de 2002 la tasa usa la población de 2002, primer año del INE. " : ""}La banda es el rango de la estimación. Un clic en un verano abre su detalle diario.</p>
        </div> : <p className="aviso" style={{ marginTop: 10 }}>Datos insuficientes para mostrar la serie de este lugar con estos filtros.</p>}
        {sel != null && <div className="tarjeta" style={{ marginTop: 12 }}>
          <div className="titulo-fila"><h3>Detalle diario del verano {temporadaTexto(T[sel])}</h3><button className="enlace-btn" onClick={() => setSel(null)}>Cerrar</button></div>
          {!detalle ? <p className="tenue">Cargando…</p> : !detalle.hay ? <p className="tenue">{l.tipo === "comuna" && !esMuerte(ind) ? "El detalle diario de urgencias está en la página de cada hospital." : l.tipo === "hospital" && esMuerte(ind) ? "El detalle diario de muertes está en la página de cada comuna del área." : "Sin casos registrados ese verano."}</p>
            : <DetalleDiario inicio={detalle.c.ini} tmax={detalle.c.tmax ?? null} calor={detalle.c.calor ?? []} p95={l.clima.p95} valores={medida === "tasa" && l.pobT[sel!] ? detalle.v.map((v: number) => (v / l.pobT[sel!]!) * POR) : detalle.v} dec={medida === "tasa" ? 4 : 0} rotuloValores={`${sust[0].toUpperCase() + sust.slice(1)} por día${medida === "tasa" ? " por 1.000 habitantes" : ""}`} rotuloArriba="Regiones con calor extremo" arriba={detalle.c.regiones_calor} />}
          {ind.startsWith("N") && (edadOk !== "T" || sexoOk !== "A") && <p className="chico">El detalle diario por nivel de diagnóstico no separa edad ni sexo.</p>}
        </div>}
      </section>

      {/* 3. A más grados, más casos */}
      <section className="seccion">
        <h2>Cuánto suben las {nombreInd} con la temperatura</h2>
        {cur && cc ? <div className="tarjeta" style={{ marginTop: 10 }}>
          {lectura && <p className="lectura">{cur.unidad === "°C" ? `Con ${fmt(lectura.x, 1)} °C (calor extremo)` : "En un día de calor extremo (percentil 95 de la temperatura del lugar)"}, las {nombreInd} suben <b>{fmt(Math.max(0, lectura.rr - 1) * 100, 1)} %</b> (entre {fmt(Math.max(0, lectura.lo - 1) * 100, 1)} y {fmt(Math.max(0, lectura.hi - 1) * 100, 1)} %) respecto de un día sin calor.
            {" "}Bajo {cur.unidad === "°C" ? `los ${fmt(cc.umbral ?? 0, 1)} °C` : `el percentil ${cc.umbral_p}`} no hay aumento.</p>}
          <CurvaRiesgo x={cur.x} rr={cc.rr} lo={cc.lo} hi={cc.hi} umbral={cur.unidad === "°C" ? cc.umbral : cc.umbral_p} p95={cur.unidad === "°C" ? l.clima.p95 : 95} unidad={cur.unidad} rotulo={`Aumento de las ${nombreInd} respecto de un día sin calor (%)`} />
          <details className="chico" style={{ marginTop: 6 }}>
            <summary>Cómo se lee y para qué sirve</summary>
            <p style={{ marginTop: 6 }}>Hacia la derecha el día es más caluroso{cur.unidad === "°C" ? " (promedio de la máxima de ese día y de los 3 anteriores)" : " para ese lugar: percentil 50 es un día de verano típico y percentil 100, el más caluroso registrado"}; hacia arriba, cuánto suben las {nombreInd}. La banda es el rango de la estimación: si es ancha, hay pocos casos.</p>
            <p style={{ marginTop: 6 }}>Es la curva que usa toda la plataforma: la temperatura de cada día se busca aquí. Con la temperatura observada salen las {sust} atribuibles de esta página; con la pronosticada, las del mapa de riesgo.</p>
            <p style={{ marginTop: 6 }}>{l.tipo === "pais" ? (ind === "N1" ? "Curva nacional única: hay muy pocos casos para estimar una por región." : "Para Chile se muestra el promedio de las curvas de las 16 regiones.") : ind === "N1" ? "Curva nacional única, llevada a los grados de esta región: hay muy pocos casos para estimar una por región." : "Curva de la región, acercada a la curva nacional según cuántos casos tiene."}</p>
          </details>
        </div> : <p className="tenue">Cargando la curva…</p>}
      </section>

      {/* 4. Dónde */}
      {l.hijos.length > 0 && <section className="seccion">
        <h2>{l.tipo === "comuna" ? "Hospitales de la comuna" : `Dónde se concentra, por ${NIVEL_INFERIOR[l.tipo]}`}</h2>
        <p className="sub">{ranking[0]?.tasa ? `${sust[0].toUpperCase() + sust.slice(1)} atribuibles por 1.000 habitantes en todo el período` : `${sust[0].toUpperCase() + sust.slice(1)} atribuibles en todo el período`}, {per}. Un clic baja de nivel.</p>
        <div className={conMapa ? "grilla dos-mapa" : ""} style={{ marginTop: 10 }}>
          {conMapa && <MapaValores modo={l.tipo === "pais" ? "region" : "comuna"} valores={Object.fromEntries(ranking.map((x) => [x.h.cod, x.ok ? x.valor : null]))} nombres={nombres} bbox={l.bbox}
            formato={(v) => fmt(v, ranking[0]?.tasa ? 2 : v < 10 ? 1 : 0)} alPinchar={(cod) => { const h = l.hijos.find((x) => x.cod === cod); if (h) location.href = rutaDe(h); }} />}
          <div className="tarjeta rank-caja">
            {Object.keys(hijos).length === 0 ? <p className="tenue">Cargando…</p> : <>
              <BarrasRango dec={ranking[0]?.tasa ? 2 : (ranking[0]?.valor ?? 0) < 100 ? 1 : 0} filas={ranking.filter((x) => x.ok).map((x) => ({ cod: x.h.cod, nombre: x.h.nombre + (x.h.referencia ? " (de referencia)" : ""), valor: x.valor, lo: x.lo, hi: x.hi, href: rutaDe(x.h) }))} />
              {ranking.some((x) => !x.ok) && <p className="chico" style={{ marginTop: 8 }}>Datos insuficientes (menos de 50 casos): {ranking.filter((x) => !x.ok).map((x, i) => <span key={x.h.cod}>{i ? ", " : ""}<a href={rutaDe(x.h)}>{x.h.nombre}</a></span>)}.</p>}
            </>}
          </div>
        </div>
      </section>}

      {/* 5. Quiénes */}
      {perfil && <section className="seccion">
        <h2>Quiénes mueren en días de calor extremo y en días normales</h2>
        <p className="sub">Todas las muertes de la temporada cálida, {per}: {fmt(mCalor)} en {fmt(diasCalor, 0)} días de calor extremo ({fmt(diasCalor ? mCalor / diasCalor : null, 1)} por día) y {fmt(mNormal)} en días normales ({fmt(diasTot - diasCalor ? mNormal / (diasTot - diasCalor) : null, 1)} por día).</p>
        {mCalor < 50 ? <p className="aviso" style={{ marginTop: 10 }}>Datos insuficientes: menos de 50 muertes en días de calor extremo.</p> : <>
          <div className="leyenda-graf" style={{ marginTop: 10 }}><span><i className="cuadro" style={{ background: "var(--n2)" }} />% en días de calor extremo</span><span><i className="cuadro" style={{ background: "var(--barra)" }} />% en días normales</span><span>La última columna es la diferencia en puntos porcentuales.</span></div>
          <div className="grilla g2">
            {([["edad", "Edad"], ["sexo", "Sexo"], ["lugar", "Lugar de defunción"], ["nivel", "Nivel de diagnóstico (desde 1997)"], ["causa", "Causa de muerte (desde 1997)"]] as const).map(([k, t]) =>
              <div key={k} className="tarjeta"><h3>{t}</h3><PerfilBarras {...perfil[k]} /></div>)}
          </div></>}
      </section>}

      {/* 6. Episodios */}
      {l.perfil && <section className="seccion">
        <h2>Olas de calor{l.tipo === "pais" ? " con más muertes atribuibles" : ""}</h2>
        <p className="sub">Tres o más días seguidos con máxima sobre el percentil 90 local. Se cuentan las muertes atribuibles al calor durante la ola y los 3 días siguientes.</p>
        {eps.length === 0 ? <p className="tenue" style={{ marginTop: 10 }}>Sin olas de calor en el período.</p> : <div className="tabla-caja" style={{ marginTop: 10 }}>
          <table>
            <thead><tr>{l.tipo === "pais" && <th>Región</th>}<th>Inicio</th><th>Término</th><th className="n">Días</th><th className="n">Máxima</th><th className="n">Muertes atribuibles al calor{medida === "tasa" ? " por 1.000 habitantes" : ""} (rango)</th></tr></thead>
            <tbody>{(todas ? eps : eps.slice(0, 10)).map((e) => <tr key={e.reg + e.ini}>
              {l.tipo === "pais" && <td><a href={`/historia/region/${e.reg}`}>{nombres[e.reg]}</a></td>}
              <td>{FECHA(e.ini)}</td><td>{FECHA(e.fin)}</td><td className="n">{e.dias}</td><td className="n">{fmt(e.tmax, 1)} °C</td>
              <td className="n">{(() => {
                const pob = (l.tipo === "pais" ? hijos[e.reg] : l)?.pobT?.[T.indexOf(e.t)], k = medida === "tasa" ? (pob ? POR / pob : null) : 1, dd = medida === "tasa" ? 4 : 1;
                return k == null ? "sin dato" : `${fmt(Math.max(0, e.an * k), dd)} (${fmt(Math.max(0, e.lo * k), dd)} – ${fmt(Math.max(0, e.hi * k), dd)})`;
              })()}</td></tr>)}</tbody>
          </table>
        </div>}
        {eps.length > 10 && <p style={{ marginTop: 8 }}><button className="enlace-btn" onClick={() => setTodas(!todas)}>{todas ? "Ver solo 10" : `Ver las ${eps.length}`}</button></p>}
      </section>}
    </div>
  );
}
