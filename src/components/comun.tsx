import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import type { Publico } from "../../shared/tipos.ts";
import { useTic } from "../socket.ts";

export const FORMAS = ["▲", "◆", "●", "■"];

export const conColor = (c: string) => ({ "--c": c }) as CSSProperties;

export function segundosRestantes(fin: number | null, desfase: number): number | null {
  if (fin === null) return null;
  return Math.max(0, Math.ceil((fin - (Date.now() + desfase)) / 1000));
}

/** Cuenta atrás circular. */
export function Cuenta({ fin, inicio, desfase, tam }: { fin: number | null; inicio: number; desfase: number; tam?: string }) {
  useTic(fin !== null, 200);
  const s = segundosRestantes(fin, desfase);
  if (s === null) return null;
  const total = Math.max(1, (fin! - inicio) / 1000);
  const frac = Math.min(1, s / total);
  return (
    <div className={`cuenta ${s <= 5 ? "urgente" : ""}`} style={{ ...(tam ? { width: tam, height: tam, fontSize: `calc(${tam} * 0.42)` } : {}), ...(s >= 100 ? { fontSize: tam ? `calc(${tam} * 0.3)` : "4.4vh" } : {}) }}>
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="45" fill="none" stroke="#ffffff22" strokeWidth="8" />
        <circle cx="50" cy="50" r="45" fill="none" stroke={s <= 5 ? "var(--ko)" : "var(--oro)"} strokeWidth="8" strokeDasharray={`${frac * 283} 283`} strokeLinecap="round" style={{ transition: "stroke-dasharray 0.25s linear" }} />
      </svg>
      {s}
    </div>
  );
}

export function tiempoCrono(c: Publico["cronometro"], desfase: number): number {
  return c.acumulado + (c.desde !== null ? Date.now() + desfase - c.desde : 0);
}

export function Crono({ c, desfase, className }: { c: Publico["cronometro"]; desfase: number; className?: string }) {
  useTic(c.desde !== null, 100);
  return <div className={className ?? "crono"}>{(tiempoCrono(c, desfase) / 1000).toFixed(1)}</div>;
}

export function equipoDe(p: Publico, id: string | null | undefined) {
  return p.equipos.find((e) => e.id === id);
}

/** Etiqueta del valor crudo según el tipo de prueba. */
export function etiquetaCrudo(p: Publico): string {
  switch (p.sub?.tipo) {
    case "test":
      return p.sub.puntuacion === "aciertos" ? "Aciertos" : "Puntos";
    case "precio":
      return "Puntos";
    case "manual":
      return p.sub.medida ?? "Marca";
    default:
      return "Aciertos";
  }
}

/** Posiciones del rosco en círculo. */
export function posRosco(i: number, n: number) {
  const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
  return { left: `${50 + 42 * Math.cos(ang)}%`, top: `${50 + 42 * Math.sin(ang)}%` };
}

let ctx: AudioContext | null = null;
/** Pitido sintético (pulsador, fin de tiempo) sin archivos. */
export function pitido(freq = 880, dur = 0.18, tipo: OscillatorType = "square") {
  try {
    ctx ??= new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = tipo;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur);
  } catch {
    /* sin audio */
  }
}
export function desbloquearAudio() {
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
  } catch {
    /* sin audio */
  }
}

/** 1.5 → «1,5»; enteros sin decimales. */
export const fmt = (n: number | undefined) => (n ?? 0).toLocaleString("es-ES", { maximumFractionDigits: 2 });

/** Mantiene la pantalla encendida mientras `activo` (se vuelve a pedir al volver a la pestaña). */
export function useWakeLock(activo: boolean) {
  useEffect(() => {
    if (!activo || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const pedir = () => {
      if (document.visibilityState !== "visible") return;
      navigator.wakeLock.request("screen").then((l) => (lock = l)).catch(() => {});
    };
    pedir();
    document.addEventListener("visibilitychange", pedir);
    return () => {
      document.removeEventListener("visibilitychange", pedir);
      void lock?.release().catch(() => {});
    };
  }, [activo]);
}

export const sonidos = {
  tic: () => pitido(1200, 0.05, "sine"),
  bocina: () => {
    pitido(220, 0.7, "sawtooth");
    setTimeout(() => pitido(180, 0.6, "sawtooth"), 120);
  },
  acierto: () => {
    pitido(880, 0.12, "sine");
    setTimeout(() => pitido(1320, 0.25, "sine"), 110);
  },
  pulsador: () => pitido(660, 0.35),
  redoble: () => {},
  fanfarria: () => {},
};

/** Tic en los últimos 5 s y bocina al llegar a 0. */
export function useSonidosCuenta(fin: number | null, desfase: number, activo: boolean) {
  const prev = useRef<number | null>(null);
  const des = useRef(desfase);
  des.current = desfase; // el desfase cambia con cada mensaje: que no reinicie la cuenta
  useEffect(() => {
    prev.current = null;
    if (fin === null || !activo) return;
    const id = setInterval(() => {
      const s = segundosRestantes(fin, des.current);
      if (s === null || s === prev.current) return;
      if (prev.current !== null) {
        if (s === 0) sonidos.bocina();
        else if (s <= 5) sonidos.tic();
      }
      prev.current = s;
    }, 200);
    return () => clearInterval(id);
  }, [fin, activo]);
}

/** Grupos del podio de peor a mejor (los empatados van juntos), con su puesto. */
export function gruposPodio(equipos: Publico["equipos"]) {
  const totales = [...new Set(equipos.map((e) => e.total))].sort((a, b) => a - b);
  return totales.map((total) => ({
    total,
    puesto: equipos.filter((e) => e.total > total).length + 1,
    ids: equipos.filter((e) => e.total === total).map((e) => e.id),
  }));
}

Object.assign(sonidos, {
  redoble: () => {
    for (let i = 0; i < 14; i++) setTimeout(() => pitido(110 + (i % 2) * 8, 0.06, "triangle"), i * 55);
  },
  fanfarria: () => {
    const notas: [number, number, number][] = [
      [523, 0, 0.15], [659, 150, 0.15], [784, 300, 0.15], [1047, 450, 0.35],
      [784, 820, 0.12], [1047, 950, 0.6],
    ];
    for (const [f, t, d] of notas) setTimeout(() => pitido(f, d, "square"), t);
  },
});
