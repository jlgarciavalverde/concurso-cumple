import { useEffect, useRef, useState } from "react";
import type { Contenido } from "../../shared/tipos.ts";
import { Icono } from "../components/iconos.tsx";
import { useTic } from "../socket.ts";
import { Campo, Texto } from "./admin/campos.tsx";
import { EditorSub } from "./admin/Editores.tsx";
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

export function Admin() {
  const { pin, ok, pedir, salir } = usePin();
  const [c, setC] = useState<Contenido | null>(null);
  const [guardado, setGuardado] = useState<EstadoGuardado>({ t: "guardado", en: Date.now() });
  const [error, setError] = useState<string | undefined>();
  const [abierta, setAbierta] = useState<string | null>(null);
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

      <Portada c={c} onIr={ir} />

      <div className="panel col">
        <h3>Datos generales</h3>
        <Campo etiqueta="Nombre del concurso (sale en la TV)"><Texto v={c.titulo} on={(titulo) => cambiar({ ...c, titulo })} /></Campo>
        <div className="campo-etiqueta">Equipos (también los pueden renombrar ellos desde el móvil)</div>
        {c.equipos.map((q, i) => (
          <div key={q.id} className="fila">
            <input type="color" aria-label={`Color del equipo ${i + 1}`} value={q.color} onChange={(e) => cambiar({ ...c, equipos: c.equipos.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)) })} />
            <input className="campo" style={{ flex: 1 }} aria-label={`Nombre del equipo ${i + 1}`} value={q.nombre} onChange={(e) => cambiar({ ...c, equipos: c.equipos.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)) })} />
          </div>
        ))}
      </div>

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
