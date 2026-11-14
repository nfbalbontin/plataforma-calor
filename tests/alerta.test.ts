import { describe, expect, it } from "vitest";
import { agregar, estadoComuna, rachaCalor, resumen } from "../src/lib/alerta";
import { confianza } from "../src/lib/niveles";

describe("regla de alerta por comuna", () => {
  it("nivel 3 es alerta máxima; nivel 2 es alerta", () => {
    expect(estadoComuna(3, 1)).toBe(3);
    expect(estadoComuna(2, 1)).toBe(2);
  });
  it("nivel 1 es aviso y pasa a alerta al tercer día seguido", () => {
    expect(estadoComuna(1, 1)).toBe(1);
    expect(estadoComuna(1, 2)).toBe(1);
    expect(estadoComuna(1, 3)).toBe(2);
  });
  it("nivel 0 da aviso solo si se pronostica nivel 2 o más en los dos días siguientes", () => {
    expect(estadoComuna(0, 0, [0, 2, 3])).toBe(1);
    expect(estadoComuna(0, 0, [1, 1, 3])).toBe(0);
    expect(estadoComuna(0, 0, [])).toBe(0);
  });
  it("sin umbral no hay estado", () => {
    expect(estadoComuna(null, 0)).toBeNull();
  });
  it("cuenta los días seguidos de calor hasta hoy", () => {
    expect(rachaCalor([0, 1, 2, 1])).toBe(3);
    expect(rachaCalor([1, 1, 0])).toBe(0);
    expect(rachaCalor([1, null, 1])).toBe(1);
  });
});

describe("agregación por provincia, región o país", () => {
  const m = (valor: number | null, peso: number) => ({ valor, peso });
  it("toma el valor más alto que alcanza al menos el 25 % de la población de 65+", () => {
    expect(agregar([m(3, 10), m(2, 20), m(0, 70)])).toBe(2);   // nivel 3 solo 10 %; nivel 2 o más 30 %
    expect(agregar([m(3, 30), m(0, 70)])).toBe(3);
    expect(agregar([m(1, 20), m(0, 80)])).toBe(0);
  });
  it("queda sin valor si los umbrales cubren menos de la mitad de la población", () => {
    expect(agregar([m(3, 40), m(null, 60)])).toBeNull();
    expect(agregar([m(3, 60), m(null, 40)])).toBe(3);
  });
});

describe("estadísticas al seleccionar", () => {
  it("promedio, desviación estándar, mínimo y máximo", () => {
    expect(resumen([2, 4, 4, 4, 5, 5, 7, 9, null])).toEqual({ n: 8, prom: 5, de: Math.sqrt(32 / 7), min: 2, max: 9 });
    expect(resumen([null, undefined])).toBeNull();
    expect(resumen([3])?.de).toBeNull();
  });
});

describe("confianza del pronóstico extendido", () => {
  it("baja con los días: alta, media, baja y muy baja desde el día 8", () => {
    expect([0, 2, 3, 4, 5, 7, 8, 15].map(confianza)).toEqual(["alta", "alta", "media", "media", "baja", "baja", "muy baja", "muy baja"]);
  });
});
