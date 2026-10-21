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
