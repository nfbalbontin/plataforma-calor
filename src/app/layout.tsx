import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Navegacion } from "@/componentes/Navegacion";
import { Tema } from "@/componentes/Tema";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Calor extremo y salud · Chile (prototipo)",
  description: "Prototipo no comercial para prevenir muertes por calor extremo: exposición, nivel estimado por comuna e impacto observado.",
};

const TEMA = `try{var t=localStorage.getItem('tema')||(matchMedia('(prefers-color-scheme: light)').matches?'claro':'oscuro');document.documentElement.dataset.tema=t}catch(e){}`;

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: TEMA }} /></head>
      <body>
        <div className="aviso-prototipo" role="note"><strong>Prototipo no comercial.</strong> No emite alertas oficiales.</div>
        <header className="cabecera">
          <a className="marca" href="/">Calor extremo <span>·</span> Chile</a>
          <Navegacion />
          <div className="acciones"><Tema /><a className="icono" href="/login" data-tour="login">Ingresar</a></div>
        </header>
        <main>{children}</main>
        <footer className="pie">
          Fuentes: INE, Censo 2024 (CC BY-SA 4.0) · DEIS, Ministerio de Salud · Open-Meteo (CC BY 4.0). <a href="/metodologia">Metodología</a> · <a href="/estado">Estado de las fuentes</a>
        </footer>
      </body>
    </html>
  );
}
