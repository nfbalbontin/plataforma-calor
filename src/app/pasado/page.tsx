import { Ayuda } from "@/componentes/Ayuda";
import { Cifra } from "@/componentes/Basicos";
import { configEpisodios, episodios, regiones } from "@/lib/datos";
import { fechaLarga, num } from "@/lib/tiempo";
import { TOUR_PASADO } from "@/lib/tours";

export const revalidate = 3600;

export default function Pasado() {
  const eps = episodios();
  const cfg = configEpisodios();
  const nombreReg = Object.fromEntries(regiones().map((r) => [r.cod, r.nombre]));
  const lista = eps?.episodios ?? [];
  return (
    <div className="pagina">
      <div className="titulo-fila"><h1>Episodios de calor desde 2010 y muertes de esos días</h1><Ayuda pasos={TOUR_PASADO} /></div>
      {!eps || lista.length === 0 ? <p className="aviso seccion">Aún no hay episodios calculados: falta la serie histórica de temperatura.</p> : (
        <>
          <section className="seccion" data-tour="tabla-pasado">
            <div className="tabla-caja">
              <table>
                <thead><tr><th>Región</th><th>Inicio</th><th>Término</th><th className="n">Días</th><th className="n">Media más alta</th><th className="n">Máxima más alta</th><th className="n">Muertes observadas</th><th className="n">Esperadas (rango)</th><th>Mapa</th></tr></thead>
                <tbody>
                  {lista.map((e) => (
                    <tr key={e.id}>
                      <td>{nombreReg[e.cod_region] ?? e.cod_region}</td><td>{fechaLarga(e.inicio)}</td><td>{fechaLarga(e.termino)}</td><td className="n">{e.dias}</td>
                      <td className="n">{num(e.tmean_max, 1)} °C</td><td className="n">{num(e.tmax_max, 1)} °C</td>
                      <td className="n">{e.def_obs == null ? "sin dato" : <Cifra valor={num(e.def_obs)} traza={{ fuente: "DEIS, Ministerio de Salud", enlace: "https://deis.minsal.cl/", fecha: `${fechaLarga(e.inicio)} a ${fechaLarga(e.termino)}`, tipo: "registro", metodo: "Defunciones de residentes de la región en los días del episodio." }} />}</td>
                      <td className="n">{e.def_esp ? <Cifra valor={`${num(e.def_esp[1])} (${num(e.def_esp[0])} a ${num(e.def_esp[2])})`} traza={{ fuente: "Elaboración propia a partir del DEIS", tipo: "estimación", metodo: eps.metodo_muertes }} /> : "sin dato"}{e.nota && <div className="chico" title={e.nota}>pandemia</div>}</td>
                      <td><a className="boton sec" data-tour="ver-niveles" href={`/pasado/${e.id}`}>Ver niveles</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <details className="metodo"><summary>Definición y método</summary><p>{cfg.definicion} Cobertura de la serie histórica: {eps.cobertura}. {eps.metodo_muertes} Lo esperado no corrige por tendencia. Temperatura: Open-Meteo, reanálisis ERA5. Umbrales {eps.umbrales}.</p></details>
          </section>
        </>
      )}
    </div>
  );
}
