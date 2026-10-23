import { useEffect, useRef, useState } from "react";
import type { Contenido } from "../../shared/tipos.ts";
import { Icono } from "../components/iconos.tsx";
import { useTic } from "../socket.ts";
import { revisarDisfraces } from "../../shared/revision.ts";
import { Campo, Texto } from "./admin/campos.tsx";
import { EditorSub, type ApiSpotify } from "./admin/Editores.tsx";
import { Portada } from "./admin/Portada.tsx";
import { usePin } from "./Presentador.tsx";

async function api<T>(pin: string, metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
  const r = await fetch(ruta, {
    method: metodo,
    headers: { "x-pin": pin, ...(cuerpo !== undefined ? { "content-type": "application/json" } : {}) },
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error ?? `Error ${r.status}`), { status: r.status });
  return d as T;
}

async function subir(pin: string, f: File): Promise<string> {
  const fd = new FormData();
  fd.append("archivo", f);
  const r = await fetch("/api/admin/subir", { method: "POST", headers: { "x-pin": pin }, body: fd });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? `Error ${r.status}`);
  return d.url;
}

type EstadoGuardado = { t: "guardado"; en: number } | { t: "pendiente" } | { t: "guardando" } | { t: "error"; msg: string } | { t: "conflicto"; msg: string };

const COLORES = [["Rojo", "#ef4444"], ["Azul", "#3b82f6"], ["Verde", "#22c55e"], ["Amarillo", "#eab308"], ["Morado", "#a855f7"], ["Naranja", "#f97316"], ["Rosa", "#ec4899"], ["Turquesa", "#14b8a6"]];

/** Equipo nuevo con el primer color y nombre libres. */
function nuevoEquipo(equipos: Contenido["equipos"]): Contenido["equipos"][number] {
  const usado = (n: string, col: string) => equipos.some((e) => e.color.toLowerCase() === col || e.nombre.toLocaleLowerCase("es") === n.toLocaleLowerCase("es"));
  const [nombre, color] = COLORES.find(([n, col]) => !usado(n, col)) ?? [`Equipo ${equipos.length + 1}`, "#94a3b8"];
  return { id: `eq-${Date.now().toString(36)}`, nombre, color };
}

export function Admin() {
  const { pin, ok, pedir, salir } = usePin();
  const [c, setC] = useState<Contenido | null>(null);
  const [guardado, setGuardado] = useState<EstadoGuardado>({ t: "guardado", en: Date.now() });
  const [error, setError] = useState<string | undefined>();
  const [abierta, setAbierta] = useState<string | null>(null);
  const [spotifyEstado, setSpotifyEstado] = useState<ApiSpotify["estado"]>(null);
  // Vuelta de Spotify tras conectar la cuenta: /admin?spotify=ok|error&msg=…
  const [avisoSpotify, setAvisoSpotify] = useState<{ ok: boolean; t: string } | null>(() => {
    const q = new URLSearchParams(location.search);
    if (!q.get("spotify")) return null;
    history.replaceState(null, "", "/admin");
    return q.get("spotify") === "ok" ? { ok: true, t: "Spotify conectado. Ya puedes cargar listas en las rondas de canciones." } : { ok: false, t: `No se ha podido conectar Spotify: ${q.get("msg") ?? ""}` };
  });
  const version = useRef(0); // sube con cada cambio: si cambia mientras se guarda, queda pendiente
  const cRef = useRef<Contenido | null>(null);
  cRef.current = c;
  useTic(guardado.t === "guardado", 5000);

  useEffect(() => {
    if (!ok) return;
    api<Contenido>(pin, "GET", "/api/admin/contenido")
      .then(setC)
      .catch((e) => {
        if (e.status === 401) {
          setError("PIN incorrecto");
          salir();
        } else setGuardado({ t: "error", msg: e.message });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ok]);

  useEffect(() => {
    if (!ok) return;
    api<ApiSpotify["estado"]>(pin, "GET", "/api/admin/spotify/estado").then(setSpotifyEstado).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ok]);

  const guardar = async () => {
    const actual = cRef.current;
    if (!actual) return;
    const v = version.current;
    setGuardado({ t: "guardando" });
    try {
      const r = await api<{ rev: number }>(pin, "PUT", "/api/admin/contenido", actual);
      setC((prev) => (prev ? { ...prev, rev: r.rev } : prev));
      setGuardado(version.current === v ? { t: "guardado", en: Date.now() } : { t: "pendiente" });
    } catch (e) {
      const err = e as Error & { status?: number };
      setGuardado(err.status === 409 ? { t: "conflicto", msg: err.message } : { t: "error", msg: err.message });
    }
  };

  // Guardado automático: 1,5 s después del último cambio
  useEffect(() => {
    if (guardado.t !== "pendiente") return;
    const t = setTimeout(guardar, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guardado, c]);

  useEffect(() => {
    if (guardado.t !== "pendiente" && guardado.t !== "guardando") return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener("beforeunload", h);
    return () => removeEventListener("beforeunload", h);
  }, [guardado.t]);

  if (!ok) return pedir(error);
  if (!c) return <div className="movil"><div className="movil-cuerpo espera">{guardado.t === "error" ? guardado.msg : "Cargando…"}</div></div>;

  const cambiar = (n: Contenido) => {
    if (guardado.t === "conflicto") return; // primero hay que recargar
    version.current++;
    setC(n);
    setGuardado({ t: "pendiente" });
  };
  const up = (f: File) => subir(pin, f);
  const apiSpotify: ApiSpotify = {
    estado: spotifyEstado,
    conectar: async () => {
      try {
        const { url } = await api<{ url: string }>(pin, "POST", "/api/admin/spotify/conectar");
        location.href = url;
      } catch (e) {
        setAvisoSpotify({ ok: false, t: (e as Error).message });
      }
    },
    lista: (url) => api(pin, "POST", "/api/admin/spotify/lista", { url }),
  };
  const ir = (subId: string) => {
    setAbierta(subId);
    requestAnimationFrame(() => document.getElementById(`ronda-${subId}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const hace = guardado.t === "guardado" ? Math.round((Date.now() - guardado.en) / 1000) : 0;

  return (
    <div className="admin">
      <div className="panel fila barra-admin">
        <div className="col" style={{ gap: 2 }}>
          <b>Contenido del concurso</b>
          <span className={`estado-guardado ${guardado.t}`} role="status">
            {guardado.t === "guardado" && <><Icono n="check" /> Guardado {hace < 5 ? "ahora" : `hace ${hace < 60 ? `${hace} s` : `${Math.round(hace / 60)} min`}`}</>}
            {guardado.t === "pendiente" && "Guardando cambios…"}
            {guardado.t === "guardando" && "Guardando…"}
            {guardado.t === "error" && <><Icono n="aviso" /> No se ha podido guardar: {guardado.msg}</>}
          </span>
        </div>
        <div className="fila">
          {(guardado.t === "error" || guardado.t === "pendiente") && <button className="btn prim peq" onClick={guardar}><Icono n="check" /> Guardar ya</button>}
          <a className="btn peq" href="/presentador" style={{ textDecoration: "none" }}><Icono n="micro" /> Presentador</a>
        </div>
      </div>
      {guardado.t === "conflicto" && (
        <div className="error col" role="alert">
          <b><Icono n="aviso" /> Alguien ha cambiado el contenido mientras tenías esto abierto (por ejemplo el presentador, en directo).</b>
          <span>Tus últimos cambios no se han guardado. Recarga para ver la versión actual y vuelve a hacerlos.</span>
          <button className="btn prim" style={{ alignSelf: "flex-start" }} onClick={() => location.reload()}><Icono n="recargar" /> Recargar</button>
        </div>
      )}

      {avisoSpotify && <div className={avisoSpotify.ok ? "panel" : "error"} role="status" style={avisoSpotify.ok ? { borderColor: "#1db954" } : undefined}>{avisoSpotify.t}</div>}
      <Portada c={c} onIr={ir} />

      <div className="panel col">
        <h3>Datos generales</h3>
        <Campo etiqueta="Nombre del concurso (sale en la TV)"><Texto v={c.titulo} on={(titulo) => cambiar({ ...c, titulo })} /></Campo>
        <div className="campo-etiqueta">Equipos: nombre y quién juega en cada uno (el nombre también lo pueden cambiar ellos desde el móvil)</div>
        {c.equipos.map((q, i) => {
          const setEq = (cambio: Partial<typeof q>) => cambiar({ ...c, equipos: c.equipos.map((x, j) => (j === i ? { ...x, ...cambio } : x)) });
          return (
            <div key={q.id} className="fila equipo-admin">
              <input type="color" aria-label={`Color del equipo ${i + 1}`} value={q.color} onChange={(e) => setEq({ color: e.target.value })} />
              <input className="campo" style={{ flex: "1 1 160px" }} aria-label={`Nombre del equipo ${i + 1}`} value={q.nombre} onChange={(e) => setEq({ nombre: e.target.value })} />
              <input
                className="campo"
                style={{ flex: "3 1 260px" }}
                aria-label={`Integrantes del equipo ${i + 1}`}
                placeholder="Integrantes, separados por comas: Ana, Luis, Marta"
                value={(q.miembros ?? []).join(",")}
                onChange={(e) => setEq({ miembros: e.target.value.split(",") })}
              />
              {c.equipos.length > 2 && (
                <button
                  type="button"
                  className="btn peq"
                  aria-label={`Quitar el equipo ${q.nombre}`}
                  onClick={() => confirm(`¿Quitar el equipo «${q.nombre}»? Si ya tiene puntos, se pierden.`) && cambiar({ ...c, equipos: c.equipos.filter((_, j) => j !== i) })}
                >
                  <Icono n="basura" />
                </button>
              )}
            </div>
          );
        })}
        {c.equipos.length < 8 && (
          <button type="button" className="btn peq" style={{ alignSelf: "flex-start" }} onClick={() => cambiar({ ...c, equipos: [...c.equipos, nuevoEquipo(c.equipos)] })}>
            <Icono n="mas" /> Añadir equipo
          </button>
        )}
      </div>

      <section id="ronda-disfraces" className="panel col">
        <div className="fila" style={{ justifyContent: "space-between" }}>
          <h3>Concurso de disfraces (al final)</h3>
          {revisarDisfraces(c).length ? <span className="estado-falta">Falta: {revisarDisfraces(c)[0]}</span> : <span className="estado-listo"><Icono n="check" /> Lista</span>}
        </div>
        <details className="guia" open>
          <summary><Icono n="info" /> Cómo funciona</summary>
          <dl>
            <dt>Qué es</dt>
            <dd>Después del concurso, todos votan el disfraz que más les ha gustado.</dd>
            <dt>Cómo se juega el día</dt>
            <dd>
              El presentador abre la votación y la TV enseña un QR. Cada invitado lo escanea con su móvil, elige su nombre y vota a otro (no vale votarse a sí mismo; un
              voto por persona). Al cerrar, la TV revela el 3º, el 2º y el ganador con suspense.
            </dd>
            <dt>Qué escribir aquí</dt>
            <dd>Los nombres de todos los que van disfrazados (y votan), uno por línea. Si hay dos con el mismo nombre, añade la inicial del apellido («Ana G.», «Ana M.»).</dd>
          </dl>
        </details>
        <Campo etiqueta="Invitados disfrazados (uno por línea)" ayuda={`${(c.disfraces?.participantes ?? []).filter((x) => x.trim()).length} en la lista`}>
          <textarea
            className={`campo ${revisarDisfraces(c).length ? "falta" : ""}`}
            rows={8}
            value={(c.disfraces?.participantes ?? []).join("\n")}
            onChange={(e) => cambiar({ ...c, disfraces: { participantes: e.target.value.split("\n") } })}
            placeholder={"Ana\nLuis\nMarta…"}
          />
        </Campo>
      </section>

      {c.pruebas.map((pr, pi) => {
        const setPr = (p: typeof pr) => cambiar({ ...c, pruebas: c.pruebas.map((x, j) => (j === pi ? p : x)) });
        return (
          <section key={pr.id} className="col prueba-admin">
            <div className="fila">
              <span className="etiqueta">Prueba {pi + 1}</span>
              <input className="campo titulo-prueba" aria-label={`Nombre de la prueba ${pi + 1}`} value={pr.titulo} onChange={(e) => setPr({ ...pr, titulo: e.target.value })} />
            </div>
            {pr.subs.map((s, si) => (
              <EditorSub
                key={s.id}
                sub={s}
                num={pr.subs.length > 1 ? `${pi + 1}.${si + 1}` : `${pi + 1}`}
                abierto={abierta === s.id}
                onAbrir={(a) => setAbierta(a ? s.id : abierta === s.id ? null : abierta)}
                subir={up}
                spotify={apiSpotify}
                onChange={(ns) => setPr({ ...pr, subs: pr.subs.map((x, j) => (j === si ? ns : x)) })}
              />
            ))}
            {pr.subs.length > 1 && (
              <details className="avanzados">
                <summary>Ajustes avanzados de la prueba</summary>
                <label className="fila" style={{ marginTop: 8 }}>
                  <input type="checkbox" checked={pr.agrupar} onChange={(e) => setPr({ ...pr, agrupar: e.target.checked })} />
                  Repartir 10/5/3/1 una sola vez para toda la prueba (si no, cada ronda reparte los suyos)
                </label>
              </details>
            )}
          </section>
        );
      })}

      <details className="panel avanzados">
        <summary>Ajustes avanzados del concurso</summary>
        <div className="col" style={{ marginTop: 10 }}>
          <Campo etiqueta="Puntos por puesto en cada ronda (1º, 2º, 3º, 4º…)">
            <input className="campo" value={c.tabla.join(", ")} onChange={(e) => cambiar({ ...c, tabla: e.target.value.split(/[,\s]+/).filter(Boolean).map(Number).filter(Number.isFinite) })} />
          </Campo>
          <div className="fila">
            <button
              className="btn ko peq"
              onClick={async () => {
                if (!confirm("¿Volver al contenido de fábrica? Se pierde TODO lo que se haya escrito.")) return;
                setC(await api<Contenido>(pin, "POST", "/api/admin/restaurar"));
                setGuardado({ t: "guardado", en: Date.now() });
              }}
            >
              Volver al contenido de fábrica
            </button>
            <button
              className="btn peq"
              onClick={() => {
                const b = new Blob([JSON.stringify(c, null, 2)], { type: "application/json" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(b);
                a.download = "concurso-contenido.json";
                a.click();
              }}
            >
              <Icono n="bajar" /> Descargar copia de seguridad
            </button>
          </div>
        </div>
      </details>
    </div>
  );
}
