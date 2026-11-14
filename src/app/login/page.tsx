import { redirect } from "next/navigation";
import { esAdmin } from "@/lib/admin";
import { iniciarSesion } from "../admin/acciones";

export const dynamic = "force-dynamic";

/** Ingreso de quien administra: carga de archivos, alertas oficiales y tarea diaria. */
export default async function Login({ searchParams }: { searchParams: Promise<{ mal?: string }> }) {
  if (await esAdmin()) redirect("/admin");
  const { mal } = await searchParams;
  return (
    <div className="pagina" style={{ maxWidth: 460 }}>
      <h1>Ingreso de administración</h1>
      <p className="sub">Para cargar archivos, ingresar alertas oficiales y ejecutar la tarea diaria. El resto del sitio es público.</p>
      {mal && <p className="aviso mal seccion" role="alert">{mal}</p>}
      <form action={iniciarSesion} className="tarjeta seccion">
        <label htmlFor="clave">Clave de administrador</label>
        <input id="clave" name="clave" type="password" required autoComplete="current-password" />
        <p style={{ marginTop: 12 }}><button className="boton" type="submit">Ingresar</button></p>
        <p className="chico" style={{ marginTop: 8 }}>Tras 5 intentos fallidos hay que esperar 15 minutos.</p>
      </form>
    </div>
  );
}
