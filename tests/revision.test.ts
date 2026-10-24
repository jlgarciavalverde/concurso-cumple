import { describe, expect, it } from "vitest";
import { contenidoInicial } from "../server/contenido-inicial.ts";
import { preparacion, revisarSub } from "../shared/revision.ts";
import type { Sub } from "../shared/tipos.ts";

const subs = () => contenidoInicial().pruebas.flatMap((p) => p.subs);
const de = (id: string) => subs().find((s) => s.id === id)!;

describe("¿Está todo listo?", () => {
  it("el contenido de fábrica marca lo que hay que rellenar", () => {
    expect(revisarSub(de("kahoot"))).toEqual([]); // el del cumpleañero: el PIN se pone el día
    const propias = de("kahoot");
    if (propias.tipo !== "externo" || !propias.respaldo) throw new Error();
    expect(revisarSub(propias.respaldo)).toEqual(["15 preguntas sin escribir", "15 preguntas con respuestas sin rellenar"]);
    expect(revisarSub(de("olores"))).toEqual(["5 mezclas sin solución"]);
    expect(revisarSub(de("sabor"))).toEqual(["3 cachimbas sin solución"]);
    expect(revisarSub(de("precio"))).toEqual(["6 productos sin nombre", "6 productos con precio 0"]);
    expect(revisarSub(de("c-rap"))).toEqual([]); // sin audio: la pone el presentador desde su móvil
    expect(revisarSub({ ...de("c-rap"), sonido: "tv" } as Sub)).toEqual(["10 de 10 canciones sin audio (ni MP3 ni Spotify)"]);
    expect(revisarSub(de("sorpresa"))).toEqual(["falta explicar en qué consiste"]);
    // Lo que ya viene hecho
    for (const id of ["cultura", "rosco", "torre", "dibujo", "prohibida", "kahoot"]) expect([id, revisarSub(de(id))]).toEqual([id, []]);
  });

  it("al rellenarlo queda lista", () => {
    const ext = de("kahoot");
    if (ext.tipo !== "externo" || ext.respaldo?.tipo !== "test") throw new Error();
    const k = ext.respaldo;
    k.preguntas = [{ texto: "¿Su primer coche?", opciones: ["Seat Ibiza", "Clio", "Corsa", "Golf"], correcta: 0 }];
    expect(revisarSub(k)).toEqual([]);
    const p = de("precio");
    if (p.tipo !== "precio") throw new Error();
    p.productos = [{ nombre: "Cachimba", precio: 120 }];
    expect(revisarSub(p)).toEqual([]);
  });

  it("la lista de preparación sale del contenido", () => {
    const l = preparacion(contenidoInicial());
    expect(l.join("\n")).toMatch(/5 cachimbas o boles preparados y numerados \(Mezcla 1, Mezcla 2/);
    expect(l.join("\n")).toMatch(/vasos de plástico/);
    expect(l.join("\n")).toMatch(/papel grande o pizarra/);
    expect(l.join("\n")).toMatch(/Un móvil por equipo \(5 equipos\)/);
  });
});
