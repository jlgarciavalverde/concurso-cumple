// Motor del concurso: estado + acciones del presentador y de los equipos. Sin E/S: el servidor persiste y emite.
import { coincide, desglose, puntosPrecio, puntosPropuestos, puntosRapidez, totales } from "../shared/puntuacion.ts";
import type { Contenido, Estado, EquipoId, Prueba, Publico, Sub, Vista, VistaEquipo, Vivo } from "../shared/tipos.ts";

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
  | { t: "correccion"; equipo: EquipoId; item: number; ok: boolean }
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
  | { t: "vista"; v: Vista };

export type AccionEquipo =
  | { t: "responder"; valor: number }
  | { t: "hoja"; i: number; valor: string }
  | { t: "entregar" }
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
    v.fin = null;
    if ((sub.tipo === "test" || sub.tipo === "precio" || sub.tipo === "adivinar") && sub.segundos > 0) v.fin = ahora + sub.segundos * 1000;
    if (sub.tipo === "adivinar") {
      v.hojas = {};
      for (const id of this.ids) v.hojas[id] = { valores: sub.items.map(() => ""), entregada: false };
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
      for (const [eq, r] of Object.entries(v.respuestas))
        if (p && r.valor === p.correcta) this.sumar(sub.id, eq, sub.rapidez ? puntosRapidez(r.ms, sub.segundos) : 1);
      for (const eq of this.ids) this.sumar(sub.id, eq, 0);
    } else if (sub.tipo === "precio") {
      const prod = sub.productos[v.indice];
      const ofertas: Record<EquipoId, number | undefined> = {};
      for (const eq of this.ids) ofertas[eq] = v.respuestas[eq]?.valor as number | undefined;
      if (prod) for (const [eq, n] of Object.entries(puntosPrecio(ofertas, prod.precio, sub.sinPasarse))) this.sumar(sub.id, eq, n);
    } else if (sub.tipo === "adivinar") {
      const corr: Record<EquipoId, boolean[]> = {};
      for (const eq of this.ids) {
        const h = v.hojas[eq];
        h && (h.entregada = true);
        corr[eq] = sub.items.map((it, i) => coincide(h?.valores[i] ?? "", it.respuesta));
      }
      this.estado.correcciones[sub.id] = corr;
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
    for (const eq of this.ids) c[eq] = (corr[eq] ?? []).filter(Boolean).length;
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

  /** Cierra sola la pregunta si se acabó el tiempo. Devuelve true si cambió algo. */
  tic(): boolean {
    const v = this.estado.vivo;
    const a = this.actual;
    if (!a || v.fase !== "jugando" || v.fin === null || this.reloj() < v.fin) return false;
    if (a.sub.tipo === "test" || a.sub.tipo === "precio" || a.sub.tipo === "adivinar") {
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
        return;
      case "ir": {
        e.vivo = vivoVacio();
        e.vivo.subId = this.buscar(acc.subId) ? acc.subId : null;
        return;
      }
      case "reiniciar": {
        const codigo = e.codigo;
        this.estado = { ...estadoVacio(), codigo };
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
      case "empezar":
        if (sub.tipo === "tarjetas") {
          if (!v.turno) return;
          v.fase = "jugando";
          v.abiertaEn = ahora;
          v.fin = sub.segundos > 0 ? ahora + sub.segundos * 1000 : null;
          this.crudo(sub.id)[v.turno] ??= 0;
          this.siguienteTarjeta(sub);
        } else if (sub.tipo === "manual") {
          v.fase = "jugando";
        } else if (totalItems(sub) > 0) {
          this.abrir(sub);
        }
        return;
      case "revelar":
        this.revelar(sub);
        return;
      case "siguiente":
        if (sub.tipo === "tarjetas" || sub.tipo === "manual" || sub.tipo === "adivinar") {
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
        delete e.crudo[sub.id];
        delete e.puntos[sub.id];
        delete e.correcciones[sub.id];
        delete e.tarjetasUsadas[sub.id];
        e.vivo = { ...vivoVacio(), subId: sub.id };
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
        if (!fila || acc.item < 0 || acc.item >= fila.length) return;
        fila[acc.item] = acc.ok;
        this.recontar(sub.id);
        return;
      }
      case "sonar":
        v.sonando = acc.on;
        return;
      case "acierto":
        if (sub.tipo === "cancion" && v.pulsado && v.fase === "jugando") {
          this.sumar(sub.id, v.pulsado, 1);
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
      case "mas":
        if (v.fin !== null) v.fin += acc.segundos * 1000;
        else if (v.fase === "jugando") v.fin = ahora + acc.segundos * 1000;
        return;
    }
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
    if (sub.tipo === "adivinar" && (acc.t === "hoja" || acc.t === "entregar") && aTiempo) {
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
      crudo: {},
      confirmado: false,
      desglose: desglose(this.contenido, e),
    };
    if (!a) return base;
    const { sub, prueba } = a;
    const revelado = v.fase === "revelar" || v.fase === "resultado";
    base.sub = { id: sub.id, tipo: sub.tipo, titulo: sub.titulo, descripcion: sub.descripcion, pruebaTitulo: prueba.titulo, emoji: prueba.emoji, total: totalItems(sub) };
    base.crudo = e.crudo[sub.id] ?? {};
    base.confirmado = !!e.puntos[sub.id];
    base.ranking = e.puntos[sub.id] ?? puntosPropuestos(sub, base.crudo, this.ids, this.contenido.tabla);

    if (sub.tipo === "test") {
      base.sub.puntuacion = sub.puntuacion;
      const p = sub.preguntas[v.indice];
      if (p && v.fase !== "intro") {
        base.pregunta = { texto: p.texto, opciones: p.opciones, imagen: p.imagen };
        if (v.fase === "revelar") {
          base.solucion = { correcta: p.correcta };
          base.respuestasVisibles = Object.fromEntries(Object.entries(v.respuestas).map(([k, r]) => [k, r.valor]));
        }
      }
    } else if (sub.tipo === "precio") {
      const p = sub.productos[v.indice];
      if (p && v.fase !== "intro") {
        base.pregunta = { texto: p.nombre, imagen: p.imagen };
        if (v.fase === "revelar") {
          base.solucion = { precio: p.precio };
          base.respuestasVisibles = Object.fromEntries(Object.entries(v.respuestas).map(([k, r]) => [k, r.valor]));
        }
      }
    } else if (sub.tipo === "adivinar") {
      base.sub.estilo = sub.estilo;
      base.sub.opciones = sub.opciones;
      base.sub.items = sub.items.map((it) => ({ etiqueta: it.etiqueta, pregunta: it.pregunta }));
      base.hojas = {};
      for (const eq of this.ids) {
        const h = v.hojas[eq];
        base.hojas[eq] = {
          entregada: !!h?.entregada,
          contestadas: h ? h.valores.filter((x) => x.trim()).length : 0,
          ...(revelado ? { aciertos: e.correcciones[sub.id]?.[eq], valores: h?.valores } : {}),
        };
      }
      if (revelado) base.solucion = { respuestas: sub.items.map((it) => it.respuesta.split("/")[0]) };
    } else if (sub.tipo === "cancion") {
      const c = sub.canciones[v.indice];
      if (c && v.fase !== "intro") {
        if (c.audio) base.audio = { src: c.audio, inicio: c.inicio };
        if (v.fase === "revelar") base.solucion = { texto: `${c.titulo} — ${c.artista}` };
      }
    } else if (sub.tipo === "tarjetas") {
      base.sub.modo = sub.modo;
      const t = sub.tarjetas[v.tarjeta];
      if (t?.condicion && v.fase === "jugando") base.condicion = t.condicion;
    } else if (sub.tipo === "manual") {
      base.sub.medida = sub.medida;
      base.sub.cronometro = sub.cronometro;
    }
    return base;
  }

  vistaEquipo(pub: Publico, eq: EquipoId): VistaEquipo {
    const v = this.estado.vivo;
    const out: VistaEquipo = { ...pub, yo: eq };
    if (v.respuestas[eq]) out.miRespuesta = v.respuestas[eq].valor;
    if (v.hojas[eq]) out.miHoja = v.hojas[eq];
    return out;
  }
}
