import { configRiesgo, historiaPais, indiceHistoria } from "@/lib/datos";
import { fmt, temporadaTexto } from "@/lib/historia";
import { riesgoActual } from "@/lib/pronostico";
import { textoRango, type Rango } from "@/lib/riesgo";
import { fechaLarga } from "@/lib/tiempo";

export const dynamic = "force-dynamic";

/** Recorrido del inicio: pantallazos reales (pipeline/capturas_inicio.mjs) con enlace a esa vista. */
const GUIA: [grupo: string, pasos: [img: string, href: string, titulo: string, texto: string][]][] = [
  ["Análisis histórico", [
    ["historia-chile", "/historia", "Elige qué mirar", "Arriba eliges el indicador (muertes totales, por tipo de diagnóstico, urgencias u hospitalizaciones), los veranos, la edad y el sexo. Todo lo de abajo cambia con eso."],
    ["historia-serie", "/historia/region/13", "Verano a verano", "Las barras son los días de calor extremo y la línea, las muertes atribuibles al calor. Un clic en un verano muestra cada día: temperatura arriba, muertes abajo."],
    ["historia-donde", "/historia/region/13", "Dónde pasa", "Mapa y ranking de las comunas de una región. Un clic en una comuna entra a ella, y desde ahí a su hospital."],
    ["historia-quienes", "/historia", "A quién afecta", "Compara a quienes mueren en días de calor extremo con quienes mueren en días normales: por edad, sexo, lugar y causa, y cruzando sexo con edad o con causa."],
    ["historia-hospital", "/historia/hospital/109100", "Hasta el hospital", "Cada hospital muestra sus urgencias y hospitalizaciones, y las muertes de los residentes de su área."],
  ]],
  ["Riesgo futuro", [
    ["riesgo-chile", "/riesgo", "El mapa de los próximos días", "Cada región se pinta según las muertes potenciales con el pronóstico de temperatura. Abajo eliges el día; del octavo en adelante es orientativo."],
    ["riesgo-region", "/riesgo?region=05&dia=12", "Dentro de una región", "Las comunas o provincias se comparan entre sí, y la tabla las ordena. Se puede buscar y ordenar por cualquier columna."],
    ["riesgo-manzanas", "/riesgo?comuna=13110&dia=12", "Hasta la manzana", "En una comuna, cada punto es una manzana: se pinta según su población vulnerable y el calor esperado. A la derecha, la ficha con su hospital de referencia."],
    ["riesgo-simular", "/riesgo?simular=34", "Simular una temperatura", "Fija una máxima para todo Chile y mira qué zonas se vuelven más graves y cuántas muertes podrían ocurrir."],
    ["riesgo-aura", "/riesgo?comuna=13110&dia=12&aura=1", "Calor urbano (AURA)", "En la Región Metropolitana, AURA estima qué manzanas son más calurosas que su comuna. Al activarlo se ve dónde ese calor extra concentra el riesgo."],
  ]],
];

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
          <div className="modulo-nombre">Análisis histórico</div>
          <h2>¿Han aumentado las muertes y hospitalizaciones por calor, y dónde?</h2>
          <div className="dato">{pais ? fmt(pais.clima.calor.slice(-10).reduce((a, b) => a + b, 0) / 10, 1) : "–"} <small>días de calor extremo por verano en la última década</small></div>
          <div className="dato-pie">De Chile a la región, la comuna y el hospital.</div>
          <span className="flecha">Ver el análisis histórico →</span>
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
      <section className="guia">
        <h2 className="guia-titulo">Cómo se usa</h2>
        <p className="guia-sub">Cada imagen es una pantalla real. Un clic la abre en esa misma vista.</p>
        {GUIA.map(([grupo, pasos]) => <div key={grupo} className="guia-grupo">
          <h3>{grupo}</h3>
          {pasos.map(([img, href, titulo, texto], i) => (
            <article key={img} className="guia-paso">
              <a href={href} className="guia-img" aria-label={`Abrir: ${titulo}`}>
                <img className="solo-oscuro" src={`/inicio/${img}-oscuro.jpg`} alt={titulo} width={1200} height={750} loading="lazy" />
                <img className="solo-claro" src={`/inicio/${img}-claro.jpg`} alt={titulo} width={1200} height={750} loading="lazy" />
              </a>
              <div className="guia-texto">
                <span className="guia-num">{i + 1}</span>
                <h4>{titulo}</h4>
                <p>{texto}</p>
                <a href={href}>Abrir esta vista →</a>
              </div>
            </article>))}
        </div>)}
      </section>
      <p className="sub" style={{ maxWidth: 1080, margin: "0 auto 60px", padding: "0 24px" }}>Datos históricos hasta el {indice ? fechaLarga(indice.defunciones_hasta) : "sin dato"}. <a href="/metodologia">Metodología y datos</a>.</p>
    </>
  );
}
