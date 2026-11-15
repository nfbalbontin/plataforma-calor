"use client";
import { useEffect, useRef, useState } from "react";

export type Paso = { sel?: string; titulo: string; texto: string; evento?: Record<string, string>; clic?: string };

/** Botón de ayuda: recorre la vista con un ejemplo de navegación, paso a paso. */
export function Ayuda({ pasos, etiqueta = "Ayuda" }: { pasos: Paso[]; etiqueta?: string }) {
  const [i, setI] = useState<number | null>(null);
  const [caja, setCaja] = useState<DOMRect | null>(null);

  const pasosRef = useRef(pasos);
  pasosRef.current = pasos;

  // En cada paso: dispara su acción, lleva el elemento a la vista y lo vuelve a medir mientras la página se acomoda.
  useEffect(() => {
    if (i == null) return;
    const p = pasosRef.current[i];
    if (!p) return;
    if (p.evento) window.dispatchEvent(new CustomEvent("calor:tour", { detail: p.evento }));
    if (p.clic) (document.querySelector(p.clic) as HTMLElement | null)?.click();
    let n = 0, desplazado = false;
    const medir = () => {
      const el = p.sel ? document.querySelector(p.sel) : null;
      if (!el) { setCaja(null); return; }
      if (!desplazado) { el.scrollIntoView({ block: el.getBoundingClientRect().height > window.innerHeight * 0.8 ? "start" : "center" }); desplazado = true; }
      const r = el.getBoundingClientRect();
      setCaja((a) => (a && Math.abs(a.top - r.top) < 1 && Math.abs(a.left - r.left) < 1 && a.width === r.width && a.height === r.height ? a : r));
    };
    const inicio = setTimeout(medir, p.evento || p.clic ? 700 : 30);
    const cada = setInterval(() => { if (++n > 12) clearInterval(cada); else if (desplazado) medir(); }, 300);
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    return () => { clearTimeout(inicio); clearInterval(cada); window.removeEventListener("resize", medir); window.removeEventListener("scroll", medir, true); };
  }, [i]);

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
    const abajo = caja.bottom + 190 < window.innerHeight, arriba = caja.top > 200;
    // Debajo del elemento si cabe; si no, encima; y si el elemento ocupa casi toda la pantalla, dentro de él, abajo a la derecha.
    estilo = abajo ? { left: Math.max(12, Math.min(caja.left, window.innerWidth - 380)), top: caja.bottom + 12 }
      : arriba ? { left: Math.max(12, Math.min(caja.left, window.innerWidth - 380)), top: Math.max(12, caja.top - 190) }
        : { right: 16, bottom: 16 };
  }
  return (
    <>
      <button className="icono" onClick={() => setI(0)} data-tour="ayuda">{etiqueta}</button>
      {p && (
        <>
          {caja ? <div className="tour-foco" style={{ left: caja.left - 6, top: Math.max(4, caja.top - 6), width: caja.width + 12, height: Math.min(caja.height + 12, window.innerHeight - Math.max(4, caja.top - 6) - 4) }} />
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
