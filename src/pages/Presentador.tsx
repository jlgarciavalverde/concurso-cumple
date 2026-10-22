import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icono } from "../components/iconos.tsx";
import { BONUS_RAPIDEZ } from "../../shared/puntuacion.ts";
import { revisarSub } from "../../shared/revision.ts";
import { fragmento, porItem, segundosItem, tarjetaEnTv, type Sub, type VistaHost } from "../../shared/tipos.ts";
import type { AccionHost } from "../../server/juego.ts";
import { Crono, Cuenta, equipoDe, etiquetaCrudo, FORMAS, fmt, gruposPodio } from "../components/comun.tsx";
import { guardado, useCanal } from "../socket.ts";

export function usePin() {
  const [pin, setPin] = useState(guardado.leer("pin") ?? "");
  const [ok, setOk] = useState(!!pin);
  const pedir = (msg?: string) => (
    <div className="movil">
      <form
        className="movil-cuerpo col"
        onSubmit={(e) => {
          e.preventDefault();
          guardado.poner("pin", pin);
          setOk(true);
        }}
      >
        <div className="espera"><div className="grande"><Icono n="micro" tam="1.2em" /></div>Presentador</div>
        {msg && <div className="error">{msg}</div>}
        <input className="campo" type="password" inputMode="numeric" placeholder="PIN" value={pin} onChange={(e) => setPin(e.target.value)} autoFocus />
        <button className="btn prim grande">Entrar</button>
      </form>
    </div>
  );
  const salir = () => {
    guardado.poner("pin", null);
    setOk(false);
  };
  return { pin, ok, pedir, salir };
}

export function Presentador() {
  const { pin, ok, pedir, salir } = usePin();
  const { datos: h, error, desfase, conectado, enviar } = useCanal<VistaHost>(ok ? { rol: "host", pin } : null, "host");
  useEffect(() => {
    if (error) salir();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);
  useAtajos((acc) => enviar("host", acc));
  if (!ok) return pedir(error ?? undefined);
  if (!h) return <div className="movil"><div className="movil-cuerpo espera">{conectado ? "Cargando…" : "Conectando…"}</div></div>;

  const a = (acc: AccionHost) => enviar("host", acc);
  const { contenido: c, estado: e, publico: p } = h;
  const subId = e.vivo.subId;
  const actual = c.pruebas.flatMap((pr) => pr.subs.map((s) => ({ s, pr }))).find((x) => x.s.id === subId);

  return (
    <div className="host">
      <nav className="host-nav panel">
        <button className={!subId ? "on" : ""} onClick={() => a({ t: "ir", subId: null })}><span><Icono n="inicio" /> Inicio / QR</span></button>
        {c.pruebas.map((pr) => (
          <div key={pr.id} style={{ display: "contents" }}>
            <div className="prueba">{c.pruebas.indexOf(pr) + 1}. {pr.titulo}</div>
            {pr.subs.map((s) => (
              <button key={s.id} className={s.id === subId ? "on" : ""} onClick={() => a({ t: "ir", subId: s.id })}>
                <span>{s.titulo}</span>
                <span>{estadoSub(h, s.id)}</span>
              </button>
            ))}
          </div>
        ))}
        <a className="btn peq" href="/admin" style={{ marginTop: 12, textAlign: "center", textDecoration: "none" }}><Icono n="lapiz" /> Editar contenido</a>
      </nav>

      <main className="host-main">
        <div className="host-barra panel">
          <div className="fila">
            <span className="chip"><span className="punto" style={{ background: conectado ? "var(--ok)" : "var(--ko)", borderRadius: "50%" }} /> Código <b>{e.codigo}</b></span>
            <span className="chip" style={h.tv && h.tvSonido === false ? { background: "#4a1020" } : undefined}>
              <Icono n="tv" /> {!h.tv ? "TV sin conectar" : h.tvSonido === false ? "TV conectada · sonido bloqueado" : "TV conectada"}
            </span>
            {c.equipos.map((q) => (
              <span key={q.id} className="chip"><span className="punto" style={{ background: q.color }} /><Icono n="telefono" /> {h.conectados[q.id] ?? 0}
                {h.latencias?.[q.id] !== undefined && (
                  <span className="suave" title="Latencia de su mejor móvil (el pulsador la compensa)" style={{ color: h.latencias[q.id] > 150 ? "var(--ko)" : undefined }}>
                    · {h.latencias[q.id]} ms
                  </span>
                )}
              </span>
            ))}
          </div>
          <div className="fila">
            {(["juego", "marcador", "podio"] as const).map((v) => (
              <button key={v} className={`btn peq ${p.vista === v ? "prim" : ""}`} onClick={() => a({ t: "vista", v })}>
                <Icono n={v === "juego" ? "play" : v === "marcador" ? "marcador" : "trofeo"} /> {v === "juego" ? "Juego" : v === "marcador" ? "Marcador" : "Podio"}
              </button>
            ))}
            <button className="btn peq" disabled={!h.deshacer} onClick={() => a({ t: "deshacer" })}><Icono n="deshacer" /> Deshacer</button>
          </div>
          <ControlTv h={h} a={a} recargar={() => confirm("¿Recargar la TV?") && enviar("tvRecargar", null)} />
          {p.vista === "podio" && <PodioControl h={h} a={a} />}
          <div className="atajos suave">
            Atajos: <kbd>Espacio</kbd> siguiente paso · <kbd>Z</kbd> deshacer · <kbd>J</kbd> juego · <kbd>M</kbd> marcador · <kbd>P</kbd> podio
          </div>
        </div>

        {actual ? (
          <Control h={h} sub={actual.s} titulo={`Prueba ${c.pruebas.indexOf(actual.pr) + 1} · ${actual.pr.titulo}`} a={a} desfase={desfase} />
        ) : (
          <div className="panel col">
            <h2>Inicio</h2>
            <p className="suave">
              La TV muestra el QR para que cada equipo entre con su móvil. En el portátil de la TV abre <b>«Concurso TV»</b> (en el Escritorio): se abre a
              pantalla completa y con sonido sin tocar nada. Todo se maneja desde aquí.
            </p>
            {h.tv > 0 && h.tvSonido === false && (
              <div className="error">
                <Icono n="silencio" /> La TV está abierta pero el navegador no le deja sonar. Ábrela con el lanzador «Concurso TV», o toca una vez la pantalla de la TV.
              </div>
            )}
            <p className="suave">Elige una prueba en el menú o empieza por la primera.</p>
            <button className="btn prim grande" data-principal onClick={() => a({ t: "siguientePrueba" })}><Icono n="play" /> Ir a la primera prueba</button>
          </div>
        )}

        <Marcador h={h} a={a} />
        <Peligro a={a} />
      </main>
    </div>
  );
}

type A = (acc: AccionHost) => void;

function Control({ h, sub, titulo, a, desfase }: { h: VistaHost; sub: Sub; titulo: string; a: A; desfase: number }) {
  const v = h.estado.vivo;
  const p = h.publico;
  const fase = v.fase;
  return (
    <div className="panel col">
      <div className="fila" style={{ justifyContent: "space-between" }}>
        <div>
          <div className="suave">{titulo}</div>
          <h2>{sub.titulo}</h2>
        </div>
        <div className="fila">
          <span className="chip">{textoFase(h, sub)}</span>
          {p.sub && p.sub.total > 0 && sub.tipo !== "tarjetas" && sub.tipo !== "adivinar" && <span className="chip">{v.indice + 1}/{p.sub.total}</span>}
          {v.fin !== null && <Cuenta fin={v.fin} inicio={v.abiertaEn} desfase={desfase} tam="52px" />}
        </div>
      </div>
      {sub.descripcion && <div className="suave">{sub.descripcion}</div>}
      {fase === "intro" && <Pendientes sub={sub} />}

      {fase === "resultado" ? (
        <Resultado h={h} sub={sub} a={a} />
      ) : fase === "intro" && h.estado.guardados?.[sub.id] ? (
        <Retomar h={h} sub={sub} a={a} />
      ) : (
        <>
          {sub.tipo === "test" && <ControlTest h={h} sub={sub} a={a} />}
          {sub.tipo === "precio" && <ControlPrecio h={h} sub={sub} a={a} />}
          {sub.tipo === "adivinar" && <ControlAdivinar h={h} sub={sub} a={a} />}
          {sub.tipo === "cancion" && <ControlCancion h={h} sub={sub} a={a} />}
          {sub.tipo === "tarjetas" && <ControlTarjetas h={h} sub={sub} a={a} />}
          {sub.tipo === "manual" && <ControlManual h={h} sub={sub} a={a} desfase={desfase} />}
          <div className="fila">
            {v.fin !== null && <button className="btn peq" onClick={() => a({ t: "mas", segundos: 15 })}>+15 s</button>}
            <button className="btn peq" onClick={() => a({ t: "resultado" })}><Icono n="bandera" /> Terminar ya y ver resultados</button>
          </div>
        </>
      )}
    </div>
  );
}

const Abrir = ({ a, texto = "Empezar" }: { a: A; texto?: string }) => (
  <button className="btn prim grande" data-principal onClick={() => a({ t: "empezar" })}>{texto}</button>
);

/** Terminada (check), a medias (reloj) o la actual (play). */
function estadoSub(h: VistaHost, id: string): ReactNode {
  const e = h.estado;
  const prog = e.vivo.subId === id ? e.vivo : e.guardados?.[id];
  if (prog?.fase === "resultado" || e.puntos[id]) return <Icono n="check" titulo="Terminada" />;
  if (e.vivo.subId === id) return <Icono n="play" titulo="En curso" />;
  if (prog || e.crudo[id]) return <Icono n="reloj" titulo="A medias" />;
  return null;
}

function textoFase(h: VistaHost, sub: Sub): string {
  const v = h.estado.vivo;
  const n = h.contenido.equipos.length;
  if (v.fase === "intro") return sub.tipo === "tarjetas" || sub.tipo === "manual" ? "Preparado" : "Presentación en la TV";
  if (v.fase === "resultado") return "Resultados";
  if (v.fase === "revelar") return sub.tipo === "tarjetas" ? "Turno terminado" : "Corregido";
  switch (sub.tipo) {
    case "cancion":
      return v.pulsado ? "Han pulsado: decide" : v.sonando ? "Sonando" : "En pausa";
    case "tarjetas":
      return "Turno en marcha";
    case "manual":
      return "En juego";
    case "adivinar":
      if (!porItem(sub)) return `Entregadas ${Object.values(v.hojas).filter((x) => x.entregada).length}/${n}`;
      return `Esperando respuestas (${h.publico.contestados.length}/${n})`;
    default:
      return `Esperando respuestas (${h.publico.contestados.length}/${n})`;
  }
}

/** Aviso si la subprueba tiene campos con el lápiz de plantilla sin rellenar (saldrían tal cual en la TV). */
function Pendientes({ sub }: { sub: Sub }) {
  const avisos = revisarSub(sub);
  if (!avisos.length) return null;
  return (
    <div className="error">
      <b><Icono n="aviso" /> Antes de empezar:</b>
      <ul style={{ margin: "6px 0 6px 18px", padding: 0 }}>
        {avisos.map((x) => <li key={x}>{x}</li>)}
      </ul>
      <a href="/admin" style={{ color: "var(--oro)" }}>Arreglarlo en /admin</a>
    </div>
  );
}

/** Volver a una prueba ya empezada: continuar donde se dejó o empezar de cero (sin sumar dos veces). */
function Retomar({ h, sub, a }: { h: VistaHost; sub: Sub; a: A }) {
  const g = h.estado.guardados![sub.id];
  const donde = g.fase === "resultado" ? "en los resultados" : sub.tipo === "tarjetas" || sub.tipo === "manual" ? "donde se dejó" : `en la ${g.indice + 1}ª (${g.fase === "revelar" ? "ya corregida" : "sin corregir"})`;
  return (
    <div className="panel col" style={{ background: "var(--bg2)" }}>
      <b>Esta prueba ya se empezó.</b>
      <div className="fila">
        <button className="btn prim grande" data-principal onClick={() => a({ t: "continuar" })}><Icono n="play" /> Continuar {donde}</button>
        <button className="btn ko" onClick={() => confirm("¿Empezar de cero? Se borran los resultados de esta prueba.") && a({ t: "deCero" })}><Icono n="recargar" /> Empezar de cero</button>
      </div>
    </div>
  );
}

/** Atajos de teclado del presentador (portátil). Espacio/Enter pulsa el botón principal visible. */
function useAtajos(a: A) {
  const ref = useRef(a);
  ref.current = a;
  useEffect(() => {
    const h = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null;
      if (ev.metaKey || ev.ctrlKey || ev.altKey || t?.closest("input, textarea, select, [contenteditable]")) return;
      const k = ev.key.toLowerCase();
      if (k === " " || k === "enter") {
        ev.preventDefault(); // que no se pulse además el botón que tenga el foco
        document.querySelector<HTMLButtonElement>("[data-principal]:not(:disabled)")?.click();
      } else if (k === "z") ref.current({ t: "deshacer" });
      else if (k === "j") ref.current({ t: "vista", v: "juego" });
      else if (k === "m") ref.current({ t: "vista", v: "marcador" });
      else if (k === "p") ref.current({ t: "vista", v: "podio" });
    };
    addEventListener("keydown", h);
    return () => removeEventListener("keydown", h);
  }, []);
}

function ControlTest({ h, sub, a }: { h: VistaHost; sub: Extract<Sub, { tipo: "test" }>; a: A }) {
  const v = h.estado.vivo;
  const q = sub.preguntas[v.indice];
  const bonus = sub.bonus ?? BONUS_RAPIDEZ;
  const rapidez = (
    <label className="fila">
      <input type="checkbox" checked={sub.rapidez} onChange={(e) => a({ t: "config", campo: "rapidez", valor: e.target.checked })} />
      <span><Icono n="rayo" /> Plus por rapidez (1º en acertar +{fmt(bonus[0])}{bonus[1] ? `, 2º +${fmt(bonus[1])}` : ""}{bonus[2] ? `, 3º +${fmt(bonus[2])}` : ""})</span>
    </label>
  );
  if (v.fase === "intro")
    return (
      <>
        {rapidez}
        <Abrir a={a} texto={`Primera pregunta (${sub.preguntas.length})`} />
      </>
    );
  return (
    <>
      {rapidez}
      <div className="secreto" style={{ color: "var(--texto)", fontSize: "1.3em" }}>{q?.texto}</div>
      <div className="col" style={{ gap: 6 }}>
        {q?.opciones.map((o, i) => (
          <div key={i} className={`op op${i % 4} ${i === q.correcta ? "correcta" : ""}`} style={{ padding: "8px 12px", fontSize: "1em", borderRadius: 10 }}>
            <b>{FORMAS[i % 4]}</b> {o} {i === q.correcta && <Icono n="check" />}
            <span style={{ marginLeft: "auto" }}>
              {h.contenido.equipos.filter((e) => v.respuestas[e.id]?.valor === i).map((e) => e.nombre).join(", ")}
            </span>
          </div>
        ))}
      </div>
      <div className="suave">Han contestado: {Object.keys(v.respuestas).length}/{h.contenido.equipos.length}</div>
      <div className="fila">
        {v.fase === "jugando" && <button className="btn oro grande" data-principal onClick={() => a({ t: "revelar" })}><Icono n="revelar" /> Revelar</button>}
        {v.fase === "revelar" && <button className="btn prim grande" data-principal onClick={() => a({ t: "siguiente" })}>{v.indice + 1 < sub.preguntas.length ? "Siguiente pregunta" : "Resultados"}</button>}
      </div>
    </>
  );
}

function ControlPrecio({ h, sub, a }: { h: VistaHost; sub: Extract<Sub, { tipo: "precio" }>; a: A }) {
  const v = h.estado.vivo;
  const prod = sub.productos[v.indice];
  if (v.fase === "intro") return <Abrir a={a} texto={`Primer producto (${sub.productos.length})`} />;
  return (
    <>
      <div className="fila">
        <b style={{ fontSize: "1.3em" }}>{prod?.nombre}</b>
        <span className="secreto">{prod?.precio} €</span>
      </div>
      <table className="tabla">
        <tbody>
          {h.contenido.equipos.map((e) => (
            <tr key={e.id}>
              <td><span className="punto" style={{ background: e.color }} /> {e.nombre}</td>
              <td>{(v.respuestas[e.id]?.valor as number | undefined) ?? "—"} €</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="fila">
        {v.fase === "jugando" && Object.keys(v.respuestas).length >= h.contenido.equipos.length && <span className="chip" style={{ background: "var(--ok)", color: "#04210f" }}><Icono n="check" /> Todos han respondido</span>}
        {v.fase === "jugando" && <button className="btn oro grande" data-principal onClick={() => a({ t: "revelar" })}><Icono n="revelar" /> Revelar precio</button>}
        {v.fase === "revelar" && <button className="btn prim grande" data-principal onClick={() => a({ t: "siguiente" })}>{v.indice + 1 < sub.productos.length ? "Siguiente producto" : "Resultados"}</button>}
      </div>
    </>
  );
}

/** Segundos ajustables en directo (se guardan en el contenido; valen desde la siguiente pregunta/turno). */
function Segundos({ valor, etiqueta, a, campo, jugando }: { valor: number; etiqueta: string; a: A; campo: "segundos" | "segundosItem" | "fragmento"; jugando: boolean }) {
  const poner = (n: number) => a({ t: "config", campo, valor: Math.max(0, Math.min(600, n)) });
  return (
    <div className="fila">
      <span className="suave">{etiqueta}:</span>
      <button className="btn peq" onClick={() => poner(valor - 5)} aria-label="Menos 5 segundos">−5</button>
      <b style={{ minWidth: "3.5em", textAlign: "center" }}>{valor ? `${valor} s` : "sin límite"}</b>
      <button className="btn peq" onClick={() => poner(valor + 5)} aria-label="Más 5 segundos">+5</button>
      {[10, 15, 20, 30, 45].map((n) => (
        <button key={n} className={`btn peq ${valor === n ? "prim" : ""}`} onClick={() => poner(n)}>{n}</button>
      ))}
      {jugando && <span className="suave" style={{ fontSize: "0.85em" }}>(se aplica desde la siguiente)</span>}
    </div>
  );
}

function ControlAdivinar({ h, sub, a }: { h: VistaHost; sub: Extract<Sub, { tipo: "adivinar" }>; a: A }) {
  const v = h.estado.vivo;
  const corr = h.estado.correcciones[sub.id];
  const pi = porItem(sub);
  const rosco = sub.estilo === "rosco";
  const nombreItem = rosco ? "letra" : "mezcla";
  const seg = pi ? segundosItem(sub) : sub.segundos;
  const marcas = h.publico.hojas;
  const corregido = (i: number) => marcas && Object.values(marcas).some((x) => x.marcas[i] !== null);
  const cfg = <Segundos valor={seg} etiqueta={pi ? `Tiempo por ${nombreItem}` : "Tiempo total"} campo={pi ? "segundosItem" : "segundos"} a={a} jugando={v.fase === "jugando"} />;

  const celda = (eqId: string, i: number) => {
    const val = v.hojas[eqId]?.valores[i] ?? "";
    if (!corregido(i)) return val ? <><Icono n="lapiz" /> {val}</> : <span className="suave">—</span>;
    const n = Number(corr?.[eqId]?.[i]) || 0;
    const poner = (puntos: number) => a({ t: "correccion", equipo: eqId, item: i, puntos });
    return (
      <div className="col" style={{ gap: 4 }}>
        <span>{val.trim() ? val : <span className="suave">sin responder</span>}</span>
        <div className="fila" style={{ gap: 4, flexWrap: "nowrap" }}>
          <button className={`btn peq ${n === 0 ? "ko" : ""}`} onClick={() => poner(0)} aria-label="Fallo">✗</button>
          <button className={`btn peq ${n > 0 && n < 1 ? "oro" : ""}`} onClick={() => poner(0.5)} aria-label="Medio punto">½</button>
          <button className={`btn peq ${n >= 1 ? "ok" : ""}`} onClick={() => poner(1)} aria-label="Acierto">✓</button>
          <NumEdit valor={n} onCambio={(x) => poner(x ?? 0)} estrecho />
        </div>
      </div>
    );
  };

  if (v.fase === "intro")
    return (
      <>
        {cfg}
        <Abrir a={a} texto={pi ? `Primera ${nombreItem} (${sub.items.length})` : "Abrir respuestas"} />
      </>
    );

  const it = sub.items[v.indice];
  const tabla = (
    <div style={{ overflowX: "auto" }}>
      <table className="tabla">
        <thead>
          <tr>
            <th>{rosco ? "Letra" : "Item"}</th>
            <th>Solución</th>
            {h.contenido.equipos.map((e) => <th key={e.id} style={{ color: e.color }}>{e.nombre}{!pi && v.hojas[e.id]?.entregada && <> <Icono n="check" /></>}</th>)}
          </tr>
        </thead>
        <tbody>
          {sub.items.map((x, i) => (
            <tr key={i} style={pi && i === v.indice ? { background: "var(--panel2)" } : undefined}>
              <td title={x.pregunta}>{x.etiqueta}</td>
              <td className="suave">{x.respuesta}</td>
              {h.contenido.equipos.map((e) => <td key={e.id}>{celda(e.id, i)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (!pi)
    return (
      <>
        {cfg}
        {tabla}
        {v.fase === "revelar" && <div className="suave">Corrige con ✗ · ½ · ✓ o pon los puntos que quieras.</div>}
        <div className="fila">
          {v.fase === "jugando" && <button className="btn oro grande" data-principal onClick={() => a({ t: "revelar" })}><Icono n="revelar" /> Cerrar y corregir</button>}
          {v.fase === "revelar" && <button className="btn prim grande" data-principal onClick={() => a({ t: "siguiente" })}><Icono n="bandera" /> Resultados</button>}
        </div>
      </>
    );

  const contestados = h.publico.contestados.length;
  return (
    <>
      {cfg}
      <div className="panel col" style={{ background: "var(--bg2)" }}>
        <div className="fila" style={{ justifyContent: "space-between" }}>
          <b style={{ fontSize: "1.3em" }}>{it?.etiqueta} {rosco && <span className="suave" style={{ fontWeight: 400 }}>· {it?.pregunta}</span>}</b>
          <span className="chip">{v.indice + 1}/{sub.items.length}</span>
        </div>
        <div>Solución: <span className="secreto" style={{ fontSize: "1.2em" }}>{it?.respuesta}</span></div>
        <table className="tabla">
          <tbody>
            {h.contenido.equipos.map((e) => (
              <tr key={e.id}>
                <td><span className="punto" style={{ background: e.color }} /> {e.nombre}</td>
                <td>{celda(e.id, v.indice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="suave">{v.fase === "jugando" ? `Han respondido ${contestados}/${h.contenido.equipos.length}. Se corrige solo al acabar el tiempo o al responder todos.` : "Corrige con ✗ · ½ · ✓ o pon los puntos que quieras."}</div>
      </div>
      <div className="fila">
        {v.fase === "jugando" && <button className="btn oro grande" data-principal onClick={() => a({ t: "revelar" })}><Icono n="revelar" /> Cerrar y corregir ya</button>}
        {v.fase === "revelar" && (
          <button className="btn prim grande" data-principal onClick={() => a({ t: "siguiente" })}>{v.indice + 1 < sub.items.length ? `Siguiente ${nombreItem}` : "Resultados"}</button>
        )}
      </div>
      <details>
        <summary className="suave">Todas las {rosco ? "letras" : "respuestas"} (para corregir las anteriores)</summary>
        {tabla}
      </details>
    </>
  );
}

function ControlCancion({ h, sub, a }: { h: VistaHost; sub: Extract<Sub, { tipo: "cancion" }>; a: A }) {
  const v = h.estado.vivo;
  const c = sub.canciones[v.indice];
  const frag = <Segundos valor={fragmento(sub)} etiqueta="Fragmento (0 = entera)" campo="fragmento" a={a} jugando={v.fase === "jugando"} />;
  if (v.fase === "intro")
    return (
      <>
        {frag}
        <Abrir a={a} texto={`Primera canción (${sub.canciones.length})`} />
      </>
    );
  const pulsado = equipoDe(h.publico, v.pulsado);
  return (
    <>
      {frag}
      <div className="fila">
        <span className="secreto">{c?.titulo}</span>
        <span className="suave">— {c?.artista}</span>
        {!c?.audio && <span className="chip"><Icono n="aviso" /> sin MP3: ponla tú</span>}
      </div>
      <div className="fila">
        <button className="btn" onClick={() => a({ t: "sonar", on: !v.sonando })}>{v.sonando ? "Pausa" : "Seguir"}</button>
        <button className="btn" onClick={() => a({ t: "repetir" })}><Icono n="recargar" /> Repetir fragmento</button>
        {v.bloqueados.length > 0 && <span className="suave">Fallaron: {v.bloqueados.map((id) => equipoDe(h.publico, id)?.nombre).join(", ")}</span>}
      </div>
      {v.fase === "jugando" && pulsado && (
        <div className="panel col" style={{ borderColor: pulsado.color }}>
          <b style={{ fontSize: "1.4em", color: pulsado.color }}><Icono n="bocina" /> Ha pulsado {pulsado.nombre}</b>
          <div className="fila">
            <button className="btn ok grande" onClick={() => a({ t: "acierto" })}><Icono n="check" /> Acierto</button>
            <button className="btn ko grande" onClick={() => a({ t: "fallo" })}><Icono n="cruz" /> Fallo (rebote)</button>
          </div>
        </div>
      )}
      <div className="fila">
        {v.fase === "jugando" && !pulsado && <button className="btn oro" onClick={() => a({ t: "revelar" })}><Icono n="revelar" /> Nadie la sabe: revelar</button>}
        <button className="btn prim grande" data-principal={v.fase === "revelar" ? "" : undefined} onClick={() => a({ t: "siguiente" })}>{v.indice + 1 < sub.canciones.length ? "Siguiente canción" : "Resultados"}</button>
      </div>
      <Crudos h={h} sub={sub} a={a} />
    </>
  );
}

function ControlTarjetas({ h, sub, a }: { h: VistaHost; sub: Extract<Sub, { tipo: "tarjetas" }>; a: A }) {
  const v = h.estado.vivo;
  const t = sub.tarjetas[v.tarjeta];
  const turno = equipoDe(h.publico, v.turno);
  return (
    <>
      <div className="fila">
        <span className="suave">Turno:</span>
        {h.contenido.equipos.map((e) => (
          <button key={e.id} className="btn" style={v.turno === e.id ? { background: e.color, color: "#fff" } : { borderColor: e.color }} onClick={() => a({ t: "turno", equipo: e.id })}>
            {e.nombre} ({h.estado.crudo[sub.id]?.[e.id] ?? "–"})
          </button>
        ))}
      </div>
      <div className="fila">
        <label className="fila">
          <input type="checkbox" checked={tarjetaEnTv(sub)} onChange={(e) => a({ t: "config", campo: "tarjetaEnTv", valor: e.target.checked })} />
          Mostrar la tarjeta en la TV {sub.modo === "palabra" ? "(palabra + prohibidas)" : "(palabra + condición)"}
        </label>
      </div>
      <Segundos valor={sub.segundos} etiqueta="Tiempo por turno" campo="segundos" a={a} jugando={v.fase === "jugando"} />
      {turno && v.fase === "intro" && <Abrir a={a} texto={`Empezar turno de ${turno.nombre} (${sub.segundos} s)`} />}
      {turno && v.fase === "jugando" && (
        <>
          {t && (
            <div className="tarjeta-host">
              <div className="pal">{t.palabra}</div>
              {t.condicion && <div style={{ marginTop: 6, fontWeight: 700 }}>{t.condicion}</div>}
              {t.prohibidas && <div className="proh">{t.prohibidas.filter(Boolean).map((x) => <span key={x}>{x}</span>)}</div>}
            </div>
          )}
          <div className="fila">
            <button className="btn ok grande" onClick={() => a({ t: "acierto" })}><Icono n="check" /> Acierto</button>
            <button className="btn ko grande" onClick={() => a({ t: "pasar" })}><Icono n="siguiente" /> {sub.modo === "palabra" ? "Tabú / pasar" : "Pasar"}</button>
            <button className="btn" onClick={() => a({ t: "revelar" })}><Icono n="bandera" /> Fin del turno</button>
          </div>
        </>
      )}
      {(!turno || v.fase === "revelar") && (
        <div className="fila">
          {turno && <span className="suave">Turno terminado: {h.estado.crudo[sub.id]?.[turno.id] ?? 0} aciertos.</span>}
          <SiguienteEquipo h={h} sub={sub} a={a} />
        </div>
      )}
      <Crudos h={h} sub={sub} a={a} />
    </>
  );
}

function ControlManual({ h, sub, a, desfase }: { h: VistaHost; sub: Extract<Sub, { tipo: "manual" }>; a: A; desfase: number }) {
  const v = h.estado.vivo;
  return (
    <>
      <Segundos valor={sub.segundos ?? 0} etiqueta="Cuenta atrás en la TV" campo="segundos" a={a} jugando={v.fase === "jugando"} />
      {(sub.segundos ?? 0) > 0 && <Abrir a={a} texto={v.fase === "jugando" ? `Reiniciar cuenta atrás (${sub.segundos} s)` : `Empezar cuenta atrás (${sub.segundos} s)`} />}
      <div className="fila">
        <SiguienteEquipo h={h} sub={sub} a={a} />
        <span className="suave">Turno (opcional):</span>
        <button className={`btn peq ${!v.turno ? "prim" : ""}`} onClick={() => a({ t: "turno", equipo: null })}>Todos</button>
        {h.contenido.equipos.map((e) => (
          <button key={e.id} className="btn peq" style={v.turno === e.id ? { background: e.color, color: "#fff" } : { borderColor: e.color }} onClick={() => a({ t: "turno", equipo: e.id })}>{e.nombre}</button>
        ))}
      </div>
      {sub.cronometro && (
        <div className="panel col">
          <Crono c={v.cronometro} desfase={desfase} className="secreto" />
          <div className="fila">
            {v.cronometro.desde === null ? <button className="btn prim" onClick={() => a({ t: "crono", op: "start" })}><Icono n="play" /> Cronómetro</button> : <button className="btn" onClick={() => a({ t: "crono", op: "stop" })}><Icono n="pausa" /> Parar</button>}
            <button className="btn" onClick={() => a({ t: "crono", op: "reset" })}><Icono n="recargar" /> A cero</button>
          </div>
          <div className="fila">
            <span className="suave">Guardar tiempo de:</span>
            {h.contenido.equipos.map((e) => (
              <button key={e.id} className="btn peq" style={{ borderColor: e.color }} onClick={() => a({ t: "crono", op: "guardar", equipo: e.id })}><Icono n="reloj" /> {e.nombre}</button>
            ))}
          </div>
        </div>
      )}
      <div className="suave">{sub.mayorMejor ? "Gana el valor más alto." : "Gana el valor más bajo."} Sin valor = 0 puntos.</div>
      <Crudos h={h} sub={sub} a={a} />
    </>
  );
}

/** Valores crudos editables a mano. */
function Crudos({ h, sub, a }: { h: VistaHost; sub: Sub; a: A }) {
  const crudo = h.estado.crudo[sub.id] ?? {};
  const etiqueta = sub.tipo === "manual" ? sub.medida : sub.tipo === "test" && sub.puntuacion === "ranking" ? "Puntos" : "Aciertos";
  return (
    <table className="tabla">
      <thead>
        <tr>
          <th>Equipo</th>
          <th>{etiqueta}</th>
        </tr>
      </thead>
      <tbody>
        {h.contenido.equipos.map((e) => (
          <tr key={e.id}>
            <td><span className="punto" style={{ background: e.color }} /> {e.nombre}</td>
            <td>
              <NumEdit valor={crudo[e.id]} onCambio={(n) => a({ t: "crudo", equipo: e.id, valor: n })} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function NumEdit({ valor, onCambio, estrecho }: { valor: number | undefined; onCambio: (n: number | null) => void; estrecho?: boolean }) {
  const [txt, setTxt] = useState(valor?.toString() ?? "");
  useEffect(() => setTxt(valor?.toString() ?? ""), [valor]);
  return (
    <input
      className="campo num"
      style={estrecho ? { width: "3.6em" } : undefined}
      aria-label="Puntos"
      inputMode="decimal"
      value={txt}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={() => {
        const t = txt.trim().replace(",", ".");
        const n = t === "" ? null : Number(t);
        if (n === null || Number.isFinite(n)) {
          if (n !== (valor ?? null)) onCambio(n);
        } else setTxt(valor?.toString() ?? "");
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

function Resultado({ h, sub, a }: { h: VistaHost; sub: Sub; a: A }) {
  const p = h.publico;
  const fijados = h.estado.puntos[sub.id];
  const [editando, setEditando] = useState(false);
  const [puntos, setPuntos] = useState<Record<string, number>>(p.ranking ?? {});
  const clave = JSON.stringify(p.ranking);
  useEffect(() => setPuntos(p.ranking ?? {}), [clave]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <table className="tabla">
        <thead>
          <tr>
            <th>Equipo</th>
            <th>{etiquetaCrudo(p)}</th>
            <th>Puntos al marcador</th>
          </tr>
        </thead>
        <tbody>
          {h.contenido.equipos.map((e) => (
            <tr key={e.id}>
              <td><span className="punto" style={{ background: e.color }} /> {e.nombre}</td>
              <td><NumEdit valor={h.estado.crudo[sub.id]?.[e.id]} onCambio={(n) => a({ t: "crudo", equipo: e.id, valor: n })} /></td>
              <td>
                {editando ? (
                  <input className="campo num" inputMode="decimal" value={puntos[e.id] ?? 0} onChange={(ev) => setPuntos({ ...puntos, [e.id]: Number(ev.target.value.replace(",", ".")) || 0 })} />
                ) : (
                  <b className="secreto" style={{ fontSize: "1.2em" }}>+{fmt(p.ranking?.[e.id])}</b>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="fila">
        {editando ? (
          <>
            <button className="btn ok" onClick={() => { a({ t: "confirmar", puntos }); setEditando(false); }}><Icono n="check" /> Fijar estos puntos</button>
            <button className="btn peq" onClick={() => setEditando(false)}>Cancelar</button>
          </>
        ) : (
          <>
            <span className="chip"><Icono n={fijados ? "lapiz" : "rayo"} /> {fijados ? "Puntos fijados a mano" : "Puntos automáticos, ya en el marcador"}</span>
            <button className="btn peq" onClick={() => setEditando(true)}>Cambiar a mano</button>
            {fijados && <button className="btn peq" onClick={() => a({ t: "desconfirmar" })}>Volver a automático</button>}
          </>
        )}
      </div>
      <div className="suave">Los puntos suman al marcador solos. Si corriges un resultado, se recalculan (salvo que los fijes a mano).</div>
      <div className="fila">
        <button className="btn prim grande" data-principal onClick={() => a({ t: "siguientePrueba" })}>
          {siguienteTitulo(h, sub.id) ? `Siguiente prueba: ${siguienteTitulo(h, sub.id)}` : "Fin: ir al inicio"}
        </button>
        <button className="btn" onClick={() => a({ t: "vista", v: "marcador" })}><Icono n="marcador" /> Enseñar marcador</button>
      </div>
    </>
  );
}

/** Sonido de la TV (la TV no se toca: todo desde aquí). */
function ControlTv({ h, a, recargar }: { h: VistaHost; a: A; recargar: () => void }) {
  const tv = h.publico.tv;
  const [vol, setVol] = useState(tv.volumen);
  useEffect(() => setVol(tv.volumen), [tv.volumen]);
  return (
    <div className="fila" style={{ width: "100%" }}>
      <button className="btn peq" onClick={() => a({ t: "tv", mudo: !tv.mudo })} aria-label={tv.mudo ? "Activar sonido de la TV" : "Silenciar la TV"}>
        <Icono n={tv.mudo ? "silencio" : "sonido"} /> {tv.mudo ? "TV en silencio" : "Sonido TV"}
      </button>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={vol}
        aria-label="Volumen de la TV"
        onChange={(e) => setVol(Number(e.target.value))}
        onPointerUp={() => a({ t: "tv", volumen: vol })}
        onKeyUp={() => a({ t: "tv", volumen: vol })}
        style={{ width: 140 }}
      />
      <span className="suave">{vol}%</span>
      <button className="btn peq" onClick={recargar}><Icono n="recargar" /> Recargar TV</button>
    </div>
  );
}

/** El final: revelar puestos de último a primero (Espacio). */
function PodioControl({ h, a }: { h: VistaHost; a: A }) {
  const grupos = gruposPodio(h.publico.equipos);
  const paso = h.publico.podioPaso;
  if (h.publico.equipos.every((e) => !e.total)) return <div className="chip" style={{ width: "100%" }}>Aún no hay puntos: el podio está vacío</div>;
  if (paso >= grupos.length) return <div className="chip" style={{ width: "100%" }}><Icono n="trofeo" /> Ganador revelado. <button className="btn peq" onClick={() => a({ t: "vista", v: "podio" })}>Repetir el final</button></div>;
  const sig = grupos[paso];
  const empate = sig.ids.length > 1 ? ` (empate de ${sig.ids.length})` : "";
  return (
    <div className="fila" style={{ width: "100%" }}>
      <button className="btn oro grande" data-principal onClick={() => a({ t: "podioPaso" })}>
        {paso === grupos.length - 1 ? `¡Revelar al GANADOR!${empate}` : `Revelar el ${sig.puesto}º puesto${empate}`}
      </button>
    </div>
  );
}

function siguienteTitulo(h: VistaHost, id: string): string | null {
  const subs = h.contenido.pruebas.flatMap((p) => p.subs);
  return subs[subs.findIndex((x) => x.id === id) + 1]?.titulo ?? null;
}

/** Elige solo el siguiente equipo que aún no ha jugado esta prueba. */
function SiguienteEquipo({ h, sub, a }: { h: VistaHost; sub: Sub; a: A }) {
  const jugados = Object.keys(h.estado.crudo[sub.id] ?? {});
  const faltan = h.contenido.equipos.filter((e) => !jugados.includes(e.id) && e.id !== h.estado.vivo.turno);
  if (!faltan.length) return <span className="chip"><Icono n="check" /> Han jugado todos</span>;
  return (
    <button className="btn" onClick={() => a({ t: "siguienteTurno" })}>
      <Icono n="siguiente" /> Siguiente equipo ({faltan.map((e) => e.nombre).join(", ")})
    </button>
  );
}

function Marcador({ h, a }: { h: VistaHost; a: A }) {
  const [eq, setEq] = useState(h.contenido.equipos[0]?.id ?? "");
  const [pts, setPts] = useState("");
  const [motivo, setMotivo] = useState("");
  return (
    <div className="panel col">
      <h3>Marcador</h3>
      <div style={{ overflowX: "auto" }}>
        <table className="tabla">
          <thead>
            <tr>
              <th />
              {h.publico.equipos.map((e) => <th key={e.id} style={{ color: e.color }}>{e.nombre}</th>)}
            </tr>
          </thead>
          <tbody>
            {h.publico.desglose.map((f) => (
              <tr key={f.pruebaId}>
                <td>{f.titulo}</td>
                {h.publico.equipos.map((e) => <td key={e.id}>{fmt(f.puntos[e.id])}</td>)}
              </tr>
            ))}
            <tr>
              <td><b>Total</b></td>
              {h.publico.equipos.map((e) => <td key={e.id}><b className="secreto" style={{ fontSize: "1.2em" }}>{fmt(e.total)}</b></td>)}
            </tr>
          </tbody>
        </table>
      </div>
      <form
        className="fila"
        onSubmit={(ev) => {
          ev.preventDefault();
          const n = Number(pts);
          if (!pts || !Number.isFinite(n)) return;
          a({ t: "ajuste", equipo: eq, puntos: n, motivo });
          setPts("");
          setMotivo("");
        }}
      >
        <select className="campo" style={{ width: "auto" }} value={eq} onChange={(e) => setEq(e.target.value)}>
          {h.contenido.equipos.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>
        <input className="campo num" inputMode="numeric" placeholder="±pts" value={pts} onChange={(e) => setPts(e.target.value)} />
        <input className="campo" style={{ flex: 1, minWidth: 120 }} placeholder="Motivo (bonus, penalización…)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        <button className="btn">Ajustar</button>
      </form>
      {h.estado.ajustes.map((aj, i) => (
        <div key={i} className="fila suave">
          {aj.puntos > 0 ? "+" : ""}{aj.puntos} {equipoDe(h.publico, aj.equipo)?.nombre} — {aj.motivo || "sin motivo"}
          <button className="btn peq" onClick={() => a({ t: "quitarAjuste", i })}>✕</button>
        </div>
      ))}
    </div>
  );
}

function Peligro({ a }: { a: A }) {
  return (
    <details className="panel">
      <summary className="suave">Opciones avanzadas</summary>
      <div className="fila" style={{ marginTop: 10 }}>
        <button className="btn peq" onClick={() => confirm("¿Borrar los resultados de esta prueba?") && a({ t: "limpiarSub" })}><Icono n="basura" /> Repetir esta prueba desde cero</button>
        <button className="btn peq" onClick={() => confirm("¿Nuevo código? Los móviles tendrán que volver a entrar.") && a({ t: "codigo" })}><Icono n="candado" /> Nuevo código</button>
        <button className="btn peq ko" onClick={() => confirm("¿Borrar TODA la partida (puntos incluidos)?") && a({ t: "reiniciar" })}><Icono n="basura" /> Reiniciar partida</button>
      </div>
    </details>
  );
}
