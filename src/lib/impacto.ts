/** Impacto observado por comuna a partir de los archivos del DEIS depurados. */
import { comunaMes, urgencias } from "./datos";
import { senalUrgencias, type Senal } from "./niveles";

export type Indicador = { valor: number | null; habitual: number | null; senal: Senal };
export type SenalComuna = {
  fecha: string; parcial: boolean; n_est: number | null; n_est_hab: number | null;
  total: Indicador; m65: Indicador; circ: Indicador; resp: Indicador; serie65: (number | null)[]; ultimaConDato: string | null;
};

const ind = (v: unknown, h: unknown): Indicador => {
  const valor = v == null ? null : Number(v), habitual = h == null ? null : Number(h);
  return { valor, habitual, senal: senalUrgencias(valor, habitual) };
};

/** Señal del último día informado de forma completa; si el más reciente está incompleto, se marca como parcial. */
export function senalComuna(cod: string): SenalComuna | null {
  const filas = urgencias()?.comunas[cod];
  if (!filas || filas.length === 0) return null;
  const completo = (f: (string | number | null)[]) => f[1] != null && Number(f[1]) > 0 && (f[2] == null || Number(f[1]) >= Number(f[2]));
  let i = filas.length - 1;
  while (i >= 0 && !completo(filas[i])) i--;
  const parcial = i < 0;
  if (i < 0) { i = filas.length - 1; while (i > 0 && (filas[i][1] == null || Number(filas[i][1]) === 0)) i--; }
  const f = filas[i];
  const sinInforme = f[1] == null || Number(f[1]) === 0;
  return {
    fecha: String(f[0]), parcial, n_est: f[1] as number | null, n_est_hab: f[2] as number | null,
    total: sinInforme ? ind(null, null) : ind(f[3], f[4]), m65: sinInforme ? ind(null, null) : ind(f[5], f[6]),
    circ: sinInforme ? ind(null, null) : ind(f[7], f[8]), resp: sinInforme ? ind(null, null) : ind(f[9], f[10]),
    serie65: filas.slice(-28, i + 1).map((x) => (x[5] != null && x[6] != null && Number(x[6]) > 0 && completo(x) ? Number(x[5]) / Number(x[6]) : null)),
    ultimaConDato: sinInforme ? null : String(f[0]),
  };
}

export type MesComuna = { a: number; m: number; def_total: number | null; def_65_mas: number | null; def_esp: number | null; urg_total: number | null; urg_65_mas: number | null };
export function mesesComuna(cod: string, n = 13): MesComuna[] {
  const filas = comunaMes()?.comunas[cod] ?? [];
  return filas.filter((f) => f[7] === true).slice(-n).map((f) => ({
    a: f[0] as number, m: f[1] as number, def_total: f[2] as number | null, def_65_mas: f[3] as number | null,
    def_esp: f[4] as number | null, urg_total: f[5] as number | null, urg_65_mas: f[6] as number | null,
  }));
}
