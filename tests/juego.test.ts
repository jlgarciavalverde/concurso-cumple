import { describe, expect, it } from "vitest";
import { clasificar, coincide, puntosPrecio, puntosTest, totales } from "../shared/puntuacion.ts";
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
  it("plus por rapidez escalonado: 1º +0,5, 2º +0,25, resto 1; sin plus todos 1", () => {
    const r = { a: { valor: 1, ms: 900 }, b: { valor: 1, ms: 300 }, c: { valor: 0, ms: 100 }, d: { valor: 1, ms: 2000 } };
    expect(puntosTest(r, 1, [0.5, 0.25])).toEqual({ b: 1.5, a: 1.25, d: 1 });
    expect(puntosTest(r, 1, null)).toEqual({ b: 1, a: 1, d: 1 });
  });
  it("coincide ignora tildes, artículos y alternativas", () => {
    expect(coincide("  el CARBÓN ", "Carbón/Carbones")).toBe(true);
    expect(coincide("papel aluminio", "Aluminio/Papel de aluminio")).toBe(true);
    expect(coincide("", "x")).toBe(false);
    expect(coincide("menta", "Sandía")).toBe(false);
  });
  it("precio justo con y sin pasarse", () => {
    // solo el más cercano se lleva el punto (empate: los dos)
    expect(puntosPrecio({ a: 10, b: 12, c: 20, d: undefined }, 11, false)).toEqual({ a: 1, b: 1, c: 0, d: 0 });
    expect(puntosPrecio({ a: 9, b: 12, c: 20, d: 1 }, 11, false)).toEqual({ a: 0, b: 1, c: 0, d: 0 });
    expect(puntosPrecio({ a: 10, b: 12, c: 20, d: 1 }, 11, true)).toEqual({ a: 1, b: 0, c: 0, d: 0 });
  });
});

function partida() {
  let ahora = 1_000_000;
  const c = contenidoInicial();
  const j = new Juego(c, estadoVacio(), () => ahora);
  return { j, c, avanza: (ms: number) => (ahora += ms) };
}

describe("Juego", () => {
  it("kahoot: acierto + plus por rapidez, se revela solo cuando contestan todos y el marcador va en directo", () => {
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
    expect(j.estado.crudo.kahoot).toEqual({ rojo: 1.5, azul: 1.25, verde: 0, amarillo: 0 });
    expect(j.publico().bonus).toEqual({ rojo: 0.5, azul: 0.25 });
    // el marcador ya lo refleja sin confirmar nada
    expect(totales(c, j.estado)).toEqual({ rojo: 10, azul: 5, verde: 0, amarillo: 0 }); // sin aciertos, sin puntos
    j.host({ t: "siguiente" });
    expect(j.estado.vivo.fase).toBe("resultado");
    // el presentador puede fijarlos a mano y luego volver a automático
    j.host({ t: "confirmar", puntos: { rojo: 10, azul: 10, verde: 0, amarillo: 0 } });
    expect(totales(c, j.estado)).toEqual({ rojo: 10, azul: 10, verde: 0, amarillo: 0 });
    j.host({ t: "desconfirmar" });
    expect(totales(c, j.estado).azul).toBe(5);
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
    expect(j.estado.crudo.cultura.rojo).toBe(1.5); // acierto + plus del más rápido
    expect(j.equipo("azul", { t: "responder", valor: 1 })).toBe(false);
    // cultura general: 1 punto por acierto, sin tabla
    j.host({ t: "resultado" });
    expect(j.publico().ranking).toEqual({ rojo: 1.5, azul: 0, verde: 0, amarillo: 0 });
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

  it("rosco por letra: cuenta atrás por letra, cierra al responder todos y marca ✔️/❌/sin responder", () => {
    const { j, c, avanza } = partida();
    j.host({ t: "ir", subId: "rosco" });
    j.host({ t: "config", campo: "segundosItem", valor: 15 });
    const rosco = c.pruebas[1].subs[2];
    expect(rosco.tipo === "adivinar" && rosco.segundosItem).toBe(15);
    j.host({ t: "empezar" });
    expect(j.estado.vivo.fin! - j.estado.vivo.abiertaEn).toBe(15000);
    expect(j.publico().pregunta?.texto).toContain("Empieza por C");
    expect(j.publico().solucion?.respuestas?.[0]).toBe(""); // sin chivatazos
    j.equipo("rojo", { t: "item", valor: "cazoleta" });
    expect(j.equipo("rojo", { t: "item", valor: "otra" })).toBe(false); // una sola respuesta
    j.equipo("azul", { t: "item", valor: "cachimba" });
    j.equipo("verde", { t: "item", valor: "kazoleta" });
    expect(j.publico().contestados).toEqual(["rojo", "azul", "verde"]);
    expect(j.publico().hojas?.rojo.valores[0]).toBe(""); // no se ven respuestas ajenas antes de corregir
    avanza(16000);
    expect(j.tic()).toBe(true); // amarillo no contesta: se cierra por tiempo
    const p = j.publico();
    expect(p.hojas?.rojo.marcas[0]).toBe("ok");
    expect(p.hojas?.azul.marcas[0]).toBe("ko");
    expect(p.hojas?.verde.marcas[0]).toBe("ok");
    expect(p.hojas?.amarillo.marcas[0]).toBe("nada");
    expect(p.hojas?.rojo.marcas[1]).toBe(null);
    expect(p.solucion?.respuestas?.[0]).toBe("Cazoleta");
    j.host({ t: "siguiente" });
    expect(j.estado.vivo).toMatchObject({ indice: 1, fase: "jugando" });
    for (const eq of ["rojo", "azul", "verde", "amarillo"]) j.equipo(eq, { t: "item", valor: eq === "azul" ? "papel albal" : "nada" });
    expect(j.estado.vivo.fase).toBe("revelar"); // todos respondieron antes de tiempo
    expect(j.estado.crudo.rosco).toEqual({ rojo: 1, azul: 1, verde: 1, amarillo: 0 });
    j.host({ t: "correccion", equipo: "azul", item: 0, puntos: 0.5 });
    expect(j.estado.crudo.rosco.azul).toBe(1.5);
    expect(j.publico().hojas?.azul.marcas[0]).toBe("medio");
    j.host({ t: "correccion", equipo: "azul", item: 0, puntos: 1 });
    expect(j.estado.crudo.rosco.azul).toBe(2);
  });

  it("modo hoja: todo a la vez y se entrega", () => {
    const { j, c } = partida();
    const olores = c.pruebas[1].subs[0];
    if (olores.tipo !== "adivinar") throw new Error();
    olores.modo = "hoja";
    olores.items[0].respuesta = "Sandía + Menta";
    j.host({ t: "ir", subId: "olores" });
    j.host({ t: "empezar" });
    j.equipo("azul", { t: "hoja", i: 0, valor: "menta y sandia" });
    j.equipo("azul", { t: "entregar" });
    expect(j.equipo("azul", { t: "hoja", i: 1, valor: "x" })).toBe(false);
    j.host({ t: "revelar" });
    expect(j.estado.crudo.olores.azul).toBe(1);
    expect(j.publico().hojas?.azul.marcas.slice(0, 2)).toEqual(["ok", "nada"]);
  });

  it("tarjeta en la TV pero nunca en los móviles", () => {
    const { j } = partida();
    j.host({ t: "ir", subId: "dibujo" });
    j.host({ t: "turno", equipo: "verde" });
    j.host({ t: "empezar" });
    const pub = j.publico();
    expect(pub.tarjeta?.palabra).toBeTruthy();
    expect(j.vistaEquipo(pub, "verde").tarjeta).toBeUndefined();
    j.host({ t: "config", campo: "tarjetaEnTv", valor: false });
    expect(j.publico().tarjeta).toBeUndefined();
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

  it("torre de vasos: cuenta atrás y gana quien más vasos pone", () => {
    const { j } = partida();
    j.host({ t: "ir", subId: "torre" });
    j.host({ t: "empezar" });
    expect(j.publico().fin! - j.publico().abiertaEn).toBe(60000);
    j.host({ t: "crudo", equipo: "rojo", valor: 12 });
    j.host({ t: "crudo", equipo: "azul", valor: 20 });
    j.host({ t: "crudo", equipo: "verde", valor: 12 });
    expect(j.publico().ranking).toEqual({ rojo: 5, azul: 10, verde: 5, amarillo: 0 });
  });

  it("manual con cronómetro: guarda tiempos sin pararlo y menor es mejor", () => {
    const { j, c, avanza } = partida();
    const torre = c.pruebas[4].subs[0];
    Object.assign(torre, { medida: "segundos", mayorMejor: false, cronometro: true });
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

describe("marcador en directo", () => {
  it("todos a 0 no suma nada; los que siguen a 0 tampoco", () => {
    const { j, c } = partida();
    j.host({ t: "ir", subId: "rosco" });
    j.host({ t: "empezar" });
    j.host({ t: "revelar" });
    expect(totales(c, j.estado)).toEqual({ rojo: 0, azul: 0, verde: 0, amarillo: 0 });
    j.host({ t: "correccion", equipo: "verde", item: 0, puntos: 0.5 });
    expect(totales(c, j.estado)).toEqual({ rojo: 0, azul: 0, verde: 10, amarillo: 0 });
  });
});

describe("flujo", () => {
  it("volver a una prueba jugada: continuar no suma dos veces y «de cero» reinicia", () => {
    const { j } = partida();
    j.host({ t: "ir", subId: "c-rap" });
    j.host({ t: "empezar" });
    j.equipo("verde", { t: "pulsar" });
    j.host({ t: "acierto" });
    j.host({ t: "siguiente" });
    j.host({ t: "ir", subId: "kahoot" });
    j.host({ t: "ir", subId: "c-rap" });
    expect(j.estado.vivo.fase).toBe("intro");
    expect(j.estado.guardados?.["c-rap"]).toMatchObject({ indice: 1, fase: "jugando" });
    j.host({ t: "continuar" });
    expect(j.estado.vivo).toMatchObject({ subId: "c-rap", indice: 1, fase: "jugando" });
    expect(j.estado.crudo["c-rap"]).toEqual({ verde: 1 });
    // Pulsar «Empezar» desde la intro de una prueba ya jugada empieza limpia (antes sumaba dos veces)
    j.host({ t: "ir", subId: "c-rap" });
    j.host({ t: "empezar" });
    expect(j.estado.crudo["c-rap"]).toBeUndefined();
    j.host({ t: "ir", subId: "kahoot" });
    j.host({ t: "ir", subId: "c-rap" });
    j.host({ t: "deCero" });
    expect(j.estado.guardados?.["c-rap"]).toBeUndefined();
    expect(j.estado.vivo).toMatchObject({ subId: "c-rap", fase: "intro", indice: 0 });
  });

  it("siguiente prueba sigue el orden y al final vuelve al inicio", () => {
    const { j, c } = partida();
    const orden = c.pruebas.flatMap((p) => p.subs.map((s) => s.id));
    j.host({ t: "siguientePrueba" });
    expect(j.estado.vivo.subId).toBe(orden[0]);
    j.host({ t: "siguientePrueba" });
    expect(j.estado.vivo.subId).toBe(orden[1]);
    j.host({ t: "ir", subId: orden.at(-1)! });
    j.host({ t: "siguientePrueba" });
    expect(j.estado.vivo.subId).toBeNull();
  });

  it("siguiente equipo salta a los que ya han jugado", () => {
    const { j } = partida();
    j.host({ t: "ir", subId: "prohibida" });
    j.host({ t: "siguienteTurno" });
    expect(j.estado.vivo.turno).toBe("rojo");
    j.host({ t: "empezar" });
    j.host({ t: "revelar" });
    j.host({ t: "turno", equipo: "verde" });
    j.host({ t: "empezar" });
    j.host({ t: "siguienteTurno" });
    expect(j.estado.vivo.turno).toBe("amarillo");
    j.host({ t: "deshacer" });
    expect(j.estado.vivo.turno).toBe("verde"); // un solo paso de deshacer
  });

  it("el turno de tarjetas se cierra solo al acabar el tiempo", () => {
    const { j, avanza } = partida();
    j.host({ t: "ir", subId: "dibujo" });
    j.host({ t: "turno", equipo: "azul" });
    j.host({ t: "empezar" });
    avanza(61000);
    expect(j.tic()).toBe(true);
    expect(j.estado.vivo.fase).toBe("revelar");
    expect(j.publico().tarjeta).toBeUndefined();
  });

  it("precio y canción dicen quién se lleva el punto", () => {
    const { j, c } = partida();
    const precio = c.pruebas[2].subs[0];
    if (precio.tipo !== "precio") throw new Error();
    precio.productos[0].precio = 10;
    j.host({ t: "ir", subId: "precio" });
    j.host({ t: "empezar" });
    j.equipo("rojo", { t: "responder", valor: 8 });
    j.equipo("azul", { t: "responder", valor: 11 });
    j.host({ t: "revelar" });
    expect(j.publico().ganadores).toEqual(["azul"]);
    j.host({ t: "ir", subId: "c-2000" });
    j.host({ t: "empezar" });
    j.equipo("verde", { t: "pulsar" });
    j.host({ t: "acierto" });
    expect(j.publico().ganadores).toEqual(["verde"]);
  });
});
