"use client";
import { usePathname } from "next/navigation";

const SECCIONES: [string, string][] = [["/historia", "Análisis histórico"], ["/riesgo", "Riesgo futuro"], ["/metodologia", "Metodología y datos"]];

export function Navegacion() {
  const ruta = usePathname();
  return (
    <nav className="nav" aria-label="Secciones">
      {SECCIONES.map(([href, texto]) => <a key={href} href={href} aria-current={ruta.startsWith(href) ? "page" : undefined}>{texto}</a>)}
    </nav>
  );
}
