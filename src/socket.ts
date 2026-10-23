import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Oyente = (d: any) => void;

/** Conexión en tiempo real. `desfase` = reloj del servidor − reloj local (para las cuentas atrás). */
export function useCanal<T extends { ahora: number }>(auth: Record<string, string> | null, evento: string, otros?: Record<string, Oyente>) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conectado, setConectado] = useState(false);
  const [desfase, setDesfase] = useState(0);
  const ref = useRef<Socket | null>(null);
  // Mensajes que el servidor aún no ha confirmado: se reenvían al reconectar (una respuesta no se pierde
  // aunque el móvil se quede sin red justo al pulsar)
  const cola = useRef<{ id: number; ev: string; payload: unknown }[]>([]);
  const siguienteId = useRef(0);
  const clave = JSON.stringify(auth);

  const mandar = (m: { id: number; ev: string; payload: unknown }) => {
    const s = ref.current;
    if (!s?.connected) return;
    s.timeout(2500).emit(m.ev, m.payload, (err: unknown) => {
      if (!err) cola.current = cola.current.filter((x) => x.id !== m.id);
    });
  };

  useEffect(() => {
    if (!auth) return;
    setError(null);
    const s = io({ auth, transports: ["websocket", "polling"] });
    ref.current = s;
    s.on("connect", () => {
      setConectado(true);
      for (const m of cola.current) mandar(m);
    });
    s.on("disconnect", () => setConectado(false));
    // El móvil sabe al instante que se ha quedado sin red; el latido de la conexión tardaría segundos
    const sinRed = () => s.disconnect();
    const conRed = () => s.connected || s.connect();
    const alVolver = () => document.visibilityState === "visible" && !s.connected && s.connect();
    addEventListener("offline", sinRed);
    addEventListener("online", conRed);
    document.addEventListener("visibilitychange", alVolver);
    s.on("error", (e: string) => setError(e));
    for (const [ev, fn] of Object.entries(otros ?? {})) s.on(ev, fn);
    // El servidor mide la latencia de cada móvil (pulsador justo): contestar al momento
    s.on("latido", (ack?: () => void) => ack?.());
    s.on(evento, (d: T) => {
      setDesfase(d.ahora - Date.now());
      setDatos(d);
    });
    return () => {
      removeEventListener("offline", sinRed);
      removeEventListener("online", conRed);
      document.removeEventListener("visibilitychange", alVolver);
      s.disconnect();
      ref.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, evento]);

  const enviar = (ev: string, payload: unknown) => ref.current?.emit(ev, payload);
  /** Como `enviar`, pero el servidor confirma y, si no, se reenvía al reconectar. */
  const enviarSeguro = (ev: string, payload: unknown) => {
    const m = { id: ++siguienteId.current, ev, payload };
    cola.current.push(m);
    mandar(m);
  };
  /** Envía y espera la respuesta del servidor (o un error si no contesta). */
  const preguntar = <R,>(ev: string, payload: unknown) =>
    new Promise<R>((ok, mal) => {
      const s = ref.current;
      if (!s?.connected) return mal(new Error("Sin conexión: espera un momento y vuelve a intentarlo"));
      s.timeout(5000).emit(ev, payload, (err: unknown, r: R) => (err ? mal(new Error("El servidor no responde: vuelve a intentarlo")) : ok(r)));
    });
  return { datos, error, conectado, desfase, enviar, enviarSeguro, preguntar };
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
