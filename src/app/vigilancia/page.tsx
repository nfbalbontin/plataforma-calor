import { Ayuda } from "@/componentes/Ayuda";
import { AvisoFuentes } from "@/componentes/Basicos";
import { ExploradorDefunciones } from "@/componentes/ExploradorDefunciones";
import { Chispa } from "@/componentes/Graficos";
import { calorCertificado, comunas, defRegionDia, regiones, urgencias, vigilancia } from "@/lib/datos";
import { conProblema, estadoFuentes } from "@/lib/fuentes";
import { senalComuna } from "@/lib/impacto";
import { fechaLarga, num } from "@/lib/tiempo";
import { TOUR_IMPACTO } from "@/lib/tours";

export const revalidate = 3600;
const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export default async function Vigilancia() {
  const vig = vigilancia(), urg = urgencias(), cert = calorCertificado(), dia = defRegionDia();
  const estados = await estadoFuentes();
  const nombreReg: Record<string, string> = Object.fromEntries(regiones().map((r) => [r.cod, r.nombre]));
  const regs = [{ cod: "00", nombre: "Chile" }, ...regiones().map((r) => ({ cod: r.cod, nombre: r.nombre }))];
  const anos = dia ? Array.from({ length: Number(dia.fin.slice(0, 4)) - 2010 + 1 }, (_, i) => 2010 + i) : [2026];
  const senales = comunas().map((c) => ({ c, s: senalComuna(c.cod) })).filter((x) => x.s).sort((a, b) => (b.s!.m65.senal.razon ?? 0) - (a.s!.m65.senal.razon ?? 0));
  const porRegAno = new Map<string, number>();
  for (const f of cert?.filas ?? []) porRegAno.set(`${f.cod_region}|${f.a}|${f.m}`, (porRegAno.get(`${f.cod_region}|${f.a}|${f.m}`) ?? 0) + f.n);
  return (
    <div className="pagina">
      <div className="titulo-fila"><h1>Defunciones y urgencias observadas</h1><Ayuda pasos={TOUR_IMPACTO} /></div>
      <div className="fila" style={{ marginTop: 8 }}>
        {vig && <span className="pildora">Defunciones hasta el {fechaLarga(vig.ultima_defuncion)}</span>}
        {urg && <span className="pildora">Urgencias hasta el {fechaLarga(urg.ultima_fecha)}</span>}
      </div>
      <div style={{ marginTop: 8 }}><AvisoFuentes fuentes={conProblema(estados, ["deis-defunciones", "deis-urgencias"])} /></div>

      <section className="seccion">
        <ExploradorDefunciones regiones={regs} comunas={comunas().map((c) => ({ cod: c.cod, nombre: c.nombre, cod_region: c.cod_region }))} anos={anos} />
        <details className="metodo"><summary>Cómo se calcula lo esperado</summary>
          <p>{vig?.metodo} No corrige por envejecimiento ni tendencia: en años recientes lo esperado puede quedar bajo, así que una diferencia positiva no es por sí sola exceso por calor. Los últimos 28 días son provisionales. Las defunciones sin comuna de residencia no se cuentan.</p>
        </details>
      </section>

      <section className="seccion" data-tour="certificadas">
        <h2>Defunciones con causa certificada por calor desde 2010: {cert?.total ?? 0}</h2>
        <div className="tabla-caja" style={{ marginTop: 8, maxWidth: 560 }}>
          <table><thead><tr><th>Región</th><th>Mes</th><th className="n">Defunciones</th></tr></thead>
            <tbody>{[...porRegAno.entries()].sort((a, b) => Number(b[0].split("|")[1]) * 100 + Number(b[0].split("|")[2]) - (Number(a[0].split("|")[1]) * 100 + Number(a[0].split("|")[2]))).map(([k, n]) => { const [reg, a, m] = k.split("|"); return <tr key={k}><td>{nombreReg[reg] ?? reg}</td><td>{MES[Number(m) - 1]} {a}</td><td className="n">{n}</td></tr>; })}</tbody></table>
        </div>
        <details className="metodo"><summary>Qué significa</summary><p>{cert?.definicion} {cert?.nota}</p></details>
      </section>

      <section className="seccion" data-tour="urgencias">
        <h2>Urgencias de 65 años o más por comuna, último día completo</h2>
        <div className="tabla-caja" style={{ maxHeight: 480, overflowY: "auto", marginTop: 8 }}>
          <table>
            <thead><tr><th>Comuna</th><th>Región</th><th>Día</th><th className="n">65 o más</th><th className="n">Habitual</th><th>Señal</th><th className="n">Total</th><th>28 días</th></tr></thead>
            <tbody>
              {senales.slice(0, 120).map(({ c, s }) => (
                <tr key={c.cod}>
                  <td><a href={`/comuna/${c.cod}`}>{c.nombre}</a></td><td className="chico">{nombreReg[c.cod_region]}</td><td className="chico">{fechaLarga(s!.fecha)}</td>
                  <td className="n">{s!.m65.valor == null ? "sin dato" : num(s!.m65.valor)}</td><td className="n">{num(s!.m65.habitual, 0)}</td>
                  <td>{s!.m65.senal.estado}{s!.m65.senal.razon ? ` (${num(s!.m65.senal.razon * 100)} %)` : ""}</td>
                  <td className="n">{s!.total.valor == null ? "sin dato" : num(s!.total.valor)}</td>
                  <td><Chispa valores={s!.serie65} base={1} titulo={`${c.nombre}: urgencias de 65+ respecto de lo habitual, 28 días`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details className="metodo"><summary>Cómo se calcula</summary><p>{urg?.metodo} Se muestran las 120 comunas con la señal más alta de {senales.length}. «Sin dato» significa que ningún establecimiento informó. <a href="/api/descargas/urgencias">Descargar todas en CSV</a></p></details>
      </section>
    </div>
  );
}
