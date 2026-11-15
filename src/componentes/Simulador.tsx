"use client";
import { useEffect, useMemo, useState } from "react";
import { fmtRango, paraMostrar, simular, suma, TRAMOS, type Insumos, type InsumoRegion, type Parametros, type Rango } from "@/lib/motor";
import { Rob } from "./Robustez";

type Reg = { cod: string; nombre: string } & InsumoRegion;
const f1 = (n: number, d = 1) => n.toLocaleString("es-CL", { minimumFractionDigits: d, maximumFractionDigits: d });
const dec = (r: Rango) => (Math.max(Math.abs(r[0]), Math.abs(r[1])) < 10 ? 1 : 0);

/** Panel 2: escenarios hipotéticos con el motor común. Los parámetros quedan en la dirección de la página. */
export function Simulador({ regiones, p }: { regiones: Reg[]; p: Parametros }) {
  const [sel, setSel] = useState<string[]>(["13"]);
  const [edad, setEdad] = useState<number[] | null>(null);
  const [dias, setDias] = useState<number | null>(null);
  const [grados, setGrados] = useState(3);
  const [verde, setVerde] = useState(0);
  const [leido, setLeido] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get("r")) setSel(q.get("r")!.split(",").filter((x) => regiones.some((r) => r.cod === x)));
    if (q.get("e")) { const e = q.get("e")!.split(",").map(Number); if (e.length === 4 && e.every((x) => Number.isFinite(x))) setEdad(e); }
    if (q.get("d") != null && q.get("d") !== "") setDias(Math.min(60, Math.max(0, Number(q.get("d")))));
    if (q.get("g")) setGrados(Math.min(10, Math.max(0, Number(q.get("g")))));
    if (q.get("v")) setVerde(Math.min(20, Math.max(-20, Number(q.get("v")))));
    setLeido(true);
  }, [regiones]);
  useEffect(() => {
    if (!leido) return;
    const q = new URLSearchParams({ r: sel.join(","), g: String(grados), v: String(verde) });
    if (edad) q.set("e", edad.join(","));
    if (dias != null) q.set("d", String(dias));
    history.replaceState(null, "", `?${q}`);
  }, [sel, edad, dias, grados, verde, leido]);

  const ins = useMemo(() => ({ regiones: Object.fromEntries(regiones.map((r) => [r.cod, r])), comunas: {} }) as unknown as Insumos, [regiones]);
  const res = useMemo(() => simular({ regiones: sel, edad, dias, grados, verde }, ins, p), [sel, edad, dias, grados, verde, ins, p]);
  const elegidas = regiones.filter((r) => sel.includes(r.cod) && r.clima);
  const censo = useMemo(() => { const t = [0, 1, 2, 3].map((i) => suma(elegidas.map((r) => r.pob[i]))), s = suma(t) || 1; return t.map((x) => Math.round((x / s) * 1000) / 10); }, [elegidas]);
  const diasCenso = elegidas.length ? Math.round((suma(elegidas.map((r) => r.clima!.dias_ano)) / elegidas.length) * 10) / 10 : 0;
  const nombre = Object.fromEntries(regiones.map((r) => [r.cod, r.nombre]));
  const evit = paraMostrar(res.evitadas);
  const adicionales = res.evitadas[0] < 0 || res.evitadas[1] < 0;
  const porTramo = (k: "sinTramo" | "conTramo", i: number): Rango => [suma(res.regiones.map((r) => r[k][0][i])), suma(res.regiones.map((r) => r[k][1][i]))];

  const csv = () => {
    const filas = [["region", "tramo", "sin_medida_bajo", "sin_medida_alto", "con_medida_bajo", "con_medida_alto", "evitadas_bajo", "evitadas_alto"]];
    for (const r of res.regiones) TRAMOS.forEach((t, i) => filas.push([nombre[r.reg], t, ...[r.sinTramo[0][i], r.sinTramo[1][i], r.conTramo[0][i], r.conTramo[1][i], r.sinTramo[0][i] - r.conTramo[0][i], r.sinTramo[1][i] - r.conTramo[1][i]].map((x) => x.toFixed(3))]));
    filas.push([], ["supuesto", "valor"], ["regiones", sel.join(" ")], ["dias_extremos", String(dias ?? "promedio histórico de cada región")], ["grados_sobre_promedio", String(grados)], ["cambio_areas_verdes_pp", String(verde)],
      ["distribucion_edad", edad ? edad.join(" / ") : "Censo 2024 de cada región"], ["rr_bajo", String(p.rr.bajo)], ["rr_alto", String(p.rr.alto)], ["coef_verde_bajo", String(p.coef_verde.bajo)], ["coef_verde_alto", String(p.coef_verde.alto)], ["nota", "Escenario hipotético; no es un pronóstico"]);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + filas.map((f) => f.join(",")).join("\n")], { type: "text/csv" }));
    a.download = "simulacion_calor.csv"; a.click();
  };

  return (
    <div className="grilla" style={{ gridTemplateColumns: "minmax(280px, 380px) minmax(0, 1fr)", alignItems: "start" }}>
      <div className="tarjeta" data-tour="sim-controles">
        <h3>Supuestos del escenario</h3>
        <label>Regiones afectadas ({sel.length})</label>
        <div style={{ maxHeight: 150, overflowY: "auto", border: "1px solid var(--borde)", borderRadius: 8, padding: "6px 8px", marginBottom: 12 }}>
          {regiones.map((r) => (
            <label key={r.cod} className="fila" style={{ gap: 6, margin: "2px 0", fontWeight: 400, color: r.clima ? "var(--texto)" : "var(--texto-3)" }}>
              <input type="checkbox" style={{ width: "auto" }} disabled={!r.clima} checked={sel.includes(r.cod)} onChange={(e) => setSel(e.target.checked ? [...sel, r.cod] : sel.filter((x) => x !== r.cod))} />{r.nombre}{r.clima ? "" : " (sin serie de temperatura)"}
            </label>
          ))}
        </div>
        <label>Distribución de la población por edad (%)</label>
        <div className="grilla" style={{ gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 4 }}>
          {TRAMOS.map((t, i) => (
            <div key={t}><span className="chico">{t}</span><input type="number" min={0} max={100} step={0.1} aria-label={`Porcentaje de ${t} años`} value={(edad ?? censo)[i]} onChange={(e) => { const v = [...(edad ?? censo)]; v[i] = Number(e.target.value); setEdad(v); }} /></div>
          ))}
        </div>
        <div className="chico" style={{ marginBottom: 12, color: edad && Math.abs(suma(edad) - 100) > 0.05 ? "var(--n3)" : undefined }}>{edad ? `Suma: ${f1(suma(edad))} %` : "Censo 2024 de cada región"}</div>
        <div className="control"><label htmlFor="s-dias">Días de temperatura extrema en el año</label><output>{dias ?? `${f1(diasCenso)} (histórico)`}</output>
          <input id="s-dias" type="range" min={0} max={60} step={1} value={dias ?? Math.round(diasCenso)} onChange={(e) => setDias(Number(e.target.value))} /></div>
        <div className="control"><label htmlFor="s-gr">Grados sobre la temperatura promedio ese día</label><output>{f1(grados)} °C</output>
          <input id="s-gr" type="range" min={0} max={10} step={0.5} value={grados} onChange={(e) => setGrados(Number(e.target.value))} /></div>
        <div className="control"><label htmlFor="s-ver">Cambio en áreas verdes</label><output>{verde > 0 ? "+" : ""}{verde} puntos</output>
          <input id="s-ver" type="range" min={-20} max={20} step={1} value={verde} onChange={(e) => setVerde(Number(e.target.value))} /></div>
        <button className="boton sec" onClick={() => { setEdad(null); setDias(null); }}>Restablecer valores del Censo</button>
      </div>

      <div>
        <div data-tour="sim-resultado">
          {res.error ? <p className="aviso mal" role="alert">{res.error}</p> : (
            <>
              <div className="grilla g3">
                <div className="tarjeta kpi"><div className="valor">{fmtRango(res.sin, dec(res.sin))}</div><div className="rot">Muertes atribuibles al año sin la medida</div></div>
                <div className="tarjeta kpi"><div className="valor">{fmtRango(res.con, dec(res.con))}</div><div className="rot">Con el cambio en áreas verdes</div></div>
                <div className="tarjeta kpi"><div className="valor">{f1(Math.abs(evit[adicionales ? 1 : 0]), dec(res.evitadas))} a {f1(Math.abs(evit[adicionales ? 0 : 1]), dec(res.evitadas))}</div>
                  <div className="rot">{verde === 0 ? "Diferencia (sin cambio en áreas verdes)" : adicionales ? "Muertes adicionales" : "Muertes evitadas"}</div>
                  <div style={{ marginTop: 6 }}><Rob clase={res.clase} /> <span className="chico">la medida evita muertes</span></div></div>
              </div>
              {res.avisos.map((a) => <p key={a} className="aviso" style={{ marginTop: 8 }}>{a}</p>)}
              <div className="grilla g2" style={{ marginTop: 12 }}>
                <div className="tabla-caja"><table>
                  <thead><tr><th>Región</th><th className="n">Día extremo / umbral</th><th className="n">Sin medida</th><th className="n">Con medida</th><th className="n">Diferencia</th></tr></thead>
                  <tbody>{res.regiones.map((r) => <tr key={r.reg}><td>{nombre[r.reg]}</td><td className="n">{r.sinClima ? "sin serie" : `${f1(r.t)}° / ${f1(r.umbral)}°`}</td><td className="n">{fmtRango(r.sin, dec(r.sin))}</td><td className="n">{fmtRango(r.con, dec(r.con))}</td><td className="n">{fmtRango(r.evitadas, dec(r.evitadas))}</td></tr>)}</tbody>
                </table></div>
                <div className="tabla-caja"><table>
                  <thead><tr><th>Edad</th><th className="n">Sin medida</th><th className="n">Con medida</th></tr></thead>
                  <tbody>{TRAMOS.map((t, i) => { const a = porTramo("sinTramo", i), b = porTramo("conTramo", i); return <tr key={t}><td>{t} años</td><td className="n">{fmtRango(a, dec(a))}</td><td className="n">{fmtRango(b, dec(b))}</td></tr>; })}</tbody>
                </table></div>
              </div>
            </>
          )}
        </div>
        <div className="tarjeta" style={{ marginTop: 12 }} data-tour="sim-supuestos">
          <div className="fila entre"><h3>Supuestos activos</h3>
            <span className="fila"><button className="boton sec" onClick={csv} disabled={!!res.error}>Descargar CSV</button>
              {!res.error && verde !== 0 && <a className="boton" href={`/analisis/inversion?bajo=${Math.max(0, res.evitadas[0]).toFixed(3)}&alto=${Math.max(0, res.evitadas[1]).toFixed(3)}&desde=simulador`}>Cuánto invertir en esta medida</a>}</span></div>
          <table className="tabla-mini supuestos">
            <tbody>
              <tr><td>Fórmula</td><td>{p.formula}</td></tr>
              <tr><td>Día extremo</td><td>Máxima promedio del mes más cálido de cada región + {f1(grados)} °C, durante {dias ?? "su promedio histórico de"} días al año</td></tr>
              <tr><td>Umbral</td><td>Percentil {p.umbral.percentil} local de la temperatura máxima ({p.umbral.periodo}), en la capital regional</td></tr>
              <tr><td>Riesgo relativo por °C</td><td>{p.rr.bajo.toLocaleString("es-CL")} (bajo) y {p.rr.alto.toLocaleString("es-CL")} (alto). {p.rr.fuente}</td></tr>
              <tr><td>Áreas verdes</td><td>{p.coef_verde.bajo.toLocaleString("es-CL")} (bajo) y {p.coef_verde.alto.toLocaleString("es-CL")} (alto) °C por punto porcentual. {p.coef_verde.advertencia}</td></tr>
              <tr><td>Población y tasa base</td><td>Población total del Censo 2024; {edad ? "distribución por edad editada" : "distribución por edad del Censo"}. {p.tasa_base.definicion}.</td></tr>
              <tr><td>Escenario bajo y alto</td><td>Bajo: RR bajo y coeficiente bajo. Alto: RR alto y coeficiente alto. La medida es robusta si evita muertes en ambos.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
