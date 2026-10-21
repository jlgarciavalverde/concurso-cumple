import type { Contenido } from "../shared/tipos.ts";

const TIPOS = ["test", "adivinar", "precio", "cancion", "tarjetas", "manual"];

/** Comprobación básica de forma antes de guardar contenido del panel. Devuelve el error o null. */
export function validarContenido(c: unknown): string | null {
  const x = c as Contenido;
  if (!x || typeof x !== "object") return "Contenido vacío";
  if (typeof x.titulo !== "string") return "Falta el título";
  if (!Array.isArray(x.tabla) || !x.tabla.every((n) => Number.isFinite(n))) return "Tabla de puntos no válida";
  if (!Array.isArray(x.equipos) || x.equipos.length < 2 || x.equipos.length > 8) return "Entre 2 y 8 equipos";
  const ids = new Set<string>();
  for (const e of x.equipos) {
    if (!e?.id || typeof e.nombre !== "string" || typeof e.color !== "string") return "Equipo no válido";
    if (ids.has(e.id)) return `Equipo repetido: ${e.id}`;
    ids.add(e.id);
  }
  if (!Array.isArray(x.pruebas)) return "Faltan las pruebas";
  const subs = new Set<string>();
  for (const p of x.pruebas) {
    if (!p?.id || typeof p.titulo !== "string" || !Array.isArray(p.subs)) return "Prueba no válida";
    for (const s of p.subs) {
      if (!s?.id || !TIPOS.includes(s.tipo) || typeof s.titulo !== "string") return `Subprueba no válida en «${p.titulo}»`;
      if (subs.has(s.id)) return `Id de subprueba repetido: ${s.id}`;
      subs.add(s.id);
      if (s.tipo === "test" && !s.preguntas.every((q) => Array.isArray(q.opciones) && q.correcta >= 0 && q.correcta < q.opciones.length))
        return `«${s.titulo}»: hay una pregunta con la respuesta correcta fuera de las opciones`;
      if (s.tipo === "precio" && !s.productos.every((q) => Number.isFinite(q.precio))) return `«${s.titulo}»: precio no válido`;
    }
  }
  if (JSON.stringify(x).length > 1_000_000) return "Contenido demasiado grande";
  return null;
}
