// Matriz de casos raros por prueba: lo que puede pasar el día del cumple.
import { describe, expect, it } from "vitest";
import { leerPrecio, totales } from "../shared/puntuacion.ts";
import { contenidoInicial } from "../server/contenido-inicial.ts";
import { estadoVacio, Juego } from "../server/juego.ts";
import { validarContenido } from "../server/validar.ts";
import type { Sub } from "../shared/tipos.ts";

const EQ = ["rojo", "azul", "verde", "amarillo"];

function partida() {
  let ahora = 1_000_000;
  const c = contenidoInicial();
  const j = new Juego(c, estadoVacio(), () => ahora);
  const sub = <T extends Sub["tipo"]>(id: string, _t: T) => c.pruebas.flatMap((p) => p.subs).find((s) => s.id === id) as Extract<Sub, { tipo: T }>;
  return { j, c, sub, avanza: (ms: number) => (ahora += ms) };
}

describe("Kahoot / cultura general", () => {
  it("nadie responde: se cierra por tiempo y nadie suma", () => {
    const { j, c, avanza } = partida();
    j.host({ t: "ir", subId: "cultura" });
    j.host({ t: "empezar" });
    avanza(20_600);
    expect(j.tic()).toBe(true);
    expect(j.publico().solucion?.correcta).toBeDefined();
    expect(totales(c, j.estado)).toEqual({ rojo: 0, azul: 0, verde: 0, amarillo: 0 });
  });

  it("todos fallan: nadie suma ni hay plus", () => {
    const { j, c } = partida();
    j.host({ t: "ir", subId: "cultura" });
    j.host({ t: "empezar" });
    for (const e of EQ) j.equipo(e, { t: "responder", valor: 0 }); // la correcta es la 1
    expect(j.estado.vivo.fase).toBe("revelar");
    expect(j.publico().bonus).toEqual({});
    expect(totales(c, j.estado)).toEqual({ rojo: 0, azul: 0, verde: 0, amarillo: 0 });
  });

  it("dos móviles del mismo equipo: vale la primera respuesta", () => {
    const { j } = partida();
    j.host({ t: "ir", subId: "cultura" });
    j.host({ t: "empezar" });
    expect(j.equipo("rojo", { t: "responder", valor: 1 })).toBe(true);
    expect(j.equipo("rojo", { t: "responder", valor: 2 })).toBe(false);
    expect(j.estado.vivo.respuestas.rojo.valor).toBe(1);
  });

  it("fuera de tiempo: medio segundo de margen sí, un segundo no", () => {
    const { j, avanza } = partida();
    j.host({ t: "ir", subId: "cultura" });
    j.host({ t: "empezar" });
    avanza(20_400);
    expect(j.equipo("rojo", { t: "responder", valor: 1 })).toBe(true);
    avanza(600);
    expect(j.equipo("azul", { t: "responder", valor: 1 })).toBe(false);
  });

  it("opción inexistente o valor raro: se ignora", () => {
    const { j } = partida();
    j.host({ t: "ir", subId: "cultura" });
    j.host({ t: "empezar" });
    for (const valor of [7, -1, 1.5, NaN]) expect(j.equipo("rojo", { t: "responder", valor })).toBe(false);
  });

  it("plus desactivado a mitad de pregunta: se aplica al revelar", () => {
    const { j } = partida();
    j.host({ t: "ir", subId: "cultura" });
    j.host({ t: "empezar" });
    j.equipo("rojo", { t: "responder", valor: 1 });
    j.host({ t: "config", campo: "rapidez", valor: false });
    j.host({ t: "revelar" });
    expect(j.estado.crudo.cultura.rojo).toBe(1);
  });

  it("preguntas de 2 y 3 opciones", () => {
    const { j, sub } = partida();
    const k = sub("kahoot", "test");
    k.preguntas = [
      { texto: "¿Sí o no?", opciones: ["Sí", "No"], correcta: 1 },
      { texto: "¿Cuál?", opciones: ["a", "b", "c"], correcta: 2 },
    ];
    j.host({ t: "ir", subId: "kahoot" });
    j.host({ t: "empezar" });
    expect(j.publico().pregunta?.opciones).toHaveLength(2);
    expect(j.equipo("rojo", { t: "responder", valor: 2 })).toBe(false); // no existe la C
    j.equipo("rojo", { t: "responder", valor: 1 });
    j.host({ t: "siguiente" });
    j.host({ t: "siguiente" });
    expect(j.publico().pregunta?.opciones).toHaveLength(3);
  });
});

describe("Precio justo", () => {
  it("lee precios como los escribe la gente", () => {
    const casos: [string, number | null][] = [
      ["12", 12], ["12,5", 12.5], ["12.50", 12.5], ["1.000", 1000], ["1.000,50", 1000.5], ["1 000 €", 1000], ["1,000.50", 1000.5],
      ["0,99", 0.99], ["12.000.000", 12_000_000], ["15€", 15], ["abc", null], ["-5", null], ["", null], ["1.00.0", null], ["   ", null],
    ];
    for (const [txt, n] of casos) expect([txt, leerPrecio(txt)]).toEqual([txt, n]);
  });

  it("nadie responde: nadie se lleva el punto", () => {
    const { j, sub } = partida();
    sub("precio", "precio").productos[0].precio = 10;
    j.host({ t: "ir", subId: "precio" });
    j.host({ t: "empezar" });
    j.host({ t: "revelar" });
    expect(j.publico().ganadores).toEqual([]);
    expect(j.estado.crudo.precio ?? {}).toEqual({ rojo: 0, azul: 0, verde: 0, amarillo: 0 });
  });

  it("empate exacto: se lo llevan los dos", () => {
    const { j, sub } = partida();
    sub("precio", "precio").productos[0].precio = 10;
    j.host({ t: "ir", subId: "precio" });
    j.host({ t: "empezar" });
    j.equipo("rojo", { t: "responder", valor: 9 });
    j.equipo("azul", { t: "responder", valor: 11 });
    j.equipo("verde", { t: "responder", valor: 30 });
    j.host({ t: "revelar" });
    expect(j.publico().ganadores?.sort()).toEqual(["azul", "rojo"]);
  });

  it("sin pasarse y todos se pasan: nadie puntúa", () => {
    const { j, sub } = partida();
    const s = sub("precio", "precio");
    s.sinPasarse = true;
    s.productos[0].precio = 10;
    j.host({ t: "ir", subId: "precio" });
    j.host({ t: "empezar" });
    for (const e of EQ) j.equipo(e, { t: "responder", valor: 11 });
    j.host({ t: "revelar" });
    expect(j.publico().ganadores).toEqual([]);
  });

  it("cambian el precio varias veces: vale el último", () => {
    const { j, sub } = partida();
    sub("precio", "precio").productos[0].precio = 10;
    j.host({ t: "ir", subId: "precio" });
    j.host({ t: "empezar" });
    j.equipo("rojo", { t: "responder", valor: 50 });
    j.equipo("rojo", { t: "responder", valor: 10 });
    j.equipo("azul", { t: "responder", valor: 12 });
    j.host({ t: "revelar" });
    expect(j.publico().ganadores).toEqual(["rojo"]);
    expect(j.equipo("rojo", { t: "responder", valor: -3 })).toBe(false);
  });
});

describe("Olores / sabor / rosco", () => {
  function rosco() {
    const r = partida();
    r.j.host({ t: "ir", subId: "rosco" });
    r.j.host({ t: "empezar" });
    return r;
  }

  it("respuesta vacía o con espacios no cuenta como respondida", () => {
    const { j } = rosco();
    expect(j.equipo("rojo", { t: "item", valor: "" })).toBe(false);
    expect(j.equipo("rojo", { t: "item", valor: "    " })).toBe(false);
    expect(j.publico().contestados).toEqual([]);
  });

  it("respuesta larguísima se recorta y no rompe nada", () => {
    const { j } = rosco();
    j.equipo("rojo", { t: "item", valor: "cazoleta ".repeat(20) });
    expect(j.estado.vivo.hojas.rojo.valores[0].length).toBeLessThanOrEqual(60);
  });

  it("no se puede responder dos veces la misma letra", () => {
    const { j } = rosco();
    expect(j.equipo("rojo", { t: "item", valor: "base" })).toBe(true);
    expect(j.equipo("rojo", { t: "item", valor: "cazoleta" })).toBe(false);
  });

  it("nadie responde: todos ⚫ y nadie suma", () => {
    const { j, avanza } = rosco();
    avanza(21_000);
    j.tic();
    expect(EQ.map((e) => j.publico().hojas?.[e].marcas[0])).toEqual(["nada", "nada", "nada", "nada"]);
  });

  it("mezcla en otro orden y sabor a medias con ½", () => {
    const { j, sub } = partida();
    const o = sub("olores", "adivinar");
    o.items[0].respuesta = "Sandía + Menta";
    j.host({ t: "ir", subId: "olores" });
    j.host({ t: "empezar" });
    j.equipo("rojo", { t: "item", valor: "menta y sandia" });
    j.equipo("azul", { t: "item", valor: "sandía" });
    j.host({ t: "revelar" });
    expect(j.publico().hojas?.rojo.marcas[0]).toBe("ok");
    expect(j.publico().hojas?.azul.marcas[0]).toBe("ko");
    j.host({ t: "correccion", equipo: "azul", item: 0, puntos: 0.5 });
    expect(j.publico().hojas?.azul.marcas[0]).toBe("medio");
    expect(j.estado.crudo.olores.azul).toBe(0.5);
  });

  it("solución sin rellenar: nunca se da por buena sola y la TV no enseña el lápiz", () => {
    const { j } = partida();
    j.host({ t: "ir", subId: "olores" });
    j.host({ t: "empezar" });
    j.equipo("rojo", { t: "item", valor: "✏️" });
    j.host({ t: "revelar" });
    expect(j.publico().hojas?.rojo.marcas[0]).toBe("ko");
    expect(j.publico().solucion?.respuestas?.[0]).toBe("(sin solución puesta)");
  });
});

describe("Canción", () => {
  function cancion() {
    const r = partida();
    r.j.host({ t: "ir", subId: "c-2000" });
    r.j.host({ t: "empezar" });
    return r;
  }

  it("pulsan dos a la vez: gana el primero que llega", () => {
    const { j } = cancion();
    expect(j.equipo("azul", { t: "pulsar" })).toBe(true);
    expect(j.equipo("rojo", { t: "pulsar" })).toBe(false);
    expect(j.estado.vivo.pulsado).toBe("azul");
  });

  it("fallan todos: se revela sola y nadie suma", () => {
    const { j } = cancion();
    for (const e of EQ) {
      j.equipo(e, { t: "pulsar" });
      j.host({ t: "fallo" });
    }
    expect(j.estado.vivo.fase).toBe("revelar");
    expect(j.publico().ganadores).toEqual([]);
    expect(j.equipo("rojo", { t: "pulsar" })).toBe(false); // ya revelada
  });

  it("canción sin MP3: se juega igual (sin audio)", () => {
    const { j } = cancion();
    expect(j.publico().audio).toBeUndefined();
    expect(j.equipo("verde", { t: "pulsar" })).toBe(true);
  });
});

describe("Tarjetas", () => {
  it("se acaba el mazo y vuelve a empezar sin quedarse sin tarjeta", () => {
    const { j, sub } = partida();
    sub("prohibida", "tarjetas").tarjetas = [{ palabra: "A" }, { palabra: "B" }];
    j.host({ t: "ir", subId: "prohibida" });
    j.host({ t: "turno", equipo: "rojo" });
    j.host({ t: "empezar" });
    for (let i = 0; i < 5; i++) {
      expect(j.estado.vivo.tarjeta).toBeGreaterThanOrEqual(0);
      j.host({ t: "pasar" });
    }
  });

  it("prueba sin tarjetas: no explota", () => {
    const { j, sub } = partida();
    sub("prohibida", "tarjetas").tarjetas = [];
    j.host({ t: "ir", subId: "prohibida" });
    j.host({ t: "turno", equipo: "rojo" });
    j.host({ t: "empezar" });
    expect(j.publico().tarjeta).toBeUndefined();
  });

  it("acierto justo al sonar la bocina cuenta; 3 s después ya no", () => {
    const { j, avanza } = partida();
    j.host({ t: "ir", subId: "prohibida" });
    j.host({ t: "turno", equipo: "rojo" });
    j.host({ t: "empezar" });
    avanza(60_100);
    j.tic();
    expect(j.estado.vivo.fase).toBe("revelar");
    avanza(800);
    j.host({ t: "acierto" });
    expect(j.estado.crudo.prohibida.rojo).toBe(1);
    avanza(3000);
    j.host({ t: "acierto" });
    expect(j.estado.crudo.prohibida.rojo).toBe(1);
  });
});

describe("Manual / torre", () => {
  it("decimales, borrar valor y empate en vasos", () => {
    const { j } = partida();
    j.host({ t: "ir", subId: "torre" });
    j.host({ t: "crudo", equipo: "rojo", valor: 12.5 });
    j.host({ t: "crudo", equipo: "azul", valor: 12.5 });
    j.host({ t: "crudo", equipo: "verde", valor: 3 });
    j.host({ t: "crudo", equipo: "verde", valor: null });
    expect(j.publico().ranking).toEqual({ rojo: 10, azul: 10, verde: 0, amarillo: 0 });
  });
});

describe("Marcador / podio / partida", () => {
  it("empate en 1º y 2º: el podio agrupa los puestos", () => {
    const { j } = partida();
    for (const [e, n] of [["rojo", 20], ["azul", 20], ["verde", 5], ["amarillo", 5]] as const) j.host({ t: "ajuste", equipo: e, puntos: n, motivo: "" });
    j.host({ t: "vista", v: "podio" });
    expect(j.pasosPodio()).toBe(2);
  });

  it("ajustes negativos y deshacer tras saltar de prueba", () => {
    const { j, c } = partida();
    j.host({ t: "ajuste", equipo: "verde", puntos: -3, motivo: "trampa" });
    j.host({ t: "siguientePrueba" });
    j.host({ t: "deshacer" });
    expect(j.estado.vivo.subId).toBeNull();
    expect(totales(c, j.estado).verde).toBe(-3);
    j.host({ t: "reiniciar" });
    expect(totales(c, j.estado).verde).toBe(0);
  });
});

describe("Equipos y contenido", () => {
  it("nombres: repetido (sin mayúsculas), vacío y largo", () => {
    const { j, c } = partida();
    expect(j.renombrar("azul", "rojo")).toBe("repetido");
    expect(j.renombrar("azul", "   ")).toBe(false);
    expect(j.renombrar("azul", "Los de la cachimba más larga del mundo")).toBe(true);
    expect(c.equipos[1].nombre.length).toBeLessThanOrEqual(20);
  });

  it("borrar preguntas en mitad de la prueba recoloca el índice", () => {
    const { j, sub } = partida();
    j.host({ t: "ir", subId: "cultura" });
    j.host({ t: "empezar" });
    for (let i = 0; i < 5; i++) j.host({ t: "siguiente" });
    expect(j.estado.vivo.indice).toBe(5);
    sub("cultura", "test").preguntas.splice(2);
    j.ajustarAlContenido();
    expect(j.estado.vivo.indice).toBe(1);
    expect(j.publico().pregunta).toBeDefined();
  });

  it("borrar la prueba que se está jugando vuelve al inicio", () => {
    const { j, c } = partida();
    j.host({ t: "ir", subId: "torre" });
    c.pruebas[4].subs = c.pruebas[4].subs.filter((s) => s.id !== "torre");
    j.ajustarAlContenido();
    expect(j.estado.vivo.subId).toBeNull();
  });

  it("validación: el contenido inicial pasa y los errores dicen dónde", () => {
    expect(validarContenido(contenidoInicial())).toBeNull();
    const c = contenidoInicial();
    c.equipos[1].nombre = "rojo";
    expect(validarContenido(c)).toContain("se llaman");
    const d = contenidoInicial();
    const k = d.pruebas[0].subs[0];
    if (k.tipo === "test") k.preguntas[2].opciones = ["solo una"];
    expect(validarContenido(d)).toMatch(/pregunta 3: necesita al menos 2 opciones/);
    const e = contenidoInicial();
    const t = e.pruebas[4].subs[2];
    if (t.tipo === "tarjetas") t.tarjetas[0].palabra = "";
    expect(validarContenido(e)).toMatch(/tarjeta 1: falta la palabra/);
  });
});
