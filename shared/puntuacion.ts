import type { Contenido, Estado, EquipoId, Prueba, Sub } from "./tipos.ts";

/**
 * Reparte la tabla (10/5/3/1) según el valor de cada equipo. Empates comparten puesto y puntos,
 * y el siguiente puesto se salta (1, 1, 3, 4). Sin valor (null) → 0 puntos.
 */
export function clasificar(
  valores: Record<EquipoId, number | null | undefined>,
  tabla: number[],
  mayorMejor = true,
): Record<EquipoId, number> {
  const ids = Object.keys(valores);
  const validos = ids.filter((id) => typeof valores[id] === "number" && Number.isFinite(valores[id]));
  const out: Record<EquipoId, number> = {};
  for (const id of ids) out[id] = 0;
  for (const id of validos) {
    const v = valores[id] as number;
    const mejores = validos.filter((o) => (mayorMejor ? (valores[o] as number) > v : (valores[o] as number) < v)).length;
    out[id] = tabla[mejores] ?? 0;
  }
  return out;
}

/** Kahoot: 1000 si contestas al instante, 500 al límite; 0 si fallas. */
export function puntosRapidez(ms: number, segundos: number): number {
  const t = Math.min(Math.max(ms / (segundos * 1000), 0), 1);
  return Math.round(1000 * (1 - t / 2));
}

export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]/g, " ")
    .replace(/\b(el|la|los|las|un|una|de|del)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** La solución admite alternativas separadas por «/». */
export function coincide(respuesta: string, solucion: string): boolean {
  const r = normalizar(respuesta);
  if (!r) return false;
  return solucion.split("/").some((s) => normalizar(s) === r);
}

/**
 * Precio justo: 3/2/1/0 por cercanía en cada producto. Con «sin pasarse», quien se pasa no puntúa.
 */
export function puntosPrecio(ofertas: Record<EquipoId, number | undefined>, precio: number, sinPasarse: boolean): Record<EquipoId, number> {
  const distancias: Record<EquipoId, number | null> = {};
  for (const [id, v] of Object.entries(ofertas)) {
    if (typeof v !== "number" || !Number.isFinite(v)) distancias[id] = null;
    else if (sinPasarse && v > precio) distancias[id] = null;
    else distancias[id] = Math.abs(precio - v);
  }
  return clasificar(distancias, [3, 2, 1, 0], false);
}

/** Puntos que daría una sub según su crudo actual (antes de confirmar). */
export function puntosPropuestos(sub: Sub, crudo: Record<EquipoId, number>, equipos: EquipoId[], tabla: number[]): Record<EquipoId, number> {
  const valores: Record<EquipoId, number | null> = {};
  for (const id of equipos) valores[id] = crudo[id] ?? null;
  if (sub.tipo === "test" && sub.puntuacion === "aciertos") {
    const out: Record<EquipoId, number> = {};
    for (const id of equipos) out[id] = crudo[id] ?? 0;
    return out;
  }
  // En manual sin medida numérica (p. ej. tiempo), quien no tiene marca no puntúa
  const mayorMejor = sub.tipo === "manual" ? sub.mayorMejor : true;
  if (sub.tipo !== "manual") for (const id of equipos) valores[id] = crudo[id] ?? 0;
  return clasificar(valores, tabla, mayorMejor);
}

/** Puntos de una prueba ya confirmados (con «agrupar» se reparte la tabla sobre la suma). */
export function puntosPrueba(prueba: Prueba, estado: Estado, equipos: EquipoId[], tabla: number[]): Record<EquipoId, number> {
  const suma: Record<EquipoId, number> = {};
  for (const id of equipos) suma[id] = 0;
  let alguna = false;
  for (const sub of prueba.subs) {
    const p = estado.puntos[sub.id];
    if (!p) continue;
    alguna = true;
    for (const id of equipos) suma[id] += p[id] ?? 0;
  }
  if (!prueba.agrupar || !alguna) return suma;
  return clasificar(suma, tabla, true);
}

export function desglose(contenido: Contenido, estado: Estado) {
  const ids = contenido.equipos.map((e) => e.id);
  const filas = contenido.pruebas.map((p) => ({ pruebaId: p.id, titulo: p.titulo, emoji: p.emoji, puntos: puntosPrueba(p, estado, ids, contenido.tabla) }));
  const ajustes: Record<EquipoId, number> = {};
  for (const id of ids) ajustes[id] = 0;
  for (const a of estado.ajustes) if (a.equipo in ajustes) ajustes[a.equipo] += a.puntos;
  if (estado.ajustes.length) filas.push({ pruebaId: "ajustes", titulo: "Ajustes", emoji: "✏️", puntos: ajustes });
  return filas;
}

export function totales(contenido: Contenido, estado: Estado): Record<EquipoId, number> {
  const out: Record<EquipoId, number> = {};
  for (const e of contenido.equipos) out[e.id] = 0;
  for (const f of desglose(contenido, estado)) for (const id in out) out[id] += f.puntos[id] ?? 0;
  return out;
}
