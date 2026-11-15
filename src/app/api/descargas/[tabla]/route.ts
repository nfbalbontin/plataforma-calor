import { NextResponse } from "next/server";
import { aCsv, respuestaCsv } from "@/lib/csv";
import { comunaMes, comunas, dependencia, episodios, prioridadDe, umbrales, vigilancia } from "@/lib/datos";
import { filasDonde, rankingPeligro } from "@/lib/analisis";
import { senalComuna } from "@/lib/impacto";

export const dynamic = "force-dynamic";

/** Descargas abiertas de tablas agregadas (RF-35). Respetan la regla de publicación (RNF-07). */
export async function GET(_: Request, { params }: { params: Promise<{ tabla: string }> }) {
  const { tabla } = await params;
  const nombre = Object.fromEntries(comunas().map((c) => [c.cod, c.nombre]));
  if (tabla === "vigilancia") {
    const v = vigilancia(); if (!v) return NextResponse.json({ error: "sin datos" }, { status: 404 });
    const filas = Object.entries(v.regiones).flatMap(([reg, ss]) => ss.filter((s) => s.dias >= 7).flatMap((s) => v.tramos.map((t) => {
      const e = s[`${t}_esp` as "total_esp"]; return [reg, s.a, s.s, s.inicio, t, s[t as "total"], e?.[1], e?.[0], e?.[2], s.provisional];
    })));
    return respuestaCsv("vigilancia_mortalidad_region_semana.csv", aCsv(["cod_region", "anio_iso", "semana_iso", "inicio_semana", "tramo_edad", "defunciones_observadas", "esperadas_mediana", "esperadas_minimo", "esperadas_maximo", "provisional"], filas));
  }
  if (tabla === "comuna-mes") {
    const m = comunaMes(); if (!m) return NextResponse.json({ error: "sin datos" }, { status: 404 });
    const filas = Object.entries(m.comunas).flatMap(([cod, fs]) => fs.filter((f) => f[7] === true).map((f) => [cod, nombre[cod], ...f.slice(0, 7)] as (string | number | null)[]));
    return respuestaCsv("defunciones_urgencias_comuna_mes.csv", aCsv(["cod_comuna", "comuna", "anio", "mes", "defunciones", "defunciones_65_mas", "defunciones_esperadas_mediana", "urgencias", "urgencias_65_mas"], filas));
  }
  if (tabla === "urgencias") {
    const filas = comunas().map((c) => ({ c, s: senalComuna(c.cod) })).filter((x) => x.s).map(({ c, s }) => [c.cod, c.nombre, s!.fecha, s!.parcial, s!.total.valor, s!.total.habitual, s!.m65.valor, s!.m65.habitual, s!.m65.senal.estado, s!.circ.valor, s!.circ.habitual, s!.resp.valor, s!.resp.habitual]);
    return respuestaCsv("senal_urgencias_comuna.csv", aCsv(["cod_comuna_establecimiento", "comuna", "fecha", "informe_parcial", "total", "total_habitual", "de_65_mas", "de_65_mas_habitual", "senal_65_mas", "circulatorias", "circulatorias_habitual", "respiratorias", "respiratorias_habitual"], filas));
  }
  if (tabla === "dependencia") {
    const d = dependencia(); if (!d) return NextResponse.json({ error: "sin datos" }, { status: 404 });
    const filas = Object.entries(d.comunas).flatMap(([cod, g]) => g.centros.map((x) => [d.corte, cod, nombre[cod], x.id, x.nombre, x.dep_severa, x.oxigeno, x.ventilacion, x.pm_autovalente_sin_riesgo, x.pm_autovalente_con_riesgo, x.pm_riesgo_dependencia, x.pm_dep_leve, x.pm_dep_moderada, x.pm_dep_grave, x.pm_dep_total]));
    return respuestaCsv("dependencia_por_centro.csv", aCsv(["corte", "cod_comuna", "comuna", "cod_establecimiento", "establecimiento", "dependencia_severa_domicilio", "oxigeno_dependientes", "asistencia_ventilatoria", "pm_autovalente_sin_riesgo", "pm_autovalente_con_riesgo", "pm_riesgo_dependencia", "pm_dependiente_leve", "pm_dependiente_moderado", "pm_dependiente_grave", "pm_dependiente_total"], filas));
  }
  if (tabla === "episodios") {
    const e = episodios(); if (!e) return NextResponse.json({ error: "sin datos" }, { status: 404 });
    return respuestaCsv("episodios_calor.csv", aCsv(["id", "cod_region", "inicio", "termino", "dias", "tmean_max_c", "tmax_max_c", "defunciones_observadas", "esperadas_minimo", "esperadas_mediana", "esperadas_maximo", "nota"],
      e.episodios.map((x) => [x.id, x.cod_region, x.inicio, x.termino, x.dias, x.tmean_max, x.tmax_max, x.def_obs, x.def_esp?.[0], x.def_esp?.[1], x.def_esp?.[2], x.nota])));
  }
  if (tabla === "umbrales") {
    const u = umbrales();
    return respuestaCsv(`umbrales_${u.version}.csv`, aCsv(["version", "cod_comuna", "comuna", "p50_tmean_c", "p90_tmean_c", "p95_tmean_c", "p99_tmean_c", "p90_tmax_c", "p90_tmin_c", "dias_usados", "temporadas"],
      Object.entries(u.comunas).map(([cod, x]) => [u.version, cod, nombre[cod], x.p50, x.p90, x.p95, x.p99, x.tmax_p90, x.tmin_p90, x.n_dias, x.temporadas])));
  }
  if (tabla === "comunas") {
    return respuestaCsv("comunas_censo2024.csv", aCsv(["cod_comuna", "comuna", "cod_region", "region", "poblacion", "pob_0_64", "pob_65_74", "pob_75_84", "pob_85_mas", "mayores_60_en_manzanas", "manzanas", "manzanas_prioridad_alta", "mayores_60_en_prioridad_alta", "hogares_solo_mayores", "lon_punto_clima", "lat_punto_clima"],
      comunas().map((c) => [c.cod, c.nombre, c.cod_region, c.region, c.pob.total, c.pob.e0_64, c.pob.e65_74, c.pob.e75_84, c.pob.e85_mas, c.mayores60, c.n_manzanas, prioridadDe(c).n_alta, prioridadDe(c).mayores_alta, c.hogares_solo_mayores, c.punto_clima?.[0], c.punto_clima?.[1]])));
  }
  if (tabla === "analisis-donde") {
    return respuestaCsv("donde_actuar_comunas.csv", aCsv(["posicion", "cod_comuna", "comuna", "region", "poblacion_65_mas", "dias_al_ano_sobre_umbral", "indicador", "muertes_ano_bajo", "muertes_ano_alto", "robustez", "clima", "olas_calor_defunciones_observadas", "olas_calor_defunciones_habituales", "olas_calor_dias"],
      filasDonde().map((f) => [f.pos, f.cod, f.nombre, f.region, f.pob65, f.dias, f.indicador == null ? null : Math.round(f.indicador), f.muertes?.[0].toFixed(2), f.muertes?.[1].toFixed(2), f.clase, f.climaPropio ? "serie propia" : f.dias == null ? "sin serie" : "capital regional", f.validacion?.[0], f.validacion?.[1], f.validacion?.[2]])));
  }
  if (tabla === "analisis-proyeccion") {
    return respuestaCsv("proyeccion_mensual_comunas.csv", aCsv(["cod_comuna", "comuna", "region", "mes_mayor_riesgo", "dias_sobre_umbral_ese_mes", "cambio_dias_frente_a_mes_normal", "muertes_esperadas_bajo", "muertes_esperadas_alto", "tasa_100mil_bajo", "tasa_100mil_alto", "poblacion_75_mas", "robustez"],
      rankingPeligro().map((f) => [f.cod, f.nombre, f.region, f.mes, f.dias.toFixed(1), f.cambio?.toFixed(1), f.muertes[0].toFixed(2), f.muertes[1].toFixed(2), f.tasa100k[0].toFixed(2), f.tasa100k[1].toFixed(2), f.pob75, f.clase])));
  }
  return NextResponse.json({ error: "tabla desconocida" }, { status: 404 });
}
