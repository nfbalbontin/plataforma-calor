import { MapaRiesgo } from "@/componentes/MapaRiesgo";
import { auraComunas, comunas, configRiesgo, curvaDe, moduloAura, provincias, regiones, tendenciaEstacional, territorio } from "@/lib/datos";
import { riesgoActual } from "@/lib/pronostico";
import { tendencia } from "@/lib/riesgo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Riesgo futuro · Calor y mortalidad en Chile" };

/** Encuadre de la región: los centros poblados de sus comunas con un margen. La caja de los polígonos incluye islas oceánicas lejanas. */
function cajaContinental(reg: string): [number, number, number, number] | null {
  const ps = comunas().filter((c) => c.cod_region === reg && c.punto_clima && !c.isla).map((c) => c.punto_clima!);
  const m = 0.4;
  return ps.length ? [Math.min(...ps.map((p) => p[0])) - m, Math.min(...ps.map((p) => p[1])) - m, Math.max(...ps.map((p) => p[0])) + m, Math.max(...ps.map((p) => p[1])) + m] : null;
}

/** Módulo 2: mapa de riesgo según el pronóstico guardado, de la región a la manzana. */
export default async function Pagina() {
  const riesgo = await riesgoActual();
  const cfg = configRiesgo();
  if (!riesgo) return (
    <div className="pagina"><h1>Riesgo según el pronóstico</h1>
      <p className="aviso" style={{ marginTop: 14 }}>Todavía no hay un pronóstico guardado. La tarea diaria (<code>/api/tareas/diaria</code>) consulta la temperatura de las 346 comunas y la guarda; el mapa aparece después de la primera corrida.</p></div>
  );
  const terr = territorio(), te = tendenciaEstacional();
  const lig = comunas().map((c) => {
    const t = terr.comunas[c.cod], h = t ? terr.hospitales[t.hospital] : null;
    return { cod: c.cod, nombre: c.nombre, reg: c.cod_region, bbox: c.bbox, punto: c.punto_clima, pob: c.pob.total, p65: c.pob.e65_74 + c.pob.e75_84 + c.pob.e85_mas, p85: c.pob.e85_mas,
      ninos: c.ninos_0_5, disc: c.discapacidad, hacinadas: c.viviendas_hacinadas, viviendas: c.viviendas,
      vulnProm: c.n_manzanas ? (c.mayores60 + c.ninos_0_5 + c.discapacidad) / c.n_manzanas : 0,
      hospital: h ? { cod: h.cod, nombre: h.nombre, km: t!.dist_km } : null };
  });
  const tend = Object.fromEntries(Object.entries(te?.regiones ?? {}).map(([r, v]) => [r, Object.entries(v.meses).map(([mes, m]) => ({ mes, anomalia: m.anomalia, cat: tendencia(m.anomalia, cfg.tendencia_grados) }))]));
  const aura = moduloAura() ? { comunas: auraComunas(), curva: curvaDe("13", "M_T") } : null;
  return <MapaRiesgo riesgo={riesgo} comunas={lig} regiones={regiones().map((r) => ({ cod: r.cod, nombre: r.nombre, bbox: cajaContinental(r.cod) ?? r.bbox }))} provincias={provincias().map((x) => ({ cod: x.cod, nombre: x.nombre, reg: x.cod_region, comunas: x.comunas }))} tendencia={tend} tendenciaCorrida={te?.corrida ?? null} cfg={cfg} aura={aura} />;
}
