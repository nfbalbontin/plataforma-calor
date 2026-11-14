import { NextResponse } from "next/server";
import { comuna, comunaMes, defComunaMes, defRegionDia, episodios, vigilancia } from "@/lib/datos";
import { semanaIso, sumarDias } from "@/lib/tiempo";

type Punto = { t: string; ini: string; obs: number | null; esp: number | null; bajo: number | null; alto: number | null; calor: number; prov: boolean };
const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/**
 * Defunciones filtradas por territorio, edad, año, mes y escala. Regla de publicación (RNF-07):
 * por día o semana solo país y región; por comuna, el detalle mínimo es el mes.
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const terr = sp.get("terr") ?? "00", edad = sp.get("edad") ?? "total", ano = sp.get("ano") ?? "", mes = sp.get("mes") ?? "";
  let escala = sp.get("escala") ?? "semana";
  if (!["total", "e0_64", "e65_79", "e80_mas"].includes(edad)) return NextResponse.json({ error: "edad inválida" }, { status: 400 });
  const reg = terr.length === 5 ? terr.slice(0, 2) : terr;
  const calor = new Set<string>();
  for (const e of episodios()?.episodios ?? []) if (e.cod_region === reg) for (const f of Object.keys(e.niveles)) calor.add(f);
  const serie: Punto[] = [];
  let nota = "";

  if (terr.length === 5) {
    const d = defComunaMes(), c = comuna(terr);
    if (!d || !c || !d.comunas[terr]) return NextResponse.json({ error: "comuna sin datos" }, { status: 404 });
    if (escala === "dia" || escala === "semana") { escala = "mes"; nota = "Por comuna el detalle mínimo es el mes."; }
    const esp = new Map((comunaMes()?.comunas[terr] ?? []).map((f) => [`${f[0]}-${String(f[1]).padStart(2, "0")}`, f[4] as number | null]));
    const grupos = new Map<string, Punto>();
    d.meses.forEach((m, i) => {
      if (m > d.completo_hasta || (ano && m.slice(0, 4) !== ano) || (mes && Number(m.slice(5)) !== Number(mes))) return;
      const k = escala === "ano" ? m.slice(0, 4) : m;
      const g = grupos.get(k) ?? { t: escala === "ano" ? k : `${MES[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`, ini: `${m}-01`, obs: 0, esp: edad === "total" ? 0 : null, bajo: null, alto: null, calor: 0, prov: m >= "2024-01" };
      g.obs! += d.comunas[terr][edad][i];
      const e = esp.get(m);
      if (g.esp != null) g.esp = e == null ? null : g.esp + e;
      for (const f of calor) if (f.startsWith(m)) g.calor++;
      grupos.set(k, g);
    });
    serie.push(...grupos.values());
  } else {
    const d = defRegionDia(), v = vigilancia();
    if (!d || !d.territorios[terr]) return NextResponse.json({ error: "territorio sin datos" }, { status: 404 });
    const vals = d.territorios[terr][edad];
    const espSem = new Map((v?.regiones[terr] ?? []).map((s) => [`${s.a}-${s.s}`, s[`${edad}_esp` as "total_esp"]]));
    let desde = 0;
    if (!ano && escala === "dia") { desde = vals.length - 120; nota = "Sin año elegido se muestran los últimos 120 días."; }
    if (!ano && escala === "semana") { desde = vals.length - 104 * 7; nota = "Sin año elegido se muestran las últimas 104 semanas."; }
    const corte = sumarDias(d.fin, -28);
    const grupos = new Map<string, Punto & { dias: number }>();
    for (let i = Math.max(0, desde); i < vals.length; i++) {
      const f = sumarDias(d.inicio, i);
      if ((ano && f.slice(0, 4) !== ano && !(escala === "semana" && semanaIso(f).split("-")[0] === ano)) || (mes && Number(f.slice(5, 7)) !== Number(mes))) continue;
      const sem = semanaIso(f);
      if (escala === "semana" && ano && sem.split("-")[0] !== ano) continue;
      const k = escala === "dia" ? f : escala === "semana" ? sem : escala === "mes" ? f.slice(0, 7) : f.slice(0, 4);
      const t = escala === "dia" ? `${Number(f.slice(8))} ${MES[Number(f.slice(5, 7)) - 1]} ${f.slice(0, 4)}` : escala === "semana" ? `semana ${sem.split("-")[1]} de ${sem.split("-")[0]}` : escala === "mes" ? `${MES[Number(f.slice(5, 7)) - 1]} ${f.slice(0, 4)}` : k;
      const g = grupos.get(k) ?? { t, ini: f, obs: 0, esp: 0, bajo: 0, alto: 0, calor: 0, prov: false, dias: 0 };
      g.obs! += vals[i]; g.dias++;
      const e = espSem.get(sem);
      if (e && g.esp != null) { g.bajo! += e[0] / 7; g.esp += e[1] / 7; g.alto! += e[2] / 7; } else { g.esp = g.bajo = g.alto = null; }
      if (calor.has(f)) g.calor++;
      if (f > corte) g.prov = true;
      grupos.set(k, g);
    }
    for (const g of grupos.values()) {
      if (escala === "semana" && g.dias < 7) continue; // semanas incompletas en los bordes
      serie.push({ t: g.t, ini: g.ini, obs: g.obs, esp: g.esp == null ? null : Math.round(g.esp), bajo: g.bajo == null ? null : Math.round(g.bajo), alto: g.alto == null ? null : Math.round(g.alto), calor: g.calor, prov: g.prov });
    }
  }
  const conCalor = serie.filter((s) => s.calor > 0);
  return NextResponse.json({
    escala, nota, serie,
    resumen: { periodos: serie.length, con_calor: conCalor.length, con_calor_sobre: conCalor.filter((s) => s.alto != null && s.obs! > s.alto).length, hay_episodios: calor.size > 0 },
  }, { headers: { "Cache-Control": "public, max-age=0, must-revalidate", "CDN-Cache-Control": "s-maxage=3600" } });
}
