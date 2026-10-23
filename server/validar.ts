import type { Contenido } from "../shared/tipos.ts";

const TIPOS = ["test", "adivinar", "precio", "cancion", "tarjetas", "manual", "externo"];

const segundosMal = (n: unknown) => n !== undefined && (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 600);

/** Comprobación de forma antes de guardar contenido del panel. Devuelve el error (diciendo dónde) o null. */
export function validarContenido(c: unknown): string | null {
  const x = c as Contenido;
  if (!x || typeof x !== "object") return "Contenido vacío";
  if (typeof x.titulo !== "string" || !x.titulo.trim()) return "Falta el título del concurso";
  if (!Array.isArray(x.tabla) || !x.tabla.length || !x.tabla.every((n) => Number.isFinite(n))) return "Tabla de puntos no válida";
  if (!Array.isArray(x.equipos) || x.equipos.length < 2 || x.equipos.length > 8) return "Tiene que haber entre 2 y 8 equipos";
  const ids = new Set<string>();
  const nombres = new Set<string>();
  for (const [i, e] of x.equipos.entries()) {
    if (!e?.id || typeof e.nombre !== "string" || typeof e.color !== "string") return `Equipo ${i + 1} no válido`;
    if (!e.nombre.trim()) return `El equipo ${i + 1} no tiene nombre`;
    const n = e.nombre.trim().toLocaleLowerCase("es");
    if (nombres.has(n)) return `Hay dos equipos que se llaman «${e.nombre.trim()}»`;
    if (ids.has(e.id)) return `Equipo repetido: ${e.id}`;
    if (e.miembros !== undefined && (!Array.isArray(e.miembros) || e.miembros.length > 30 || !e.miembros.every((m: unknown) => typeof m === "string" && m.length <= 60)))
      return `Los integrantes de «${e.nombre.trim()}» no son válidos`;
    ids.add(e.id);
    nombres.add(n);
  }
  if (!Array.isArray(x.pruebas)) return "Faltan las pruebas";
  const subs = new Set<string>();
  for (const p of x.pruebas) {
    if (!p?.id || typeof p.titulo !== "string" || !Array.isArray(p.subs)) return "Prueba no válida";
    for (const s of p.subs) {
      if (!s?.id || !TIPOS.includes(s.tipo) || typeof s.titulo !== "string") return `Subprueba no válida en «${p.titulo}»`;
      if (subs.has(s.id)) return `Id de subprueba repetido: ${s.id}`;
      subs.add(s.id);
      const donde = `«${s.titulo}»`;
      if ("segundos" in s && segundosMal(s.segundos)) return `${donde}: los segundos tienen que estar entre 0 y 600`;
      if (s.tipo === "adivinar" && segundosMal(s.segundosItem)) return `${donde}: los segundos por cada uno tienen que estar entre 0 y 600`;
      if (s.tipo === "cancion" && segundosMal(s.fragmento)) return `${donde}: el fragmento tiene que estar entre 0 y 600 segundos`;
      if (s.tipo === "test")
        for (const [i, q] of s.preguntas.entries()) {
          const aqui = `${donde}, pregunta ${i + 1}`;
          if (!Array.isArray(q.opciones) || q.opciones.length < 2) return `${aqui}: necesita al menos 2 opciones`;
          if (q.opciones.some((o) => typeof o !== "string" || !o.trim())) return `${aqui}: hay una opción vacía`;
          if (!Number.isInteger(q.correcta) || q.correcta < 0 || q.correcta >= q.opciones.length) return `${aqui}: la respuesta correcta no está entre las opciones`;
          if (typeof q.texto !== "string" || !q.texto.trim()) return `${aqui}: falta el texto de la pregunta`;
        }
      if (s.tipo === "precio")
        for (const [i, q] of s.productos.entries())
          if (!Number.isFinite(q.precio) || q.precio < 0) return `${donde}, producto ${i + 1}: precio no válido`;
      if (s.tipo === "tarjetas")
        for (const [i, t] of s.tarjetas.entries()) if (typeof t.palabra !== "string" || !t.palabra.trim()) return `${donde}, tarjeta ${i + 1}: falta la palabra`;
      if (s.tipo === "adivinar")
        for (const [i, it] of s.items.entries()) if (typeof it.respuesta !== "string") return `${donde}, ${it.etiqueta || `item ${i + 1}`}: falta la solución`;
    }
  }
  if (x.disfraces !== undefined) {
    const p = x.disfraces?.participantes;
    if (!Array.isArray(p) || !p.every((n) => typeof n === "string")) return "Lista de invitados no válida";
    const vistos = new Set<string>();
    for (const n of p.map((n) => n.trim()).filter(Boolean)) {
      const k = n.toLocaleLowerCase("es");
      if (vistos.has(k)) return `En la lista de invitados «${n}» está repetido (añade la inicial del apellido)`;
      vistos.add(k);
    }
  }
  if (JSON.stringify(x).length > 1_000_000) return "Contenido demasiado grande";
  return null;
}
