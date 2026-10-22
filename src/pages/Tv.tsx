import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Marca, Publico } from "../../shared/tipos.ts";
import confetti from "canvas-confetti";
import { conColor, Crono, Cuenta, desbloquearAudio, equipoDe, etiquetaCrudo, FORMAS, gruposPodio, posRosco, fmt, sonidos, useSonidosCuenta, useWakeLock } from "../components/comun.tsx";
import { guardado, useCanal } from "../socket.ts";

const AUTH = { rol: "tv" };

export function Tv() {
  const { datos: p, desfase, conectado } = useCanal<Publico>(AUTH, "publico");
  const [activa, setActiva] = useState(false);
  const [mudo, setMudo] = useState(guardado.leer("tv-mudo") === "1");
  const [progreso, setProgreso] = useState<Progreso>(null);
  const pulsadoPrev = useRef<string | null>(null);
  const suena = activa && !mudo;

  useWakeLock(activa);
  useSonidosCuenta(p?.fase === "jugando" ? p.fin : null, desfase, suena);
  useEffect(() => {
    if (suena && p?.pulsado && p.pulsado !== pulsadoPrev.current) sonidos.pulsador();
    pulsadoPrev.current = p?.pulsado ?? null;
  }, [p?.pulsado, suena]);
  // «Ding» al revelar (menos en tarjetas, donde el fin de turno ya lleva bocina)
  const claveRevelar = p?.fase === "revelar" && p.sub?.tipo !== "tarjetas" ? `${p.sub?.id}:${p.indice}` : null;
  useEffect(() => {
    if (suena && claveRevelar) sonidos.acierto();
  }, [claveRevelar]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!p) return <div className="tv"><div /><div className="tv-centro tv-sub">{conectado ? "Cargando…" : "Conectando…"}</div></div>;

  const enJuego = p.equipos.filter((e) => e.id);
  return (
    <div className="tv" style={{ "--n": enJuego.length } as CSSProperties}>
      <div className="tv-cab">
        <div className="marca">🎉 {p.titulo}</div>
        <div className="unete">
          {location.host} · código <b>{p.codigo}</b> {!conectado && <span style={{ color: "var(--ko)" }}>· sin conexión</span>}
          <button
            className="btn peq"
            style={{ marginLeft: "1vw", background: "transparent" }}
            aria-label={mudo ? "Activar sonidos" : "Silenciar sonidos"}
            onClick={() => {
              guardado.poner("tv-mudo", mudo ? "0" : "1");
              setMudo(!mudo);
            }}
          >
            {mudo ? "🔇" : "🔊"}
          </button>
        </div>
      </div>
      <div className="tv-centro">
        <Centro p={p} desfase={desfase} progreso={progreso} suena={suena} />
      </div>
      {p.vista !== "podio" && (
        <div className="tv-pie">
          {enJuego.map((e) => (
            <div key={e.id} className={`tv-eq ${p.pulsado === e.id || p.turno === e.id ? "on" : ""}`} style={conColor(e.color)}>
              <span>{e.nombre}</span>
              <span className="n">{fmt(e.total)}</span>
            </div>
          ))}
        </div>
      )}
      <AudioTv p={p} activa={activa} onProgreso={setProgreso} />
      <Precarga urls={activa ? p.audiosSub : undefined} />
      {!activa && (
        <div className="activar">
          <button
            className="btn prim grande"
            onClick={() => {
              desbloquearAudio();
              document.documentElement.requestFullscreen?.().catch(() => {});
              setActiva(true);
            }}
          >
            📺 Activar pantalla y sonido
          </button>
        </div>
      )}
    </div>
  );
}

type Progreso = { frac: number; acabado: boolean } | null;

/**
 * Reproduce la canción en la TV. Suena solo el fragmento (inicio → inicio + fragmento) y se para sola;
 * al revelar sigue sonando libre. «Repetir» vuelve al inicio del fragmento.
 */
function AudioTv({ p, activa, onProgreso }: { p: Publico; activa: boolean; onProgreso: (x: Progreso) => void }) {
  const ref = useRef<HTMLAudioElement>(null);
  const au = p.audio;
  const src = au?.src ?? null;
  const clave = `${p.sub?.id}:${p.indice}:${src}`;
  const fin = au && au.fragmento > 0 ? au.inicio + au.fragmento : null;
  const libre = useRef(false);
  libre.current = p.fase === "revelar";

  // Canción nueva: cargar y colocarse en el inicio
  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    if (!src || !au) {
      a.pause();
      a.removeAttribute("src");
      onProgreso(null);
      return;
    }
    a.src = src;
    const colocar = () => (a.currentTime = au.inicio);
    if (a.readyState >= 1) colocar();
    else a.addEventListener("loadedmetadata", colocar, { once: true });
    onProgreso({ frac: 0, acabado: false });
  }, [clave]); // eslint-disable-line react-hooks/exhaustive-deps

  // Repetir el fragmento
  useEffect(() => {
    const a = ref.current;
    if (a && au && p.repetir) a.currentTime = au.inicio;
  }, [p.repetir]); // eslint-disable-line react-hooks/exhaustive-deps

  // Play / pausa
  useEffect(() => {
    const a = ref.current;
    if (!a || !src || !au) return;
    if (activa && p.sonando) {
      if (fin !== null && !libre.current && a.currentTime >= fin - 0.05) return; // fragmento ya agotado: hace falta «Repetir»
      a.play().catch(() => {});
    } else a.pause();
  }, [clave, p.sonando, activa, p.repetir, p.fase]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <audio
      ref={ref}
      preload="auto"
      onTimeUpdate={(ev) => {
        const a = ev.currentTarget;
        if (!au) return;
        if (fin === null) return onProgreso({ frac: a.duration ? (a.currentTime - au.inicio) / (a.duration - au.inicio) : 0, acabado: false });
        const acabado = a.currentTime >= fin;
        if (acabado && !libre.current) a.pause();
        onProgreso({ frac: Math.min(1, Math.max(0, (a.currentTime - au.inicio) / au.fragmento)), acabado });
      }}
    />
  );
}

/** Precarga los MP3 de la ronda para que no haya esperas entre canciones. */
function Precarga({ urls }: { urls?: string[] }) {
  const lista = useRef<HTMLAudioElement[]>([]);
  const clave = (urls ?? []).join("|");
  useEffect(() => {
    lista.current = (urls ?? []).map((u) => {
      const x = new Audio();
      x.preload = "auto";
      x.src = u;
      return x;
    });
  }, [clave]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function Centro({ p, desfase, progreso, suena }: { p: Publico; desfase: number; progreso: Progreso; suena: boolean }) {
  if (p.vista === "podio") return <Podio p={p} suena={suena} />;
  if (p.vista === "marcador") return <Desglose p={p} />;
  if (!p.sub) return <Lobby p={p} />;
  const s = p.sub;
  if (p.fase === "intro" && s.tipo !== "tarjetas" && s.tipo !== "manual")
    return (
      <>
        <div className="tv-emoji">{s.emoji}</div>
        <div className="tv-sub">{s.pruebaTitulo}</div>
        <div className="tv-titulo">{s.titulo}</div>
        {s.descripcion && <div className="tv-sub">{s.descripcion}</div>}
      </>
    );
  if (p.fase === "resultado") return <Resultado p={p} />;

  switch (s.tipo) {
    case "test":
      return <Test p={p} desfase={desfase} />;
    case "precio":
      return <Precio p={p} desfase={desfase} />;
    case "adivinar":
      return <AdivinarTv p={p} desfase={desfase} />;
    case "cancion":
      return <CancionTv p={p} progreso={progreso} />;
    case "tarjetas":
      return <TarjetasTv p={p} desfase={desfase} />;
    case "manual":
      return <ManualTv p={p} desfase={desfase} />;
  }
}

function Lobby({ p }: { p: Publico }) {
  const url = `${location.origin}/?c=${p.codigo}`;
  return (
    <>
      <div className="tv-titulo">{p.titulo}</div>
      <div className="fila" style={{ gap: "4vw", alignItems: "center" }}>
        <div style={{ background: "#fff", padding: "1.6vh", borderRadius: 16 }}>
          <QRCodeSVG value={url} size={Math.round(window.innerHeight * 0.3)} />
        </div>
        <div className="col" style={{ textAlign: "left", gap: "2vh" }}>
          <div className="tv-sub">Escanead el QR con un móvil por equipo</div>
          {p.equipos.map((e) => (
            <div key={e.id} className="fila" style={{ fontSize: "3.6vh", fontWeight: 800 }}>
              <span className="punto" style={{ background: e.color, width: "3vh", height: "3vh" }} />
              {e.nombre}
              <span className="suave" style={{ fontSize: "2.4vh" }}>{e.conectados ? `✅ ${e.conectados} móvil${e.conectados > 1 ? "es" : ""}` : "esperando…"}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function Contestados({ p }: { p: Publico }) {
  return (
    <div className="contestados">
      {p.equipos.map((e) => (
        <span key={e.id} className={`chip ${p.contestados.includes(e.id) ? "si" : ""}`} style={conColor(e.color)}>
          {p.contestados.includes(e.id) ? "✓ " : ""}
          {e.nombre}
        </span>
      ))}
    </div>
  );
}

function Contador({ p }: { p: Publico }) {
  return <div className="tv-sub">{p.sub!.titulo} · {p.indice + 1}/{p.sub!.total}</div>;
}

function Test({ p, desfase }: { p: Publico; desfase: number }) {
  const q = p.pregunta;
  if (!q) return null;
  const rev = p.fase === "revelar";
  return (
    <>
      <Contador p={p} />
      <div className="fila" style={{ gap: "3vw", justifyContent: "center" }}>
        <div className="tv-pregunta">{q.texto}</div>
        {!rev && <Cuenta fin={p.fin} inicio={p.abiertaEn} desfase={desfase} />}
      </div>
      {q.imagen && <img className="tv-imagen" src={q.imagen} alt="" />}
      <div className="opciones">
        {q.opciones?.map((o, i) => {
          const quien = rev ? p.equipos.filter((e) => p.respuestasVisibles?.[e.id] === i) : [];
          return (
            <div key={i} className={`op op${i % 4} ${rev ? (p.solucion?.correcta === i ? "buena" : "apagada") : ""}`}>
              <span className="forma">{FORMAS[i % 4]}</span>
              <span style={{ flex: 1 }}>{o}</span>
              {quien.map((e) => (
                <span key={e.id} className="chip" style={{ background: e.color, color: "#fff", fontSize: "2.2vh" }}>
                  {e.nombre}
                  {p.bonus?.[e.id] ? ` ⚡+${String(p.bonus[e.id]).replace(".", ",")}` : ""}
                </span>
              ))}
            </div>
          );
        })}
      </div>
      {!rev && <Contestados p={p} />}
    </>
  );
}

const euros = (n: number) => n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });

function Precio({ p, desfase }: { p: Publico; desfase: number }) {
  const q = p.pregunta;
  if (!q) return null;
  const rev = p.fase === "revelar";
  const precio = p.solucion?.precio ?? 0;
  const ofertas = p.equipos
    .map((e) => ({ e, v: p.respuestasVisibles?.[e.id] as number | undefined }))
    .sort((a, b) => (a.v === undefined ? 1 : b.v === undefined ? -1 : Math.abs(a.v - precio) - Math.abs(b.v - precio)));
  return (
    <>
      <Contador p={p} />
      <div className="tv-pregunta">{q.texto}</div>
      {q.imagen && <img className="tv-imagen" src={q.imagen} alt="" />}
      {!rev ? (
        <>
          <Cuenta fin={p.fin} inicio={p.abiertaEn} desfase={desfase} />
          <Contestados p={p} />
        </>
      ) : (
        <>
          <div className="revela">{euros(precio)}</div>
          <div className="fila" style={{ gap: "2vw", justifyContent: "center" }}>
            {ofertas.map(({ e, v }) => (
              <div key={e.id} className={`tv-eq ${p.ganadores?.includes(e.id) ? "on" : ""}`} style={conColor(e.color)}>
                <span>{p.ganadores?.includes(e.id) ? "🏆 " : ""}{e.nombre}&nbsp;</span>
                <span className="n">{v === undefined ? "—" : euros(v)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

const MARCA: Record<NonNullable<Marca>, string> = { ok: "✅", medio: "🟡", ko: "❌", nada: "⚫" };

function AdivinarTv({ p, desfase }: { p: Publico; desfase: number }) {
  const s = p.sub!;
  if (!s.porItem) return <HojasTv p={p} desfase={desfase} />;
  const items = s.items ?? [];
  const rev = p.fase === "revelar";
  const it = items[p.indice];
  const rosco = s.estilo === "rosco";
  return (
    <>
      <div className="fila" style={{ gap: "3vw", justifyContent: "center" }}>
        <div className="tv-sub">{s.titulo} · {p.indice + 1}/{items.length}</div>
        {!rev && <Cuenta fin={p.fin} inicio={p.abiertaEn} desfase={desfase} tam="12vh" />}
      </div>
      {rosco ? (
        <div className="tv-pregunta" style={{ fontSize: "5vh" }}>
          <span className="letra-grande">{it?.etiqueta}</span> {p.pregunta?.texto}
        </div>
      ) : (
        <div className="tv-titulo">{it?.etiqueta}</div>
      )}
      {rev && <div className="revela">{p.solucion?.respuestas?.[p.indice]}</div>}
      {rosco ? (
        <div className="fila" style={{ gap: "3vw", justifyContent: "center" }}>
          {p.equipos.map((e) => {
            const h = p.hojas?.[e.id];
            const m = h?.marcas[p.indice];
            return (
              <div key={e.id} className="col" style={{ alignItems: "center", gap: "1vh" }}>
                <div className="rosco" style={{ "--d": "24vh" } as CSSProperties}>
                  {items.map((x, i) => {
                    const mi = h?.marcas[i];
                    return (
                      <div key={i} className={`letra ${mi ?? "pend"} ${i === p.indice ? "actual" : ""}`} style={{ ...posRosco(i, items.length), ...(mi ? {} : { background: e.color }) }}>
                        {x.etiqueta}
                      </div>
                    );
                  })}
                  <div className="centro" style={{ color: e.color, fontSize: "2.6vh" }}>
                    {e.nombre}
                    <br />
                    <span style={{ fontSize: "5vh" }}>{rev && m ? MARCA[m] : p.contestados.includes(e.id) ? "✍️" : "…"}</span>
                  </div>
                </div>
                <div className="tv-sub" style={{ fontSize: "2.4vh", minHeight: "3vh" }}>{rev ? h?.valores[p.indice] || "sin responder" : `${h?.marcas.filter((x) => x === "ok").length ?? 0} aciertos`}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="hojas">
          {p.equipos.map((e) => {
            const h = p.hojas?.[e.id];
            const m = h?.marcas[p.indice];
            return (
              <div key={e.id} className={`hoja ${rev && m ? `marca-${m}` : ""}`} style={conColor(e.color)}>
                <div className="fila" style={{ justifyContent: "space-between" }}>
                  <b>{e.nombre}</b>
                  <span style={{ fontSize: "4.4vh" }}>{rev && m ? MARCA[m] : p.contestados.includes(e.id) ? "✍️" : "…"}</span>
                </div>
                <div style={{ fontSize: "3vh", minHeight: "4vh", fontWeight: 700 }}>{rev ? h?.valores[p.indice] || "sin responder" : p.contestados.includes(e.id) ? "¡Respondido!" : "Pensando…"}</div>
                <div className="fila" style={{ gap: 4, marginTop: "1vh" }}>
                  {items.map((_, i) => (
                    <span key={i} className={`mini ${h?.marcas[i] ?? "pend"} ${i === p.indice ? "actual" : ""}`}>{h?.marcas[i] ? MARCA[h.marcas[i]!] : i + 1}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!rev && <Contestados p={p} />}
    </>
  );
}

function HojasTv({ p, desfase }: { p: Publico; desfase: number }) {
  const s = p.sub!;
  const rev = p.fase === "revelar";
  const items = s.items ?? [];
  return (
    <>
      <div className="tv-titulo" style={{ fontSize: "6vh" }}>{s.titulo}</div>
      {!rev && <Cuenta fin={p.fin} inicio={p.abiertaEn} desfase={desfase} />}
      <div className="hojas">
        {p.equipos.map((e) => {
          const h = p.hojas?.[e.id];
          return (
            <div key={e.id} className="hoja" style={conColor(e.color)}>
              <b>{e.nombre}</b>
              {rev ? (
                items.map((it, i) => (
                  <div key={i} className="l">
                    <span>{it.etiqueta}: {h?.valores[i] || "—"}</span>
                    <span>{MARCA[h?.marcas[i] ?? "nada"]}</span>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: "3.4vh", marginTop: "1vh" }}>{h?.entregada ? "✅ Entregado" : `${h?.contestadas ?? 0}/${items.length}`}</div>
              )}
            </div>
          );
        })}
      </div>
      {rev && <div className="tv-sub">Soluciones: {items.map((it, i) => `${it.etiqueta} ${p.solucion?.respuestas?.[i] ?? ""}`).join(" · ")}</div>}
    </>
  );
}

function CancionTv({ p, progreso }: { p: Publico; progreso: Progreso }) {
  const e = equipoDe(p, p.pulsado);
  if (p.fase === "revelar")
    return (
      <>
        <Contador p={p} />
        <div className="tv-emoji">🎶</div>
        <div className="revela">{p.solucion?.texto}</div>
        {p.ganadores?.length ? (
          p.ganadores.map((id) => {
            const g = equipoDe(p, id)!;
            return <div key={id} className="pulsado" style={{ background: g.color, fontSize: "5vh" }}>✅ {g.nombre} +1</div>;
          })
        ) : (
          <div className="tv-sub">Nadie la acertó</div>
        )}
      </>
    );
  return (
    <>
      <Contador p={p} />
      {e ? (
        <div className="pulsado" style={{ background: e.color }}>{e.nombre}</div>
      ) : (
        <>
          <div className="tv-emoji" style={{ animation: p.sonando ? "latido 0.6s infinite alternate" : undefined }}>{p.sonando ? "🎵" : "⏸️"}</div>
          <div className="tv-pregunta">{progreso?.acabado ? "⏹️ Fin del fragmento… ¿quién la sabe?" : "¿Qué canción es?"}</div>
          {!p.audio && <div className="tv-sub">(sin audio: el presentador la pone aparte)</div>}
          {p.audio && progreso && p.audio.fragmento > 0 && (
            <div className="barra-frag" aria-hidden>
              <div style={{ width: `${progreso.frac * 100}%` }} />
            </div>
          )}
        </>
      )}
      {p.bloqueados.length > 0 && (
        <div className="contestados">
          {p.bloqueados.map((id) => {
            const b = equipoDe(p, id)!;
            return <span key={id} className="chip si" style={{ ...conColor("#555"), opacity: 0.8 }}>❌ {b.nombre}</span>;
          })}
        </div>
      )}
    </>
  );
}

function TarjetasTv({ p, desfase }: { p: Publico; desfase: number }) {
  const s = p.sub!;
  const e = equipoDe(p, p.turno);
  return (
    <>
      <div className="tv-sub">{s.emoji} {s.titulo}</div>
      {!e ? (
        <>
          <div className="tv-titulo">{s.titulo}</div>
          {s.descripcion && <div className="tv-sub">{s.descripcion}</div>}
        </>
      ) : (
        <>
          <div className="fila" style={{ gap: "3vw", justifyContent: "center" }}>
            <div className="pulsado" style={{ background: e.color, fontSize: p.tarjeta ? "4.5vh" : "8vh", padding: "1.5vh 3vw" }}>Turno: {e.nombre}</div>
            {p.fase === "jugando" && <Cuenta fin={p.fin} inicio={p.abiertaEn} desfase={desfase} tam={p.tarjeta ? "12vh" : "18vh"} />}
            <div className="revela" style={{ fontSize: p.tarjeta ? "4vh" : undefined }}>{p.crudo[e.id] ?? 0} aciertos</div>
          </div>
          {p.tarjeta ? (
            <div className="tarjeta-tv">
              <div className="aviso">🙈 Solo mira quien {s.modo === "dibujo" ? "dibuja" : "explica"}</div>
              <div className="pal">{p.tarjeta.palabra}</div>
              {p.tarjeta.condicion && <div className="cond">{p.tarjeta.condicion}</div>}
              {p.tarjeta.prohibidas && p.tarjeta.prohibidas.filter(Boolean).length > 0 && (
                <div className="proh">{p.tarjeta.prohibidas.filter(Boolean).map((x) => <span key={x}>🚫 {x}</span>)}</div>
              )}
            </div>
          ) : (
            p.condicion && <div className="tarjeta-cond">{p.condicion}</div>
          )}
        </>
      )}
    </>
  );
}

function ManualTv({ p, desfase }: { p: Publico; desfase: number }) {
  const s = p.sub!;
  const e = equipoDe(p, p.turno);
  return (
    <>
      <div className="tv-titulo">{s.emoji} {s.titulo}</div>
      {s.descripcion && <div className="tv-sub">{s.descripcion}</div>}
      {e && <div className="pulsado" style={{ background: e.color, fontSize: "6vh" }}>Turno: {e.nombre}</div>}
      {p.fase === "jugando" && p.fin !== null && <Cuenta fin={p.fin} inicio={p.abiertaEn} desfase={desfase} tam="20vh" />}
      {s.cronometro && (p.cronometro.desde !== null || p.cronometro.acumulado > 0) && <Crono c={p.cronometro} desfase={desfase} />}
      {Object.keys(p.crudo).length > 0 && (
        <div className="fila" style={{ gap: "2vw", justifyContent: "center" }}>
          {p.equipos.map((q) => (
            <div key={q.id} className="tv-eq" style={conColor(q.color)}>
              <span>{q.nombre}&nbsp;</span>
              <span className="n">{p.crudo[q.id] ?? "—"}{s.medida && p.crudo[q.id] !== undefined ? <small style={{ fontSize: "0.55em", opacity: 0.8 }}> {s.medida}</small> : null}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** Al terminar una ronda: su tabla y, a los 6 s, la clasificación general recolocándose. */
function Resultado({ p }: { p: Publico }) {
  const [general, setGeneral] = useState(false);
  const subId = p.sub?.id;
  useEffect(() => {
    setGeneral(false);
    const t = setTimeout(() => setGeneral(true), 6000);
    return () => clearTimeout(t);
  }, [subId]);
  return general ? <Clasificacion p={p} /> : <ResultadoRonda p={p} />;
}

function Clasificacion({ p }: { p: Publico }) {
  const [despues, setDespues] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDespues(true), 800);
    return () => clearTimeout(t);
  }, []);
  const ganado = (id: string) => p.ranking?.[id] ?? 0;
  const antes = (id: string) => (p.equipos.find((e) => e.id === id)?.total ?? 0) - ganado(id);
  const ordenAntes = [...p.equipos].sort((a, b) => antes(b.id) - antes(a.id)).map((e) => e.id);
  const ordenAhora = [...p.equipos].sort((a, b) => b.total - a.total).map((e) => e.id);
  const max = Math.max(1, ...p.equipos.map((e) => e.total));
  const alto = 11; // vh por fila
  return (
    <>
      <div className="tv-sub">Después de «{p.sub?.titulo}»</div>
      <div className="tv-titulo" style={{ fontSize: "6vh" }}>Clasificación general</div>
      <div className="clasif" style={{ height: `${p.equipos.length * alto}vh` }}>
        {p.equipos.map((e) => {
          const pos = (despues ? ordenAhora : ordenAntes).indexOf(e.id);
          const sube = ordenAntes.indexOf(e.id) - ordenAhora.indexOf(e.id);
          const total = despues ? e.total : antes(e.id);
          return (
            <div key={e.id} className="clasif-fila" style={{ top: `${pos * alto}vh`, height: `${alto - 2}vh` }}>
              <span className="clasif-pos">{pos + 1}º</span>
              <div className="clasif-barra">
                <div style={{ width: `${Math.max(4, (total / max) * 100)}%`, background: e.color }}>
                  <span>{e.nombre}</span>
                </div>
              </div>
              <span className="clasif-pts">{fmt(total)}</span>
              <span className="clasif-delta">
                {despues && ganado(e.id) > 0 && <span className="mas">+{fmt(ganado(e.id))}</span>}
                {despues && sube > 0 && <span style={{ color: "var(--ok)" }}> ▲{sube}</span>}
                {despues && sube < 0 && <span style={{ color: "var(--ko)" }}> ▼{-sube}</span>}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function ResultadoRonda({ p }: { p: Publico }) {
  const filas = [...p.equipos].sort((a, b) => (p.ranking?.[b.id] ?? 0) - (p.ranking?.[a.id] ?? 0));
  return (
    <>
      <div className="tv-sub">{p.sub!.emoji} {p.sub!.pruebaTitulo}</div>
      <div className="tv-titulo" style={{ fontSize: "6vh" }}>{p.sub!.titulo}</div>
      <table className="tabla-res">
        <thead>
          <tr className="suave" style={{ fontSize: "2.4vh" }}>
            <th>Equipo</th>
            <th>{etiquetaCrudo(p)}</th>
            <th style={{ textAlign: "right" }}>Puntos</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((e) => (
            <tr key={e.id}>
              <td><span className="punto" style={{ background: e.color, marginRight: 12 }} />{e.nombre}</td>
              <td>{p.crudo[e.id] === undefined ? "—" : fmt(p.crudo[e.id])}</td>
              <td className="pts">+{fmt(p.ranking?.[e.id])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Desglose({ p }: { p: Publico }) {
  return (
    <>
      <div className="tv-titulo" style={{ fontSize: "6vh" }}>Marcador</div>
      <table className="desglose">
        <thead>
          <tr>
            <th />
            {p.equipos.map((e) => <th key={e.id} style={{ color: e.color }}>{e.nombre}</th>)}
          </tr>
        </thead>
        <tbody>
          {p.desglose.map((f) => (
            <tr key={f.pruebaId}>
              <td>{f.emoji} {f.titulo}</td>
              {p.equipos.map((e) => <td key={e.id}>{fmt(f.puntos[e.id])}</td>)}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            {p.equipos.map((e) => <td key={e.id}>{fmt(e.total)}</td>)}
          </tr>
        </tfoot>
      </table>
    </>
  );
}

function Podio({ p, suena }: { p: Publico; suena: boolean }) {
  const grupos = gruposPodio(p.equipos);
  const paso = Math.min(p.podioPaso, grupos.length);
  const revelados = new Set(grupos.slice(0, paso).flatMap((g) => g.ids));
  const ganadores = paso >= grupos.length ? (grupos.at(-1)?.ids ?? []) : [];
  const orden = [...p.equipos].sort((a, b) => b.total - a.total);
  const puesto = (e: (typeof orden)[number]) => orden.filter((o) => o.total > e.total).length + 1;
  // 2º, 1º, 3º, 4º… como en un podio (el hueco no delata a nadie: las peanas sin revelar son iguales)
  const vis = [orden[1], orden[0], orden[2], ...orden.slice(3)].filter(Boolean);
  const alto = (n: number) => ({ 1: 100, 2: 78, 3: 60 })[n] ?? 46;

  useEffect(() => {
    if (!paso) return;
    if (paso >= grupos.length) {
      if (suena) sonidos.fanfarria();
      const fin = Date.now() + 3500;
      const rafaga = () => {
        void confetti({ particleCount: 70, spread: 80, startVelocity: 55, origin: { x: Math.random() * 0.6 + 0.2, y: 0.7 } });
        if (Date.now() < fin) setTimeout(rafaga, 350);
      };
      rafaga();
    } else if (suena) sonidos.redoble();
  }, [paso]); // eslint-disable-line react-hooks/exhaustive-deps

  const nombres = ganadores.map((id) => equipoDe(p, id)?.nombre).join(" y ");
  return (
    <>
      <div className="tv-titulo">{ganadores.length ? `🏆 ¡${nombres} ${ganadores.length > 1 ? "ganan" : "gana"}!` : paso ? "🥁 …" : "🥁 ¿Quién ganará?"}</div>
      <div className={`podio ${ganadores.length ? "con-confeti" : ""}`}>
        {vis.map((e) => {
          const n = puesto(e);
          const ver = revelados.has(e.id);
          return (
            <div key={e.id} className={`peana ${ver ? "vista" : "oculta"}`} style={{ height: `${ver ? alto(n) : 22}%`, background: ver ? e.color : undefined }}>
              {ver ? (
                <>
                  <div className="pos">{n === 1 ? "🥇" : n === 2 ? "🥈" : n === 3 ? "🥉" : `${n}º`}</div>
                  <div className="nom">{e.nombre}</div>
                  <div className="pt">{fmt(e.total)} pts</div>
                </>
              ) : (
                <div className="pos">?</div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
