import { describe, expect, it } from "vitest";
import { clasificar, coincide, puntosPrecio, puntosRapidez, totales } from "../shared/puntuacion.ts";
import { contenidoInicial } from "../server/contenido-inicial.ts";
import { estadoVacio, Juego } from "../server/juego.ts";

const T = [10, 5, 3, 1];

describe("clasificar", () => {
  it("reparte 10/5/3/1", () => {
    expect(clasificar({ a: 4, b: 9, c: 1, d: 6 }, T)).toEqual({ a: 3, b: 10, c: 1, d: 5 });
  });
  it("empates comparten puesto y saltan el siguiente", () => {
    expect(clasificar({ a: 5, b: 5, c: 2, d: 1 }, T)).toEqual({ a: 10, b: 10, c: 3, d: 1 });
    expect(clasificar({ a: 5, b: 3, c: 3, d: 1 }, T)).toEqual({ a: 10, b: 5, c: 5, d: 1 });
  });
  it("menor es mejor y sin marca no puntúa", () => {
    expect(clasificar({ a: 30.2, b: 25, c: null, d: 41 }, T, false)).toEqual({ a: 5, b: 10, c: 0, d: 3 });
  });
});

describe("reglas", () => {
  it("rapidez: 1000 al instante, 500 al límite", () => {
    expect(puntosRapidez(0, 20)).toBe(1000);
    expect(puntosRapidez(20000, 20)).toBe(500);
    expect(puntosRapidez(99999, 20)).toBe(500);
  });
  it("coincide ignora tildes, artículos y alternativas", () => {
    expect(coincide("  el CARBÓN ", "Carbón/Carbones")).toBe(true);
    expect(coincide("papel aluminio", "Aluminio/Papel de aluminio")).toBe(true);
    expect(coincide("", "x")).toBe(false);
    expect(coincide("menta", "Sandía")).toBe(false);
  });
  it("precio justo con y sin pasarse", () => {
    expect(puntosPrecio({ a: 10, b: 12, c: 20, d: undefined }, 11, false)).toEqual({ a: 3, b: 3, c: 1, d: 0 });
    expect(puntosPrecio({ a: 10, b: 12, c: 20, d: 1 }, 11, true)).toEqual({ a: 3, b: 0, c: 0, d: 2 });
  });
});

function partida() {
  let ahora = 1_000_000;
  const c = contenidoInicial();
  const j = new Juego(c, estadoVacio(), () => ahora);
  return { j, c, avanza: (ms: number) => (ahora += ms) };
}

describe("Juego", () => {
  it("kahoot: puntúa por rapidez, se revela solo cuando contestan todos y confirma 10/5/3/1", () => {
    const { j, c, avanza } = partida();
    const sub = c.pruebas[0].subs[0];
    if (sub.tipo !== "test") throw new Error();
    sub.preguntas = [{ texto: "x", opciones: ["a", "b", "c", "d"], correcta: 2 }];
    j.host({ t: "ir", subId: "kahoot" });
    j.host({ t: "empezar" });
    j.equipo("rojo", { t: "responder", valor: 2 });
    avanza(10000);
    j.equipo("azul", { t: "responder", valor: 2 });
    expect(j.equipo("azul", { t: "responder", valor: 1 })).toBe(false); // no se cambia
    j.equipo("verde", { t: "responder", valor: 0 });
    expect(j.estado.vivo.fase).toBe("jugando");
    j.equipo("amarillo", { t: "responder", valor: 3 });
    expect(j.estado.vivo.fase).toBe("revelar");
    expect(j.estado.crudo.kahoot).toEqual({ rojo: 1000, azul: 750, verde: 0, amarillo: 0 });
    j.host({ t: "siguiente" });
    expect(j.estado.vivo.fase).toBe("resultado");
    const pub = j.publico();
    expect(pub.ranking).toEqual({ rojo: 10, azul: 5, verde: 3, amarillo: 3 });
    j.host({ t: "confirmar", puntos: pub.ranking! });
    expect(totales(c, j.estado)).toEqual({ rojo: 10, azul: 5, verde: 3, amarillo: 3 });
  });

  it("no revela la respuesta correcta antes de tiempo y cierra al acabar el tiempo", () => {
    const { j, avanza } = partida();
    j.host({ t: "ir", subId: "cultura" });
    j.host({ t: "empezar" });
    expect(j.publico().solucion).toBeUndefined();
    j.equipo("rojo", { t: "responder", valor: 1 });
    avanza(21000);
    expect(j.tic()).toBe(true);
    expect(j.publico().solucion?.correcta).toBe(1);
    expect(j.estado.crudo.cultura.rojo).toBe(1);
    expect(j.equipo("azul", { t: "responder", valor: 1 })).toBe(false);
    // cultura general: 1 punto por acierto, sin tabla
    j.host({ t: "resultado" });
    expect(j.publico().ranking).toEqual({ rojo: 1, azul: 0, verde: 0, amarillo: 0 });
  });

  it("pulsador: gana el primero, fallo rebota y acierto suma", () => {
    const { j } = partida();
    j.host({ t: "ir", subId: "c-rap" });
    j.host({ t: "empezar" });
    expect(j.estado.vivo.sonando).toBe(true);
    expect(j.equipo("verde", { t: "pulsar" })).toBe(true);
    expect(j.equipo("rojo", { t: "pulsar" })).toBe(false);
    expect(j.estado.vivo.sonando).toBe(false);
    j.host({ t: "fallo" });
    expect(j.equipo("verde", { t: "pulsar" })).toBe(false); // bloqueado
    expect(j.equipo("rojo", { t: "pulsar" })).toBe(true);
    j.host({ t: "acierto" });
    expect(j.estado.crudo["c-rap"]).toEqual({ rojo: 1 });
    expect(j.publico().solucion?.texto).toContain("Mazas");
    j.host({ t: "siguiente" });
    expect(j.estado.vivo).toMatchObject({ indice: 1, fase: "jugando", pulsado: null, bloqueados: [] });
  });

  it("rosco: corrige solo y el presentador puede enmendar", () => {
    const { j } = partida();
    j.host({ t: "ir", subId: "rosco" });
    j.host({ t: "empezar" });
    j.equipo("azul", { t: "hoja", i: 0, valor: "cazoleta" });
    j.equipo("azul", { t: "hoja", i: 3, valor: "jukah" });
    j.equipo("azul", { t: "entregar" });
    expect(j.equipo("azul", { t: "hoja", i: 1, valor: "aluminio" })).toBe(false);
    expect(j.publico().hojas?.azul).toEqual({ entregada: true, contestadas: 2 });
    j.host({ t: "revelar" });
    expect(j.estado.crudo.rosco.azul).toBe(1);
    j.host({ t: "correccion", equipo: "azul", item: 3, ok: true });
    expect(j.estado.crudo.rosco.azul).toBe(2);
  });

  it("tarjetas: turno, aciertos y sin repetir tarjeta", () => {
    const { j } = partida();
    j.host({ t: "ir", subId: "prohibida" });
    j.host({ t: "empezar" });
    expect(j.estado.vivo.fase).toBe("intro"); // sin turno no empieza
    j.host({ t: "turno", equipo: "rojo" });
    j.host({ t: "empezar" });
    const vistas = new Set<number>();
    for (let i = 0; i < 5; i++) {
      vistas.add(j.estado.vivo.tarjeta);
      j.host({ t: i % 2 ? "pasar" : "acierto" });
    }
    expect(vistas.size).toBe(5);
    expect(j.estado.crudo.prohibida.rojo).toBe(3);
  });

  it("manual con cronómetro: guarda tiempos sin pararlo y menor es mejor", () => {
    const { j, avanza } = partida();
    j.host({ t: "ir", subId: "torre" });
    j.host({ t: "crono", op: "start" });
    avanza(12340);
    j.host({ t: "crono", op: "guardar", equipo: "verde" });
    avanza(5000);
    j.host({ t: "crono", op: "guardar", equipo: "rojo" });
    expect(j.estado.crudo.torre).toEqual({ verde: 12.3, rojo: 17.3 });
    expect(j.publico().ranking).toEqual({ rojo: 5, azul: 0, verde: 10, amarillo: 0 });
  });

  it("deshacer vuelve al estado anterior y los ajustes suman", () => {
    const { j, c } = partida();
    j.host({ t: "ajuste", equipo: "azul", puntos: 2, motivo: "bonus" });
    j.host({ t: "ajuste", equipo: "azul", puntos: -5, motivo: "trampa" });
    expect(totales(c, j.estado).azul).toBe(-3);
    j.host({ t: "deshacer" });
    expect(totales(c, j.estado).azul).toBe(2);
  });

  it("agrupar: la prueba reparte la tabla sobre la suma de sus subpruebas", () => {
    const { j, c } = partida();
    c.pruebas[1].agrupar = true;
    j.host({ t: "ir", subId: "olores" });
    j.host({ t: "confirmar", puntos: { rojo: 10, azul: 5, verde: 3, amarillo: 1 } });
    j.host({ t: "ir", subId: "sabor" });
    j.host({ t: "confirmar", puntos: { rojo: 1, azul: 10, verde: 5, amarillo: 3 } });
    expect(totales(c, j.estado)).toEqual({ azul: 10, rojo: 5, verde: 3, amarillo: 1 });
  });
});
