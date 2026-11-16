import { configRiesgo, historiaPais, indiceHistoria } from "@/lib/datos";
import { fmt, temporadaTexto } from "@/lib/historia";
import { riesgoActual } from "@/lib/pronostico";
import { textoRango, type Rango } from "@/lib/riesgo";
import { fechaLarga } from "@/lib/tiempo";

export const dynamic = "force-dynamic";

/** Serie mínima: muertes atribuibles por verano, con su rango. */
function Serie({ T, an, lo, hi }: { T: number[]; an: number[]; lo: number[]; hi: number[] }) {
  const W = 1000, H = 190, B = 22, n = T.length, max = Math.max(...hi) * 1.05;
  const x = (i: number) => (i / (n - 1)) * W, y = (v: number) => H - B - (Math.max(0, v) / max) * (H - B - 8);
  const linea = an.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const banda = `M${hi.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("L")}L${[...lo.keys()].reverse().map((i) => `${x(i).toFixed(1)},${y(lo[i]).toFixed(1)}`).join("L")}Z`;
  const marcas = T.map((t, i) => [t, i] as const).filter(([t]) => t % 5 === 1);
  const iMax = an.indexOf(Math.max(...an));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Muertes atribuibles al calor en Chile por verano">
      <path d={banda} fill="var(--acento)" opacity={0.14} />
      <path d={linea} fill="none" stroke="var(--acento)" strokeWidth={2.2} strokeLinejoin="round" />
      <circle cx={x(iMax)} cy={y(an[iMax])} r={4} fill="var(--acento)" />
      <text x={x(iMax)} y={y(an[iMax]) - 10} textAnchor="middle" style={{ fill: "var(--texto)" }}>{fmt(an[iMax])} en {temporadaTexto(T[iMax])}</text>
      <line x1={0} x2={W} y1={H - B} y2={H - B} stroke="var(--borde)" />
      {marcas.map(([t, i]) => <text key={t} x={x(i)} y={H - 5} textAnchor="middle">{temporadaTexto(t)}</text>)}
    </svg>
  );
}

/** Inicio: la cifra central, su evolución y la entrada a los dos módulos. */
export default async function Inicio() {
  const pais = historiaPais(), indice = indiceHistoria(), riesgo = await riesgoActual(), cfg = configRiesgo();
  const s = pais?.series.M_T_A, T = pais?.temporadas ?? [];
  const col = (k: number) => (s ? s[k].map((v) => v ?? 0) : []);
  const tot: Rango | null = s ? [col(1).reduce((a, b) => a + b, 0), col(2).reduce((a, b) => a + b, 0), col(3).reduce((a, b) => a + b, 0)] : null;
  const alta = cfg.dias_confianza_alta;
  const r7: Rango | null = riesgo ? [riesgo.pais.m, riesgo.pais.lo, riesgo.pais.hi].map((a) => a.slice(0, alta).reduce((x, y) => x + y, 0)) as Rango : null;
  const altas = riesgo ? Object.values(riesgo.regiones).filter((x) => Math.max(...x.n.slice(0, alta)) >= 2).length : 0;
  return (
    <>
      <section className="portada2">
        <p className="kicker">Chile · veranos {T.length ? `${temporadaTexto(T[0])} a ${temporadaTexto(T[T.length - 1])}` : ""}</p>
        <h1 className="titular">Cuántas personas mueren por el calor, y dónde puede pasar ahora.</h1>
        {tot && <div data-tour="cifra">
          <div className="cifra-grande"><b>{fmt(tot[0])}</b><span>({fmt(tot[1])} – {fmt(tot[2])})</span></div>
          <p className="cifra-pie">muertes atribuibles al calor en Chile en los últimos {T.length} veranos, de noviembre a marzo.</p>
          <div className="serie-portada"><Serie T={T} an={col(1)} lo={col(2)} hi={col(3)} /></div>
        </div>}
      </section>
      <section className="entradas">
        <a className="entrada" href="/historia" data-tour="entrada-historia">
          <div className="modulo-nombre">Historia</div>
          <h2>¿Han aumentado las muertes y hospitalizaciones por calor, y dónde?</h2>
          <div className="dato">{pais ? fmt(pais.clima.calor.slice(-10).reduce((a, b) => a + b, 0) / 10, 1) : "–"} <small>días de calor extremo por verano en la última década</small></div>
          <div className="dato-pie">De Chile a la región, la comuna y el hospital.</div>
          <span className="flecha">Ver la historia →</span>
        </a>
        <a className="entrada" href="/riesgo" data-tour="entrada-riesgo">
          <div className="modulo-nombre">Riesgo futuro</div>
          <h2>¿Dónde puede morir u hospitalizarse más gente con el calor que viene?</h2>
          {r7 && riesgo ? <><div className="dato">{textoRango(r7, 0)} <small>muertes potenciales, próximos {alta} días</small></div>
            <div className="dato-pie">{altas} {altas === 1 ? "región" : "regiones"} con riesgo alto o muy alto · pronóstico del {fechaLarga(riesgo.emision)}</div></>
            : <div className="dato-pie">Sin pronóstico guardado todavía.</div>}
          <span className="flecha">Ver el mapa →</span>
        </a>
      </section>
      <p className="sub" style={{ maxWidth: 1080, margin: "-48px auto 60px", padding: "0 24px" }}>Datos históricos hasta el {indice ? fechaLarga(indice.defunciones_hasta) : "sin dato"}. <a href="/metodologia">Metodología y datos</a>.</p>
    </>
  );
}
