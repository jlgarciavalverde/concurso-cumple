// Editor de cada ronda: guía arriba, lo importante con etiquetas claras y lo técnico plegado.
import type { Cancion, ItemAdivinar, PreguntaTest, Producto, Sub, Tarjeta } from "../../../shared/tipos.ts";
import { BONUS_RAPIDEZ } from "../../../shared/puntuacion.ts";
import { useState } from "react";
import { revisarSub } from "../../../shared/revision.ts";
import { FORMAS } from "../../components/comun.tsx";
import { Icono } from "../../components/iconos.tsx";
import { Archivo, Avanzados, Campo, esPlantilla, Lista, Numero, Texto } from "./campos.tsx";
import { guiaDe } from "./guias.ts";

function Guia({ sub }: { sub: Sub }) {
  const g = guiaDe(sub);
  return (
    <details className="guia" open>
      <summary><Icono n="info" /> Cómo funciona esta ronda</summary>
      <dl>
        <dt>Qué es</dt>
        <dd>{g.que}</dd>
        <dt>Cómo se juega el día</dt>
        <dd>{g.como}</dd>
        {g.preparar && g.preparar !== "Nada." && (
          <>
            <dt>Qué tienes que preparar</dt>
            <dd>{g.preparar}</dd>
          </>
        )}
        <dt>Qué escribir aquí</dt>
        <dd>{g.escribir}</dd>
      </dl>
    </details>
  );
}

/** Lo que el editor necesita de Spotify (lo da Admin.tsx, que tiene el PIN). */
export interface ApiSpotify {
  estado: { configurado: boolean; conectado: boolean; cuenta: string | null; premium: boolean | null } | null;
  conectar: () => void;
  lista: (url: string) => Promise<{ nombre: string; canciones: { titulo: string; artista: string; spotify: string; duracion: number }[] }>;
}

export function EditorSub({ sub, onChange, subir, abierto, onAbrir, num, spotify }: { sub: Sub; onChange: (s: Sub) => void; subir: (f: File) => Promise<string>; abierto: boolean; onAbrir: (a: boolean) => void; num: string; spotify: ApiSpotify }) {
  const falta = revisarSub(sub);
  const set = (p: Partial<Sub>) => onChange({ ...sub, ...p } as Sub);
  return (
    <details id={`ronda-${sub.id}`} className="panel ronda" open={abierto} onToggle={(e) => onAbrir((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="ronda-cab">
        <span className="etiqueta">{num}</span>
        <b>{sub.titulo}</b>
        {falta.length ? <span className="estado-falta">Falta: {falta[0]}{falta.length > 1 ? ` (+${falta.length - 1})` : ""}</span> : <span className="estado-listo"><Icono n="check" /> Lista</span>}
      </summary>
      {abierto && (
        <div className="col" style={{ marginTop: 12, gap: 14 }}>
          <Guia sub={sub} />
          <div className="fila" style={{ alignItems: "flex-start" }}>
            <Campo etiqueta="Nombre de la ronda (sale en la TV)"><Texto v={sub.titulo} on={(titulo) => set({ titulo })} /></Campo>
            <Campo etiqueta="Explicación corta (sale en la TV antes de empezar)" flex={2}>
              <Texto v={sub.descripcion} on={(descripcion) => set({ descripcion })} obligatorio={sub.tipo === "manual"} ph="Opcional" />
            </Campo>
          </div>
          <Contenido sub={sub} set={set} subir={subir} cambiar={onChange} spotify={spotify} />
        </div>
      )}
    </details>
  );
}

/** El Kahoot de la app de Kahoot del cumpleañero, guardando las preguntas propias por si se vuelve a ellas. */
const aKahootReal = (s: Sub): Sub => ({ id: s.id, tipo: "externo", plataforma: "kahoot", titulo: s.titulo, descripcion: "El Kahoot del cumpleañero: entrad con el nombre de vuestro equipo.", respaldo: s });

function Contenido({ sub, set, subir, cambiar, spotify }: { sub: Sub; set: (p: Partial<Sub>) => void; subir: (f: File) => Promise<string>; cambiar: (s: Sub) => void; spotify: ApiSpotify }) {
  switch (sub.tipo) {
    case "externo":
      return (
        <div className="panel col" style={{ background: "var(--bg2)" }}>
          <b>Se juega con el Kahoot que ha hecho el cumpleañero en la app de Kahoot.</b>
          <span className="suave">
            Aquí no hay que escribir nada: el día, cuando él lance su Kahoot, el presentador escribe el PIN en su panel y la TV lo enseña con un QR. Al
            acabar, el presentador apunta en qué puesto quedó cada equipo.
          </span>
          <button
            type="button"
            className="btn peq"
            style={{ alignSelf: "flex-start" }}
            onClick={() =>
              confirm("¿Usar preguntas escritas aquí en lugar del Kahoot del cumpleañero?") &&
              cambiar(sub.respaldo ?? { id: sub.id, tipo: "test", titulo: sub.titulo, puntuacion: "ranking", rapidez: true, segundos: 20, preguntas: [] })
            }
          >
            Mejor escribir las preguntas aquí
          </button>
        </div>
      );
    case "test":
      return (
        <>
          {sub.id === "kahoot" && (
            <div className="fila">
              <button type="button" className="btn peq" onClick={() => cambiar(aKahootReal(sub))}>
                <Icono n="enlace" /> Usar el Kahoot que ha hecho el cumpleañero (en la app de Kahoot)
              </button>
            </div>
          )}
          <Lista<PreguntaTest>
            nombre="Pregunta"
            items={sub.preguntas}
            onChange={(preguntas) => set({ preguntas })}
            nuevo={() => ({ texto: "", opciones: ["", "", "", ""], correcta: 0 })}
            render={(q, s) => (
              <>
                <Campo etiqueta={sub.id === "kahoot" ? "Pregunta sobre el cumpleañero" : "Pregunta"} ayuda={sub.id === "kahoot" ? "Ej.: «¿Cuál fue su primer coche?»" : undefined}>
                  <Texto v={q.texto} on={(texto) => s({ ...q, texto })} largo />
                </Campo>
                {q.opciones.map((o, i) => {
                  const buena = q.correcta === i;
                  return (
                    <div key={i} className={`opcion-admin ${buena ? "buena" : ""}`}>
                      <span className={`op op${i % 4}`} style={{ padding: "4px 10px", fontSize: "0.95em", boxShadow: "none" }}>{FORMAS[i % 4]}</span>
                      <div style={{ flex: 1 }}>
                        <Campo etiqueta={buena ? "Respuesta correcta" : "Respuesta falsa (que suene creíble)"}>
                          <Texto v={o} on={(t) => s({ ...q, opciones: q.opciones.map((x, j) => (j === i ? t : x)) })} />
                        </Campo>
                      </div>
                      {buena ? (
                        <span className="estado-listo"><Icono n="check" /> Correcta</span>
                      ) : (
                        <button type="button" className="btn peq" onClick={() => s({ ...q, correcta: i })}>Esta es la correcta</button>
                      )}
                    </div>
                  );
                })}
                <div className="fila">
                  {q.opciones.length > 2 && (
                    <button type="button" className="btn peq" onClick={() => s({ ...q, opciones: q.opciones.slice(0, -1), correcta: Math.min(q.correcta, q.opciones.length - 2) })}>
                      <Icono n="menos" /> Quitar una respuesta
                    </button>
                  )}
                  {q.opciones.length < 4 && <button type="button" className="btn peq" onClick={() => s({ ...q, opciones: [...q.opciones, ""] })}><Icono n="mas" /> Añadir respuesta</button>}
                </div>
                <Archivo url={q.imagen} tipo="imagen" subir={subir} on={(imagen) => s({ ...q, imagen })} />
              </>
            )}
          />
          <Avanzados>
            <div className="fila">
              <Campo etiqueta="Segundos para responder cada pregunta"><Numero v={sub.segundos} on={(segundos) => set({ segundos })} /></Campo>
              <Campo etiqueta="Cómo se puntúa">
                <select className="campo" value={sub.puntuacion} onChange={(e) => set({ puntuacion: e.target.value as "ranking" })}>
                  <option value="ranking">Al final, 10/5/3/1 según aciertos</option>
                  <option value="aciertos">1 punto por acierto, directo al marcador</option>
                </select>
              </Campo>
            </div>
            <label className="fila"><input type="checkbox" checked={sub.rapidez} onChange={(e) => set({ rapidez: e.target.checked })} /> <Icono n="rayo" /> Plus por rapidez para los primeros en acertar</label>
            {sub.rapidez && (
              <Campo etiqueta="Plus para el 1º, 2º, 3º… en acertar (separados por comas)">
                <Texto v={(sub.bonus ?? BONUS_RAPIDEZ).join(", ")} on={(t) => set({ bonus: t.split(",").map((x) => Number(x.trim().replace(/\s/g, ""))).filter((n) => Number.isFinite(n) && n >= 0) })} />
              </Campo>
            )}
          </Avanzados>
        </>
      );
    case "adivinar": {
      const rosco = sub.estilo === "rosco";
      return (
        <>
          {!rosco && (
            <Campo etiqueta="Sabores que verán en el móvil (separados por comas)" ayuda="Tienen que estar todos los que uses en las soluciones, y alguno más para despistar.">
              <textarea className="campo" rows={3} value={sub.opciones.join(", ")} onChange={(e) => set({ opciones: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
            </Campo>
          )}
          <Lista<ItemAdivinar>
            nombre={rosco ? "Letra" : sub.id === "sabor" ? "Cachimba" : "Mezcla"}
            titulo={(it, i) => (rosco ? `Letra ${it.etiqueta || i + 1}` : it.etiqueta || `${sub.id === "sabor" ? "Cachimba" : "Mezcla"} ${i + 1}`)}
            items={sub.items}
            onChange={(items) => set({ items })}
            nuevo={() => ({ etiqueta: rosco ? "" : `${sub.id === "sabor" ? "Cachimba" : "Mezcla"} ${sub.items.length + 1}`, respuesta: "" })}
            render={(it, s) =>
              rosco ? (
                <div className="fila" style={{ alignItems: "flex-start" }}>
                  <Campo etiqueta="Letra"><Texto v={it.etiqueta} on={(etiqueta) => s({ ...it, etiqueta: etiqueta.toUpperCase().slice(0, 2) })} /></Campo>
                  <Campo etiqueta="Pregunta («Empieza por…» o «Contiene la…»)" flex={4}><Texto v={it.pregunta} on={(pregunta) => s({ ...it, pregunta })} largo /></Campo>
                  <Campo etiqueta="Solución" ayuda="Varias formas válidas: sepáralas con «/»" flex={2}><Texto v={it.respuesta} on={(respuesta) => s({ ...it, respuesta })} /></Campo>
                </div>
              ) : (
                <div className="fila" style={{ alignItems: "flex-start" }}>
                  <Campo etiqueta="Nombre en la pegatina"><Texto v={it.etiqueta} on={(etiqueta) => s({ ...it, etiqueta })} /></Campo>
                  <Campo etiqueta="Qué lleva" ayuda="Varios sabores con «+»: «Sandía + Menta»" flex={2}>
                    <Texto v={it.respuesta} on={(respuesta) => s({ ...it, respuesta })} />
                  </Campo>
                </div>
              )
            }
          />
          <Avanzados>
            <div className="fila">
              <Campo etiqueta="Cómo se juega">
                <select className="campo" value={sub.modo ?? "porItem"} onChange={(e) => set({ modo: e.target.value as "porItem" })}>
                  <option value="porItem">De una en una, con cuenta atrás y corrección en cada una</option>
                  <option value="hoja">Todas a la vez (cada equipo entrega su hoja)</option>
                </select>
              </Campo>
              {(sub.modo ?? "porItem") === "porItem" ? (
                <Campo etiqueta="Segundos para cada una (0 = sin límite)"><Numero v={sub.segundosItem ?? 20} on={(segundosItem) => set({ segundosItem })} /></Campo>
              ) : (
                <Campo etiqueta="Tiempo total (s, 0 = sin límite)"><Numero v={sub.segundos} on={(segundos) => set({ segundos })} /></Campo>
              )}
              <Campo etiqueta="Aspecto">
                <select className="campo" value={sub.estilo} onChange={(e) => set({ estilo: e.target.value as "lista" })}>
                  <option value="lista">Lista</option>
                  <option value="rosco">Rosco</option>
                </select>
              </Campo>
            </div>
          </Avanzados>
        </>
      );
    }
    case "precio":
      return (
        <>
          <Lista<Producto>
            nombre="Producto"
            items={sub.productos}
            onChange={(productos) => set({ productos })}
            nuevo={() => ({ nombre: "", precio: 0 })}
            render={(it, s) => (
              <div className="fila" style={{ alignItems: "flex-start" }}>
                <Campo etiqueta="Qué es" flex={2}><Texto v={it.nombre} on={(nombre) => s({ ...it, nombre })} ph="Ej.: Cachimba Kaloud de cristal" /></Campo>
                <Campo etiqueta="Precio real en euros" ayuda="Mira el ticket o la web"><Numero v={it.precio} on={(precio) => s({ ...it, precio })} falta={!it.precio} /></Campo>
                <Archivo url={it.imagen} tipo="imagen" subir={subir} on={(imagen) => s({ ...it, imagen })} />
              </div>
            )}
          />
          <Avanzados>
            <div className="fila">
              <Campo etiqueta="Segundos para responder cada producto"><Numero v={sub.segundos} on={(segundos) => set({ segundos })} /></Campo>
              <label className="fila"><input type="checkbox" checked={sub.sinPasarse} onChange={(e) => set({ sinPasarse: e.target.checked })} /> Sin pasarse (quien dice más que el precio real no puntúa)</label>
            </div>
          </Avanzados>
        </>
      );
    case "cancion":
      return (
        <>
          <ListaSpotify spotify={spotify} canciones={sub.canciones} onCargar={(canciones) => set({ canciones })} />
          <Lista<Cancion>
            nombre="Canción"
            titulo={(it, i) => `Canción ${i + 1}${it.titulo && !esPlantilla(it.titulo) ? ` · ${it.titulo}` : ""}`}
            items={sub.canciones}
            onChange={(canciones) => set({ canciones })}
            nuevo={() => ({ titulo: "", artista: "", inicio: 0 })}
            render={(it, s) => (
              <>
                <div className="fila" style={{ alignItems: "flex-start" }}>
                  <Campo etiqueta="Título (la solución)" flex={2}><Texto v={it.titulo} on={(titulo) => s({ ...it, titulo })} /></Campo>
                  <Campo etiqueta="Artista" flex={2}><Texto v={it.artista} on={(artista) => s({ ...it, artista })} obligatorio={false} /></Campo>
                  <Campo etiqueta="Empieza a sonar en el segundo"><Numero v={it.inicio} on={(inicio) => s({ ...it, inicio })} /></Campo>
                </div>
                {it.spotify && !it.audio ? (
                  <div className="col" style={{ gap: 6 }}>
                    <span className="estado-listo" style={{ marginLeft: 0 }}><Icono n="nota" /> Suena por Spotify{it.duracion ? ` · dura ${Math.floor(it.duracion / 60)}:${String(it.duracion % 60).padStart(2, "0")}` : ""}</span>
                    {it.duracion ? (
                      <label className="col" style={{ gap: 4 }}>
                        <span className="campo-ayuda">Mueve la barra hasta la parte que quieras que suene (minuto {Math.floor(it.inicio / 60)}:{String(it.inicio % 60).padStart(2, "0")})</span>
                        <input type="range" min={0} max={Math.max(0, it.duracion - 5)} value={it.inicio} onChange={(e) => s({ ...it, inicio: Number(e.target.value) })} aria-label="Segundo en el que empieza" />
                      </label>
                    ) : null}
                    <iframe
                      title={`Escuchar ${it.titulo}`}
                      src={`https://open.spotify.com/embed/track/${it.spotify.split(":").pop()}`}
                      width="100%"
                      height="80"
                      style={{ border: 0, borderRadius: 8 }}
                      allow="encrypted-media"
                      loading="lazy"
                    />
                    <span className="campo-ayuda">Escúchala aquí para encontrar el segundo (con la sesión de Spotify abierta en este navegador suena entera).</span>
                    <button type="button" className="btn peq" style={{ alignSelf: "flex-start" }} onClick={() => s({ ...it, spotify: undefined, duracion: undefined })}>Quitar Spotify y usar MP3</button>
                  </div>
                ) : (
                  <>
                    {!it.audio && <span className="falta-aviso">Sin audio: sube un MP3 o carga la lista de Spotify arriba</span>}
                    <Archivo url={it.audio} tipo="audio" subir={subir} on={(audio) => s({ ...it, audio })} inicio={it.inicio} onEmpezarAqui={(inicio) => s({ ...it, inicio })} />
                  </>
                )}
              </>
            )}
          />
          <Avanzados>
            <Campo etiqueta="Segundos que suena cada canción (0 = entera)"><Numero v={sub.fragmento ?? 20} on={(fragmento) => set({ fragmento })} /></Campo>
          </Avanzados>
        </>
      );
    case "tarjetas":
      return (
        <>
          <Lista<Tarjeta>
            nombre="Tarjeta"
            titulo={(it, i) => `Tarjeta ${i + 1}${it.palabra ? ` · ${it.palabra}` : ""}`}
            items={sub.tarjetas}
            onChange={(tarjetas) => set({ tarjetas })}
            nuevo={() => ({ palabra: "", ...(sub.modo === "palabra" ? { prohibidas: [] } : { condicion: "" }) })}
            render={(it, s) => (
              <div className="fila" style={{ alignItems: "flex-start" }}>
                <Campo etiqueta={sub.modo === "palabra" ? "Palabra a adivinar" : "Qué hay que dibujar"}><Texto v={it.palabra} on={(palabra) => s({ ...it, palabra })} /></Campo>
                {sub.modo === "palabra" ? (
                  <Campo etiqueta="Palabras prohibidas (4, separadas por comas)" ayuda="Las que saldrían primero al explicarla" flex={2}>
                    <Texto v={(it.prohibidas ?? []).join(", ")} on={(t) => s({ ...it, prohibidas: t.split(",").map((x) => x.trim()) })} />
                  </Campo>
                ) : (
                  <Campo etiqueta="Condición imposible" ayuda="Ej.: con los ojos cerrados, con la mano mala…" flex={2}><Texto v={it.condicion} on={(condicion) => s({ ...it, condicion })} /></Campo>
                )}
              </div>
            )}
          />
          <Avanzados>
            <div className="fila">
              <Campo etiqueta="Segundos por turno"><Numero v={sub.segundos} on={(segundos) => set({ segundos })} /></Campo>
              <label className="fila"><input type="checkbox" checked={sub.tarjetaEnTv ?? true} onChange={(e) => set({ tarjetaEnTv: e.target.checked })} /> Enseñar la tarjeta en la TV (para quien explica)</label>
            </div>
          </Avanzados>
        </>
      );
    case "manual":
      return (
        <Avanzados>
          <div className="fila">
            <Campo etiqueta="Qué se apunta de cada equipo" ayuda="vasos, segundos, puntos…"><Texto v={sub.medida} on={(medida) => set({ medida })} /></Campo>
            <Campo etiqueta="Gana">
              <select className="campo" value={sub.mayorMejor ? "1" : "0"} onChange={(e) => set({ mayorMejor: e.target.value === "1" })}>
                <option value="1">El que más tenga</option>
                <option value="0">El que menos (p. ej. tiempo)</option>
              </select>
            </Campo>
            <Campo etiqueta="Cuenta atrás en la TV (s, 0 = sin)"><Numero v={sub.segundos ?? 0} on={(segundos) => set({ segundos })} /></Campo>
          </div>
          <label className="fila"><input type="checkbox" checked={sub.cronometro} onChange={(e) => set({ cronometro: e.target.checked })} /> Cronómetro (para medir tiempos)</label>
        </Avanzados>
      );
  }
}

/** Cargar las canciones de una ronda desde una lista de Spotify (de la cuenta Premium conectada). */
function ListaSpotify({ spotify, canciones, onCargar }: { spotify: ApiSpotify; canciones: Cancion[]; onCargar: (c: Cancion[]) => void }) {
  const [url, setUrl] = useState("");
  const [cargando, setCargando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const e = spotify.estado;
  return (
    <div className="panel col" style={{ background: "#0d2a1d", borderColor: "#1db954" }}>
      <b><Icono n="nota" /> Canciones desde Spotify (opcional)</b>
      {!e ? (
        <span className="suave">Comprobando Spotify…</span>
      ) : !e.configurado ? (
        <span className="suave">Spotify no está configurado en el servidor. Mientras tanto, sube los MP3 canción a canción.</span>
      ) : !e.conectado ? (
        <>
          <span className="suave">Conecta una cuenta <b>Premium</b> (una sola vez). Las canciones sonarán en la TV sin descargar nada.</span>
          <button type="button" className="btn prim" style={{ alignSelf: "flex-start" }} onClick={spotify.conectar}>Conectar con Spotify</button>
        </>
      ) : (
        <>
          <span className="suave">
            Conectado como <b>{e.cuenta}</b>
            {e.premium === false && <b style={{ color: "var(--ko)" }}> · esta cuenta no es Premium: no podrá sonar en la TV</b>}. Pega el enlace de una lista
            <b> tuya</b> (o colaborativa): en Spotify, «…» → Compartir → Copiar enlace.
          </span>
          <form
            className="fila"
            onSubmit={async (ev) => {
              ev.preventDefault();
              if (!url.trim()) return;
              if (canciones.some((c) => (c.titulo && !esPlantilla(c.titulo)) || c.audio) && !confirm("Se cambiarán las canciones de esta ronda por las de la lista. ¿Seguir?")) return;
              setCargando(true);
              setMsg(null);
              try {
                const r = await spotify.lista(url);
                if (!r.canciones.length) throw new Error("La lista está vacía");
                onCargar(r.canciones.map((c) => ({ ...c, inicio: Math.min(45, Math.max(0, Math.round(c.duracion / 3))) })));
                setMsg({ ok: true, t: `Cargadas ${r.canciones.length} canciones de «${r.nombre}». Revisa en qué segundo empieza cada una.` });
                setUrl("");
              } catch (x) {
                setMsg({ ok: false, t: (x as Error).message });
              } finally {
                setCargando(false);
              }
            }}
          >
            <input className="campo" style={{ flex: 1, minWidth: 220 }} placeholder="https://open.spotify.com/playlist/…" value={url} onChange={(ev) => setUrl(ev.target.value)} aria-label="Enlace de la lista de Spotify" />
            <button className="btn prim" disabled={!url.trim() || cargando}>{cargando ? "Cargando…" : "Cargar canciones"}</button>
          </form>
        </>
      )}
      {msg && <span style={{ color: msg.ok ? "var(--ok)" : "var(--ko)" }}>{msg.t}</span>}
    </div>
  );
}
