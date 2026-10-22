// Guía de cada ronda para quien rellena el contenido sin haber visto nunca la app.
import type { Sub } from "../../../shared/tipos.ts";

export interface Guia {
  que: string; // qué es
  como: string; // cómo se juega el día
  preparar: string; // qué preparar en físico (vacío si nada)
  escribir: string; // qué escribir aquí
}

const POR_RONDA: Record<string, Guia> = {
  kahoot: {
    que: "Preguntas tipo test sobre el cumpleañero: cuánto le conocen sus amigos.",
    como: "La pregunta sale en la TV con 4 respuestas de colores; cada equipo pulsa la suya en el móvil antes de que acabe el tiempo. Acertar da 1 punto y un pequeño plus a los más rápidos.",
    preparar: "Nada físico. Solo saber cosas del cumpleañero: si no las sabes, pregunta a su pareja, familia o amigos de siempre (sin que él se entere).",
    escribir: "Unas 10–15 preguntas. En cada una: la pregunta, la respuesta correcta y 3 falsas que suenen creíbles (si son absurdas, se adivina sola). Ideas: su primer trabajo o coche, una anécdota de viaje, su comida/serie/canción favorita, una manía, con quién fue su primer beso, qué quería ser de pequeño.",
  },
  cultura: {
    que: "40 preguntas tipo test de cultura general. Ya vienen hechas.",
    como: "Igual que el Kahoot: pregunta en la TV y respuesta en el móvil. 1 punto por acierto.",
    preparar: "Nada.",
    escribir: "Ya están listas. Puedes cambiar o quitar las que no te gusten (por ejemplo si son muy fáciles o muy difíciles para el grupo).",
  },
  olores: {
    que: "Los equipos huelen mezclas de tabaco de cachimba y adivinan qué sabores llevan.",
    como: "El presentador va sacando las mezclas de una en una («Mezcla 1», «Mezcla 2»…). Cada equipo la huele y en el móvil toca los sabores que cree que lleva (puede marcar varios). Al acabar el tiempo se ve en la TV quién acertó.",
    preparar: "Una cachimba o un bol pequeño con tabaco por cada mezcla, con una pegatina «Mezcla 1», «Mezcla 2»… para no liarse. Apunta qué lleva cada una.",
    escribir: "Para cada mezcla, qué lleva. Si son varios sabores, sepáralos con «+», por ejemplo «Sandía + Menta» (da igual el orden en que los pongan los equipos). En «Sabores que verán en el móvil» deja la lista de sabores que pueden elegir: tienen que estar todos los que uses, y alguno más para despistar.",
  },
  sabor: {
    que: "Igual que los olores, pero dando una calada: adivinar el sabor.",
    como: "El presentador saca cada cachimba («Cachimba 1», «2»…), los equipos la prueban y marcan el sabor en el móvil.",
    preparar: "Una cachimba encendida por cada sabor, numeradas. Apunta qué lleva cada una.",
    escribir: "Para cada cachimba, el sabor (o sabores con «+»). La lista de sabores del móvil tiene que incluir los que uses.",
  },
  rosco: {
    que: "Un rosco tipo Pasapalabra con las letras de CACHIMBA, todo sobre el mundo de la cachimba.",
    como: "Sale una letra en la TV con su pregunta; todos los equipos escriben la respuesta en el móvil a la vez. Al acabar el tiempo se corrige sola (perdona tildes, mayúsculas y faltas pequeñas).",
    preparar: "Nada.",
    escribir: "Ya vienen hechas. Si cambias alguna, que tenga una sola respuesta posible y escribe en «Solución» todas las formas aceptables separadas por «/» (por ejemplo «Hookah/Huka»).",
  },
  sorpresa: {
    que: "Una prueba libre que te inventas tú (o se deja vacía si no hay sorpresa).",
    como: "Sale en la TV el título y la explicación; el presentador apunta a mano lo que haga cada equipo y la app reparte los puntos.",
    preparar: "Lo que necesite la sorpresa.",
    escribir: "El título y una explicación corta de qué hay que hacer (es lo que se lee en la TV). Si no va a haber sorpresa, avisa al presentador para que se la salte.",
  },
  precio: {
    que: "El precio justo: adivinar cuánto cuesta un producto.",
    como: "Sale el producto en la TV (con foto si la hay); cada equipo escribe su precio en el móvil. Se lleva el punto el que más se acerque.",
    preparar: "Los productos de verdad para enseñarlos, o al menos una foto de cada uno.",
    escribir: "Unos 5–6 productos con su precio real en euros (mira el ticket o la web). Mejor cosas con precios que no sean obvios: algo de cachimba, una botella, un aparato…",
  },
  "c-reggaeton": {
    que: "Adivinar canciones de reggaetón actual por un trocito.",
    como: "En la TV suena un fragmento; el primer equipo que pulsa el botón del móvil dice la canción en voz alta. Si falla, rebota al resto.",
    preparar: "Los MP3 de las canciones (de tu ordenador o descargados).",
    escribir: "Ya hay 10 canciones propuestas: sube el MP3 de cada una (o cámbialas). Dale al play y, cuando llegue la parte que quieres que suene, pulsa «Empezar aquí». Si no subes MP3, el presentador tendrá que ponerla él.",
  },
  torre: {
    que: "Montar la torre de vasos más alta posible en un tiempo.",
    como: "Sale una cuenta atrás en la TV; los equipos apilan vasos a la vez. Al acabar, el presentador apunta cuántos vasos tiene cada torre y gana la más alta.",
    preparar: "Muchos vasos de plástico iguales (unos 25 por equipo) y espacio en una mesa.",
    escribir: "Nada obligatorio. Puedes cambiar el tiempo en «Ajustes avanzados».",
  },
  dibujo: {
    que: "Dibujar algo con una condición imposible (ojos cerrados, con la boca…) para que tu equipo lo adivine.",
    como: "Por turnos: uno de cada equipo mira la tarjeta en la TV (los demás de espaldas), dibuja con la condición y su equipo intenta adivinar. Cada acierto, 1 punto; el presentador pasa de tarjeta.",
    preparar: "Papel grande o pizarra y rotuladores.",
    escribir: "Ya hay 20 tarjetas. Puedes añadir cosas del cumpleañero o del grupo (bromas internas). Cada tarjeta: qué hay que dibujar y la condición imposible.",
  },
  prohibida: {
    que: "Tabú: describir una palabra sin decir las palabras prohibidas.",
    como: "Por turnos: uno de cada equipo ve la tarjeta en la TV y la explica sin decir las prohibidas; si las dice, se pasa a otra. Cada acierto, 1 punto.",
    preparar: "Nada.",
    escribir: "Ya hay 22 tarjetas. Cada una: la palabra y 4 palabras prohibidas (las que saldrían primero al explicarla). Puedes añadir palabras del grupo.",
  },
};

const POR_TIPO: Record<Sub["tipo"], Guia> = {
  test: { que: "Preguntas tipo test.", como: "Pregunta en la TV, respuesta en el móvil.", preparar: "Nada.", escribir: "Cada pregunta con su respuesta correcta y otras falsas creíbles." },
  adivinar: { que: "Adivinar algo por equipos.", como: "Cada equipo escribe su respuesta en el móvil y se corrige sola.", preparar: "Lo que haya que adivinar.", escribir: "Cada cosa con su solución (varias formas válidas separadas por «/»)." },
  precio: POR_RONDA.precio,
  cancion: POR_RONDA["c-reggaeton"],
  tarjetas: POR_RONDA.prohibida,
  manual: POR_RONDA.sorpresa,
};

export function guiaDe(s: Sub): Guia {
  if (s.id.startsWith("c-") && s.tipo === "cancion") return { ...POR_RONDA["c-reggaeton"], que: `Adivinar canciones: «${s.titulo}».` };
  return POR_RONDA[s.id] ?? POR_TIPO[s.tipo];
}
