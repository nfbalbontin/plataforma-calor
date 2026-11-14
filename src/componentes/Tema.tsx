"use client";
import { useEffect, useState } from "react";

/** Cambia entre modo oscuro y claro. La preferencia queda guardada en el navegador. */
export function Tema() {
  const [tema, setTema] = useState<"oscuro" | "claro">("oscuro");
  useEffect(() => { setTema(document.documentElement.dataset.tema === "claro" ? "claro" : "oscuro"); }, []);
  const cambiar = () => {
    const t = tema === "claro" ? "oscuro" : "claro";
    document.documentElement.dataset.tema = t;
    try { localStorage.setItem("tema", t); } catch { /* sin almacenamiento */ }
    setTema(t);
    window.dispatchEvent(new CustomEvent("calor:tema"));
  };
  return <button className="icono" onClick={cambiar} aria-label={`Cambiar a modo ${tema === "claro" ? "oscuro" : "claro"}`} data-tour="tema">{tema === "claro" ? "Modo oscuro" : "Modo claro"}</button>;
}
