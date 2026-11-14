"use client";
import { useMemo, useState } from "react";
import { agregar } from "@/lib/alerta";
import { NivelChip } from "./Basicos";
import { BarraNiveles, EstadoPill } from "./Explorador";

export type FilaSemaforo = {
  cod: string; nombre: string; cod_region: string; region: string; cod_prov: string; provincia: string; pob65: number;
  niveles: { nivel: number | null; incierto: boolean; tmax: number | null; estado: number | null }[];
  alerta: { organismo: string; tipo: string; enlace: string } | null;
  discrepancia: string | null; mayores_alta: number; dep_severa: number | null; senal65: string | null;
};
const fmt = (n: number | null) => (n == null ? "sin dato" : n.toLocaleString("es-CL"));

/** Semáforo por comuna, provincia o región: alerta oficial y nivel propio en columnas separadas (RF-13 a RF-15). */
export function TablaSemaforo({ filas, fechas, regiones, fraccion, cobertura }: { filas: FilaSemaforo[]; fechas: string[]; regiones: { cod: string; nombre: string }[]; fraccion: number; cobertura: number }) {
  const [region, setRegion] = useState("");
  const [grupo, setGrupo] = useState<"comuna" | "provincia" | "region">("comuna");
  const [activas, setActivas] = useState(false);
  const [discrep, setDiscrep] = useState(false);
  const [orden, setOrden] = useState<"nivel" | "mayores" | "dependientes">("nivel");
  const [limite, setLimite] = useState(40);
  const dias = fechas.slice(0, 6);
  const vista = useMemo(() => {
    const base = filas.filter((x) => !region || x.cod_region === region);
    type G = { cod: string; nombre: string; sub: string; enlace: string | null; n: number; niveles: { nivel: number | null; incierto: boolean }[]; estado: number | null; dist: number[]; sin: number; tmax: number | null; alerta: FilaSemaforo["alerta"]; discrepancia: string | null; mayores: number; dep: number | null; senal: string | null };
    let gs: G[];
    if (grupo === "comuna") {
      gs = base.map((x) => ({ cod: x.cod, nombre: x.nombre, sub: x.region, enlace: `/comuna/${x.cod}`, n: 1, niveles: x.niveles.slice(0, 6), estado: x.niveles[0]?.estado ?? null, dist: [], sin: 0, tmax: x.niveles[0]?.tmax ?? null, alerta: x.alerta, discrepancia: x.discrepancia, mayores: x.mayores_alta, dep: x.dep_severa, senal: x.senal65 }));
    } else {
      const m = new Map<string, FilaSemaforo[]>();
      for (const x of base) { const k = grupo === "region" ? x.cod_region : x.cod_prov; if (!m.has(k)) m.set(k, []); m.get(k)!.push(x); }
      gs = [...m.entries()].map(([cod, xs]) => {
        const ag = (i: number, campo: "nivel" | "estado") => agregar(xs.map((x) => ({ valor: x.niveles[i]?.[campo], peso: x.pob65 })), fraccion, cobertura);
        const dist = [0, 0, 0, 0]; let sin = 0;
        for (const x of xs) { const v = x.niveles[0]?.nivel; if (v == null) sin++; else dist[v]++; }
        const tm = xs.map((x) => x.niveles[0]?.tmax).filter((t): t is number => t != null);
        return { cod, nombre: grupo === "region" ? xs[0].region : xs[0].provincia, sub: grupo === "region" ? `${xs.length} comunas` : `${xs[0].region} · ${xs.length} comunas`, enlace: null, n: xs.length,
          niveles: dias.map((_, i) => ({ nivel: ag(i, "nivel"), incierto: false })), estado: ag(0, "estado"), dist, sin, tmax: tm.length ? Math.max(...tm) : null,
          alerta: null, discrepancia: xs.some((x) => x.discrepancia) ? `${xs.filter((x) => x.discrepancia).length} comunas con discrepancia` : null,
          mayores: xs.reduce((a, x) => a + x.mayores_alta, 0), dep: xs.some((x) => x.dep_severa != null) ? xs.reduce((a, x) => a + (x.dep_severa ?? 0), 0) : null,
          senal: `${xs.filter((x) => x.senal65 && /sobre/.test(x.senal65)).length} comunas sobre lo habitual` };
      });
    }
    const f = gs.filter((x) => (!activas || (x.niveles[0]?.nivel ?? 0) >= 1) && (!discrep || x.discrepancia));
    const maxN = (x: G) => Math.max(-1, ...x.niveles.map((n) => n.nivel ?? -1));
    return f.sort((a, b) => orden === "mayores" ? b.mayores - a.mayores : orden === "dependientes" ? (b.dep ?? -1) - (a.dep ?? -1)
      : ((b.niveles[0]?.nivel ?? -1) - (a.niveles[0]?.nivel ?? -1)) || (maxN(b) - maxN(a)) || (b.mayores - a.mayores));
  }, [filas, region, grupo, activas, discrep, orden, dias, fraccion, cobertura]);
  return (
    <>
      <div className="filtros" style={{ marginBottom: 10 }} data-tour="filtros-panel">
        <div><label htmlFor="f-region">Región</label><select id="f-region" value={region} onChange={(e) => setRegion(e.target.value)}><option value="">Todas</option>{regiones.map((r) => <option key={r.cod} value={r.cod}>{r.nombre}</option>)}</select></div>
        <div><label htmlFor="f-grupo">Agrupar por</label><select id="f-grupo" value={grupo} onChange={(e) => setGrupo(e.target.value as typeof grupo)}><option value="comuna">Comuna</option><option value="provincia">Provincia</option><option value="region">Región</option></select></div>
        <div><label htmlFor="f-orden">Ordenar por</label><select id="f-orden" value={orden} onChange={(e) => setOrden(e.target.value as typeof orden)}><option value="nivel">Nivel de hoy</option><option value="mayores">60+ en manzanas prioritarias</option><option value="dependientes">Dependencia severa</option></select></div>
        <label className="fila" style={{ gap: 6, margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={activas} onChange={(e) => setActivas(e.target.checked)} />Nivel 1 o más</label>
        <label className="fila" style={{ gap: 6, margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={discrep} onChange={(e) => setDiscrep(e.target.checked)} />Con discrepancia</label>
        <span className="chico">{vista.length} filas</span>
      </div>
      <div className="tabla-caja" data-tour="tabla-panel">
        <table>
          <thead>
            <tr><th>{grupo === "comuna" ? "Comuna" : grupo === "provincia" ? "Provincia" : "Región"}</th><th>Alerta propia</th>{grupo === "comuna" ? <th>Alerta oficial</th> : <th>Comunas por nivel</th>}
              {dias.map((f, i) => <th key={f} style={{ textAlign: "center" }}>{i === 0 ? "Hoy" : `+${i}`}<br /><span style={{ fontWeight: 400 }}>{f.slice(8)}/{f.slice(5, 7)}</span></th>)}
              <th className="n">Máx. hoy</th><th className="n">60+ prioritarias</th><th className="n">Dep. severa</th><th>Urgencias 65+</th></tr>
          </thead>
          <tbody>
            {vista.slice(0, limite).map((x) => (
              <tr key={x.cod}>
                <td>{x.enlace ? <a href={x.enlace}>{x.nombre}</a> : <b>{x.nombre}</b>}<br /><span className="chico">{x.sub}</span></td>
                <td><EstadoPill e={x.estado} /></td>
                <td>{grupo === "comuna" ? (x.alerta ? <><b>{x.alerta.tipo}</b><br /><span className="chico">{x.alerta.organismo} · <a href={x.alerta.enlace} target="_blank" rel="noreferrer">original</a></span></> : <span className="chico">Sin alerta</span>) : <BarraNiveles n={x.dist} sin={x.sin} />}
                  {x.discrepancia && <><br /><span className="pildora roja" title={x.discrepancia}>Discrepancia</span></>}</td>
                {x.niveles.map((n, i) => <td key={i} style={{ textAlign: "center" }}><NivelChip nivel={n.nivel} incierto={n.incierto} /></td>)}
                {Array.from({ length: Math.max(0, dias.length - x.niveles.length) }).map((_, i) => <td key={`v${i}`} />)}
                <td className="n">{x.tmax == null ? "" : `${x.tmax.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} °C`}</td>
                <td className="n">{fmt(x.mayores)}</td><td className="n">{fmt(x.dep)}</td><td className="chico">{x.senal ?? "sin dato"}</td>
              </tr>
            ))}
            {vista.length === 0 && <tr><td colSpan={7 + dias.length} className="chico">Ninguna fila cumple el filtro.</td></tr>}
          </tbody>
        </table>
      </div>
      {vista.length > limite && <p style={{ marginTop: 8 }}><button className="boton sec" onClick={() => setLimite(limite + 100)}>Ver más ({vista.length - limite} restantes)</button></p>}
    </>
  );
}
