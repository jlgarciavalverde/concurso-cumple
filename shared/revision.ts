// Qué le falta a cada ronda para estar lista y qué hay que preparar en físico. Lo usan /admin y el panel.
import { sonidoCancion, type Contenido, type Sub } from "./tipos.ts";

const PLANTILLA = "✏️";
const vacio = (s: string | undefined) => !s || !s.trim() || s.includes(PLANTILLA);
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Lista de lo que falta en una ronda, en lenguaje normal (vacía = lista para jugar). */
export function revisarSub(s: Sub): string[] {
  const falta: string[] = [];
  switch (s.tipo) {
    case "test": {
      if (!s.preguntas.length) falta.push("no tiene preguntas");
      const sinTexto = s.preguntas.filter((q) => vacio(q.texto)).length;
      const sinOpciones = s.preguntas.filter((q) => q.opciones.some(vacio)).length;
      if (sinTexto) falta.push(`${plural(sinTexto, "pregunta", "preguntas")} sin escribir`);
      if (sinOpciones) falta.push(`${plural(sinOpciones, "pregunta", "preguntas")} con respuestas sin rellenar`);
      break;
    }
    case "adivinar": {
      const cachimbas = /^cachimba/i.test(s.items[0]?.etiqueta ?? "");
      const nombre = s.estilo === "rosco" ? ["letra", "letras"] : cachimbas ? ["cachimba", "cachimbas"] : ["mezcla", "mezclas"];
      const sinSol = s.items.filter((it) => vacio(it.respuesta)).length;
      if (!s.items.length) falta.push(`no tiene ${nombre[1]}`);
      if (sinSol) falta.push(`${plural(sinSol, nombre[0], nombre[1])} sin solución`);
      if (s.estilo === "rosco") {
        const sinPregunta = s.items.filter((it) => vacio(it.pregunta)).length;
        if (sinPregunta) falta.push(`${plural(sinPregunta, "letra", "letras")} sin pregunta`);
      }
      break;
    }
    case "precio": {
      if (!s.productos.length) falta.push("no tiene productos");
      const sinNombre = s.productos.filter((p) => vacio(p.nombre)).length;
      const sinPrecio = s.productos.filter((p) => !p.precio).length;
      if (sinNombre) falta.push(`${plural(sinNombre, "producto", "productos")} sin nombre`);
      if (sinPrecio) falta.push(`${plural(sinPrecio, "producto", "productos")} con precio 0`);
      break;
    }
    case "cancion": {
      if (!s.canciones.length) falta.push("no tiene canciones");
      const sinMp3 = s.canciones.filter((c) => !c.audio && !c.spotify).length;
      const sinTitulo = s.canciones.filter((c) => vacio(c.titulo)).length;
      if (sinMp3 && sonidoCancion(s) === "tv") falta.push(`${sinMp3} de ${s.canciones.length} canciones sin audio (ni MP3 ni Spotify)`);
      if (sinTitulo) falta.push(`${plural(sinTitulo, "canción", "canciones")} sin título`);
      break;
    }
    case "tarjetas": {
      const validas = s.tarjetas.filter((t) => !vacio(t.palabra)).length;
      if (validas < 8) falta.push(`solo ${plural(validas, "tarjeta", "tarjetas")} (mejor 8 o más para 4 equipos)`);
      if (s.modo === "palabra") {
        const pocas = s.tarjetas.filter((t) => (t.prohibidas ?? []).filter((x) => x.trim()).length < 3).length;
        if (pocas) falta.push(`${plural(pocas, "tarjeta", "tarjetas")} con menos de 3 palabras prohibidas`);
      }
      break;
    }
    case "manual":
      if (vacio(s.descripcion)) falta.push("falta explicar en qué consiste");
      break;
    case "externo":
      break; // el PIN se pone el día, en el panel
  }
  if (vacio(s.titulo)) falta.unshift("falta el título");
  return falta;
}

/** Lo que hay que tener preparado el día (sale del contenido actual). */
export function preparacion(c: Contenido): string[] {
  const subs = c.pruebas.flatMap((p) => p.subs);
  const lista: string[] = [
    "Un portátil conectado a la TV, con el lanzador «Concurso TV» (o Chrome en la dirección /tv)",
    `Un móvil por equipo (${c.equipos.length} equipos) con internet`,
    "El móvil del presentador (entra en /presentador con el PIN)",
  ];
  for (const s of subs) {
    if (s.tipo === "adivinar" && s.estilo !== "rosco")
      lista.push(`«${s.titulo}»: ${plural(s.items.length, "cachimba o bol preparado", "cachimbas o boles preparados")} y numerados (${s.items.map((i) => i.etiqueta).join(", ")})`);
    if (s.tipo === "precio") lista.push(`«${s.titulo}»: los ${s.productos.length} productos (o sus fotos subidas aquí)`);
    if (s.tipo === "manual" && /vaso/i.test(s.titulo + (s.descripcion ?? ""))) lista.push(`«${s.titulo}»: vasos de plástico (unos 100, iguales) y una mesa despejada`);
    if (s.tipo === "tarjetas" && s.modo === "dibujo") lista.push(`«${s.titulo}»: papel grande o pizarra y rotuladores`);
    if (s.tipo === "manual" && !/vaso/i.test(s.titulo + (s.descripcion ?? ""))) lista.push(`«${s.titulo}»: lo que necesite la prueba (${s.descripcion?.includes(PLANTILLA) ? "aún sin explicar" : s.descripcion ?? ""})`);
  }
  if (subs.some((s) => s.tipo === "externo"))
    lista.push("El cumpleañero con su Kahoot listo para lanzarlo desde su cuenta (al lanzarlo sale un PIN: se escribe en el panel del presentador y la TV lo enseña)");
  if (c.disfraces?.participantes.length) lista.push(`Concurso de disfraces: cada invitado vota con su móvil (${c.disfraces.participantes.length} en la lista)`);
  if (subs.some((s) => s.tipo === "cancion" && sonidoCancion(s) === "tv" && s.canciones.some((x) => x.spotify))) lista.push("Spotify conectado en /admin y la TV abierta con el lanzador (hace de reproductor)");
  const canciones = subs.filter((s): s is Extract<Sub, { tipo: "cancion" }> => s.tipo === "cancion");
  if (canciones.some((s) => sonidoCancion(s) === "tv")) lista.push("Altavoz o el sonido de la TV a buen volumen (la música sale por la TV)");
  if (canciones.some((s) => sonidoCancion(s) === "presentador"))
    lista.push("El móvil del presentador con Spotify y conectado a un altavoz (Bluetooth o la TV): pone él cada canción y el panel le dice cuál");
  return lista;
}

/** Lo que le falta al concurso de disfraces. */
export function revisarDisfraces(c: Contenido): string[] {
  const n = (c.disfraces?.participantes ?? []).filter((x) => x.trim()).length;
  if (!n) return ["falta la lista de invitados (uno por línea)"];
  if (n < 2) return ["hacen falta al menos 2 personas"];
  const nombres = (c.disfraces?.participantes ?? []).map((x) => x.trim().toLocaleLowerCase("es")).filter(Boolean);
  if (new Set(nombres).size !== nombres.length) return ["hay nombres repetidos (añade la inicial del apellido para distinguirlos)"];
  return [];
}
