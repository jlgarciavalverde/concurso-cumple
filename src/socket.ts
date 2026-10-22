import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

/** Conexión en tiempo real. `desfase` = reloj del servidor − reloj local (para las cuentas atrás). */
export function useCanal<T extends { ahora: number }>(auth: Record<string, string> | null, evento: string, otros?: Record<string, () => void>) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conectado, setConectado] = useState(false);
  const [desfase, setDesfase] = useState(0);
  const ref = useRef<Socket | null>(null);
  const clave = JSON.stringify(auth);

  useEffect(() => {
    if (!auth) return;
    setError(null);
    const s = io({ auth, transports: ["websocket", "polling"] });
    ref.current = s;
    s.on("connect", () => setConectado(true));
    s.on("disconnect", () => setConectado(false));
    s.on("error", (e: string) => setError(e));
    for (const [ev, fn] of Object.entries(otros ?? {})) s.on(ev, fn);
    s.on(evento, (d: T) => {
      setDesfase(d.ahora - Date.now());
      setDatos(d);
    });
    return () => {
      s.disconnect();
      ref.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, evento]);

  const enviar = (ev: string, payload: unknown) => ref.current?.emit(ev, payload);
  return { datos, error, conectado, desfase, enviar };
}

/** Re-renderiza cada `ms` mientras `activo`. */
export function useTic(activo: boolean, ms = 200) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!activo) return;
    const id = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [activo, ms]);
}

export const guardado = {
  leer(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  poner(k: string, v: string | null) {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* modo privado */
    }
  },
};
