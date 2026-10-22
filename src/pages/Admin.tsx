import { useEffect, useState, type ReactNode } from "react";
import type { Cancion, Contenido, ItemAdivinar, PreguntaTest, Producto, Sub, Tarjeta } from "../../shared/tipos.ts";
import { BONUS_RAPIDEZ } from "../../shared/puntuacion.ts";
import { FORMAS } from "../components/comun.tsx";
import { Icono } from "../components/iconos.tsx";
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

const pendientes = (c: Contenido) => (JSON.stringify(c).match(/✏️/g) ?? []).length;

export function Admin() {
  const { pin, ok, pedir, salir } = usePin();
  const [c, setC] = useState<Contenido | null>(null);
  const [sucio, setSucio] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!ok) return;
    api<Contenido>(pin, "GET", "/api/admin/contenido")
      .then(setC)
      .catch((e) => {
        if (e.status === 401) {
          setError("PIN incorrecto");
          salir();
        } else setMsg({ ok: false, t: e.message });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ok]);

  useEffect(() => {
    if (!sucio) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener("beforeunload", h);
    return () => removeEventListener("beforeunload", h);
  }, [sucio]);

  if (!ok) return pedir(error);
  if (!c) return <div className="movil"><div className="movil-cuerpo espera">{msg?.t ?? "Cargando…"}</div></div>;

  const cambiar = (n: Contenido) => {
    setC(n);
    setSucio(true);
    setMsg(null);
  };
  const guardar = async () => {
    try {
      const r = await api<{ rev: number }>(pin, "PUT", "/api/admin/contenido", c);
      setC({ ...c, rev: r.rev });
      setSucio(false);
      setMsg({ ok: true, t: "Guardado" });
    } catch (e) {
      setMsg({ ok: false, t: (e as Error).message });
    }
  };
  const up = (f: File) => subir(pin, f);
  const n = pendientes(c);

  return (
    <div className="movil" style={{ maxWidth: 980 }}>
      <div className="panel fila" style={{ justifyContent: "space-between", position: "sticky", top: 8, zIndex: 5 }}>
        <div>
          <h2>Contenido</h2>
          <div className="suave">{n ? `Quedan ${n} campos con ✏️ por rellenar` : "Todo relleno"}</div>
        </div>
        <div className="fila">
          {msg && <span style={{ color: msg.ok ? "var(--ok)" : "var(--ko)" }}>{msg.t}</span>}
          <a className="btn peq" href="/presentador" style={{ textDecoration: "none" }}><Icono n="micro" /> Presentador</a>
          <button className="btn prim" disabled={!sucio} onClick={guardar}><Icono n="check" /> Guardar</button>
        </div>
      </div>

      <div className="panel col">
        <h3>General</h3>
        <label className="col" style={{ gap: 4 }}>
          <span className="suave">Título del concurso</span>
          <input className="campo" value={c.titulo} onChange={(e) => cambiar({ ...c, titulo: e.target.value })} />
        </label>
        <div className="suave">Equipos</div>
        {c.equipos.map((q, i) => (
          <div key={q.id} className="fila">
            <input type="color" value={q.color} onChange={(e) => cambiar({ ...c, equipos: c.equipos.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)) })} />
            <input className="campo" style={{ flex: 1 }} value={q.nombre} onChange={(e) => cambiar({ ...c, equipos: c.equipos.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)) })} />
          </div>
        ))}
        <label className="col" style={{ gap: 4 }}>
          <span className="suave">Puntos por puesto (1º, 2º, 3º, 4º…)</span>
          <input className="campo" value={c.tabla.join(", ")} onChange={(e) => cambiar({ ...c, tabla: e.target.value.split(/[,\s]+/).filter(Boolean).map(Number).filter(Number.isFinite) })} />
        </label>
      </div>

      {c.pruebas.map((pr, pi) => {
        const setPr = (p: typeof pr) => cambiar({ ...c, pruebas: c.pruebas.map((x, j) => (j === pi ? p : x)) });
        return (
          <div key={pr.id} className="panel col">
            <div className="fila">
              <span className="etiqueta" style={{ minWidth: "5.5em" }}>Prueba {pi + 1}</span>
              <input className="campo" style={{ flex: 1, fontWeight: 800 }} value={pr.titulo} onChange={(e) => setPr({ ...pr, titulo: e.target.value })} />
            </div>
            {pr.subs.length > 1 && (
              <label className="fila suave">
                <input type="checkbox" checked={pr.agrupar} onChange={(e) => setPr({ ...pr, agrupar: e.target.checked })} />
                Repartir 10/5/3/1 una sola vez para toda la prueba (si no, cada subprueba reparte los suyos)
              </label>
            )}
            {pr.subs.map((s, si) => (
              <EditorSub key={s.id} sub={s} subir={up} onChange={(ns) => setPr({ ...pr, subs: pr.subs.map((x, j) => (j === si ? ns : x)) })} />
            ))}
          </div>
        );
      })}

      <div className="panel fila">
        <button
          className="btn ko peq"
          onClick={async () => {
            if (!confirm("¿Volver al contenido inicial? Se pierde lo que hayas escrito.")) return;
            setC(await api<Contenido>(pin, "POST", "/api/admin/restaurar"));
            setSucio(false);
          }}
        >
          Restaurar contenido inicial
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
          ⬇️ Copia en JSON
        </button>
      </div>
    </div>
  );
}

// ---------- Editores ----------

function Campo({ etiqueta, children, flex }: { etiqueta: string; children: ReactNode; flex?: number }) {
  return (
    <label className="col" style={{ gap: 4, flex: flex ?? 1, minWidth: 120 }}>
      <span className="suave" style={{ fontSize: "0.85em" }}>{etiqueta}</span>
      {children}
    </label>
  );
}

function Texto({ v, on, ph }: { v: string | undefined; on: (s: string) => void; ph?: string }) {
  return <input className="campo" value={v ?? ""} placeholder={ph} onChange={(e) => on(e.target.value)} style={(v ?? "").includes("✏️") ? { borderColor: "var(--oro)" } : undefined} />;
}

function Numero({ v, on }: { v: number; on: (n: number) => void }) {
  const [t, setT] = useState(String(v));
  useEffect(() => setT(String(v)), [v]);
  return (
    <input
      className="campo"
      inputMode="decimal"
      value={t}
      onChange={(e) => {
        setT(e.target.value);
        const n = Number(e.target.value.replace(",", "."));
        if (e.target.value.trim() !== "" && Number.isFinite(n)) on(n);
      }}
    />
  );
}

function Archivo({ url, tipo, subir, on }: { url?: string; tipo: "audio" | "imagen"; subir: (f: File) => Promise<string>; on: (u: string | undefined) => void }) {
  const [cargando, setCargando] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="col" style={{ gap: 6 }}>
      {url && (tipo === "audio" ? <audio controls src={url} style={{ width: "100%" }} preload="none" /> : <img src={url} alt="" style={{ maxHeight: 90, maxWidth: 160, borderRadius: 8 }} />)}
      <div className="fila">
        <label className="btn peq">
          <Icono n={tipo === "audio" ? "nota" : "subir"} /> {cargando ? "Subiendo…" : url ? "Cambiar" : tipo === "audio" ? "Subir MP3" : "Subir foto"}
          <input
            type="file"
            hidden
            accept={tipo === "audio" ? "audio/*" : "image/*"}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setCargando(true);
              setErr(null);
              try {
                on(await subir(f));
              } catch (x) {
                setErr((x as Error).message);
              } finally {
                setCargando(false);
                e.target.value = "";
              }
            }}
          />
        </label>
        {url && <button className="btn peq" onClick={() => on(undefined)}>Quitar</button>}
        {err && <span style={{ color: "var(--ko)" }}>{err}</span>}
      </div>
    </div>
  );
}

function Lista<T>({ items, onChange, nuevo, render, nombre }: { items: T[]; onChange: (l: T[]) => void; nuevo: () => T; render: (it: T, set: (n: T) => void, i: number) => ReactNode; nombre: string }) {
  const mover = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const l = [...items];
    [l[i], l[j]] = [l[j], l[i]];
    onChange(l);
  };
  return (
    <div className="col">
      {items.map((it, i) => (
        <div key={i} className="panel col" style={{ background: "var(--bg2)", padding: 12 }}>
          <div className="fila" style={{ justifyContent: "space-between" }}>
            <b className="suave">{nombre} {i + 1}</b>
            <div className="fila">
              <button className="btn peq" onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Subir">↑</button>
              <button className="btn peq" onClick={() => mover(i, 1)} disabled={i === items.length - 1} aria-label="Bajar">↓</button>
              <button className="btn peq" onClick={() => confirm(`¿Borrar ${nombre.toLowerCase()} ${i + 1}?`) && onChange(items.filter((_, j) => j !== i))} aria-label="Borrar"><Icono n="basura" /></button>
            </div>
          </div>
          {render(it, (n) => onChange(items.map((x, j) => (j === i ? n : x))), i)}
        </div>
      ))}
      <button className="btn peq" style={{ alignSelf: "flex-start" }} onClick={() => onChange([...items, nuevo()])}>+ Añadir {nombre.toLowerCase()}</button>
    </div>
  );
}

const TIPO: Record<Sub["tipo"], string> = {
  test: "Preguntas tipo test",
  adivinar: "Hoja de respuestas",
  precio: "Precio justo",
  cancion: "Canciones con pulsador",
  tarjetas: "Tarjetas por turnos",
  manual: "Puntuación manual",
};

function EditorSub({ sub, onChange, subir }: { sub: Sub; onChange: (s: Sub) => void; subir: (f: File) => Promise<string> }) {
  const pend = (JSON.stringify(sub).match(/✏️/g) ?? []).length;
  const set = (p: Partial<Sub>) => onChange({ ...sub, ...p } as Sub);
  return (
    <details className="panel" style={{ background: "var(--panel2)" }}>
      <summary style={{ cursor: "pointer", fontWeight: 700 }}>
        {sub.titulo} <span className="suave" style={{ fontWeight: 400 }}>· {TIPO[sub.tipo]}</span> {pend > 0 && <span className="chip" style={{ background: "var(--oro)", color: "var(--tinta)" }}><Icono n="lapiz" /> {pend} por rellenar</span>}
      </summary>
      <div className="col" style={{ marginTop: 12 }}>
        <div className="fila">
          <Campo etiqueta="Título"><Texto v={sub.titulo} on={(titulo) => set({ titulo })} /></Campo>
          <Campo etiqueta="Descripción (sale en la TV)" flex={2}><Texto v={sub.descripcion} on={(descripcion) => set({ descripcion })} /></Campo>
        </div>
        {sub.tipo === "test" && (
          <>
            <div className="fila">
              <Campo etiqueta="Segundos por pregunta"><Numero v={sub.segundos} on={(segundos) => set({ segundos })} /></Campo>
              <Campo etiqueta="Puntuación">
                <select className="campo" value={sub.puntuacion} onChange={(e) => set({ puntuacion: e.target.value as "ranking" })}>
                  <option value="ranking">Ranking 10/5/3/1</option>
                  <option value="aciertos">1 punto por acierto</option>
                </select>
              </Campo>
              <label className="fila suave"><input type="checkbox" checked={sub.rapidez} onChange={(e) => set({ rapidez: e.target.checked })} /> <Icono n="rayo" /> Plus por rapidez</label>
              {sub.rapidez && (
                <Campo etiqueta="Plus para el 1º, 2º, 3º… en acertar (separados por comas)">
                  <Texto v={(sub.bonus ?? BONUS_RAPIDEZ).join(", ")} on={(t) => set({ bonus: t.split(",").map((x) => Number(x.trim().replace(/\s/g, ""))).filter((n) => Number.isFinite(n) && n >= 0) })} />
                </Campo>
              )}
            </div>
            <Lista<PreguntaTest>
              nombre="Pregunta"
              items={sub.preguntas}
              onChange={(preguntas) => set({ preguntas })}
              nuevo={() => ({ texto: "", opciones: ["", "", "", ""], correcta: 0 })}
              render={(q, s) => (
                <>
                  <Texto v={q.texto} on={(texto) => s({ ...q, texto })} ph="Pregunta" />
                  {q.opciones.map((o, i) => (
                    <div key={i} className="fila">
                      <label className="fila" title="Correcta">
                        <input type="radio" checked={q.correcta === i} onChange={() => s({ ...q, correcta: i })} />
                        <span className={`op op${i % 4}`} style={{ padding: "4px 8px", fontSize: "0.9em", borderRadius: 6 }}>{FORMAS[i % 4]}</span>
                      </label>
                      <div style={{ flex: 1 }}><Texto v={o} on={(t) => s({ ...q, opciones: q.opciones.map((x, j) => (j === i ? t : x)) })} ph={`Opción ${i + 1}`} /></div>
                    </div>
                  ))}
                  <div className="fila">
                    <span className="suave">Marca con ● la correcta.</span>
                    {q.opciones.length > 2 && <button className="btn peq" onClick={() => s({ ...q, opciones: q.opciones.slice(0, -1), correcta: Math.min(q.correcta, q.opciones.length - 2) })}>− opción</button>}
                    {q.opciones.length < 4 && <button className="btn peq" onClick={() => s({ ...q, opciones: [...q.opciones, ""] })}>+ opción</button>}
                  </div>
                  <Archivo url={q.imagen} tipo="imagen" subir={subir} on={(imagen) => s({ ...q, imagen })} />
                </>
              )}
            />
          </>
        )}
        {sub.tipo === "adivinar" && (
          <>
            <div className="fila">
              <Campo etiqueta="Cómo se juega">
                <select className="campo" value={sub.modo ?? "porItem"} onChange={(e) => set({ modo: e.target.value as "porItem" })}>
                  <option value="porItem">De uno en uno (cuenta atrás y acierto/fallo en cada uno)</option>
                  <option value="hoja">Todo a la vez (hoja que se entrega)</option>
                </select>
              </Campo>
              {(sub.modo ?? "porItem") === "porItem" ? (
                <Campo etiqueta="Segundos por cada uno (0 = sin límite)"><Numero v={sub.segundosItem ?? 20} on={(segundosItem) => set({ segundosItem })} /></Campo>
              ) : (
                <Campo etiqueta="Límite de tiempo total (s, 0 = sin límite)"><Numero v={sub.segundos} on={(segundos) => set({ segundos })} /></Campo>
              )}
              <Campo etiqueta="Estilo">
                <select className="campo" value={sub.estilo} onChange={(e) => set({ estilo: e.target.value as "lista" })}>
                  <option value="lista">Lista</option>
                  <option value="rosco">Rosco</option>
                </select>
              </Campo>
            </div>
            <Campo etiqueta="Botones de sabores en el móvil (separados por comas; se pueden combinar varios)">
              <textarea className="campo" rows={2} value={sub.opciones.join(", ")} onChange={(e) => set({ opciones: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
            </Campo>
            <div className="suave">Mezclas: escribe la solución con «+» (p. ej. «Sandía + Menta»); vale en cualquier orden. Varias soluciones válidas: sepáralas con «/». La corrección perdona mayúsculas, tildes, artículos, plurales, b/v, c/z/s, h y erratas pequeñas; aun así puedes cambiar cualquier corrección a mano.</div>
            <Lista<ItemAdivinar>
              nombre="Item"
              items={sub.items}
              onChange={(items) => set({ items })}
              nuevo={() => ({ etiqueta: "", respuesta: "" })}
              render={(it, s) => (
                <div className="fila">
                  <Campo etiqueta="Etiqueta / letra"><Texto v={it.etiqueta} on={(etiqueta) => s({ ...it, etiqueta })} /></Campo>
                  {sub.estilo === "rosco" && <Campo etiqueta="Pregunta" flex={3}><Texto v={it.pregunta} on={(pregunta) => s({ ...it, pregunta })} /></Campo>}
                  <Campo etiqueta="Solución"><Texto v={it.respuesta} on={(respuesta) => s({ ...it, respuesta })} /></Campo>
                </div>
              )}
            />
          </>
        )}
        {sub.tipo === "precio" && (
          <>
            <div className="fila">
              <Campo etiqueta="Segundos por producto"><Numero v={sub.segundos} on={(segundos) => set({ segundos })} /></Campo>
              <label className="fila suave"><input type="checkbox" checked={sub.sinPasarse} onChange={(e) => set({ sinPasarse: e.target.checked })} /> Sin pasarse (quien se pasa no puntúa)</label>
            </div>
            <div className="suave">Cada producto: 1 punto al que más se acerque (si empatan, a los dos). Al final se reparte 10/5/3/1 según los puntos.</div>
            <Lista<Producto>
              nombre="Producto"
              items={sub.productos}
              onChange={(productos) => set({ productos })}
              nuevo={() => ({ nombre: "", precio: 0 })}
              render={(it, s) => (
                <div className="fila">
                  <Campo etiqueta="Nombre" flex={2}><Texto v={it.nombre} on={(nombre) => s({ ...it, nombre })} /></Campo>
                  <Campo etiqueta="Precio (€)"><Numero v={it.precio} on={(precio) => s({ ...it, precio })} /></Campo>
                  <Archivo url={it.imagen} tipo="imagen" subir={subir} on={(imagen) => s({ ...it, imagen })} />
                </div>
              )}
            />
          </>
        )}
        {sub.tipo === "cancion" && (
          <>
            <div className="fila">
              <Campo etiqueta="Segundos que suena cada fragmento (0 = entera)"><Numero v={sub.fragmento ?? 20} on={(fragmento) => set({ fragmento })} /></Campo>
            </div>
            <div className="suave">Sube el MP3 de cada canción y el segundo desde el que empieza a sonar (para saltarte la intro o empezar por el estribillo). Suena en la TV el fragmento y se para sola; al revelar sigue sonando.</div>
            <Lista<Cancion>
              nombre="Canción"
              items={sub.canciones}
              onChange={(canciones) => set({ canciones })}
              nuevo={() => ({ titulo: "", artista: "", inicio: 0 })}
              render={(it, s) => (
                <>
                  <div className="fila">
                    <Campo etiqueta="Título" flex={2}><Texto v={it.titulo} on={(titulo) => s({ ...it, titulo })} /></Campo>
                    <Campo etiqueta="Artista" flex={2}><Texto v={it.artista} on={(artista) => s({ ...it, artista })} /></Campo>
                    <Campo etiqueta="Empieza en (s)"><Numero v={it.inicio} on={(inicio) => s({ ...it, inicio })} /></Campo>
                  </div>
                  <Archivo url={it.audio} tipo="audio" subir={subir} on={(audio) => s({ ...it, audio })} />
                </>
              )}
            />
          </>
        )}
        {sub.tipo === "tarjetas" && (
          <>
            <div className="fila">
              <Campo etiqueta="Segundos por turno"><Numero v={sub.segundos} on={(segundos) => set({ segundos })} /></Campo>
              <label className="fila suave"><input type="checkbox" checked={sub.tarjetaEnTv ?? true} onChange={(e) => set({ tarjetaEnTv: e.target.checked })} /> Mostrar la tarjeta en la TV</label>
            </div>
            <div className="suave">{(sub.tarjetaEnTv ?? true) ? "La tarjeta sale en grande en la TV (que solo la vea quien explica/dibuja) y en el móvil del presentador; nunca en los móviles de los equipos." : "La tarjeta solo sale en el móvil del presentador; en la TV solo la condición (dibujo)."}</div>
            <Lista<Tarjeta>
              nombre="Tarjeta"
              items={sub.tarjetas}
              onChange={(tarjetas) => set({ tarjetas })}
              nuevo={() => ({ palabra: "", ...(sub.modo === "palabra" ? { prohibidas: [] } : { condicion: "" }) })}
              render={(it, s) => (
                <div className="fila">
                  <Campo etiqueta="Palabra"><Texto v={it.palabra} on={(palabra) => s({ ...it, palabra })} /></Campo>
                  {sub.modo === "palabra" ? (
                    <Campo etiqueta="Prohibidas (separadas por comas)" flex={2}>
                      <Texto v={(it.prohibidas ?? []).join(", ")} on={(t) => s({ ...it, prohibidas: t.split(",").map((x) => x.trim()) })} />
                    </Campo>
                  ) : (
                    <Campo etiqueta="Condición imposible" flex={2}><Texto v={it.condicion} on={(condicion) => s({ ...it, condicion })} /></Campo>
                  )}
                </div>
              )}
            />
          </>
        )}
        {sub.tipo === "manual" && (
          <div className="fila">
            <Campo etiqueta="Qué se mide (segundos, vasos, puntos…)"><Texto v={sub.medida} on={(medida) => set({ medida })} /></Campo>
            <Campo etiqueta="Gana">
              <select className="campo" value={sub.mayorMejor ? "1" : "0"} onChange={(e) => set({ mayorMejor: e.target.value === "1" })}>
                <option value="1">El valor más alto</option>
                <option value="0">El valor más bajo (p. ej. tiempo)</option>
              </select>
            </Campo>
            <Campo etiqueta="Cuenta atrás en la TV (s, 0 = sin)"><Numero v={sub.segundos ?? 0} on={(segundos) => set({ segundos })} /></Campo>
            <label className="fila suave"><input type="checkbox" checked={sub.cronometro} onChange={(e) => set({ cronometro: e.target.checked })} /> Cronómetro (para medir tiempos)</label>
          </div>
        )}
      </div>
    </details>
  );
}
