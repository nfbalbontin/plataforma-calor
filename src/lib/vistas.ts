/** Datos livianos para el mapa, armados en el servidor: una fila por comuna con lo que se agrega al seleccionar. */
import { aura, comunas, configAlerta, dependencia, establecimientos, manzanaStats, prioridadDe, provincias, regiones, umbrales } from "./datos";
import { semaforo, ultimaEmision } from "./consultas";
import { q, seguro } from "./db";
import { mesesComuna, senalComuna } from "./impacto";
import type { ComunaLigera, Territorio } from "@/componentes/Explorador";

export async function datosExplorador() {
  const um = umbrales(), au = aura(), dep = dependencia(), mz = manzanaStats(), cfg = configAlerta();
  const provDe: Record<string, string> = {};
  for (const p of provincias()) for (const c of p.comunas) provDe[c] = p.cod;
  const nEst: Record<string, [number, number]> = {};
  for (const e of establecimientos().establecimientos) { const x = (nEst[e.com] ??= [0, 0]); x[0]++; if (/hospital/i.test(e.tipo)) x[1]++; }
  const cs: ComunaLigera[] = comunas().map((c) => {
    const pri = prioridadDe(c), m = mz[c.cod], a = au?.comunas[c.cod], mes = mesesComuna(c.cod, 1)[0], d = dep?.comunas[c.cod];
    return {
      cod: c.cod, nombre: c.nombre, cod_region: c.cod_region, cod_prov: provDe[c.cod] ?? c.cod.slice(0, 3), bbox: c.bbox, isla: c.isla,
      pob: c.pob.total, pob65: c.pob.e65_74 + c.pob.e75_84 + c.pob.e85_mas, mayores_alta: pri.mayores_alta, n_alta: pri.n_alta, n_media: pri.n_media, n_mz: Math.max(c.n_manzanas, 1),
      dep: d?.dep_severa ?? null, oxi: d?.oxigeno ?? null, est: nEst[c.cod]?.[0] ?? 0, hosp: nEst[c.cod]?.[1] ?? 0,
      rz: senalComuna(c.cod)?.m65.senal.razon ?? null, def: mes?.def_total ?? null, esp: mes?.def_esp ?? null,
      mz: m ? [m.may_prom, m.may_de, m.may_max, m.pct_prom, m.pct_de] : null,
      au: a ? [a.temp_dia_prom, a.temp_noche_prom, a.cobertura] : null,
    };
  });
  const rs: Territorio[] = regiones().map((r) => ({ cod: r.cod, nombre: r.nombre }));
  const ps: Territorio[] = provincias().map((p) => ({ cod: p.cod, nombre: p.nombre, cod_region: p.cod_region }));
  const emision = await ultimaEmision();
  const sem = await semaforo();
  const pasadas = emision
    ? (await seguro(() => q<{ fecha: string }>("select distinct fecha from comuna_dia where fecha < $1 order by fecha desc limit 7", [emision]), [])).map((f) => f.fecha).reverse()
    : [];
  return {
    comunas: cs, regiones: rs, provincias: ps, hoy: emision, futuras: sem.fechas, pasadas,
    versionUmbral: um.version, conUmbral: Object.keys(um.comunas).length, aura: !!au,
    auraComunas: au ? Object.keys(au.comunas) : [], auraZonas: au?.zonas_climaticas ?? {},
    fraccion: cfg.territorio.fraccion_poblacion, cobertura: cfg.territorio.cobertura_minima,
  };
}
