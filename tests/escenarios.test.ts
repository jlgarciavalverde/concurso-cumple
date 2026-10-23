// Matriz de casos raros por prueba: lo que puede pasar el día del cumple.
import { describe, expect, it } from "vitest";
import { leerPrecio, totales } from "../shared/puntuacion.ts";
import { contenidoInicial as inicial } from "../server/contenido-inicial.ts";

/** Los tests de reglas se escribieron con 4 equipos (rojo, azul, verde, amarillo). */
const contenidoInicial = () => {
  const c = inicial();
  c.equipos = c.equipos.slice(0, 4);
  return c;
};
import { estadoVacio, Juego, normalizarEstado } from "../server/juego.ts";
import { validarContenido } from "../server/validar.ts";
import type { Sub } from "../shared/tipos.ts";

const EQ = ["rojo", "azul", "verde", "amarillo"];

function partida() {
  let ahora = 1_000_000;
  const c = contenidoInicial();
  const j = new Juego(c, estadoVacio(), () => ahora, 0);
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
    const { j, c } = partida();
    const ext = c.pruebas[0].subs[0];
    if (ext.tipo !== "externo" || ext.respaldo?.tipo !== "test") throw new Error();
    const k = ext.respaldo;
    c.pruebas[0].subs[0] = k;
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
    const k = d.pruebas[5].subs[0];
    if (k.tipo === "test") k.preguntas[2].opciones = ["solo una"];
    expect(validarContenido(d)).toMatch(/Cultura general», pregunta 3: necesita al menos 2 opciones/);
    const e = contenidoInicial();
    const t = e.pruebas[4].subs[2];
    if (t.tipo === "tarjetas") t.tarjetas[0].palabra = "";
    expect(validarContenido(e)).toMatch(/tarjeta 1: falta la palabra/);
  });
});

describe("Pulsador justo", () => {
  function conVentana() {
    let ahora = 1_000_000;
    const j = new Juego(contenidoInicial(), estadoVacio(), () => ahora, 150);
    j.host({ t: "ir", subId: "c-2000" });
    j.host({ t: "empezar" });
    return { j, avanza: (ms: number) => (ahora += ms) };
  }

  it("gana quien pulsó antes de verdad, no quien llegó antes", () => {
    // Rojo (datos, 120 ms) llega en t=0 → pulsó en −120. Azul (wifi, 10 ms) llega en t=60 → pulsó en +50.
    const { j, avanza } = conVentana();
    expect(j.equipo("rojo", { t: "pulsar" }, { latencia: 120 })).toBe(true);
    expect(j.estado.vivo.sonando).toBe(false); // la música se para en cuanto llega el primero
    expect(j.estado.vivo.pulsado).toBeNull(); // aún no se decide
    avanza(60);
    j.equipo("azul", { t: "pulsar" }, { latencia: 10 });
    avanza(100);
    expect(j.tic()).toBe(true);
    expect(j.estado.vivo.pulsado).toBe("rojo");

    // Al revés: verde (wifi, 20 ms) llega primero → pulsó en −20; amarillo (datos, 140 ms) llega en +40 → pulsó en −100
    const b = conVentana();
    b.j.equipo("verde", { t: "pulsar" }, { latencia: 20 });
    b.avanza(40);
    b.j.equipo("amarillo", { t: "pulsar" }, { latencia: 140 });
    b.avanza(120);
    b.j.tic();
    expect(b.j.estado.vivo.pulsado).toBe("amarillo");
  });

  it("una latencia inflada (2 s) solo se descuenta hasta el tope de 150 ms", () => {
    // Azul pulsa en 0 sin latencia; rojo llega 140 ms después diciendo tener 2 s → cuenta como −10 (no −1860)
    const { j, avanza } = conVentana();
    j.equipo("azul", { t: "pulsar" }, { latencia: 0 });
    avanza(140);
    j.equipo("rojo", { t: "pulsar" }, { latencia: 2000 });
    expect(j.estado.vivo.ventana?.candidatos.rojo).toBe(1_000_000 + 140 - 150);
    avanza(20);
    j.tic();
    expect(j.estado.vivo.pulsado).toBe("rojo");
  });

  it("fuera de la ventana ya no entra nadie: gana el que había", () => {
    const { j, avanza } = conVentana();
    j.equipo("verde", { t: "pulsar" }, { latencia: 30 });
    avanza(200);
    j.tic();
    expect(j.estado.vivo.pulsado).toBe("verde");
    expect(j.equipo("rojo", { t: "pulsar" }, { latencia: 150 })).toBe(false);
  });

  it("revelar con la ventana abierta la cierra sin ganador", () => {
    const { j, avanza } = conVentana();
    j.equipo("verde", { t: "pulsar" });
    j.host({ t: "revelar" });
    avanza(200);
    j.tic();
    expect(j.estado.vivo.pulsado).toBeNull();
  });
});

describe("Cinco equipos", () => {
  it("el de serie trae 5; con la tabla 10/5/3/1 el 5º no suma; los integrantes se validan", () => {
    const c = inicial();
    expect(c.equipos.map((e) => e.id)).toEqual(["rojo", "azul", "verde", "amarillo", "morado"]);
    expect(validarContenido(c)).toBeNull();
    const j = new Juego(c, estadoVacio(), () => 1, 0);
    j.host({ t: "ir", subId: "torre" });
    for (const [eq, v] of [["rojo", 5], ["azul", 4], ["verde", 3], ["amarillo", 2], ["morado", 1]] as const) j.host({ t: "crudo", equipo: eq, valor: v });
    expect(j.publico().ranking).toEqual({ rojo: 10, azul: 5, verde: 3, amarillo: 1, morado: 0 });
    c.equipos[4].miembros = ["Ana", " Luis "];
    expect(validarContenido(c)).toBeNull();
    c.equipos[4].miembros = [42 as unknown as string];
    expect(validarContenido(c)).toMatch(/integrantes/);
  });
});

describe("Partidas guardadas por versiones antiguas", () => {
  it("una hoja de la v0.1 (sin «hechos») no tumba el servidor al responder: regresión del fallo de olores", () => {
    const c = contenidoInicial();
    // Así guardaba la v0.1 la partida: olores a medias, hojas solo con valores y entregada
    const viejo = {
      codigo: "ABCD",
      vivo: { subId: "olores", fase: "jugando", indice: 0, abiertaEn: 0, fin: null, respuestas: {}, pulsado: null, bloqueados: [], sonando: false, turno: null, tarjeta: -1,
        cronometro: { desde: null, acumulado: 0 },
        hojas: Object.fromEntries(EQ.map((e) => [e, { valores: ["", "", "", "", ""], entregada: false }])) },
      crudo: {}, correcciones: {}, puntos: {}, ajustes: [], tarjetasUsadas: {},
    };
    const crudo = new Juego(c, JSON.parse(JSON.stringify(viejo)), Date.now, 0);
    expect(() => crudo.equipo("rojo", { t: "item", valor: "menta" })).not.toThrow(); // sin normalizar tampoco revienta ya
    const j = new Juego(c, normalizarEstado(JSON.parse(JSON.stringify(viejo))), Date.now, 0);
    for (const e of EQ) expect(j.equipo(e, { t: "item", valor: "menta" })).toBe(true);
    expect(j.estado.vivo.fase).toBe("revelar");
    expect(j.publico().hojas?.rojo.marcas[0]).toBe("ko");
  });

  it("normalizar no toca una partida actual", () => {
    const e = estadoVacio();
    expect(normalizarEstado(structuredClone(e))).toEqual(e);
  });
});

describe("Kahoot del cumpleañero (ronda externa)", () => {
  it("el PIN sale en la TV y los puestos de Kahoot reparten 10/5/3/1", () => {
    const { j, c } = partida();
    j.host({ t: "ir", subId: "kahoot" });
    expect(j.publico().externo).toEqual({ plataforma: "kahoot", pin: null });
    j.host({ t: "pin", pin: " 123 456 7 " });
    expect(j.publico().externo?.pin).toBe("1234567");
    j.host({ t: "empezar" });
    j.host({ t: "crudo", equipo: "azul", valor: 1 });
    j.host({ t: "crudo", equipo: "rojo", valor: 2 });
    j.host({ t: "crudo", equipo: "verde", valor: 3 });
    expect(totales(c, j.estado)).toEqual({ rojo: 5, azul: 10, verde: 3, amarillo: 0 }); // amarillo sin puesto: 0
    j.host({ t: "siguiente" });
    expect(j.estado.vivo.fase).toBe("resultado");
  });
});

describe("Votación del mejor disfraz", () => {
  function conInvitados(n = ["Ana", "Luis", "Marta", "Pepe", "Sara", "Toni"]) {
    const r = partida();
    r.c.disfraces = { participantes: n };
    return r;
  }

  it("cerrada no admite votos; abierta: uno por persona, no a uno mismo, solo de la lista", () => {
    const { j } = conInvitados();
    expect(j.votar("Ana", "Luis")).toMatch(/no está abierta/);
    j.host({ t: "votacion", op: "abrir" });
    expect(j.estado.vivo.vista).toBe("votacion");
    expect(j.votar("Ana", "Luis")).toBeNull();
    expect(j.votar("Ana", "Marta")).toMatch(/Ya has votado/);
    expect(j.votar("Luis", "Luis")).toMatch(/a ti mismo/);
    expect(j.votar("Intruso", "Luis")).toMatch(/No estás en la lista/);
    expect(j.votar("Marta", "Nadie")).toMatch(/no está en la votación/);
    expect(j.publicoVotacion().votaron).toEqual(["Ana"]);
  });

  it("se revela de 3º a 1º y no se sabe quién gana hasta el final", () => {
    const { j } = conInvitados();
    j.host({ t: "votacion", op: "abrir" });
    for (const [a, b] of [["Ana", "Luis"], ["Marta", "Luis"], ["Pepe", "Luis"], ["Sara", "Marta"], ["Toni", "Marta"], ["Luis", "Pepe"]]) j.votar(a, b);
    expect(j.publicoVotacion().revelados).toEqual([]);
    j.host({ t: "votacion", op: "revelar" });
    expect(j.estado.votacion?.estado).toBe("cerrada");
    expect(j.publicoVotacion().revelados).toEqual([{ puesto: 3, nombres: ["Pepe"], votos: 1 }]);
    j.host({ t: "votacion", op: "revelar" });
    j.host({ t: "votacion", op: "revelar" });
    j.host({ t: "votacion", op: "revelar" }); // no pasa del último
    expect(j.publicoVotacion().revelados.at(-1)).toEqual({ puesto: 1, nombres: ["Luis"], votos: 3 });
    expect(j.votar("Ana", "Pepe")).toMatch(/no está abierta/);
  });

  it("empate en el primer puesto: se revelan juntos y se puede desempatar solo entre ellos", () => {
    const { j } = conInvitados();
    j.host({ t: "votacion", op: "abrir" });
    for (const [a, b] of [["Ana", "Luis"], ["Marta", "Luis"], ["Pepe", "Sara"], ["Toni", "Sara"]]) j.votar(a, b);
    j.host({ t: "votacion", op: "cerrar" });
    for (let i = 0; i < 3; i++) j.host({ t: "votacion", op: "revelar" });
    expect(j.publicoVotacion().revelados.at(-1)).toEqual({ puesto: 1, nombres: ["Luis", "Sara"], votos: 2 });
    j.host({ t: "votacion", op: "desempatar" });
    const p = j.publicoVotacion();
    expect(p).toMatchObject({ estado: "abierta", ronda: 2, candidatos: ["Luis", "Sara"], votaron: [] });
    expect(j.votar("Ana", "Marta")).toMatch(/no está en la votación/);
    expect(j.votar("Ana", "Sara")).toBeNull();
  });
});
