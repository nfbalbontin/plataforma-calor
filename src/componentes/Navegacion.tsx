"use client";
import { usePathname } from "next/navigation";
import { SECCIONES } from "@/lib/secciones";

export function Navegacion() {
  const ruta = usePathname();
  return (
    <nav className="nav" aria-label="Secciones" data-tour="nav">
      <a href="/" aria-current={ruta === "/" ? "page" : undefined}>Inicio</a>
      {SECCIONES.map(([href, texto]) => <a key={href} href={href} aria-current={ruta.startsWith(href) ? "page" : undefined}>{texto}</a>)}
    </nav>
  );
}
