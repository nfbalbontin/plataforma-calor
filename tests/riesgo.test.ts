import { describe, expect, it } from "vitest";
import { aEscalaRegion, interp, mesCalido, nivelDe, promedioRezagos, riesgoDia, tendencia, textoRango, type Curva } from "../src/lib/riesgo";
import { claveCurva, claveSerie, grupos, resumen, tendenciaDecada, type Lugar } from "../src/lib/historia";

const curva: Curva = { x: [20, 25, 30, 35], rr: [1, 1, 1.1, 1.3], lo: [1, 1, 1.05, 1.1], hi: [1, 1, 1.15, 1.5], umbral: 25 };

describe("riesgo", () => {
  it("interpola dentro de la grilla y sujeta fuera de ella", () => {
    expect(interp([0, 10], [0, 100], 2.5)).toBe(25);
    expect(interp([0, 10], [0, 100], -3)).toBe(0);
    expect(interp([0, 10], [0, 100], 30)).toBe(100);
  });
  it("promedia el día y los 3 anteriores que existan", () => {
    expect(promedioRezagos([20, 22, 24, 26, 28], 4)).toBe(25);
    expect(promedioRezagos([20, null, 24], 2)).toBe(22);
    expect(promedioRezagos([20, null], 1)).toBeNull();
  });
  it("bajo el umbral el riesgo relativo es 1", () => {
    expect(riesgoDia(24, curva)).toEqual({ rr: 1, lo: 1, hi: 1 });
    expect(riesgoDia(null, curva)).toEqual({ rr: 1, lo: 1, hi: 1 });
    expect(riesgoDia(32.5, curva).rr).toBeCloseTo(1.2);
  });
  it("clasifica el nivel por el aumento esperado", () => {
    const c = [0.02, 0.05, 0.1];
    expect([0, 0.019, 0.02, 0.05, 0.0999, 0.1, 0.5].map((e) => nivelDe(e, c))).toEqual([0, 0, 1, 2, 2, 3, 3]);
  });
  it("lleva la temperatura de una comuna a la escala de la capital por percentil", () => {
    const qc = Array.from({ length: 101 }, (_, i) => 10 + i * 0.1), qr = Array.from({ length: 101 }, (_, i) => 20 + i * 0.2);
    expect(aEscalaRegion(15, qc, qr)).toBeCloseTo(30);
    expect(aEscalaRegion(22, qc, qr)).toBeCloseTo(42);      // 2 grados sobre el máximo histórico
  });
  it("nunca entrega una cifra sola", () => {
    expect(textoRango([5, 3.2, 9.4])).toBe("entre 3,2 y 9,4 muertes adicionales");
    expect(textoRango([0.1, -0.2, 0.3])).toBe("menos de 1 muerte adicional");
    expect(textoRango([50, -4, 120])).toBe("entre 0 y 120 muertes adicionales");
  });
  it("mes cálido y tendencia", () => {
    expect(["2026-11-15", "2026-12-01", "2027-01-10", "2027-03-31"].map(mesCalido)).toEqual([0, 1, 2, 4]);
    expect([0.6, 0.2, -0.7].map((a) => tendencia(a, 0.5))).toEqual(["Más cálido", "Normal", "Menos cálido"]);
  });
});

describe("historia", () => {
  const l = { temporadas: [2001, 2002, 2003], pob65: [null, 1000, 1000], series: { M_T_A: [[100, 100, 100], [2, 4, 6], [1, 2, 3], [3, 6, 9]], M_2_H: [[5, 5, 5], [0, 0, 0], [0, 0, 0], [0, 0, 0]] } } as unknown as Lugar;
  it("arma las claves de serie y de curva", () => {
    expect(claveSerie("M", "2", "H")).toBe("M_2_H");
    expect(claveSerie("H", "65", "M")).toBe("H_65_A");
    expect(claveCurva("M", "T")).toBe("M_T");
    expect(claveCurva("N2", "1")).toBe("N2");
    expect(claveCurva("U", "65")).toBe("U_65");
  });
  it("suma el período y calcula la tasa solo con años con población", () => {
    const r = resumen(l, "M_T_A", 0, 2)!;
    expect([r.obs, r.an, r.lo, r.hi, r.suficiente]).toEqual([300, 12, 6, 18, true]);
    expect(r.tasa).toBeCloseTo(500);            // (4 + 6) muertes / 2.000 personas-año
    expect(resumen(l, "M_2_H", 0, 2)!.suficiente).toBe(false);
  });
  it("agrupa o declara datos insuficientes cuando hay pocos casos", () => {
    expect(grupos(l, "M_T_A", 0, 2)!.length).toBe(3);
    expect(grupos(l, "M_2_H", 0, 2)).toBeNull();
  });
  it("tendencia por década necesita 8 años", () => {
    expect(tendenciaDecada([1, 2, 3], [1, 2, 3])).toBeNull();
    expect(tendenciaDecada([1, 2, 3, 4, 5, 6, 7, 8], [1, 2, 3, 4, 5, 6, 7, 8])).toBeCloseTo(10);
  });
});
