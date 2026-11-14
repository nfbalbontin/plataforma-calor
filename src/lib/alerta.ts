/**
 * Regla de alerta propia (no oficial). Parámetros en config/alerta.json; respaldo en datos/evidencia_alerta.json.
 * Estados: 0 sin alerta, 1 aviso, 2 alerta, 3 alerta máxima.
 */
export type Estado = 0 | 1 | 2 | 3;
export const NOMBRE_ESTADO = ["Sin alerta", "Aviso", "Alerta", "Alerta máxima"] as const;

/**
 * Estado de una comuna. `racha` = días seguidos con nivel 1 o más contando hoy; `proximos` = niveles de mañana en adelante.
 */
export function estadoComuna(nivelHoy: number | null | undefined, racha: number, proximos: (number | null | undefined)[] = [], diasSeguidos = 3, anticipacion = 2): Estado | null {
  if (nivelHoy == null) return null;
  if (nivelHoy >= 3) return 3;
  if (nivelHoy >= 2 || (nivelHoy >= 1 && racha >= diasSeguidos)) return 2;
  if (nivelHoy >= 1) return 1;
  if (proximos.slice(0, anticipacion).some((n) => (n ?? 0) >= 2)) return 1;
  return 0;
}

/** Días seguidos con nivel 1 o más hasta el último de la lista (del más antiguo al más reciente). Un nulo corta. */
export function rachaCalor(niveles: (number | null | undefined)[]): number {
  let n = 0;
  for (let i = niveles.length - 1; i >= 0 && (niveles[i] ?? 0) >= 1; i--) n++;
  return n;
}

/**
 * Valor agregado de un territorio (sirve para el nivel y para el estado): el más alto que alcanzan miembros
 * con al menos `fraccion` de la población de 65+. Sin cobertura suficiente de umbrales devuelve null.
 */
export function agregar(miembros: { valor: number | null | undefined; peso: number }[], fraccion = 0.25, cobertura = 0.5): number | null {
  const total = miembros.reduce((a, m) => a + m.peso, 0);
  const con = miembros.filter((m) => m.valor != null);
  const pesoCon = con.reduce((a, m) => a + m.peso, 0);
  if (total <= 0 || pesoCon < cobertura * total) return null;
  for (let v = 3; v >= 1; v--) {
    if (con.filter((m) => m.valor! >= v).reduce((a, m) => a + m.peso, 0) >= fraccion * pesoCon) return v;
  }
  return 0;
}

/** Promedio, desviación estándar muestral, mínimo y máximo; ignora nulos. */
export function resumen(xs: (number | null | undefined)[]): { n: number; prom: number; de: number | null; min: number; max: number } | null {
  const v = xs.filter((x): x is number => x != null && !Number.isNaN(x));
  if (v.length === 0) return null;
  const prom = v.reduce((a, b) => a + b, 0) / v.length;
  const de = v.length > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - prom) ** 2, 0) / (v.length - 1)) : null;
  return { n: v.length, prom, de, min: Math.min(...v), max: Math.max(...v) };
}
