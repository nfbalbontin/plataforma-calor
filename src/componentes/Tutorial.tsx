"use client";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type Paso = { sel?: string; titulo: string; texto: string };

/** Pasos del recorrido de cada página. Los pasos cuyo elemento no existe en pantalla se saltan. */
const PASOS: [prefijo: string, pasos: Paso[]][] = [
  ["/historia", [
    { titulo: "Historia", texto: "Cómo han evolucionado las muertes y hospitalizaciones frente a la temperatura. La misma pantalla se repite para Chile, región, comuna y hospital." },
    { sel: "[data-tour=ruta]", titulo: "Dónde estás", texto: "La ruta muestra el lugar. Un clic en un nivel superior sube." },
    { sel: "[data-tour=filtros]", titulo: "Filtros", texto: "Indicador, período, edad y sexo. «Mostrar» cambia todas las cifras entre número y por 1.000 habitantes." },
    { sel: "[data-tour=cifras]", titulo: "Las tres cifras", texto: "Muertes atribuibles al calor con su rango, cómo cambian cada 10 años y cuántos días de calor extremo hay por verano." },
    { sel: "[data-tour=serie]", titulo: "Verano a verano", texto: "Días de calor extremo arriba y muertes atribuibles abajo. Un clic en un verano abre su detalle diario." },
    { sel: "[data-tour=curva]", titulo: "Desde qué temperatura sube", texto: "Cuánto aumentan las muertes a medida que hace más calor. Es la curva que usa toda la plataforma." },
    { sel: "[data-tour=donde]", titulo: "Dónde", texto: "Mapa y ranking del nivel inferior. Un clic baja a ese lugar." },
    { sel: "[data-tour=quienes]", titulo: "Quiénes", texto: "Edad, sexo, lugar y causa de las muertes en días de calor extremo frente a días normales." },
    { sel: "[data-tour=olas]", titulo: "Olas de calor", texto: "Cada ola del lugar con sus muertes atribuibles." },
  ]],
  ["/riesgo", [
    { titulo: "Riesgo futuro", texto: "Dónde puede haber más muertes con el calor que viene, de la región a la manzana." },
    { sel: "[data-tour=mapa-lugar]", titulo: "Dónde estás", texto: "Un clic en una región muestra sus comunas; un clic en una comuna, sus manzanas." },
    { sel: "[data-tour=mapa-modo]", titulo: "Pronóstico o simulación", texto: "Usa el pronóstico de los próximos 16 días o fija una temperatura máxima para todo Chile y mira cómo cambia el mapa." },
    { sel: "[data-tour=mapa-medida]", titulo: "Número o tasa", texto: "Cambia todas las cifras entre número de muertes y muertes por 100.000 habitantes." },
    { sel: "[data-tour=mapa-pintar]", titulo: "Cómo se pinta", texto: "Por muertes potenciales, comparando los lugares entre sí, o por nivel de riesgo." },
    { sel: "[data-tour=dias]", titulo: "Cada día", texto: "Elige el día. Del día 8 en adelante el pronóstico es orientativo." },
    { sel: "[data-tour=potenciales]", titulo: "Muertes potenciales", texto: "Siempre con su rango. A nivel de manzana solo hay un índice relativo." },
    { sel: "[data-tour=lugares]", titulo: "Ranking", texto: "Los lugares ordenados por muertes potenciales del día elegido." },
  ]],
  ["/metodologia", [
    { titulo: "Metodología y datos", texto: "De dónde sale cada cifra." },
    { sel: "[data-tour=fuentes]", titulo: "Fuentes", texto: "Institución, enlace, fecha de descarga y condiciones de uso de cada fuente." },
    { sel: "[data-tour=modelo]", titulo: "Modelo", texto: "Cómo se convierten grados en muertes, la validación y las pruebas de sensibilidad." },
    { sel: "[data-tour=limites]", titulo: "Límites", texto: "Lo que la plataforma no puede afirmar." },
  ]],
  ["/", [
    { titulo: "Calor y mortalidad en Chile", texto: "Dos preguntas: si han aumentado las muertes por calor, y dónde puede haber más con el calor que viene." },
    { sel: "[data-tour=cifra]", titulo: "La cifra", texto: "Muertes atribuibles al calor en Chile desde 1990, con su rango." },
    { sel: "[data-tour=entrada-historia]", titulo: "Historia", texto: "Temperatura contra muertes y hospitalizaciones, de Chile al hospital." },
    { sel: "[data-tour=entrada-riesgo]", titulo: "Riesgo futuro", texto: "El mapa según el pronóstico, de la región a la manzana." },
    { sel: "[data-tour=ayuda]", titulo: "Volver a ver", texto: "Este recorrido se abre al entrar a cada página. Puedes repetirlo aquí." },
  ]],
];
const CLAVE = "tutorial-oculto";

/** Recorrido guiado: se abre al entrar a cada página (salvo que se pida no mostrarlo más) y se repite con el botón. */
export function Tutorial() {
  const ruta = usePathname();
  const todos = (PASOS.find(([p]) => (p === "/" ? ruta === "/" : ruta.startsWith(p)))?.[1]) ?? [];
  const [pasos, setPasos] = useState<Paso[]>([]), [i, setI] = useState<number | null>(null), [caja, setCaja] = useState<DOMRect | null>(null);
  const abrir = useCallback(() => {
    const visibles = todos.filter((p) => !p.sel || document.querySelector(p.sel));
    if (visibles.length) { setPasos(visibles); setI(0); }
  }, [todos]);
  const cerrar = () => setI(null);
  const noMostrar = () => { try { localStorage.setItem(CLAVE, "1"); } catch { /* sin almacenamiento */ } setI(null); };

  // Al entrar a la página (espera a que cargue su contenido)
  const abrirRef = useRef(abrir); abrirRef.current = abrir;
  useEffect(() => {
    setI(null);
    let oculto = false;
    try { oculto = localStorage.getItem(CLAVE) === "1"; } catch { /* sin almacenamiento */ }
    if (new URLSearchParams(location.search).get("ayuda") === "1") oculto = false;
    if (oculto) return;
    const t = setTimeout(() => abrirRef.current(), 1500);
    return () => clearTimeout(t);
  }, [ruta]);

  useEffect(() => {
    if (i == null) return;
    const p = pasos[i];
    if (!p) return;
    let n = 0, desplazado = false;
    const medir = () => {
      const el = p.sel ? document.querySelector(p.sel) : null;
      if (!el) { setCaja(null); return; }
      if (!desplazado) { el.scrollIntoView({ block: el.getBoundingClientRect().height > window.innerHeight * 0.8 ? "start" : "center" }); desplazado = true; }
      const r = el.getBoundingClientRect();
      setCaja((a) => (a && Math.abs(a.top - r.top) < 1 && Math.abs(a.left - r.left) < 1 && a.width === r.width && a.height === r.height ? a : r));
    };
    const inicio = setTimeout(medir, 30);
    const cada = setInterval(() => { if (++n > 10) clearInterval(cada); else medir(); }, 300);
    window.addEventListener("resize", medir); window.addEventListener("scroll", medir, true);
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setI(null); if (e.key === "ArrowRight") setI((x) => (x != null && x < pasos.length - 1 ? x + 1 : x)); if (e.key === "ArrowLeft") setI((x) => (x ? x - 1 : x)); };
    window.addEventListener("keydown", tecla);
    return () => { clearTimeout(inicio); clearInterval(cada); window.removeEventListener("resize", medir); window.removeEventListener("scroll", medir, true); window.removeEventListener("keydown", tecla); };
  }, [i, pasos]);

  const p = i != null ? pasos[i] : null;
  let estilo: React.CSSProperties = { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
  if (p?.sel && caja && typeof window !== "undefined") {
    const abajo = caja.bottom + 200 < window.innerHeight, arriba = caja.top > 210;
    estilo = abajo ? { left: Math.max(12, Math.min(caja.left, window.innerWidth - 372)), top: caja.bottom + 12 }
      : arriba ? { left: Math.max(12, Math.min(caja.left, window.innerWidth - 372)), top: Math.max(12, caja.top - 200) } : { right: 16, bottom: 16 };
  }
  return (
    <>
      {todos.length > 0 && <button className="icono" onClick={abrir} data-tour="ayuda">Tutorial</button>}
      {p && <>
        {p.sel && caja ? <div className="tour-foco" style={{ left: caja.left - 6, top: Math.max(4, caja.top - 6), width: caja.width + 12, height: Math.min(caja.height + 12, window.innerHeight - Math.max(4, caja.top - 6) - 4) }} />
          : <div className="tour-velo" onClick={cerrar} />}
        <div className="tour-tarjeta" style={estilo} role="dialog" aria-label="Tutorial">
          <div className="tour-paso">{i! + 1} / {pasos.length}</div>
          <h4>{p.titulo}</h4>
          <p>{p.texto}</p>
          <div className="tour-botones">
            <button className="txt" onClick={noMostrar}>No mostrar más</button>
            <span>
              {i! > 0 && <button className="sec" onClick={() => setI(i! - 1)}>Atrás</button>}
              {i! < pasos.length - 1 ? <button onClick={() => setI(i! + 1)}>Siguiente</button> : <button onClick={cerrar}>Listo</button>}
            </span>
          </div>
          <button className="tour-cerrar" onClick={cerrar} aria-label="Cerrar el tutorial">×</button>
        </div>
      </>}
    </>
  );
}
