import { describe, expect, it } from "vitest";
import { diferencias, validarImpactLab } from "../src/lib/cargas";
import { vigentes, type Alerta } from "../src/lib/consultas";
import { semanaIso } from "../src/lib/tiempo";

const REGS = Array.from({ length: 16 }, (_, i) => String(i + 1).padStart(2, "0"));
const csv = (filas: string[]) => new TextEncoder().encode(["version,cod_region,mes,muertes", ...filas].join("\n"));
const bueno = REGS.flatMap((r) => ["2026-12", "2027-01"].map((m) => `v261026,${r},${m},${r === "13" && m === "2026-12" ? -2 : 3}`));

describe("validación de archivos de carga (RF-37, RNF-11)", () => {
  it("acepta un archivo correcto, con valores negativos", () => {
    const v = validarImpactLab("impactlab_chile_v261026.csv", csv(bueno));
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.resumen).toMatchObject({ filas: 32, regiones: 16, meses: "2026-12 a 2027-01", total: 91 });
  });
  it("rechaza nombre, encabezado, región, mes, número, duplicados y regiones faltantes", () => {
    const mal = (nombre: string, filas: Uint8Array) => { const v = validarImpactLab(nombre, filas); expect(v.ok).toBe(false); return v.ok ? [] : v.errores.join(" "); };
    expect(mal("tracker.csv", csv(bueno))).toMatch(/Nombre de archivo/);
    expect(mal("impactlab_chile_v261026.csv", new TextEncoder().encode("region;mes;muertes\n13;2026-12;1"))).toMatch(/Encabezado/);
    expect(mal("impactlab_chile_v261026.csv", csv([...bueno.slice(0, -1), "v261026,99,2027-01,3"]))).toMatch(/región «99»/);
    expect(mal("impactlab_chile_v261026.csv", csv([...bueno.slice(0, -1), "v261026,16,2027-13,3"]))).toMatch(/mes «2027-13»/);
    expect(mal("impactlab_chile_v261026.csv", csv([...bueno.slice(0, -1), "v261026,16,2027-01,muchas"]))).toMatch(/no es un número/);
    expect(mal("impactlab_chile_v261026.csv", csv([...bueno, bueno[0]]))).toMatch(/repetidos/);
    expect(mal("impactlab_chile_v261026.csv", csv(bueno.slice(0, 20)))).toMatch(/Faltan regiones/);
    expect(mal("impactlab_chile_v011126.csv", csv(bueno))).toMatch(/no coincide con la del nombre/);
  });
  it("rechaza una codificación que no es UTF-8", () => {
    const latin1 = new Uint8Array([...new TextEncoder().encode("version,cod_region,mes,muertes\n"), 0xf1, 0xe9]);
    const v = validarImpactLab("impactlab_chile_v261026.csv", latin1);
    expect(v.ok).toBe(false);
  });
  it("calcula las diferencias con la carga anterior", () => {
    const a = [{ version: "v1", cod_region: "13", mes: "2026-12", muertes: 5 }, { version: "v1", cod_region: "05", mes: "2026-12", muertes: 2 }];
    const b = [{ version: "v2", cod_region: "13", mes: "2026-12", muertes: 7 }, { version: "v2", cod_region: "13", mes: "2027-01", muertes: 1 }];
    expect(diferencias(b, a)).toEqual({ primera: false, agregadas: 1, eliminadas: 1, cambiadas: 1, total_antes: 7 });
    expect(diferencias(b, null).primera).toBe(true);
  });
});

describe("alertas oficiales (RF-18)", () => {
  const base = { organismo: "Senapred", tipo: "Alerta Amarilla", territorio_tipo: "region", territorio_cod: "13", territorio_nombre: "RM", enlace: "https://senapred.cl", creado: "", anulada: false } as const;
  const lista: Alerta[] = [
    { ...base, id: 1, inicio: "2026-11-10T12:00:00.000Z", termino: "2026-11-12T12:00:00.000Z" },
    { ...base, id: 2, inicio: "2026-11-13T12:00:00.000Z", termino: "2026-11-16T12:00:00.000Z" },
    { ...base, id: 3, inicio: "2026-11-13T12:00:00.000Z", termino: "2026-11-16T12:00:00.000Z", anulada: true },
    { ...base, id: 4, inicio: "2026-11-20T12:00:00.000Z", termino: "2026-11-21T12:00:00.000Z" },
  ];
  it("una alerta vencida, anulada o futura no se muestra como vigente", () => {
    expect(vigentes(lista, new Date("2026-11-14T15:00:00Z")).map((a) => a.id)).toEqual([2]);
    expect(vigentes(lista, new Date("2026-11-16T12:00:01Z"))).toEqual([]);
  });
});

describe("semana ISO", () => {
  it("coincide con el calendario ISO y junta la semana 53 con la 52", () => {
    expect(semanaIso("2026-11-14")).toBe("2026-46");
    expect(semanaIso("2026-01-01")).toBe("2026-1");
    expect(semanaIso("2021-01-03")).toBe("2020-52"); // semana 53 de 2020
    expect(semanaIso("2024-12-30")).toBe("2025-1");
  });
});
