/** Estado de cada fuente y alerta de actualización vencida (RF-36). */
import { cargaVigente, estadosGuardados } from "./consultas";
import { configFuentes, dependencia, fechaArchivo, impactlabSemilla, modulo, proyeccionMensual, urgencias, vigilancia, type Fuente } from "./datos";
import { esPeriodoCalido, hoyChile } from "./tiempo";

export type EstadoFuente = Fuente & {
  ultima_carga: string | null; ultimo_dato: string | null; detalle: string | null;
  estado: "al día" | "vencida" | "sin carga" | "no aplica" | "módulo desactivado";
  dias_desde: number | null;
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export async function estadoFuentes(ahora = new Date()): Promise<EstadoFuente[]> {
  const guardados = await estadosGuardados();
  const il = await cargaVigente("impactlab");
  const semilla = impactlabSemilla();
  const hoy = hoyChile(ahora);
  return configFuentes().fuentes.map((f) => {
    let ultima: string | null = null, dato: string | null = null, detalle: string | null = null;
    switch (f.id) {
      case "deis-defunciones": ultima = iso(fechaArchivo("datos/vigilancia.json")); dato = vigilancia()?.ultima_defuncion ?? null; break;
      case "deis-urgencias": ultima = iso(fechaArchivo("datos/urgencias.json")); dato = urgencias()?.ultima_fecha ?? null; break;
      case "deis-establecimientos": ultima = iso(fechaArchivo("datos/establecimientos.json")); break;
      case "deis-rem": ultima = iso(fechaArchivo("datos/dependencia.json")); dato = dependencia()?.corte ?? null; break;
      case "censo-2024": ultima = iso(fechaArchivo("datos/comunas.json")); dato = "Censo 2024"; break;
      case "impactlab":
        if (il) { ultima = il.fecha; dato = il.archivo; }
        else if (semilla) { ultima = semilla.transcrito + "T12:00:00Z"; dato = `versión ${semilla.version}`; detalle = "Transcripción inicial de los totales por región."; }
        break;
      case "aura": ultima = iso(fechaArchivo("datos/aura.json")); break;
      case "open-meteo-estacional": { const pr = proyeccionMensual(); if (pr) { ultima = pr.corrida; dato = `hasta ${pr.hasta}`; detalle = `${Object.keys(pr.regiones).length} regiones`; } break; }
      default: {
        const g = guardados[f.id];
        if (g) { ultima = g.ultima_carga; dato = g.ultimo_dato; detalle = g.detalle; }
      }
    }
    let estado: EstadoFuente["estado"];
    const dias = ultima ? (ahora.getTime() - Date.parse(ultima)) / 86400000 : null;
    if (f.modulo && !modulo(f.modulo)) estado = "módulo desactivado";
    else if (f.tolerancia_dias == null) estado = ultima ? "al día" : "no aplica";
    else if (f.solo_temporada && !esPeriodoCalido(hoy)) estado = "no aplica";
    else if (dias == null) estado = "sin carga";
    else estado = dias > f.tolerancia_dias ? "vencida" : "al día";
    if (guardados[f.id]?.resultado === "falla") { estado = estado === "al día" ? "vencida" : estado; detalle = guardados[f.id].detalle; }
    return { ...f, ultima_carga: ultima, ultimo_dato: dato, detalle, estado, dias_desde: dias == null ? null : Math.round(dias * 10) / 10 };
  });
}

/** Fuentes con problema entre las que alimentan un bloque de cifras. */
export function conProblema(estados: EstadoFuente[], ids: string[]): EstadoFuente[] {
  return estados.filter((e) => ids.includes(e.id) && (e.estado === "vencida" || e.estado === "sin carga"));
}
