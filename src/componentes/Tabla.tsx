"use client";
import { useMemo, useState, type ReactNode } from "react";

export type Columna<T> = { titulo: string; celda: (r: T) => ReactNode; valor?: (r: T) => number | string; n?: boolean };

/** Tabla con búsqueda y orden: un clic en el encabezado ordena, otro invierte el orden. */
export function Tabla<T>({ filas, columnas, clave, buscar, orden: inicial, limite, mini, placeholder = "Buscar…" }: {
  filas: T[]; columnas: Columna<T>[]; clave: (r: T) => string; buscar?: (r: T) => string;
  orden?: { col: number; asc: boolean }; limite?: number; mini?: boolean; placeholder?: string;
}) {
  const [q, setQ] = useState(""), [orden, setOrden] = useState(inicial ?? null), [todas, setTodas] = useState(false);
  const vistas = useMemo(() => {
    const t = q.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
    let r = buscar && t ? filas.filter((f) => buscar(f).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").includes(t)) : filas;
    const c = orden ? columnas[orden.col] : null;
    if (c?.valor) {
      const v = c.valor;
      r = [...r].sort((a, b) => { const x = v(a), y = v(b); const d = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "es"); return orden!.asc ? d : -d; });
    }
    return r;
  }, [filas, columnas, q, orden, buscar]);
  const mostradas = limite && !todas ? vistas.slice(0, limite) : vistas;
  return (
    <div className="tabla-ord">
      {buscar && filas.length > 6 && <input className="tabla-buscar" type="search" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filtrar la tabla" />}
      <div className={mini ? "" : "tabla-caja"}>
        <table className={mini ? "tabla-mini" : ""}>
          <thead><tr>{columnas.map((c, i) => (
            <th key={c.titulo} className={c.n ? "n" : ""} aria-sort={orden?.col === i ? (orden.asc ? "ascending" : "descending") : undefined}>
              {c.valor ? <button className="orden" onClick={() => setOrden(orden?.col === i ? { col: i, asc: !orden.asc } : { col: i, asc: !c.n })}>{c.titulo}<span>{orden?.col === i ? (orden.asc ? "▲" : "▼") : "↕"}</span></button> : c.titulo}
            </th>))}</tr></thead>
          <tbody>{mostradas.map((f) => <tr key={clave(f)}>{columnas.map((c) => <td key={c.titulo} className={c.n ? "n" : ""}>{c.celda(f)}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {vistas.length === 0 && <p className="tenue" style={{ marginTop: 6 }}>Nada coincide con «{q}».</p>}
      {limite && vistas.length > limite && <p style={{ marginTop: 8 }}><button className="enlace-btn" onClick={() => setTodas(!todas)}>{todas ? `Ver solo ${limite}` : `Ver las ${vistas.length}`}</button></p>}
    </div>
  );
}
