import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Icono, Insignia, ICONOS, type NombreIcono } from "../components/iconos.tsx";
import { miembros, type Publico, type VistaEquipo } from "../../shared/tipos.ts";
import confetti from "canvas-confetti";
import { leerPrecio } from "../../shared/puntuacion.ts";
import { conColor, Cuenta, equipoDe, euros, FORMAS, gruposPodio, posRosco, fmt, useWakeLock } from "../components/comun.tsx";
import { guardado, useCanal } from "../socket.ts";

export function Jugar() {
  const url = new URLSearchParams(location.search).get("c");
  const [codigo, setCodigo] = useState((url ?? guardado.leer("codigo") ?? "").toUpperCase());
  const [equipo, setEquipo] = useState(guardado.leer("equipo") ?? "");
  const [enviado, setEnviado] = useState(codigo.length === 4);
  const [nombrando, setNombrando] = useState(false);
  const auth = enviado ? { rol: "equipo", codigo, equipo } : null;
  const [aviso, setAviso] = useState<string | null>(null);
  const { datos, error, conectado, desfase, enviar, enviarSeguro } = useCanal<VistaEquipo | Publico>(auth, "equipo", {
    aviso: (m: string) => {
      setAviso(m);
      setNombrando(true);
    },
  });
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  useEffect(() => {
    if (!url) return;
    guardado.poner("codigo", url.toUpperCase());
    history.replaceState(null, "", "/");
  }, [url]);
  useEffect(() => {
    if (error) {
      setEnviado(false);
      guardado.poner("codigo", null);
    }
  }, [error]);

  if (!enviado)
    return (
      <div className="movil">
        <div className="movil-cuerpo">
          <div className="espera"><div className="marquesina" style={{ fontFamily: "var(--titular)", fontSize: "1.6em", color: "var(--bombilla)", textTransform: "uppercase" }}>¡Al concurso!</div></div>
          {error && <div className="error">{error}</div>}
          <form
            className="col"
            onSubmit={(ev) => {
              ev.preventDefault();
              guardado.poner("codigo", codigo);
              setEnviado(true);
            }}
          >
            <label className="suave" htmlFor="codigo">Código que sale en la pantalla</label>
            <input id="codigo" className="campo" style={{ fontSize: "2em", textAlign: "center", letterSpacing: "0.3em" }} maxLength={4} autoCapitalize="characters" autoComplete="off" value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} />
            <button className="btn prim grande" disabled={codigo.length !== 4}>Entrar</button>
          </form>
        </div>
      </div>
    );

  if (!datos) return <div className="movil"><div className="movil-cuerpo espera">{conectado ? "Cargando…" : "Conectando…"}</div></div>;

  const yo = "yo" in datos ? equipoDe(datos, datos.yo) : undefined;
  if (!yo)
    return (
      <div className="movil">
        <div className="movil-cuerpo">
          <div className="espera">¿De qué equipo sois?</div>
          <div className="equipos-elegir">
            {datos.equipos.map((e) => (
              <button
                key={e.id}
                style={{ background: e.color }}
                onClick={() => {
                  guardado.poner("equipo", e.id);
                  setEquipo(e.id);
                  if (!guardado.leer(`nombrado-${codigo}-${e.id}`)) setNombrando(true); // primera vez: que se pongan nombre
                }}
              >
                <span className="col" style={{ alignItems: "flex-start", gap: 2, textAlign: "left" }}>
                  {e.nombre}
                  {miembros(e).length > 0 && <small style={{ textTransform: "none", letterSpacing: 0, fontSize: "0.5em", fontWeight: 600 }}>{miembros(e).join(", ")}</small>}
                </span>
                <span style={{ fontWeight: 400, fontSize: "0.7em" }}>{e.conectados ? <><Icono n="telefono" /> {e.conectados}</> : ""}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );

  const v = datos as VistaEquipo;
  return (
    <div className="movil">
      {aviso && <div className="error" role="alert">{aviso}</div>}
      {!conectado && <div className="banda-conexion"><Icono n="recargar" /> Reconectando… no cerréis la página</div>}
      <Avisos v={v} />
      <div className="movil-cab" style={{ background: yo.color }}>
        <button className="nombre-btn" onClick={() => setNombrando(true)} aria-label="Cambiar el nombre del equipo">{yo.nombre} <Icono n="lapiz" tam="0.9em" /></button>
        <span>{fmt(yo.total)} pts</span>
      </div>
      <div className="movil-cuerpo">
        {nombrando ? (
          <Nombre
            actual={yo.nombre}
            onGuardar={(n) => {
              if (n.trim()) enviar("nombre", n.trim());
              guardado.poner(`nombrado-${v.codigo}-${yo.id}`, "1");
              setNombrando(false);
            }}
          />
        ) : (
          <Conexion.Provider value={conectado}>
            <Cuerpo v={v} desfase={desfase} enviar={(a) => enviarSeguro("equipo", a)} />
          </Conexion.Provider>
        )}
      </div>
      <button
        className="btn peq"
        style={{ alignSelf: "center", background: "transparent", border: 0, color: "var(--suave)" }}
        onClick={() => {
          if (!confirm("¿Cambiar de equipo?")) return;
          guardado.poner("equipo", null);
          setEquipo("");
        }}
      >
        Cambiar de equipo
      </button>
    </div>
  );
}

type Enviar = (a: unknown) => void;

/** ¿Hay conexión? (para decir «Enviando…» en vez de «Enviado» si la respuesta no ha llegado al servidor). */
const Conexion = createContext(true);

/** Lo que este móvil ha mandado y el servidor aún no ha confirmado; se olvida al cambiar de pregunta. */
function usePendiente<T>(clave: string) {
  const [p, setP] = useState<{ clave: string; valor: T } | null>(null);
  return [p?.clave === clave ? p.valor : null, (valor: T) => setP({ clave, valor })] as const;
}

function Enviando({ icono }: { icono: string }) {
  const conectado = useContext(Conexion);
  return <Espera icono={icono} texto={conectado ? "Enviando…" : "Sin conexión: se enviará en cuanto vuelva"} />;
}

function Espera({ icono = "tv", texto }: { icono?: NombreIcono | ReactNode; texto: string }) {
  return (
    <div className="espera">
      <div className="grande">{typeof icono === "string" && icono in ICONOS ? <Icono n={icono as NombreIcono} tam="1.2em" /> : icono}</div>
      {texto}
    </div>
  );
}

/** Pantalla encendida y vibración cuando hay que hacer algo (pregunta nueva, os toca…). */
function Nombre({ actual, onGuardar }: { actual: string; onGuardar: (n: string) => void }) {
  const [txt, setTxt] = useState("");
  return (
    <form
      className="panel col"
      onSubmit={(e) => {
        e.preventDefault();
        onGuardar(txt);
      }}
    >
      <div className="espera"><div className="grande"><Icono n="lapiz" tam="1.2em" /></div>¿Cómo se llama vuestro equipo?</div>
      <input className="campo" style={{ fontSize: "1.3em" }} maxLength={20} autoFocus placeholder={actual} value={txt} onChange={(e) => setTxt(e.target.value)} />
      <button className="btn prim grande" disabled={!txt.trim()}>Guardar</button>
      <button type="button" className="btn" onClick={() => onGuardar("")}>Dejar «{actual}»</button>
    </form>
  );
}

/** En el final: vuestro puesto solo cuando el presentador lo revela (y confeti si habéis ganado). */
function PodioMovil({ v }: { v: VistaEquipo }) {
  const grupos = gruposPodio(v.equipos);
  const i = grupos.findIndex((g) => g.ids.includes(v.yo));
  const revelado = i >= 0 && i < v.podioPaso;
  const ganador = revelado && i === grupos.length - 1;
  useEffect(() => {
    if (!ganador) return;
    navigator.vibrate?.([200, 100, 200, 100, 400]);
    void confetti({ particleCount: 150, spread: 100, origin: { y: 0.6 } });
  }, [ganador]);
  if (!revelado) return <Espera icono="tv" texto="Redoble de tambores… ¡mirad la pantalla!" />;
  if (ganador) return <Espera icono="trofeo" texto="¡¡HABÉIS GANADO!!" />;
  return <Espera icono={`${grupos[i].puesto}º`} texto={`¡Sois ${grupos[i].puesto}º con ${fmt(grupos[i].total)} puntos!`} />;
}

function Avisos({ v }: { v: VistaEquipo }) {
  useWakeLock(true);
  const abierta = v.fase === "jugando" ? `${v.sub?.id}:${v.indice}:${v.abiertaEn}` : null;
  useEffect(() => {
    if (abierta) navigator.vibrate?.(60);
  }, [abierta]);
  const meToca = v.turno === v.yo && v.sub ? `${v.sub.id}:${v.turno}` : null;
  useEffect(() => {
    if (meToca) navigator.vibrate?.([120, 60, 120]);
  }, [meToca]);
  return null;
}

/** «Vais 2º con 26,5 puntos». */
function Posicion({ v }: { v: VistaEquipo }) {
  const yo = equipoDe(v, v.yo);
  if (!yo || v.equipos.every((e) => !e.total)) return null; // al principio no tiene gracia «vais 1º con 0»
  const puesto = v.equipos.filter((e) => e.total > yo.total).length + 1;
  return <div className="resultado-movil" style={{ background: "var(--panel2)" }}>Vais {puesto}º con {fmt(yo.total)} puntos</div>;
}

function Cuerpo({ v, desfase, enviar }: { v: VistaEquipo; desfase: number; enviar: Enviar }) {
  const s = v.sub;
  if (v.vista === "podio") return <PodioMovil v={v} />;
  if (v.vista === "marcador") return <><Espera icono="marcador" texto="Marcador en la pantalla" /><Posicion v={v} /></>;
  if (v.vista === "votacion")
    return (
      <>
        <Espera icono="trofeo" texto="¡Toca votar el mejor disfraz! Cada uno con su móvil." />
        <a className="btn prim grande" href={`/votar?c=${v.codigo}`} style={{ textDecoration: "none" }}><Icono n="trofeo" /> Votar desde este móvil</a>
      </>
    );
  if (!s) return <><Espera icono="reloj" texto="Esperando a que empiece la siguiente prueba…" /><Posicion v={v} /></>;
  if (v.fase === "resultado") {
    const p = v.ranking?.[v.yo] ?? 0;
    return (
      <>
        <Espera icono={p >= 10 ? "trofeo" : "marcador"} texto={s.titulo} />
        <div className="resultado-movil bien">+{fmt(p)} puntos al marcador</div>
        <Posicion v={v} />
      </>
    );
  }
  if (v.fase === "intro" && s.tipo !== "tarjetas" && s.tipo !== "manual" && s.tipo !== "externo")
    return (
      <>
        <Espera icono={String(s.pruebaNum)} texto={`Prueba ${s.pruebaNum} · ${s.pruebaTitulo}: ${s.titulo}`} />
        {s.descripcion && <div className="espera suave">{s.descripcion}</div>}
        <div className="espera suave">¡Preparados! Empieza en nada…</div>
      </>
    );

  switch (s.tipo) {
    case "test":
      return <TestMovil v={v} desfase={desfase} enviar={enviar} />;
    case "precio":
      return <PrecioMovil v={v} desfase={desfase} enviar={enviar} />;
    case "adivinar":
      return s.porItem ? <ItemMovil v={v} desfase={desfase} enviar={enviar} /> : <HojaMovil v={v} desfase={desfase} enviar={enviar} />;
    case "cancion":
      return <Pulsador v={v} enviar={enviar} />;
    case "externo": {
      const pin = v.externo?.pin;
      const ir = pin ? `https://kahoot.it/?pin=${pin}&refer_method=link` : v.externo?.enlace;
      const yo = equipoDe(v, v.yo);
      return (
        <>
          <Espera icono="usuarios" texto={pin ? `Kahoot del cumpleañero · PIN ${pin}` : ir ? "Kahoot del cumpleañero" : "Esperando a que el cumpleañero lance su Kahoot…"} />
          {ir && (
            <>
              <a className="btn prim grande" href={ir} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                <Icono n="enlace" /> Abrir Kahoot
              </a>
              <div className="espera suave">Entrad con el nombre «{yo?.nombre}» (un solo móvil por equipo). Luego volved aquí.</div>
            </>
          )}
        </>
      );
    }
    case "tarjetas":
    case "manual": {
      const t = equipoDe(v, v.turno);
      if (t?.id === v.yo) return <Espera icono="micro" texto={s.tipo === "tarjetas" ? "¡Os toca! Quien explica, que mire la tarjeta." : "¡Os toca!"} />;
      return <Espera icono="usuarios" texto={t ? `Turno de ${t.nombre}` : s.descripcion ?? s.titulo} />;
    }
  }
}

function TestMovil({ v, desfase, enviar }: { v: VistaEquipo; desfase: number; enviar: Enviar }) {
  const [pend, setPend] = usePendiente<number>(`${v.sub?.id}:${v.indice}`);
  const q = v.pregunta;
  if (!q) return null;
  const mia = v.miRespuesta as number | undefined;
  if (v.fase === "revelar") {
    const bien = mia === v.solucion?.correcta;
    return (
      <>
        <div className={`resultado-movil ${bien ? "bien" : "mal"}`}><Insignia m={mia === undefined ? "nada" : bien ? "ok" : "ko"} />
          {mia === undefined ? (pend !== null ? "No llegó a tiempo" : "Sin respuesta") : bien ? "¡Correcto!" : "Fallo"}
          {bien && v.bonus?.[v.yo] ? <span style={{ fontSize: "0.7em" }}> <Icono n="rayo" />+{fmt(v.bonus[v.yo])} por rapidez</span> : null}</div>
        <div className="espera suave">Correcta: {FORMAS[v.solucion?.correcta ?? 0]} {q.opciones?.[v.solucion?.correcta ?? 0]}</div>
      </>
    );
  }
  if (mia !== undefined) return <Espera icono={FORMAS[mia]} texto="Respuesta enviada. ¡A esperar!" />;
  if (pend !== null) return <Enviando icono={FORMAS[pend]} />;
  return (
    <>
      <div className="fila" style={{ justifyContent: "space-between" }}>
        <b>{v.indice + 1}/{v.sub!.total}</b>
        <Cuenta fin={v.fin} inicio={v.abiertaEn} desfase={desfase} tam="56px" />
      </div>
      <div style={{ fontWeight: 700, fontSize: "1.15em" }}>{q.texto}</div>
      <div className="botones4">
        {q.opciones?.map((o, i) => (
          <button
            key={i}
            className={`op op${i % 4}`}
            onClick={() => {
              setPend(i);
              enviar({ t: "responder", valor: i });
            }}
          >
            <span className="forma">{FORMAS[i % 4]}</span>
            {o}
          </button>
        ))}
      </div>
    </>
  );
}

function PrecioMovil({ v, desfase, enviar }: { v: VistaEquipo; desfase: number; enviar: Enviar }) {
  const mia = v.miRespuesta as number | undefined;
  const [txt, setTxt] = useState("");
  useEffect(() => setTxt(""), [v.indice]);
  if (v.fase === "revelar")
    return (
      <>
        <div className="espera">{v.pregunta?.texto}</div>
        <div className="resultado-movil bien">Precio: {euros(v.solucion?.precio ?? 0)}</div>
        <div className="espera suave">Vosotros: {mia === undefined ? "sin respuesta" : euros(mia)}</div>
        {v.ganadores?.includes(v.yo) && <div className="resultado-movil medio"><Icono n="trofeo" /> ¡El más cercano! +1</div>}
      </>
    );
  const n = leerPrecio(txt);
  return (
    <>
      <div className="fila" style={{ justifyContent: "space-between" }}>
        <b>{v.pregunta?.texto}</b>
        <Cuenta fin={v.fin} inicio={v.abiertaEn} desfase={desfase} tam="56px" />
      </div>
      <form
        className="col"
        onSubmit={(e) => {
          e.preventDefault();
          if (n !== null) enviar({ t: "responder", valor: n });
        }}
      >
        <input className="campo" style={{ fontSize: "2.2em", textAlign: "center" }} inputMode="decimal" placeholder="0,00 €" value={txt} onChange={(e) => setTxt(e.target.value.replace(/[^0-9.,\s€]/g, ""))} />
        <div className="espera suave" style={{ minHeight: "1.4em", fontSize: "1em" }}>{txt ? (n === null ? "Escribe solo el número, p. ej. 12,50" : `= ${euros(n)}`) : ""}</div>
        <button className="btn prim grande" disabled={n === null}>{mia === undefined ? "Enviar precio" : "Cambiar precio"}</button>
      </form>
      {mia !== undefined && <div className="espera suave">Enviado: {euros(mia)} (podéis cambiarlo hasta que acabe el tiempo)</div>}
    </>
  );
}

const MARCA_TXT = { ok: "¡Correcto!", medio: "Medio acierto", ko: "Fallo", nada: "Sin responder" } as const;

/** Rosco / olores / sabor de uno en uno: una respuesta por item, se corrige al acabar el tiempo o al responder todos. */
function ItemMovil({ v, desfase, enviar }: { v: VistaEquipo; desfase: number; enviar: Enviar }) {
  const s = v.sub!;
  const items = s.items ?? [];
  const it = items[v.indice];
  const hoja = v.miHoja;
  const marcas = v.hojas?.[v.yo]?.marcas ?? [];
  const [txt, setTxt] = useState("");
  useEffect(() => setTxt(""), [v.indice, s.id]);
  const rosco = s.estilo === "rosco";
  const opciones = s.opciones ?? [];
  const elegidas = txt.split("+").map((x) => x.trim()).filter(Boolean);
  const alternar = (o: string) => setTxt((elegidas.includes(o) ? elegidas.filter((x) => x !== o) : [...elegidas, o]).join(" + "));
  const enviada = hoja?.hechos?.[v.indice];
  const [pend, setPend] = usePendiente<string>(`${s.id}:${v.indice}`);
  const m = marcas[v.indice];

  return (
    <>
      <div className="fila" style={{ justifyContent: "space-between" }}>
        <b>{s.titulo} · {v.indice + 1}/{items.length}</b>
        {v.fase === "jugando" && <Cuenta fin={v.fin} inicio={v.abiertaEn} desfase={desfase} tam="56px" />}
      </div>
      {rosco ? (
        <div className="rosco" style={{ "--d": "min(56vw, 230px)", margin: "0 auto" } as CSSProperties}>
          {items.map((x, i) => (
            <div key={i} className={`letra ${marcas[i] ?? "pend"} ${i === v.indice ? "actual" : ""}`} style={posRosco(i, items.length)}>{x.etiqueta}</div>
          ))}
          <div className="centro" style={{ fontSize: "0.95em" }}>{marcas.filter((x) => x === "ok").length} aciertos</div>
        </div>
      ) : (
        <div className="fila" style={{ justifyContent: "center", gap: 6 }}>
          {items.map((_, i) => (
            <span key={i} className={`mini-m ${marcas[i] ?? "pend"} ${i === v.indice ? "actual" : ""}`}>{marcas[i] ? <Insignia m={marcas[i]!} tam="26px" /> : i + 1}</span>
          ))}
        </div>
      )}
      <div className="panel col">
        <b style={{ fontSize: rosco ? "1.1em" : "1.6em", textAlign: rosco ? "left" : "center" }}>{rosco ? `${it?.etiqueta} · ${it?.pregunta ?? ""}` : it?.etiqueta}</b>
        {v.fase === "revelar" ? (
          <>
            <div className={`resultado-movil ${m === "ok" ? "bien" : m === "ko" ? "mal" : m === "medio" ? "medio" : "nada"}`}>
              {m && <Insignia m={m} />}
              {m === "nada" && pend !== null ? "No llegó a tiempo" : m ? MARCA_TXT[m] : "…"}
              {m === "ok" || m === "medio" ? ` (+${String(v.hojas?.[v.yo]?.puntos[v.indice] ?? 0).replace(".", ",")})` : ""}
            </div>
            <div className="suave">Solución: <b style={{ color: "var(--texto)" }}>{v.solucion?.respuestas?.[v.indice]}</b></div>
            {hoja?.valores[v.indice] && <div className="suave">Vosotros: {hoja.valores[v.indice]}</div>}
          </>
        ) : enviada ? (
          <Espera icono="lapiz" texto={`Enviado: «${hoja?.valores[v.indice]}». ¡A esperar!`} />
        ) : pend !== null ? (
          <Enviando icono="lapiz" />
        ) : (
          <form
            className="col"
            onSubmit={(e) => {
              e.preventDefault();
              if (!txt.trim()) return;
              setPend(txt.trim());
              enviar({ t: "item", valor: txt.trim() });
            }}
          >
            {opciones.length > 0 && (
              <div className="chips">
                {opciones.map((o) => (
                  <button type="button" key={o} className={`chip-op ${elegidas.includes(o) ? "on" : ""}`} onClick={() => alternar(o)}>{o}</button>
                ))}
              </div>
            )}
            <input className="campo" style={{ fontSize: "1.2em" }} autoComplete="off" autoCapitalize="sentences" placeholder={opciones.length ? "Toca los sabores o escribe" : "Respuesta"} value={txt} onChange={(e) => setTxt(e.target.value)} />
            <button className="btn prim grande" disabled={!txt.trim()}>Responder</button>
          </form>
        )}
      </div>
    </>
  );
}

function HojaMovil({ v, desfase, enviar }: { v: VistaEquipo; desfase: number; enviar: Enviar }) {
  const s = v.sub!;
  const items = s.items ?? [];
  const hoja = v.miHoja;
  const [local, setLocal] = useState<string[]>(() => hoja?.valores ?? items.map(() => ""));
  const [actual, setActual] = useState(0);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const clave = `${s.id}:${v.abiertaEn}`;
  useEffect(() => {
    setLocal(hoja?.valores ?? items.map(() => ""));
    setActual(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  if (v.fase === "revelar") {
    const ac = (v.hojas?.[v.yo]?.marcas ?? []).map((x) => x === "ok");
    return (
      <>
        <div className="resultado-movil bien">{ac.filter(Boolean).length}/{items.length} aciertos</div>
        <div className="panel col">
          {items.map((it, i) => (
            <div key={i} className="fila" style={{ justifyContent: "space-between" }}>
              <span>{it.etiqueta}: {hoja?.valores[i] || "—"}</span>
              <span className="fila" style={{ gap: 6 }}><Insignia m={ac[i] ? "ok" : "ko"} tam="1.2em" />{ac[i] ? "" : v.solucion?.respuestas?.[i] ?? ""}</span>
            </div>
          ))}
        </div>
      </>
    );
  }
  if (hoja?.entregada) return <Espera icono="check" texto="Entregado. ¡A esperar la corrección!" />;

  const cambiar = (i: number, valor: string) => {
    setLocal((l) => l.map((x, j) => (j === i ? valor : x)));
    clearTimeout(timers.current[i]);
    timers.current[i] = setTimeout(() => enviar({ t: "hoja", i, valor }), 300);
  };
  const entregar = () => {
    if (!confirm("¿Entregar? Ya no podréis cambiar nada.")) return;
    local.forEach((valor, i) => enviar({ t: "hoja", i, valor }));
    enviar({ t: "entregar" });
  };
  const lista = `ops-${s.id}`;

  return (
    <>
      <div className="fila" style={{ justifyContent: "space-between" }}>
        <b>{s.titulo}</b>
        <Cuenta fin={v.fin} inicio={v.abiertaEn} desfase={desfase} tam="56px" />
      </div>
      {s.opciones && s.opciones.length > 0 && (
        <datalist id={lista}>
          {s.opciones.map((o) => <option key={o} value={o} />)}
        </datalist>
      )}
      {s.estilo === "rosco" ? (
        <>
          <div className="rosco" style={{ "--d": "min(70vw, 300px)", margin: "0 auto" } as CSSProperties}>
            {items.map((it, i) => (
              <button key={i} className={`letra ${local[i]?.trim() ? "hecha" : ""} ${i === actual ? "actual" : ""}`} style={{ ...posRosco(i, items.length), padding: 0 }} onClick={() => setActual(i)}>
                {it.etiqueta}
              </button>
            ))}
            <div className="centro suave" style={{ fontSize: "0.9em" }}>{local.filter((x) => x.trim()).length}/{items.length}</div>
          </div>
          <div className="panel col">
            <b>{items[actual]?.pregunta}</b>
            <input
              key={actual}
              className="campo"
              autoFocus
              autoComplete="off"
              value={local[actual] ?? ""}
              onChange={(e) => cambiar(actual, e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setActual((actual + 1) % items.length)}
              placeholder="Respuesta"
            />
            <div className="fila">
              <button className="btn" onClick={() => setActual((actual + 1) % items.length)}>Pasapalabra <Icono n="siguiente" /></button>
            </div>
          </div>
        </>
      ) : (
        <div className="panel col">
          {items.map((it, i) => (
            <label key={i} className="col" style={{ gap: 4 }}>
              <span className="suave">{it.etiqueta}{it.pregunta ? ` — ${it.pregunta}` : ""}</span>
              <input className="campo" list={s.opciones?.length ? lista : undefined} autoComplete="off" value={local[i] ?? ""} onChange={(e) => cambiar(i, e.target.value)} />
            </label>
          ))}
        </div>
      )}
      <button className="btn oro grande" onClick={entregar}>Entregar</button>
    </>
  );
}

function Pulsador({ v, enviar }: { v: VistaEquipo; enviar: Enviar }) {
  const [pend, setPend] = usePendiente<true>(`${v.sub?.id}:${v.indice}:${v.bloqueados.length}`);
  const conectado = useContext(Conexion);
  if (v.fase === "revelar") return <Espera icono="nota" texto={v.solucion?.texto ?? ""} />;
  const bloqueado = v.bloqueados.includes(v.yo);
  const otro = v.pulsado && v.pulsado !== v.yo ? equipoDe(v, v.pulsado) : null;
  const esperando = pend && !v.pulsado;
  return (
    <>
      <div className="espera suave">{v.sub!.titulo} · {v.indice + 1}/{v.sub!.total}</div>
      <button
        className="pulsador"
        disabled={!!v.pulsado || bloqueado || !!esperando}
        onPointerDown={() => {
          navigator.vibrate?.(80);
          setPend(true);
          enviar({ t: "pulsar" });
        }}
      >
        {v.pulsado === v.yo ? "¡Vuestro turno!" : bloqueado ? "Bloqueados" : otro ? otro.nombre : esperando ? (conectado ? "…" : "Sin red") : "¡PULSA!"}
      </button>
      <div className="espera">{v.pulsado === v.yo ? "Decid la canción en voz alta" : otro ? `Contesta ${otro.nombre}…` : bloqueado ? "Habéis fallado esta" : ""}</div>
    </>
  );
}
