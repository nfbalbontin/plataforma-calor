import type { Metadata } from "next";
import { Geist, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { Navegacion } from "@/componentes/Navegacion";
import { Tema } from "@/componentes/Tema";
import { Tutorial } from "@/componentes/Tutorial";
import { indiceHistoria } from "@/lib/datos";
import { fechaLarga } from "@/lib/tiempo";

const ui = Geist({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
const titulo = Instrument_Serif({ subsets: ["latin"], weight: "400", variable: "--font-titulo", display: "swap" });

export const metadata: Metadata = {
  title: "Calor y mortalidad en Chile",
  description: "Dos preguntas sobre calor extremo y salud en Chile: si han aumentado las muertes y hospitalizaciones asociadas al calor, y dónde puede haber más con el calor que viene.",
};

const TEMA = `try{var t=localStorage.getItem('tema')||(matchMedia('(prefers-color-scheme: light)').matches?'claro':'oscuro');document.documentElement.dataset.tema=t}catch(e){}`;

export default function Layout({ children }: { children: React.ReactNode }) {
  const indice = indiceHistoria();
  return (
    <html lang="es" className={`${ui.variable} ${titulo.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: TEMA }} /></head>
      <body>
        <div className="aviso-prototipo" role="note"><strong>Estimaciones estadísticas, siempre con su rango.</strong> No es un sistema de alertas oficiales.</div>
        <header className="cabecera">
          <a className="marca" href="/">Calor y mortalidad <span>Chile</span></a>
          <Navegacion />
          <div className="acciones"><Tutorial /><Tema /></div>
        </header>
        <main>{children}</main>
        <footer className="pie">
          Datos históricos hasta el {indice ? fechaLarga(indice.defunciones_hasta) : "sin dato"}. Fuentes: DEIS, Ministerio de Salud · INE, Censo 2024 · Open-Meteo (CC BY 4.0). <a href="/metodologia">Metodología y datos</a> · Autor: Nicolás Balbontín.
        </footer>
      </body>
    </html>
  );
}
