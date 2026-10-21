// Modelo compartido entre servidor y cliente.

export type EquipoId = string;

export interface Equipo {
  id: EquipoId;
  nombre: string;
  color: string;
}

export interface PreguntaTest {
  texto: string;
  opciones: string[];
  correcta: number;
  imagen?: string;
}

export interface ItemAdivinar {
  etiqueta: string; // «Mezcla 1», «C», …
  pregunta?: string; // rosco: «Empieza por C: …»
  respuesta: string; // varias válidas separadas por «/»
}

export interface Producto {
  nombre: string;
  imagen?: string;
  precio: number;
}

export interface Cancion {
  titulo: string;
  artista: string;
  audio?: string;
  inicio: number;
}

export interface Tarjeta {
  palabra: string;
  prohibidas?: string[];
  condicion?: string; // dibujo imposible: se ve en la TV
}

interface SubBase {
  id: string;
  titulo: string;
  descripcion?: string;
}

export type Sub =
  | (SubBase & { tipo: "test"; puntuacion: "ranking" | "aciertos"; rapidez: boolean; segundos: number; preguntas: PreguntaTest[] })
  | (SubBase & { tipo: "adivinar"; estilo: "lista" | "rosco"; opciones: string[]; segundos: number; items: ItemAdivinar[] })
  | (SubBase & { tipo: "precio"; sinPasarse: boolean; segundos: number; productos: Producto[] })
  | (SubBase & { tipo: "cancion"; canciones: Cancion[] })
  | (SubBase & { tipo: "tarjetas"; modo: "palabra" | "dibujo"; segundos: number; tarjetas: Tarjeta[] })
  | (SubBase & { tipo: "manual"; medida: string; mayorMejor: boolean; cronometro: boolean });

export type TipoSub = Sub["tipo"];

export interface Prueba {
  id: string;
  titulo: string;
  emoji: string;
  agrupar: boolean; // true: las subpruebas suman y luego se reparte 10/5/3/1 una sola vez
  subs: Sub[];
}

export interface Contenido {
  titulo: string;
  tabla: number[]; // 10/5/3/1
  equipos: Equipo[];
  pruebas: Prueba[];
}

// ---------- Estado en vivo ----------

export type Fase = "intro" | "jugando" | "revelar" | "resultado";

export interface Respuesta {
  valor: unknown;
  ms: number; // ms desde que se abrió la pregunta
}

export type Vista = "juego" | "marcador" | "podio";

export interface Vivo {
  subId: string | null;
  vista: Vista;
  fase: Fase;
  indice: number; // pregunta / canción / producto actual
  abiertaEn: number; // epoch ms
  fin: number | null; // epoch ms de cierre (temporizador)
  respuestas: Record<EquipoId, Respuesta>;
  // adivinar (olores/sabor/rosco): respuestas por item y si están entregadas
  hojas: Record<EquipoId, { valores: string[]; entregada: boolean }>;
  // pulsador (canciones)
  pulsado: EquipoId | null;
  bloqueados: EquipoId[];
  sonando: boolean;
  // tarjetas y manual
  turno: EquipoId | null;
  tarjeta: number; // índice global de tarjeta
  cronometro: { desde: number | null; acumulado: number };
}

export interface Ajuste {
  equipo: EquipoId;
  puntos: number;
  motivo: string;
}

export interface Estado {
  codigo: string;
  vivo: Vivo;
  crudo: Record<string, Record<EquipoId, number>>; // por sub: aciertos, tiempo, etc.
  correcciones: Record<string, Record<EquipoId, boolean[]>>; // adivinar: acierto por item (editable)
  puntos: Record<string, Record<EquipoId, number>>; // por sub, confirmados
  ajustes: Ajuste[];
  tarjetasUsadas: Record<string, number[]>;
}

// Lo que reciben TV y móviles (sin soluciones antes de tiempo)
export interface Publico {
  ahora: number;
  titulo: string;
  codigo: string;
  vista: Vista;
  equipos: (Equipo & { total: number; conectados: number })[];
  sub: null | {
    id: string;
    tipo: TipoSub;
    titulo: string;
    descripcion?: string;
    pruebaTitulo: string;
    emoji: string;
    total: number; // nº de preguntas/canciones/…
    puntuacion?: "ranking" | "aciertos";
    estilo?: "lista" | "rosco";
    modo?: "palabra" | "dibujo";
    medida?: string;
    cronometro?: boolean;
    opciones?: string[];
    items?: { etiqueta: string; pregunta?: string }[];
  };
  fase: Fase;
  indice: number;
  fin: number | null;
  abiertaEn: number;
  pregunta?: { texto: string; opciones?: string[]; imagen?: string };
  solucion?: { correcta?: number; texto?: string; precio?: number; respuestas?: string[] };
  contestados: EquipoId[];
  respuestasVisibles?: Record<EquipoId, unknown>;
  hojas?: Record<EquipoId, { entregada: boolean; contestadas: number; aciertos?: boolean[]; valores?: string[] }>;
  pulsado: EquipoId | null;
  bloqueados: EquipoId[];
  sonando: boolean;
  audio?: { src: string; inicio: number };
  turno: EquipoId | null;
  condicion?: string;
  cronometro: { desde: number | null; acumulado: number };
  crudo: Record<EquipoId, number>;
  ranking?: Record<EquipoId, number>; // puntos que se darían / se dieron
  confirmado: boolean;
  desglose: { pruebaId: string; titulo: string; emoji: string; puntos: Record<EquipoId, number> }[];
}

export interface VistaEquipo extends Publico {
  yo: EquipoId;
  miRespuesta?: unknown;
  miHoja?: { valores: string[]; entregada: boolean };
}

export interface VistaHost {
  ahora: number;
  contenido: Contenido;
  estado: Estado;
  publico: Publico;
  conectados: Record<EquipoId, number>;
  tv: number;
  deshacer: number;
}
