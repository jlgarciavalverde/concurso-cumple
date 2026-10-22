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
  condicion?: string;
  tarjeta?: Tarjeta; // solo TV y presentador, nunca a los móviles // dibujo imposible: se ve en la TV
}

interface SubBase {
  id: string;
  titulo: string;
  descripcion?: string;
}

export type Sub =
  // rapidez: plus escalonado para los primeros en acertar (bonus, por defecto +0,5 y +0,25)
  | (SubBase & { tipo: "test"; puntuacion: "ranking" | "aciertos"; rapidez: boolean; bonus?: number[]; segundos: number; preguntas: PreguntaTest[] })
  // modo «porItem» (por defecto): una letra/mezcla cada vez con su cuenta atrás; «hoja»: todo a la vez
  | (SubBase & { tipo: "adivinar"; estilo: "lista" | "rosco"; modo?: "porItem" | "hoja"; segundosItem?: number; opciones: string[]; segundos: number; items: ItemAdivinar[] })
  | (SubBase & { tipo: "precio"; sinPasarse: boolean; segundos: number; productos: Producto[] })
  | (SubBase & { tipo: "cancion"; fragmento?: number; canciones: Cancion[] }) // fragmento: segundos que suena (0 = entera)
  | (SubBase & { tipo: "tarjetas"; modo: "palabra" | "dibujo"; tarjetaEnTv?: boolean; segundos: number; tarjetas: Tarjeta[] })
  | (SubBase & { tipo: "manual"; medida: string; mayorMejor: boolean; cronometro: boolean; segundos?: number });

export type TipoSub = Sub["tipo"];

export interface Prueba {
  id: string;
  titulo: string;
  emoji: string;
  agrupar: boolean; // true: las subpruebas suman y luego se reparte 10/5/3/1 una sola vez
  subs: Sub[];
}

export interface Contenido {
  rev?: number; // sube en cada cambio: evita que /admin machaque cambios hechos en directo
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
  hojas: Record<EquipoId, Hoja>;
  // pulsador (canciones)
  pulsado: EquipoId | null;
  bloqueados: EquipoId[];
  sonando: boolean;
  acertante?: EquipoId | null; // canción: quién la acertó
  podioPaso?: number; // podio: cuántos puestos se han revelado (empezando por el último)
  repetir?: number; // canción: sube cada vez que el presentador repite el fragmento
  cerradoEn?: number; // tarjetas: cuándo acabó el turno (un acierto justo al final aún cuenta)
  // canción: el primer pulsador abre una ventana corta; gana quien pulsó antes de verdad (llegada − latencia)
  ventana?: { hasta: number; candidatos: Record<EquipoId, number> } | null;
  // tarjetas y manual
  turno: EquipoId | null;
  tarjeta: number; // índice global de tarjeta
  cronometro: { desde: number | null; acumulado: number };
}

export interface Hoja {
  valores: string[];
  hechos: boolean[]; // porItem: ya ha respondido ese item
  entregada: boolean;
}

/** Resultado de un item para un equipo: acierto, fallo, sin responder o aún sin corregir. */
export type Marca = "ok" | "medio" | "ko" | "nada" | null;

export interface Ajuste {
  equipo: EquipoId;
  puntos: number;
  motivo: string;
}

export interface Estado {
  codigo: string;
  vivo: Vivo;
  crudo: Record<string, Record<EquipoId, number>>; // por sub: aciertos, tiempo, etc.
  correcciones: Record<string, Record<EquipoId, number[]>>; // adivinar: puntos por item (1/0 automático, editable: ½…)
  puntos: Record<string, Record<EquipoId, number>>; // por sub, fijados a mano (si no, se calculan en directo)
  ajustes: Ajuste[];
  tarjetasUsadas: Record<string, number[]>;
  guardados?: Record<string, Vivo>; // cómo se dejó cada subprueba al salir de ella (para continuar)
  tv?: { mudo: boolean; volumen: number }; // sonido de la TV, lo controla el presentador
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
    pruebaNum: number; // 1, 2, 3… (la TV numera las pruebas en lugar de emojis)
    emoji: string;
    total: number; // nº de preguntas/canciones/…
    puntuacion?: "ranking" | "aciertos";
    estilo?: "lista" | "rosco";
    porItem?: boolean;
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
  bonus?: Record<EquipoId, number>; // plus por rapidez en la pregunta revelada
  ganadores?: EquipoId[]; // quién se lleva el punto en la canción / producto revelado
  hojas?: Record<EquipoId, { entregada: boolean; contestadas: number; marcas: Marca[]; puntos: number[]; valores: string[] }>;
  pulsado: EquipoId | null;
  bloqueados: EquipoId[];
  sonando: boolean;
  audio?: { src: string; inicio: number; fragmento: number };
  audiosSub?: string[]; // para precargar los MP3 de la ronda
  podioPaso: number;
  repetir: number;
  tv: { mudo: boolean; volumen: number };
  turno: EquipoId | null;
  condicion?: string;
  tarjeta?: Tarjeta; // solo TV y presentador, nunca a los móviles
  cronometro: { desde: number | null; acumulado: number };
  crudo: Record<EquipoId, number>;
  ranking?: Record<EquipoId, number>; // puntos que se darían / se dieron
  confirmado: boolean;
  desglose: { pruebaId: string; titulo: string; emoji: string; puntos: Record<EquipoId, number> }[];
}

export interface VistaEquipo extends Publico {
  yo: EquipoId;
  miRespuesta?: unknown;
  miHoja?: Hoja;
}

export interface VistaHost {
  ahora: number;
  contenido: Contenido;
  estado: Estado;
  publico: Publico;
  conectados: Record<EquipoId, number>;
  tv: number;
  tvSonido: boolean | null; // ¿la TV puede sonar? (null: no lo ha dicho / sin TV)
  latencias: Record<EquipoId, number>; // ms (mitad del ida y vuelta) del mejor móvil de cada equipo
  deshacer: number;
}

// Valores por defecto de campos añadidos después (el contenido guardado puede no tenerlos)
export const porItem = (s: Extract<Sub, { tipo: "adivinar" }>) => (s.modo ?? "porItem") === "porItem";
export const segundosItem = (s: Extract<Sub, { tipo: "adivinar" }>) => s.segundosItem ?? 20;
export const tarjetaEnTv = (s: Extract<Sub, { tipo: "tarjetas" }>) => s.tarjetaEnTv ?? true;
export const fragmento = (s: Extract<Sub, { tipo: "cancion" }>) => s.fragmento ?? 20;
