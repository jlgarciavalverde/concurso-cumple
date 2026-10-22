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

// ---------- Corrección de respuestas escritas ----------
// Generosa a propósito: mejor dar por buena una respuesta dudosa (el presentador puede quitarla) que
// fallar una buena por una tilde o una errata.

/** Minúsculas, sin tildes (ñ → n), sin signos; «+», «&» y comas se quedan como separadores de mezcla. */
export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " + ")
    .replace(/[^a-z0-9+, ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Palabras que no cambian la respuesta («creo que es la menta» = «menta»)
const RELLENO = new Set(
  "el la los las lo le un una unos unas de del al a en es son era seria sera sea o u que creo pienso pues igual quizas tal vez mi su sabor sabores olor gusto tipo mezcla respuesta esto eso esta este".split(" "),
);

/** Escritura «a oído»: b/v, c/z/s, k/qu, j/g, y/ll, h muda, letras repetidas, plural en -s. */
export function fonetica(palabra: string): string {
  let w = palabra
    .replace(/ph/g, "f")
    .replace(/ch/g, "X") // la ch se conserva
    .replace(/h/g, "")
    .replace(/qu([ei])/g, "k$1")
    .replace(/c([ei])/g, "s$1")
    .replace(/g([ei])/g, "j$1")
    .replace(/gu([ei])/g, "g$1")
    .replace(/[cq]/g, "k")
    .replace(/z/g, "s")
    .replace(/v/g, "b")
    .replace(/w/g, "u")
    .replace(/ll/g, "y")
    .replace(/y$/, "i")
    .replace(/(.)\1+/g, "$1")
    .replace(/X/g, "ch");
  if (w.length > 3 && w.endsWith("s")) w = w.slice(0, -1); // «carbones» ≈ «carbon» lo cubren las erratas
  return w;
}

const tokens = (s: string) =>
  s
    .split(" ")
    .filter((w) => w && !RELLENO.has(w))
    .map(fonetica)
    .filter(Boolean);

function distancia(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** Erratas permitidas según la longitud: «cazoleta» admite 2, «base» 1, «ice» ninguna. */
const tolerancia = (n: number) => (n <= 3 ? 0 : n <= 5 ? 1 : n <= 9 ? 2 : 3);

function parecido(a: string, b: string): boolean {
  if (a === b) return true;
  if (/\d/.test(a) || /\d/.test(b)) return a === b; // «Love 66» ≠ «Love 69»
  return distancia(a, b) <= tolerancia(Math.min(a.length, b.length));
}

/** Compara un elemento (sin mezclas): junto, palabra a palabra o como parte significativa. */
function elementoCoincide(resp: string[], sol: string[]): boolean {
  if (!resp.length || !sol.length) return false;
  if (parecido(resp.join(""), sol.join(""))) return true;
  const cubre = (de: string[], en: string[]) => de.every((w) => en.some((x) => parecido(w, x)));
  // «papel de aluminio grande» ⊇ «papel aluminio» (con poco texto de más)
  if (cubre(sol, resp) && resp.length <= sol.length + 2) return true;
  // «aluminio» ⊆ «papel de aluminio» si incluye la palabra más larga de la solución
  const larga = [...sol].sort((a, b) => b.length - a.length)[0];
  return cubre(resp, sol) && resp.some((w) => parecido(w, larga));
}

/** «Sandía + menta», «menta y sandía», «sandia, menta» → elementos sin orden. */
function elementos(s: string): string[][] {
  return normalizar(s)
    .split(/\s*[+,]\s*|\s+(?:y|e|con|mas)\s+/)
    .map(tokens)
    .filter((t) => t.length);
}

function unaCoincide(respuesta: string, solucion: string): boolean {
  const sol = elementos(solucion);
  if (!sol.length) return false;
  if (sol.length === 1) return elementoCoincide(tokens(normalizar(respuesta).replace(/[+,]/g, " ")), sol[0]);
  const resp = elementos(respuesta);
  if (resp.length !== sol.length) return false;
  const libres = [...resp];
  return sol.every((s) => {
    const i = libres.findIndex((r) => elementoCoincide(r, s));
    if (i < 0) return false;
    libres.splice(i, 1);
    return true;
  });
}

/** La solución admite alternativas separadas por «/». */
export function coincide(respuesta: string, solucion: string): boolean {
  if (!respuesta.trim() || solucion.includes("✏️")) return false;
  return solucion.split("/").some((s) => unaCoincide(respuesta, s));
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
