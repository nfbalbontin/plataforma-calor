import { describe, expect, it } from "vitest";
import { calorAcumulado, confianza, corteCodigoRojo, diasCalorModerado, esIncierto, mediana, nivelEstimado, percentil, senalUrgencias, type Umbral } from "../src/lib/niveles";

const u: Umbral = { p50: 20, p90: 24, p95: 25, p99: 27, tmax_p90: 31, tmin_p90: 17 };

describe("nivel estimado por percentil local (RF-06)", () => {
  it("asigna 0 a 3 según los cortes p90, p95 y p99", () => {
    expect(nivelEstimado(23.9, u)).toBe(0);
    expect(nivelEstimado(24, u)).toBe(1);
    expect(nivelEstimado(24.99, u)).toBe(1);
    expect(nivelEstimado(25, u)).toBe(2);
    expect(nivelEstimado(27, u)).toBe(3);
    expect(nivelEstimado(35, u)).toBe(3);
  });
  it("no inventa nivel sin temperatura o sin umbral", () => {
    expect(nivelEstimado(null, u)).toBeNull();
    expect(nivelEstimado(30, null)).toBeNull();
  });
});

describe("niveles esperados con confianza (RF-08)", () => {
  it("confianza alta en hoy y días 1 y 2, media en 3 y 4, baja desde el 5", () => {
    expect([0, 1, 2, 3, 4, 5].map(confianza)).toEqual(["alta", "alta", "alta", "media", "media", "baja"]);
  });
  it("marca incierto a menos de 1 °C de un corte", () => {
    expect(esIncierto(23.2, u)).toBe(true);   // a 0,8 del p90
    expect(esIncierto(22.9, u)).toBe(false);
    expect(esIncierto(26.1, u)).toBe(true);   // a 0,9 del p99
    expect(esIncierto(29, u)).toBe(false);
    expect(esIncierto(null, u)).toBe(false);
  });
});

describe("calor acumulado y calor moderado sostenido (RF-07)", () => {
  // Serie conocida: 5 días. Solo cuentan los últimos 3.
  const serie = [
    { tmax: 40, tmin: 25 },   // fuera de la ventana
    { tmax: 30, tmin: 16 },   // fuera de la ventana
    { tmax: 33, tmin: 18.5 }, // +2 de día, +1,5 de noche
    { tmax: 30, tmin: 17 },   // 0 y 0
    { tmax: 34.5, tmin: 19 }, // +3,5 de día, +2 de noche
  ];
  it("suma los grados sobre el percentil 90 en los últimos 3 días, de día y de noche", () => {
    expect(calorAcumulado(serie, u)).toEqual({ dia: 5.5, noche: 3.5 });
  });
  it("da cero cuando ningún día supera el umbral e ignora los nulos", () => {
    expect(calorAcumulado([{ tmax: 20, tmin: 10 }, { tmax: null, tmin: null }, { tmax: 31, tmin: 17 }], u)).toEqual({ dia: 0, noche: 0 });
  });
  it("sin umbral no calcula", () => {
    expect(calorAcumulado(serie, null)).toBeNull();
    expect(diasCalorModerado([25, 25], null)).toBeNull();
  });
  it("cuenta los días seguidos sobre la mediana hasta el último día", () => {
    expect(diasCalorModerado([21, 19, 22, 23, 20.5], u)).toBe(3);
    expect(diasCalorModerado([22, 23, 20], u)).toBe(0);      // el último día no supera la mediana
    expect(diasCalorModerado([22, null, 23, 24], u)).toBe(2); // un día sin dato corta la cuenta
  });
});

describe("Código Rojo de la RM (S3)", () => {
  it("cuenta cuántos cortes de la máxima se alcanzan", () => {
    expect(corteCodigoRojo(32.9, [33, 34, 35])).toBe(0);
    expect(corteCodigoRojo(33, [33, 34, 35])).toBe(1);
    expect(corteCodigoRojo(34.2, [33, 34, 35])).toBe(2);
    expect(corteCodigoRojo(36, [33, 34, 35])).toBe(3);
    expect(corteCodigoRojo(null, [33, 34, 35])).toBe(0);
  });
});

describe("señal de urgencias (RF-29)", () => {
  it("sin informe es «sin dato», no cero", () => {
    expect(senalUrgencias(null, 50).estado).toBe("sin dato");
    expect(senalUrgencias(40, null).estado).toBe("sin dato");
  });
  it("compara con lo habitual", () => {
    expect(senalUrgencias(100, 100)).toEqual({ estado: "habitual", razon: 1 });
    expect(senalUrgencias(118, 100).estado).toBe("sobre lo habitual");
    expect(senalUrgencias(140, 100).estado).toBe("muy sobre lo habitual");
    expect(senalUrgencias(70, 100).estado).toBe("bajo lo habitual");
    expect(senalUrgencias(0, 100)).toEqual({ estado: "bajo lo habitual", razon: 0 });
  });
});

describe("estadística básica", () => {
  it("mediana ignora nulos", () => {
    expect(mediana([3, null, 1, 2])).toBe(2);
    expect(mediana([4, 1, 3, 2])).toBe(2.5);
    expect(mediana([null, undefined])).toBeNull();
  });
  it("percentil con interpolación lineal", () => {
    expect(percentil([1, 2, 3, 4, 5], 50)).toBe(3);
    expect(percentil([1, 2, 3, 4, 5], 90)).toBeCloseTo(4.6);
    expect(percentil([10, 20], 25)).toBe(12.5);
  });
});
