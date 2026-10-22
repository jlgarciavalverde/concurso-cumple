// Motor del concurso: estado + acciones del presentador y de los equipos. Sin E/S: el servidor persiste y emite.
import { BONUS_RAPIDEZ, coincide, desglose, puntosPrecio, puntosSub, puntosTest, totales } from "../shared/puntuacion.ts";
import { fragmento, porItem, segundosItem, tarjetaEnTv, type Contenido, type Estado, type EquipoId, type Marca, type Prueba, type Publico, type Sub, type Vista, type VistaEquipo, type Vivo } from "../shared/tipos.ts";

export type AccionHost =
  | { t: "ir"; subId: string | null }
  | { t: "empezar" }
  | { t: "revelar" }
  | { t: "siguiente" }
  | { t: "resultado" }
  | { t: "confirmar"; puntos: Record<EquipoId, number> }
  | { t: "desconfirmar" }
  | { t: "limpiarSub" }
  | { t: "crudo"; equipo: EquipoId; valor: number | null }
  | { t: "correccion"; equipo: EquipoId; item: number; puntos: number }
  | { t: "sonar"; on: boolean }
  | { t: "acierto" }
  | { t: "fallo" }
  | { t: "pasar" }
  | { t: "turno"; equipo: EquipoId | null }
  | { t: "crono"; op: "start" | "stop" | "reset" | "guardar"; equipo?: EquipoId }
  | { t: "mas"; segundos: number }
  | { t: "ajuste"; equipo: EquipoId; puntos: number; motivo: string }
  | { t: "quitarAjuste"; i: number }
  | { t: "deshacer" }
  | { t: "reiniciar" }
  | { t: "codigo" }
  | { t: "vista"; v: Vista }
  | { t: "continuar" }
  | { t: "deCero" }
  | { t: "siguientePrueba" }
  | { t: "siguienteTurno" }
  | { t: "config"; campo: "segundos" | "segundosItem" | "tarjetaEnTv" | "rapidez" | "fragmento"; valor: number | boolean }
  | { t: "podioPaso" }
  | { t: "repetir" }
  | { t: "tv"; mudo?: boolean; volumen?: number };

export type AccionEquipo =
  | { t: "responder"; valor: number }
  | { t: "hoja"; i: number; valor: string }
  | { t: "entregar" }
  | { t: "item"; valor: string }
  | { t: "pulsar" };

export const vivoVacio = (): Vivo => ({
  subId: null,
  vista: "juego",
  fase: "intro",
  indice: 0,
  abiertaEn: 0,
  fin: null,
  respuestas: {},
  hojas: {},
  pulsado: null,
  bloqueados: [],
  sonando: false,
  turno: null,
  tarjeta: -1,
  cronometro: { desde: null, acumulado: 0 },
});

export function nuevoCodigo(): string {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  return Array.from({ length: 4 }, () => letras[Math.floor(Math.random() * letras.length)]).join("");
}

export const estadoVacio = (): Estado => ({
  codigo: nuevoCodigo(),
  vivo: vivoVacio(),
  crudo: {},
  correcciones: {},
  puntos: {},
  ajustes: [],
  tarjetasUsadas: {},
});

export function totalItems(sub: Sub): number {
  switch (sub.tipo) {
    case "test":
      return sub.preguntas.length;
    case "adivinar":
      return sub.items.length;
    case "precio":
      return sub.productos.length;
    case "cancion":
      return sub.canciones.length;
    case "tarjetas":
      return sub.tarjetas.length;
    case "manual":
      return 0;
  }
}

export class Juego {
  private pila: string[] = [];

  constructor(
    public contenido: Contenido,
    public estado: Estado,
    private reloj: () => number = Date.now,
  ) {}

  get ids(): EquipoId[] {
    return this.contenido.equipos.map((e) => e.id);
  }

  buscar(subId: string | null): { sub: Sub; prueba: Prueba } | null {
    if (!subId) return null;
    for (const prueba of this.contenido.pruebas) for (const sub of prueba.subs) if (sub.id === subId) return { sub, prueba };
    return null;
  }

  get actual() {
    return this.buscar(this.estado.vivo.subId);
  }

  /** Todas las subpruebas en orden. */
  get subs(): Sub[] {
    return this.contenido.pruebas.flatMap((p) => p.subs);
  }

  /** Deja la subprueba actual guardada y entra en otra (en su intro). */
  private irA(subId: string | null) {
    const e = this.estado;
    const v = e.vivo;
    if (v.subId && (v.fase !== "intro" || e.crudo[v.subId])) (e.guardados ??= {})[v.subId] = { ...v, fin: null, vista: "juego" };
    e.vivo = vivoVacio();
    e.vivo.subId = this.buscar(subId) ? subId : null;
  }

  get puedeDeshacer() {
    return this.pila.length;
  }

  private crudo(subId: string): Record<EquipoId, number> {
    return (this.estado.crudo[subId] ??= {});
  }

  private sumar(subId: string, eq: EquipoId, n: number) {
    const c = this.crudo(subId);
    c[eq] = (c[eq] ?? 0) + n;
  }

  /** Abre la pregunta/canción/producto del índice actual. */
  private abrir(sub: Sub) {
    const v = this.estado.vivo;
    const ahora = this.reloj();
    v.fase = "jugando";
    v.abiertaEn = ahora;
    v.respuestas = {};
    v.pulsado = null;
    v.bloqueados = [];
    v.acertante = null;
    v.fin = null;
    if ((sub.tipo === "test" || sub.tipo === "precio") && sub.segundos > 0) v.fin = ahora + sub.segundos * 1000;
    if (sub.tipo === "adivinar") {
      const pi = porItem(sub);
      const seg = pi ? segundosItem(sub) : sub.segundos;
      if (seg > 0) v.fin = ahora + seg * 1000;
      // Por item, la hoja se rellena letra a letra: solo se crea al empezar
      if (!pi || v.indice === 0) {
        v.hojas = {};
        for (const id of this.ids) v.hojas[id] = { valores: sub.items.map(() => ""), hechos: sub.items.map(() => false), entregada: false };
        this.estado.correcciones[sub.id] = Object.fromEntries(this.ids.map((id) => [id, sub.items.map(() => 0)]));
      }
    }
    if (sub.tipo === "cancion") v.sonando = true;
  }

  private revelar(sub: Sub) {
    const v = this.estado.vivo;
    if (v.fase !== "jugando") return;
    v.fase = "revelar";
    v.fin = null;
    if (sub.tipo === "test") {
      const p = sub.preguntas[v.indice];
      if (p) for (const [eq, n] of Object.entries(puntosTest(v.respuestas, p.correcta, this.bonus(sub)))) this.sumar(sub.id, eq, n);
      for (const eq of this.ids) this.sumar(sub.id, eq, 0);
    } else if (sub.tipo === "precio") {
      const prod = sub.productos[v.indice];
      const ofertas: Record<EquipoId, number | undefined> = {};
      for (const eq of this.ids) ofertas[eq] = v.respuestas[eq]?.valor as number | undefined;
      if (prod) for (const [eq, n] of Object.entries(puntosPrecio(ofertas, prod.precio, sub.sinPasarse))) this.sumar(sub.id, eq, n);
    } else if (sub.tipo === "adivinar") {
      const corr = (this.estado.correcciones[sub.id] ??= {});
      const pi = porItem(sub);
      for (const eq of this.ids) {
        const h = v.hojas[eq];
        const fila = (corr[eq] ??= sub.items.map(() => 0));
        sub.items.forEach((it, i) => {
          if (!pi || i === v.indice) fila[i] = coincide(h?.valores[i] ?? "", it.respuesta) ? 1 : 0;
        });
        if (h && !pi) h.entregada = true;
      }
      this.recontar(sub.id);
    } else if (sub.tipo === "cancion") {
      v.pulsado = null;
      v.sonando = true;
    } else if (sub.tipo === "tarjetas") {
      v.tarjeta = -1;
    }
  }

  private recontar(subId: string) {
    const corr = this.estado.correcciones[subId] ?? {};
    const c = this.crudo(subId);
    for (const eq of this.ids) c[eq] = Math.round((corr[eq] ?? []).reduce((t: number, x) => t + (Number(x) || 0), 0) * 100) / 100;
  }

  private bonus(sub: Extract<Sub, { tipo: "test" }>): number[] | null {
    return sub.rapidez ? (sub.bonus ?? BONUS_RAPIDEZ) : null;
  }

  private siguienteTarjeta(sub: Extract<Sub, { tipo: "tarjetas" }>) {
    const usadas = (this.estado.tarjetasUsadas[sub.id] ??= []);
    if (this.estado.vivo.tarjeta >= 0 && !usadas.includes(this.estado.vivo.tarjeta)) usadas.push(this.estado.vivo.tarjeta);
    let libres = sub.tarjetas.map((_, i) => i).filter((i) => !usadas.includes(i));
    if (!libres.length) {
      usadas.length = 0;
      libres = sub.tarjetas.map((_, i) => i);
    }
    this.estado.vivo.tarjeta = libres.length ? libres[Math.floor(Math.random() * libres.length)] : -1;
  }

  /** Borra resultados y progreso de una subprueba y la deja en su intro. */
  private limpiar(subId: string) {
    const e = this.estado;
    delete e.crudo[subId];
    delete e.puntos[subId];
    delete e.correcciones[subId];
    delete e.tarjetasUsadas[subId];
    delete e.guardados?.[subId];
    e.vivo = { ...vivoVacio(), subId, vista: e.vivo.vista };
  }

  /** Cierra sola la pregunta (o el turno de tarjetas) si se acabó el tiempo. Devuelve true si cambió algo. */
  tic(): boolean {
    const v = this.estado.vivo;
    const a = this.actual;
    if (!a || v.fase !== "jugando" || v.fin === null || this.reloj() < v.fin) return false;
    if (a.sub.tipo === "test" || a.sub.tipo === "precio" || a.sub.tipo === "adivinar" || a.sub.tipo === "tarjetas") {
      this.revelar(a.sub);
      return true;
    }
    return false;
  }

  host(acc: AccionHost): void {
    if (acc.t === "deshacer") {
      const prev = this.pila.pop();
      if (prev) this.estado = JSON.parse(prev);
      return;
    }
    this.pila.push(JSON.stringify(this.estado));
    if (this.pila.length > 60) this.pila.shift();

    const e = this.estado;
    const v = e.vivo;
    const a = this.actual;
    const ahora = this.reloj();

    switch (acc.t) {
      case "vista":
        if (["juego", "marcador", "podio"].includes(acc.v)) v.vista = acc.v;
        if (acc.v === "podio") v.podioPaso = 0; // el final se revela por pasos
        return;
      case "tv": {
        const tv = (e.tv ??= { mudo: false, volumen: 80 });
        if (typeof acc.mudo === "boolean") tv.mudo = acc.mudo;
        if (Number.isFinite(acc.volumen)) tv.volumen = Math.max(0, Math.min(100, Math.round(acc.volumen!)));
        this.pila.pop(); // el sonido no es un paso de la partida: no se deshace
        return;
      }
      case "podioPaso":
        v.podioPaso = Math.min((v.podioPaso ?? 0) + 1, this.pasosPodio());
        return;
      case "ir":
        this.irA(acc.subId);
        return;
      case "siguientePrueba": {
        const subs = this.subs;
        const i = subs.findIndex((x) => x.id === v.subId);
        this.irA(subs[i + 1]?.id ?? null);
        return;
      }
      case "reiniciar": {
        const codigo = e.codigo;
        this.estado = { ...estadoVacio(), codigo };
        return;
      }
      case "continuar": {
        const g = v.subId ? e.guardados?.[v.subId] : undefined;
        if (!g) return;
        // Se retoma sin cuenta atrás (se había parado al salir); el presentador revela cuando quiera
        e.vivo = { ...g, fin: null, vista: v.vista };
        delete e.guardados![v.subId!];
        return;
      }
      case "codigo":
        e.codigo = nuevoCodigo();
        return;
      case "ajuste":
        if (this.ids.includes(acc.equipo) && Number.isFinite(acc.puntos)) e.ajustes.push({ equipo: acc.equipo, puntos: acc.puntos, motivo: acc.motivo.slice(0, 80) });
        return;
      case "quitarAjuste":
        e.ajustes.splice(acc.i, 1);
        return;
    }

    if (!a) return;
    const { sub } = a;
    switch (acc.t) {
      case "deCero":
        this.limpiar(sub.id);
        return;
      case "siguienteTurno": {
        if (sub.tipo !== "tarjetas" && sub.tipo !== "manual") return;
        const ids = this.ids;
        const jugados = Object.keys(e.crudo[sub.id] ?? {});
        const desde = v.turno ? ids.indexOf(v.turno) + 1 : 0;
        const orden = [...ids.slice(desde), ...ids.slice(0, desde)];
        const sig = orden.find((id) => !jugados.includes(id)) ?? orden[0];
        this.host({ t: "turno", equipo: sig });
        this.pila.pop(); // la llamada interna no cuenta como otro paso de deshacer
        return;
      }
      case "empezar":
        // Empezar desde el principio un test/precio/canción ya jugado lo reinicia (si no, sumaría dos veces)
        if ((sub.tipo === "test" || sub.tipo === "precio" || sub.tipo === "cancion") && v.fase === "intro" && e.crudo[sub.id]) this.limpiar(sub.id);
        if (sub.tipo === "tarjetas") {
          if (!v.turno) return;
          v.fase = "jugando";
          v.abiertaEn = ahora;
          v.fin = sub.segundos > 0 ? ahora + sub.segundos * 1000 : null;
          this.crudo(sub.id)[v.turno] ??= 0;
          this.siguienteTarjeta(sub);
        } else if (sub.tipo === "manual") {
          v.fase = "jugando";
          v.abiertaEn = ahora;
          v.fin = sub.segundos ? ahora + sub.segundos * 1000 : null;
        } else if (totalItems(sub) > 0) {
          this.abrir(sub);
        }
        return;
      case "revelar":
        this.revelar(sub);
        return;
      case "siguiente":
        if (sub.tipo === "tarjetas" || sub.tipo === "manual" || (sub.tipo === "adivinar" && !porItem(sub))) {
          v.fase = "resultado";
          v.sonando = false;
          return;
        }
        if (v.fase === "jugando") this.revelar(sub);
        if (v.indice + 1 < totalItems(sub)) {
          v.indice++;
          this.abrir(sub);
        } else {
          v.fase = "resultado";
          v.sonando = false;
        }
        return;
      case "resultado":
        if (v.fase === "jugando") this.revelar(sub);
        v.fase = "resultado";
        v.sonando = false;
        v.fin = null;
        return;
      case "confirmar": {
        const p: Record<EquipoId, number> = {};
        for (const eq of this.ids) p[eq] = Number.isFinite(acc.puntos[eq]) ? acc.puntos[eq] : 0;
        e.puntos[sub.id] = p;
        return;
      }
      case "desconfirmar":
        delete e.puntos[sub.id];
        return;
      case "limpiarSub":
        this.limpiar(sub.id);
        return;
      case "crudo": {
        if (!this.ids.includes(acc.equipo)) return;
        const c = this.crudo(sub.id);
        if (acc.valor === null || !Number.isFinite(acc.valor)) delete c[acc.equipo];
        else c[acc.equipo] = acc.valor;
        return;
      }
      case "correccion": {
        const fila = e.correcciones[sub.id]?.[acc.equipo];
        if (!fila || acc.item < 0 || acc.item >= fila.length || !Number.isFinite(acc.puntos)) return;
        fila[acc.item] = Math.max(-10, Math.min(10, acc.puntos));
        this.recontar(sub.id);
        return;
      }
      case "sonar":
        v.sonando = acc.on;
        return;
      case "repetir":
        v.repetir = (v.repetir ?? 0) + 1;
        v.sonando = true;
        return;
      case "acierto":
        if (sub.tipo === "cancion" && v.pulsado && v.fase === "jugando") {
          this.sumar(sub.id, v.pulsado, 1);
          v.acertante = v.pulsado;
          v.fase = "revelar";
          v.sonando = true;
          return;
        }
        if (sub.tipo === "tarjetas" && v.turno && v.fase === "jugando") {
          this.sumar(sub.id, v.turno, 1);
          this.siguienteTarjeta(sub);
        }
        return;
      case "fallo":
        if (sub.tipo === "cancion" && v.pulsado) {
          v.bloqueados.push(v.pulsado);
          v.pulsado = null;
          if (v.bloqueados.length >= this.ids.length) this.revelar(sub);
          else v.sonando = true;
        }
        return;
      case "pasar":
        if (sub.tipo === "tarjetas" && v.fase === "jugando") this.siguienteTarjeta(sub);
        return;
      case "turno":
        v.turno = acc.equipo && this.ids.includes(acc.equipo) ? acc.equipo : null;
        if (sub.tipo === "tarjetas") {
          v.fase = "intro";
          v.fin = null;
          v.tarjeta = -1;
        }
        return;
      case "crono": {
        const c = v.cronometro;
        if (acc.op === "start" && c.desde === null) c.desde = ahora;
        if (acc.op === "stop" && c.desde !== null) {
          c.acumulado += ahora - c.desde;
          c.desde = null;
        }
        if (acc.op === "reset") v.cronometro = { desde: null, acumulado: 0 };
        if (acc.op === "guardar" && acc.equipo && this.ids.includes(acc.equipo)) {
          const ms = c.acumulado + (c.desde !== null ? ahora - c.desde : 0);
          // No se para: en la torre de vasos juegan todos a la vez y se guarda cada tiempo al terminar
          this.crudo(sub.id)[acc.equipo] = Math.round(ms / 100) / 10;
        }
        return;
      }
      case "config": {
        const n = Math.round(Number(acc.valor));
        if (acc.campo === "segundosItem" && sub.tipo === "adivinar" && n >= 0 && n <= 600) sub.segundosItem = n;
        if (acc.campo === "segundos" && sub.tipo !== "cancion" && n >= 0 && n <= 600) sub.segundos = n;
        if (acc.campo === "tarjetaEnTv" && sub.tipo === "tarjetas") sub.tarjetaEnTv = !!acc.valor;
        if (acc.campo === "rapidez" && sub.tipo === "test") sub.rapidez = !!acc.valor;
        if (acc.campo === "fragmento" && sub.tipo === "cancion" && n >= 0 && n <= 600) sub.fragmento = n;
        return;
      }
      case "mas":
        if (v.fin !== null) v.fin += acc.segundos * 1000;
        else if (v.fase === "jugando") v.fin = ahora + acc.segundos * 1000;
        return;
    }
  }

  /** Pasos del podio: un paso por puesto distinto (los empatados se revelan juntos). */
  pasosPodio(): number {
    return new Set(Object.values(totales(this.contenido, this.estado))).size;
  }

  /** Un equipo se pone nombre desde su móvil. Devuelve true si cambió (hay que guardar el contenido). */
  renombrar(eq: EquipoId, nombre: unknown): boolean {
    const n = String(nombre ?? "").replace(/\s+/g, " ").trim().slice(0, 20);
    const e = this.contenido.equipos.find((x) => x.id === eq);
    if (!e || !n || n === e.nombre) return false;
    e.nombre = n;
    this.contenido.rev = (this.contenido.rev ?? 0) + 1;
    return true;
  }

  /** Acción de un equipo. Devuelve true si cambió el estado. */
  equipo(eq: EquipoId, acc: AccionEquipo): boolean {
    const a = this.actual;
    const v = this.estado.vivo;
    if (!a || !this.ids.includes(eq) || v.fase !== "jugando") return false;
    const { sub } = a;
    const ahora = this.reloj();
    const aTiempo = v.fin === null || ahora <= v.fin + 500;

    if (acc.t === "responder" && aTiempo) {
      if (sub.tipo === "test") {
        const p = sub.preguntas[v.indice];
        if (v.respuestas[eq] || !p || !Number.isInteger(acc.valor) || acc.valor < 0 || acc.valor >= p.opciones.length) return false;
        v.respuestas[eq] = { valor: acc.valor, ms: ahora - v.abiertaEn };
      } else if (sub.tipo === "precio") {
        if (!Number.isFinite(acc.valor) || acc.valor < 0) return false;
        v.respuestas[eq] = { valor: Math.round(acc.valor * 100) / 100, ms: ahora - v.abiertaEn };
        return true; // el precio se puede cambiar hasta que se cierre
      } else return false;
      if (this.ids.every((id) => v.respuestas[id])) this.revelar(sub);
      return true;
    }
    if (sub.tipo === "adivinar" && acc.t === "item" && porItem(sub) && aTiempo) {
      const h = v.hojas[eq];
      const valor = String(acc.valor ?? "").trim().slice(0, 60);
      if (!h || h.hechos[v.indice] || !valor) return false;
      h.valores[v.indice] = valor;
      h.hechos[v.indice] = true;
      if (this.ids.every((id) => v.hojas[id]?.hechos[v.indice])) this.revelar(sub);
      return true;
    }
    if (sub.tipo === "adivinar" && !porItem(sub) && (acc.t === "hoja" || acc.t === "entregar") && aTiempo) {
      const h = v.hojas[eq];
      if (!h || h.entregada) return false;
      if (acc.t === "entregar") {
        h.entregada = true;
        return true;
      }
      if (!Number.isInteger(acc.i) || acc.i < 0 || acc.i >= h.valores.length) return false;
      h.valores[acc.i] = String(acc.valor).slice(0, 60);
      return true;
    }
    if (acc.t === "pulsar" && sub.tipo === "cancion") {
      if (v.pulsado || v.bloqueados.includes(eq)) return false;
      v.pulsado = eq;
      v.sonando = false;
      return true;
    }
    return false;
  }

  // ---------- Vistas ----------

  publico(conectados: Record<EquipoId, number> = {}): Publico {
    const e = this.estado;
    const v = e.vivo;
    const a = this.actual;
    const tot = totales(this.contenido, e);
    const base: Publico = {
      ahora: this.reloj(),
      titulo: this.contenido.titulo,
      codigo: e.codigo,
      vista: v.vista ?? "juego",
      equipos: this.contenido.equipos.map((q) => ({ ...q, total: tot[q.id] ?? 0, conectados: conectados[q.id] ?? 0 })),
      sub: null,
      fase: v.fase,
      indice: v.indice,
      fin: v.fin,
      abiertaEn: v.abiertaEn,
      contestados: Object.keys(v.respuestas),
      pulsado: v.pulsado,
      bloqueados: v.bloqueados,
      sonando: v.sonando,
      turno: v.turno,
      cronometro: v.cronometro,
      podioPaso: v.podioPaso ?? 0,
      repetir: v.repetir ?? 0,
      tv: e.tv ?? { mudo: false, volumen: 80 },
      crudo: {},
      confirmado: false,
      desglose: desglose(this.contenido, e),
    };
    if (!a) return base;
    const { sub, prueba } = a;
    const revelado = v.fase === "revelar" || v.fase === "resultado";
    const pruebaNum = this.contenido.pruebas.indexOf(prueba) + 1;
    base.sub = { id: sub.id, tipo: sub.tipo, titulo: sub.titulo, descripcion: sub.descripcion, pruebaTitulo: prueba.titulo, pruebaNum, emoji: prueba.emoji, total: totalItems(sub) };
    base.crudo = e.crudo[sub.id] ?? {};
    base.confirmado = !!e.puntos[sub.id];
    base.ranking = puntosSub(sub, e, this.ids, this.contenido.tabla) ?? Object.fromEntries(this.ids.map((id) => [id, 0]));

    if (sub.tipo === "test") {
      base.sub.puntuacion = sub.puntuacion;
      const p = sub.preguntas[v.indice];
      if (p && v.fase !== "intro") {
        base.pregunta = { texto: p.texto, opciones: p.opciones, imagen: p.imagen };
        if (v.fase === "revelar") {
          base.solucion = { correcta: p.correcta };
          base.respuestasVisibles = Object.fromEntries(Object.entries(v.respuestas).map(([k, r]) => [k, r.valor]));
          const b = this.bonus(sub);
          if (b) base.bonus = Object.fromEntries(Object.entries(puntosTest(v.respuestas, p.correcta, b)).filter(([, n]) => n > 1).map(([k, n]) => [k, n - 1]));
        }
      }
    } else if (sub.tipo === "precio") {
      const p = sub.productos[v.indice];
      if (p && v.fase !== "intro") {
        base.pregunta = { texto: p.nombre, imagen: p.imagen };
        if (v.fase === "revelar") {
          base.solucion = { precio: p.precio };
          base.respuestasVisibles = Object.fromEntries(Object.entries(v.respuestas).map(([k, r]) => [k, r.valor]));
          const ofertas = Object.fromEntries(this.ids.map((id) => [id, v.respuestas[id]?.valor as number | undefined]));
          base.ganadores = Object.entries(puntosPrecio(ofertas, p.precio, sub.sinPasarse)).filter(([, n]) => n > 0).map(([k]) => k);
        }
      }
    } else if (sub.tipo === "adivinar") {
      const pi = porItem(sub);
      base.sub.estilo = sub.estilo;
      base.sub.porItem = pi;
      base.sub.opciones = sub.opciones;
      base.sub.items = sub.items.map((it) => ({ etiqueta: it.etiqueta, pregunta: it.pregunta }));
      // Un item está corregido si ya se reveló (por item: los anteriores y el actual tras revelar)
      const corregido = (i: number) => (pi ? v.fase !== "intro" && (i < v.indice || (i === v.indice && revelado)) : revelado);
      base.hojas = {};
      for (const eq of this.ids) {
        const h = v.hojas[eq];
        const ok = e.correcciones[sub.id]?.[eq];
        base.hojas[eq] = {
          entregada: !!h?.entregada,
          contestadas: h ? h.valores.filter((x) => x.trim()).length : 0,
          marcas: sub.items.map((_, i): Marca => {
            const n = Number(ok?.[i]) || 0;
            if (!corregido(i)) return null;
            if (n >= 1) return "ok";
            if (n > 0) return "medio";
            return h?.valores[i]?.trim() ? "ko" : "nada";
          }),
          puntos: sub.items.map((_, i) => (corregido(i) ? Number(ok?.[i]) || 0 : 0)),
          valores: sub.items.map((_, i) => (corregido(i) ? (h?.valores[i] ?? "") : "")),
        };
      }
      const sol = (r: string) => (r.includes("✏️") ? "(sin solución puesta)" : r.split("/")[0]);
      base.solucion = { respuestas: sub.items.map((it, i) => (corregido(i) ? sol(it.respuesta) : "")) };
      if (pi && v.fase !== "intro") {
        const it = sub.items[v.indice];
        if (it) base.pregunta = { texto: it.pregunta || it.etiqueta };
        base.contestados = this.ids.filter((id) => v.hojas[id]?.hechos?.[v.indice]);
      }
    } else if (sub.tipo === "cancion") {
      const c = sub.canciones[v.indice];
      base.audiosSub = sub.canciones.map((x) => x.audio).filter((x): x is string => !!x);
      if (c && v.fase !== "intro") {
        if (c.audio) base.audio = { src: c.audio, inicio: c.inicio, fragmento: fragmento(sub) };
        if (v.fase === "revelar") {
          base.solucion = { texto: `${c.titulo} — ${c.artista}` };
          base.ganadores = v.acertante ? [v.acertante] : [];
        }
      }
    } else if (sub.tipo === "tarjetas") {
      base.sub.modo = sub.modo;
      const t = sub.tarjetas[v.tarjeta];
      if (t?.condicion && v.fase === "jugando") base.condicion = t.condicion;
      if (t && v.fase === "jugando" && tarjetaEnTv(sub)) base.tarjeta = t;
    } else if (sub.tipo === "manual") {
      base.sub.medida = sub.medida;
      base.sub.cronometro = sub.cronometro;
    }
    return base;
  }

  vistaEquipo(pub: Publico, eq: EquipoId): VistaEquipo {
    const v = this.estado.vivo;
    const out: VistaEquipo = { ...pub, yo: eq };
    delete out.tarjeta; // la tarjeta nunca va a los móviles: la verían los que adivinan
    if (v.respuestas[eq]) out.miRespuesta = v.respuestas[eq].valor;
    if (v.hojas[eq]) out.miHoja = v.hojas[eq];
    return out;
  }
}
