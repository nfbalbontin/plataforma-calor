import { configRiesgo, historiaPais, indiceHistoria } from "@/lib/datos";
import { fmt, rangoTexto, temporadaTexto } from "@/lib/historia";
import { riesgoActual } from "@/lib/pronostico";
import { textoRango, type Rango } from "@/lib/riesgo";
import { fechaLarga } from "@/lib/tiempo";

export const dynamic = "force-dynamic";

/** Inicio: las dos preguntas que responde la plataforma, cada una con su cifra y su entrada. */
export default async function Inicio() {
  const pais = historiaPais(), indice = indiceHistoria(), riesgo = await riesgoActual(), cfg = configRiesgo();
  const s = pais?.series.M_T_A, T = pais?.temporadas ?? [];
  const tot = s ? s[0].map((_, i) => i).reduce((a, i) => [a[0] + (s[0][i] ?? 0), a[1] + (s[1][i] ?? 0), a[2] + (s[2][i] ?? 0), a[3] + (s[3][i] ?? 0)], [0, 0, 0, 0]) : null;
  const alta = cfg.dias_confianza_alta;
  const r7: Rango | null = riesgo ? [0, 1, 2].map((k) => (k === 0 ? riesgo.pais.m : k === 1 ? riesgo.pais.lo : riesgo.pais.hi).slice(0, alta).reduce((a, b) => a + b, 0)) as Rango : null;
  const altas = riesgo ? Object.values(riesgo.regiones).filter((x) => Math.max(...x.n.slice(0, alta)) >= 2).length : 0;
  return (
    <div className="pagina">
      <h1>Calor y mortalidad en Chile</h1>
      <p className="bajada">Dos preguntas sobre calor extremo y salud, de Chile a la manzana. Toda estimación va con su rango.</p>
      <section className="seccion grilla dos-inicio">
        <div className="tarjeta modulo">
          <div className="eyebrow">Historia</div>
          <h2>¿Han aumentado las muertes y hospitalizaciones asociadas al calor, y dónde?</h2>
          {tot && <div className="kpi"><div className="valor">{rangoTexto(tot[2], tot[3])} muertes</div>
            <div className="chico">atribuibles al calor en Chile, veranos {temporadaTexto(T[0])} a {temporadaTexto(T[T.length - 1])}; estimación central {fmt(tot[1])} de {fmt(tot[0])} muertes en temporada cálida.</div></div>}
          <p className="tenue">Temperatura contra muertes, urgencias y hospitalizaciones: Chile, región, comuna y hospital.</p>
          <a className="boton" href="/historia">Ver la historia</a>
        </div>
        <div className="tarjeta modulo">
          <div className="eyebrow">Riesgo futuro</div>
          <h2>¿Dónde puede morir u hospitalizarse más gente con el calor que viene?</h2>
          {r7 && riesgo ? <div className="kpi"><div className="valor">{textoRango(r7)}</div>
            <div className="chico">en Chile en los próximos {alta} días; {altas === 0 ? "ninguna región" : altas === 1 ? "1 región" : `${altas} regiones`} con riesgo alto o muy alto. Pronóstico del {fechaLarga(riesgo.emision)}.</div></div>
            : <p className="aviso">Sin pronóstico guardado todavía.</p>}
          <p className="tenue">Mapa de riesgo según el pronóstico: región, comuna y manzana, con la ficha de cada lugar.</p>
          <a className="boton" href="/riesgo">Ver el mapa de riesgo</a>
        </div>
      </section>
      <p className="sub" style={{ marginTop: 18 }}>Datos históricos hasta el {indice ? fechaLarga(indice.defunciones_hasta) : "sin dato"}. De dónde sale cada cifra: <a href="/metodologia">Metodología y datos</a>.</p>
    </div>
  );
}
