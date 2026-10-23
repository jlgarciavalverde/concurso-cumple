// Votación del mejor disfraz: cada invitado, desde su móvil, elige quién es y vota a otro.
import { useEffect, useState, type ReactNode } from "react";
import type { VotacionPublica } from "../../shared/tipos.ts";
import { useWakeLock } from "../components/comun.tsx";
import { Icono } from "../components/iconos.tsx";
import { guardado, useCanal } from "../socket.ts";

type Datos = { ahora: number; titulo: string; votacion: VotacionPublica };

export function Votar() {
  const url = new URLSearchParams(location.search).get("c");
  const [codigo] = useState((url ?? guardado.leer("codigo") ?? "").toUpperCase());
  const [yo, setYo] = useState(guardado.leer("votante"));
  const [elegido, setElegido] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { datos, error: errorConexion, conectado, preguntar } = useCanal<Datos>(codigo ? { rol: "votante", codigo } : null, "votacion");
  useWakeLock(true);
  useEffect(() => {
    if (url) {
      guardado.poner("codigo", url.toUpperCase());
      history.replaceState(null, "", "/votar");
    }
  }, [url]);

  const marco = (hijos: ReactNode) => (
    <div className="movil">
      {!conectado && datos && <div className="banda-conexion"><Icono n="recargar" /> Reconectando…</div>}
      <div className="marquesina" style={{ textAlign: "center", fontFamily: "var(--titular)", color: "var(--bombilla)", fontSize: "1.4em", textTransform: "uppercase" }}>
        Mejor disfraz
      </div>
      <div className="movil-cuerpo">{hijos}</div>
    </div>
  );

  if (!codigo || errorConexion) return marco(<div className="espera">Escanea el QR de la TV para votar.</div>);
  if (!datos) return marco(<div className="espera">{conectado ? "Cargando…" : "Conectando…"}</div>);
  const v = datos.votacion;
  if (!v.participantes.length) return marco(<div className="espera">Aún no hay lista de disfraces.</div>);

  // 1) ¿Quién eres?
  if (!yo || !v.participantes.includes(yo))
    return marco(
      <>
        <div className="espera">¿Quién eres?</div>
        <div className="col">
          {v.participantes.map((n) => {
            const ya = v.votaron.includes(n);
            return (
              <button
                key={n}
                className="btn grande"
                disabled={ya}
                style={ya ? { textDecoration: "line-through" } : undefined}
                onClick={() => {
                  guardado.poner("votante", n);
                  setYo(n);
                }}
              >
                {n}
                {ya && " · ya ha votado"}
              </button>
            );
          })}
        </div>
      </>,
    );

  const cambiarDePersona = (
    <button className="btn peq" style={{ alignSelf: "center", background: "transparent", border: 0, color: "var(--suave)", boxShadow: "none" }} onClick={() => { guardado.poner("votante", null); setYo(null); }}>
      No soy {yo}
    </button>
  );

  if (v.votaron.includes(yo) && v.estado !== "cerrada")
    return marco(
      <>
        <div className="espera"><div className="grande"><Icono n="check" tam="1.2em" /></div>¡Voto enviado, {yo}!</div>
        <div className="espera suave">Han votado {v.votaron.length} de {v.participantes.length}. Mirad la TV.</div>
      </>,
    );
  if (v.estado === "preparada") return marco(<><div className="espera"><div className="grande"><Icono n="reloj" tam="1.2em" /></div>Hola, {yo}. La votación aún no ha empezado.</div>{cambiarDePersona}</>);
  if (v.estado === "cerrada") {
    const ganador = v.paso >= v.totalPasos && v.totalPasos ? v.revelados.at(-1) : null;
    return marco(
      <div className="espera">
        <div className="grande"><Icono n="trofeo" tam="1.2em" /></div>
        {ganador ? `¡Mejor disfraz: ${ganador.nombres.join(" y ")}!` : "Votación cerrada. ¡Mirad la TV!"}
      </div>,
    );
  }

  // 2) ¿Qué disfraz te ha gustado más?
  const opciones = v.candidatos.filter((n) => n !== yo);
  return marco(
    <>
      <div className="espera">
        {v.ronda > 1 ? "¡Desempate! " : ""}
        {yo}, ¿qué disfraz te ha gustado más?
      </div>
      {error && <div className="error" role="alert">{error}</div>}
      <div className="col">
        {opciones.map((n) => (
          <button key={n} className={`btn grande ${elegido === n ? "prim" : ""}`} onClick={() => setElegido(n)} aria-pressed={elegido === n}>
            {n}
          </button>
        ))}
      </div>
      <button
        className="btn oro grande"
        disabled={!elegido || enviando}
        onClick={async () => {
          if (!elegido) return;
          setEnviando(true);
          setError(null);
          try {
            const r = await preguntar<{ ok: boolean; error?: string }>("votar", { votante: yo, votado: elegido });
            if (!r.ok) setError(r.error ?? "No se ha podido votar");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setEnviando(false);
          }
        }}
      >
        {enviando ? "Enviando…" : elegido ? `Votar a ${elegido}` : "Elige un disfraz"}
      </button>
      {cambiarDePersona}
    </>,
  );
}
