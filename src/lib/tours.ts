/** Recorridos de ayuda de cada sección: un ejemplo de navegación paso a paso. */
import type { Paso } from "@/componentes/Ayuda";

export const TOUR_PANEL: Paso[] = [
  { titulo: "Ejemplo: qué comunas atender hoy", texto: "El panel responde tres preguntas: dónde hay calor, si hay alerta oficial y qué medidas tomar." },
  { sel: "[data-tour=resumen]", titulo: "Estado general", texto: "Hora de la última revisión del clima y de las alertas oficiales, y cuántas discrepancias hay." },
  { sel: "[data-tour=filtros-panel]", titulo: "Filtrar y agrupar", texto: "Elige una región, agrupa por comuna, provincia o región, y ordena por nivel, personas mayores o dependientes." },
  { sel: "[data-tour=tabla-panel]", titulo: "Semáforo", texto: "Cada fila tiene el nivel de hoy y de los 5 días siguientes, la alerta oficial y el estado de alerta propio. El borde punteado marca un nivel incierto." },
  { sel: "[data-tour=activas]", titulo: "Comunas activas", texto: "Para cada comuna con nivel 1 o más: medidas, señal de urgencias y personas dependientes." },
  { sel: "[data-tour=registro]", titulo: "Registro de cambios", texto: "Cada cambio de nivel queda guardado y se descarga en CSV." },
];
export const TOUR_IMPACTO: Paso[] = [
  { titulo: "Ejemplo: ¿murió más gente en un episodio de calor?", texto: "Se revisa la Región Metropolitana en enero de 2026, día por día.", evento: { region: "13", ano: "2026", mes: "1", escala: "dia", edad: "total" } },
  { sel: "[data-tour=filtros-def]", titulo: "Filtros", texto: "Región, comuna, edad, año, mes y agrupación. Por comuna el detalle mínimo es el mes, para no identificar personas." },
  { sel: "[data-tour=grafico-def]", titulo: "Gráfico", texto: "Barras rojas: días con episodio de calor. Línea y banda: lo esperado y su rango. Borde marcado: sobre el rango. Pincha una barra para ver su detalle." },
  { sel: "[data-tour=calor-def]", titulo: "Períodos con calor", texto: "Lista de los períodos que coinciden con un episodio de calor y si las defunciones superaron el rango esperado." },
  { sel: "[data-tour=filtros-def]", titulo: "Cambiar la edad", texto: "Ahora se ven solo las personas de 80 años o más, por semana, en todo 2026.", evento: { edad: "e80_mas", escala: "semana", mes: "" } },
  { sel: "[data-tour=certificadas]", titulo: "Causa certificada por calor", texto: "Muy pocas defunciones se certifican como causadas por calor; por eso se compara con lo esperado." },
  { sel: "[data-tour=urgencias]", titulo: "Urgencias", texto: "Atenciones de 65 años o más de cada comuna frente a lo habitual." },
];
export const TOUR_ESTABLECIMIENTOS: Paso[] = [
  { titulo: "Ejemplo: hospitales con más atenciones en días de calor", texto: "La tabla muestra los establecimientos de una región y cómo cambian sus urgencias de 65 años o más en los episodios de calor." },
  { sel: "[data-tour=filtros-est]", titulo: "Filtros", texto: "Elige región, comuna y tipo, y deja solo los que tienen urgencia o los que suben en días de calor." },
  { sel: "[data-tour=tabla-est]", titulo: "Tabla", texto: "«Días de calor con alza» cuenta los días de episodio en que las atenciones de 65+ superaron en 15 % o más lo habitual." },
];
export const TOUR_PASADO: Paso[] = [
  { titulo: "Ejemplo: revisar un episodio pasado", texto: "Cada fila es un episodio: tres o más días seguidos sobre el percentil 90." },
  { sel: "[data-tour=tabla-pasado]", titulo: "Episodios", texto: "Fechas, duración, temperatura más alta y muertes observadas contra las esperadas. Pincha una cifra para ver su fuente." },
  { sel: "[data-tour=ver-niveles]", titulo: "Ver en el mapa", texto: "«Ver niveles» abre el mapa con el nivel de cada comuna en esos días." },
];
export const TOUR_FUTURO: Paso[] = [
  { titulo: "Ejemplo: qué viene", texto: "Tres horizontes: 15 días, la temporada y el clima al 2050 en la RM." },
  { sel: "[data-tour=dias]", titulo: "Próximos 15 días", texto: "Cada columna es un día y cada fila una región. El número es el nivel agregado de la región. La confianza baja hacia la derecha." },
  { sel: "[data-tour=temporada]", titulo: "Temporada", texto: "Proyección del Climate Impact Lab hasta marzo de 2027, por región. Es una proyección de un tercero, sin rango." },
  { sel: "[data-tour=clima2050]", titulo: "Al 2050 en la RM", texto: "Cambio de la temperatura de verano por comuna, según AURA." },
];
export const TOUR_DATOS: Paso[] = [
  { titulo: "Ejemplo: descargar una tabla", texto: "Todas las tablas están en CSV con su diccionario y su cita." },
  { sel: "[data-tour=manzanas]", titulo: "Manzanas prioritarias", texto: "Elige una comuna y descarga su lista de manzanas con la clase de prioridad." },
  { sel: "[data-tour=tablas]", titulo: "Tablas agregadas", texto: "Cada tarjeta dice qué trae, sus columnas y cómo citarla." },
];
export const TOUR_METODOLOGIA: Paso[] = [
  { titulo: "Ejemplo: de dónde sale una cifra", texto: "Esta página dice quién es el titular de cada dato, por qué API o descarga llega y qué se calculó." },
  { sel: "[data-tour=fuentes]", titulo: "Fuentes y conexión", texto: "Cada fuente con su titular, la API o dirección de descarga, la licencia y la cita." },
  { sel: "[data-tour=regla]", titulo: "Regla de alerta", texto: "Cuándo se pasa a aviso, alerta o alerta máxima, y los datos que la respaldan." },
];
export const TOUR_ESTADO: Paso[] = [
  { titulo: "Ejemplo: ¿están al día los datos?", texto: "Cada fuente tiene un plazo. Si se vence, se marca aquí y junto a las cifras que dependen de ella." },
  { sel: "[data-tour=tabla-estado]", titulo: "Estado por fuente", texto: "Última carga, último dato, frecuencia esperada y plazo de tolerancia." },
];
export const TOUR_COMUNA: Paso[] = [
  { titulo: "Ejemplo: leer la ficha de una comuna", texto: "La ficha reúne el nivel, el pronóstico, el impacto en salud y la población vulnerable." },
  { sel: "[data-tour=nivel]", titulo: "Nivel y alerta", texto: "A la izquierda, el nivel estimado y el estado de alerta propio; a la derecha, la alerta oficial." },
  { sel: "[data-tour=pronostico]", titulo: "Pronóstico", texto: "Nivel y temperatura de hoy y de los días siguientes, con su confianza." },
  { sel: "[data-tour=impacto]", titulo: "Impacto observado", texto: "Defunciones del último mes y señal de urgencias frente a lo habitual." },
  { sel: "[data-tour=vulnerable]", titulo: "Población vulnerable", texto: "Personas mayores, manzanas prioritarias y personas dependientes por centro de salud." },
];
