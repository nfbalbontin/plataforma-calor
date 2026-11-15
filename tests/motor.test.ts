import { describe, expect, it } from "vitest";
import { excesosConAnomalia, factor, inversion, muertesAnuales, proyectarMes, rankingDonde, robustez, simular, sumaFactor, type Clima, type Insumos, type Parametros } from "../src/lib/motor";

const clima = (extra: Partial<Clima> = {}): Clima => ({ umbral: 30, t_prom: 28, mes_calido: 1, n_anos: 2, temporadas: "", dias_ano: 3, excesos: [1, 2, 0.5, 3, 1, 1], normal_mes: {}, ...extra });
const p = { rr: { bajo: 1.04, alto: 1.08 }, coef_verde: { bajo: -0.01, alto: -0.05 }, robustez: { fraccion_superior: 0.2 } } as unknown as Parametros;
const ins: Insumos = {
  tramos: [], anos_tasa: [], dias_tasa: 1, umbrales: "", nota_clima: "", verde_aura: null,
  regiones: { "13": { pob: [100000, 500000, 60000, 40000], tasa: [1e-6, 5e-6, 3e-5, 1e-4], clima: clima() }, "05": { pob: [50000, 200000, 30000, 20000], tasa: [1e-6, 5e-6, 3e-5, 1e-4], clima: clima({ umbral: 26, t_prom: 22 }) }, "11": { pob: [1, 1, 1, 1], tasa: [0, 0, 0, 0], clima: null } },
  comunas: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`13${100 + i}`, { reg: "13", pob: [100, 500, 60 + i * 10, 40 + i * 10], clima: i % 2 ? clima({ excesos: [1, 1, 1, 1, 1, 1 + i] }) : null, validacion: null }])),
};
const base = { regiones: ["13"], edad: null, dias: 10, grados: 4, verde: 0 };

describe("fórmula del motor", () => {
  it("sin exceso no hay muertes y crece con los grados", () => {
    expect(factor(1.05, 0)).toBe(0);
    expect(factor(1.05, -2)).toBe(0);
    expect(factor(1.05, 1)).toBeCloseTo(0.05);
    expect(factor(1.05, 2)).toBeCloseTo(0.1025);
    expect(sumaFactor(1.05, [1, 2])).toBeCloseTo(0.1525);
  });
  it("muertes anuales = población × tasa × factor promedio por año, como rango", () => {
    const m = muertesAnuales([1000, 0, 0, 0], [0.001, 0, 0, 0], clima({ excesos: [1, 1], n_anos: 2 }), p);
    expect(m.rango[0]).toBeCloseTo(1000 * 0.001 * 0.04);
    expect(m.rango[1]).toBeCloseTo(1000 * 0.001 * 0.08);
  });
});

describe("clasificación de robustez", () => {
  it("robusta si se cumple en ambos escenarios, depende si en uno, no se sostiene si en ninguno", () => {
    expect([robustez(true, true), robustez(true, false), robustez(false, true), robustez(false, false)]).toEqual(["robusta", "depende", "depende", "no"]);
  });
});

describe("Panel 2: simulador (criterios de aceptación)", () => {
  it("0 días o 0 grados dan 0 muertes", () => {
    expect(simular({ ...base, dias: 0 }, ins, p).sin).toEqual([0, 0]);
    expect(simular({ ...base, grados: 0 }, ins, p).sin).toEqual([0, 0]);
  });
  it("si promedio + grados no supera el umbral, el resultado es 0 y lo avisa", () => {
    const r = simular({ ...base, grados: 1.5 }, ins, p); // 28 + 1,5 < 30
    expect(r.sin).toEqual([0, 0]);
    expect(r.avisos.join(" ")).toMatch(/no supera el umbral de la región/);
  });
  it("más días o más grados nunca dan menos muertes", () => {
    let antes = [-1, -1];
    for (const dias of [0, 5, 10, 30, 60]) { const r = simular({ ...base, dias }, ins, p).sin; expect(r[0]).toBeGreaterThanOrEqual(antes[0]); expect(r[1]).toBeGreaterThanOrEqual(antes[1]); antes = r; }
    antes = [-1, -1];
    for (let g = 0; g <= 10; g += 0.5) { const r = simular({ ...base, grados: g }, ins, p).sin; expect(r[0]).toBeGreaterThanOrEqual(antes[0]); expect(r[1]).toBeGreaterThanOrEqual(antes[1]); antes = r; }
  });
  it("menos áreas verdes nunca dan menos muertes; más áreas verdes evitan", () => {
    let antes = [Infinity, Infinity];
    for (let v = -20; v <= 20; v += 5) { const r = simular({ ...base, verde: v }, ins, p).con; expect(r[0]).toBeLessThanOrEqual(antes[0] + 1e-12); expect(r[1]).toBeLessThanOrEqual(antes[1] + 1e-12); antes = r; }
    const mas = simular({ ...base, verde: 10 }, ins, p), menos = simular({ ...base, verde: -10 }, ins, p);
    expect(mas.evitadas[0]).toBeGreaterThan(0);
    expect(mas.clase).toBe("robusta");
    expect(menos.evitadas[1]).toBeLessThan(0);
    expect(menos.clase).toBe("no");
  });
  it("si los porcentajes de edad no suman 100, no calcula y marca el error", () => {
    const r = simular({ ...base, edad: [20, 60, 10, 5] }, ins, p);
    expect(r.error).toMatch(/deben sumar 100/);
    expect(r.regiones).toEqual([]);
    expect(simular({ ...base, edad: [20, 60, 10, 10] }, ins, p).error).toBeNull();
  });
  it("la población total se mantiene al cambiar la distribución por edad", () => {
    const r = simular({ ...base, edad: [0, 0, 0, 100] }, ins, p);
    expect(r.sin[0]).toBeCloseTo(700000 * 1e-4 * 10 * (1.04 ** 2 - 1));
  });
  it("suma regiones y deja fuera las que no tienen clima", () => {
    const a = simular({ ...base, regiones: ["13"] }, ins, p).sin, b = simular({ ...base, regiones: ["05"] }, ins, p).sin, ab = simular({ ...base, regiones: ["13", "05", "11"] }, ins, p);
    expect(ab.sin[0]).toBeCloseTo(a[0] + b[0]);
    expect(ab.avisos.join(" ")).toMatch(/sin serie histórica/);
  });
});

describe("Panel 1: ranking y robustez", () => {
  it("el indicador no usa RR y la robustez sí", () => {
    const a = rankingDonde(ins, p), b = rankingDonde(ins, { ...p, rr: { ...p.rr, bajo: 1.01, alto: 1.2 } } as Parametros);
    expect(a.map((f) => [f.cod, f.indicador])).toEqual(b.map((f) => [f.cod, f.indicador]));
    expect(a[0].indicador).toBeGreaterThanOrEqual(a[1].indicador!);
  });
  it("una comuna sin serie propia usa el clima de su región", () => {
    const f = rankingDonde(ins, p).find((x) => x.cod === "13100")!;
    expect(f.climaPropio).toBe(false);
    expect(f.dias).toBe(3);
  });
});

describe("Panel 3: proyección mensual", () => {
  it("una comuna sin días sobre el umbral da 0 y no falla", () => {
    const vacio = { directos: [], historicos: [] };
    expect(proyectarMes([1000, 0, 0, 0], [0.001, 0, 0, 0], [vacio, vacio, vacio], 10, p)).toEqual({ dias: 0, rango: [0, 0], media: [0, 0] });
    expect(proyectarMes([1000, 0, 0, 0], [0.001, 0, 0, 0], [], 10, p).rango).toEqual([0, 0]);
  });
  it("el rango combina RR bajo y alto con la dispersión del ensamble", () => {
    const m = (n: number) => ({ directos: Array(n).fill(1), historicos: [] });
    const r = proyectarMes([1000, 0, 0, 0], [0.001, 0, 0, 0], [m(0), m(1), m(2), m(3)], 10, p);
    expect(r.dias).toBeCloseTo(1.5);
    expect(r.rango[0]).toBeLessThan(r.media[0]);
    expect(r.rango[1]).toBeGreaterThan(r.media[1]);
  });
});

describe("Panel 3: días históricos con la anomalía pronosticada", () => {
  const hist: [number, number][] = [[1, 29], [2, 30.5], [15, 31], [16, 28], [30, 32]];
  it("cuenta solo los días desde el indicado que superan el umbral con la anomalía", () => {
    expect(excesosConAnomalia(hist, 1, 0, 30)).toEqual([0.5, 1, 2]);
    expect(excesosConAnomalia(hist, 16, 0, 30)).toEqual([2]);
    expect(excesosConAnomalia(hist, 1, 1.5, 30)).toEqual([0.5, 2, 2.5, 3.5]);
    expect(excesosConAnomalia(hist, 1, -5, 30)).toEqual([]);
  });
  it("los días históricos se promedian por año", () => {
    const r = proyectarMes([1000, 0, 0, 0], [0.001, 0, 0, 0], [{ directos: [], historicos: [1, 1, 1, 1] }], 2, p);
    expect(r.dias).toBe(2);
    expect(r.media[0]).toBeCloseTo(1000 * 0.001 * 2 * 0.04);
  });
});

describe("Panel 4: inversión", () => {
  it("compara las muertes necesarias con lo evitado en cada escenario", () => {
    expect(inversion(2_000_000_000, 1_000_000_000, [3, 5]).clase).toBe("robusta");
    expect(inversion(4_000_000_000, 1_000_000_000, [3, 5]).clase).toBe("depende");
    expect(inversion(6_000_000_000, 1_000_000_000, [3, 5])).toMatchObject({ necesarias: 6, clase: "no" });
  });
});

describe("criterios generales", () => {
  it("con RR bajo = RR alto y coeficiente bajo = alto, nada queda en «depende del supuesto»", () => {
    const igual = { ...p, rr: { bajo: 1.05, alto: 1.05 }, coef_verde: { bajo: -0.02, alto: -0.02 } } as unknown as Parametros;
    expect(rankingDonde(ins, igual).every((f) => f.clase !== "depende")).toBe(true);
    for (const verde of [-10, 0, 10]) expect(simular({ ...base, verde }, ins, igual).clase).not.toBe("depende");
    const s = simular({ ...base, verde: 10 }, ins, igual);
    for (const costo of [1e6, 1e9, 1e12]) expect(inversion(costo, 2e9, s.evitadas).clase).not.toBe("depende");
  });
});
