"use client";
import { useCallback, useEffect, useState } from "react";

export type Paso = { sel?: string; titulo: string; texto: string; evento?: Record<string, string>; clic?: string };

/** Botón de ayuda: recorre la vista con un ejemplo de navegación, paso a paso. */
export function Ayuda({ pasos, etiqueta = "Ayuda" }: { pasos: Paso[]; etiqueta?: string }) {
  const [i, setI] = useState<number | null>(null);
  const [caja, setCaja] = useState<DOMRect | null>(null);

  const medir = useCallback((p: Paso) => {
    const el = p.sel ? document.querySelector(p.sel) : null;
    if (!el) { setCaja(null); return; }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    setTimeout(() => setCaja(el.getBoundingClientRect()), 350);
  }, []);

  useEffect(() => {
    if (i == null) return;
    const p = pasos[i];
    if (p.evento) window.dispatchEvent(new CustomEvent("calor:tour", { detail: p.evento }));
    if (p.clic) (document.querySelector(p.clic) as HTMLElement | null)?.click();
    const t = setTimeout(() => medir(p), p.evento || p.clic ? 900 : 50);
    const alCambiar = () => medir(p);
    window.addEventListener("resize", alCambiar);
    return () => { clearTimeout(t); window.removeEventListener("resize", alCambiar); };
  }, [i, pasos, medir]);

  useEffect(() => { if (new URLSearchParams(location.search).get("ayuda") === "1") setI(0); }, []);
  useEffect(() => {
    if (i == null) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setI(null); if (e.key === "ArrowRight") setI((x) => (x != null && x < pasos.length - 1 ? x + 1 : x)); if (e.key === "ArrowLeft") setI((x) => (x != null && x > 0 ? x - 1 : x)); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [i, pasos.length]);

  const p = i != null ? pasos[i] : null;
  let estilo: React.CSSProperties = { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
  if (caja && typeof window !== "undefined") {
    const abajo = caja.bottom + 190 < window.innerHeight;
    estilo = { left: Math.max(12, Math.min(caja.left, window.innerWidth - 380)), top: abajo ? caja.bottom + 12 : Math.max(12, caja.top - 190) };
  }
  return (
    <>
      <button className="icono" onClick={() => setI(0)} data-tour="ayuda">{etiqueta}</button>
      {p && (
        <>
          {caja ? <div className="tour-foco" style={{ left: caja.left - 6, top: caja.top - 6, width: caja.width + 12, height: caja.height + 12 }} />
            : <div className="tour-foco" style={{ left: "50%", top: "50%", width: 0, height: 0 }} />}
          <div className="tour-tarjeta" style={estilo} role="dialog" aria-label="Ayuda paso a paso">
            <h4>{p.titulo}</h4>
            <div>{p.texto}</div>
            <div className="fila">
              <span style={{ fontSize: 12, color: "#6a7399" }}>Paso {i! + 1} de {pasos.length}</span>
              <span className="fila" style={{ margin: 0 }}>
                {i! > 0 && <button className="sec" onClick={() => setI(i! - 1)}>Anterior</button>}
                {i! < pasos.length - 1 ? <button onClick={() => setI(i! + 1)}>Siguiente</button> : <button onClick={() => setI(null)}>Terminar</button>}
                <button className="sec" onClick={() => setI(null)} aria-label="Cerrar la ayuda">Cerrar</button>
              </span>
            </div>
          </div>
        </>
      )}
    </>
  );
}
