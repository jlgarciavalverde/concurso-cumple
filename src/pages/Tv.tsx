import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { miembros, type Publico } from "../../shared/tipos.ts";
import confetti from "canvas-confetti";
import { conColor, Crono, Cuenta, desbloquearAudio, equipoDe, etiquetaCrudo, euros, FORMAS, gruposPodio, ponerVolumen, posRosco, probarSonido, fmt, sonidos, useSonidosCuenta, useWakeLock } from "../components/comun.tsx";
import { Icono, Insignia } from "../components/iconos.tsx";
import { guardado, useCanal } from "../socket.ts";
import { ReproductorSpotify, type EstadoSpotify } from "../components/spotifyTv.ts";

export function Tv() {
  // Clave que da el panel al autorizar esta TV para Spotify (se guarda: sobrevive a recargas)
  const [claveSpotify, setClaveSpotify] = useState(guardado.leer("tv-spotify") ?? "");
  const auth = useMemo(() => ({ rol: "tv", claveSpotify }), [claveSpotify]);
  const { datos: p, desfase, conectado, enviar, preguntar } = useCanal<Publico>(auth, "publico", {
    recargar: () => location.reload(),
    spotifyClave: (k: string) => {
      guardado.poner("tv-spotify", k);
      setClaveSpotify(k);
    },
  });
  const reproductor = useSpotifyTv(!!claveSpotify, preguntar, (e) => enviar("spotifyEstado", e), conectado);
  // La TV no se toca: el sonido funciona si el navegador lo permite (lanzador «Concurso TV») y lo controla el presentador
  const [sonidoOk, setSonidoOk] = useState(false);
  const [progreso, setProgreso] = useState<Progreso>(null);
  const pulsadoPrev = useRef<string | null>(null);
  const mudo = p?.tv.mudo ?? false;
  const suena = sonidoOk && !mudo;

  useEffect(() => {
    let vivo = true;
    const probar = () => probarSonido().then((ok) => vivo && setSonidoOk(ok));
    probar();
    // Plan B: si el navegador bloquea el sonido, cualquier toque o tecla en la TV lo desbloquea
    const desbloquear = () => {
      desbloquearAudio();
      probar();
    };
    addEventListener("pointerdown", desbloquear);
    addEventListener("keydown", desbloquear);
    return () => {
      vivo = false;
      removeEventListener("pointerdown", desbloquear);
      removeEventListener("keydown", desbloquear);
    };
  }, []);
  useEffect(() => {
    if (conectado) enviar("tvEstado", { sonido: sonidoOk });
  }, [conectado, sonidoOk]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    ponerVolumen((p?.tv.volumen ?? 80) / 100);
  }, [p?.tv.volumen]);

  useWakeLock(true);
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
        <div className="marca marquesina">{p.titulo}</div>
        <div className="unete">
          {location.host} · código <b>{p.codigo}</b> {!conectado && <span style={{ color: "var(--ko)" }}>· sin conexión</span>}
          {!sonidoOk && <span className="sin-sonido"><Icono n="silencio" /> sin sonido</span>}
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
      <AudioTv p={p} activa={sonidoOk} onProgreso={setProgreso} />
      <AudioSpotify p={p} reproductor={reproductor} onProgreso={setProgreso} />
      <Precarga urls={p.audiosSub} />
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
    a.volume = p.tv.mudo ? 0 : p.tv.volumen / 100;
    if (activa && p.sonando) {
      if (fin !== null && !libre.current && a.currentTime >= fin - 0.05) return; // fragmento ya agotado: hace falta «Repetir»
      a.play().catch(() => {});
    } else a.pause();
  }, [clave, p.sonando, activa, p.repetir, p.fase, p.tv.mudo, p.tv.volumen]); // eslint-disable-line react-hooks/exhaustive-deps

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
  if (p.vista === "votacion") return <VotacionTv p={p} suena={suena} />;
  if (p.vista === "marcador") return <Desglose p={p} />;
  if (!p.sub) return <Lobby p={p} />;
  const s = p.sub;
  if (p.fase === "intro" && s.tipo !== "tarjetas" && s.tipo !== "manual" && s.tipo !== "externo")
    return (
      <>
        <div className="marquesina" style={{ padding: "2.4vh 4vw" }}>
          <div className="tv-numero">{String(s.pruebaNum).padStart(2, "0")}</div>
        </div>
        <div className="tv-sub etiqueta">Prueba {s.pruebaNum} · {s.pruebaTitulo}</div>
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
    case "externo":
      return <ExternoTv p={p} />;
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
            <div key={e.id} className="col" style={{ gap: "0.3vh" }}>
              <div className="fila" style={{ fontSize: p.equipos.length > 4 ? "3.2vh" : "3.6vh", fontWeight: 800 }}>
                <span className="punto" style={{ background: e.color, width: "3vh", height: "3vh" }} />
                {e.nombre}
                <span className="suave" style={{ fontSize: "2.4vh" }}>{e.conectados ? <><Icono n="telefono" /> {e.conectados} móvil{e.conectados > 1 ? "es" : ""}</> : "esperando…"}</span>
              </div>
              {miembros(e).length > 0 && <div className="suave" style={{ fontSize: "2.2vh", paddingLeft: "4vh" }}>{miembros(e).join(" · ")}</div>}
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
          {p.contestados.includes(e.id) && <Icono n="check" />}
          {e.nombre}
        </span>
      ))}
    </div>
  );
}

function Contador({ p }: { p: Publico }) {
  const nombre = p.sub!.tipo === "cancion" ? "Canción" : p.sub!.tipo === "precio" ? "Producto" : "Pregunta";
  const dos = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="tv-sub etiqueta">
      {nombre} {dos(p.indice + 1)} / {dos(p.sub!.total)} · {p.sub!.titulo}
    </div>
  );
}

function Test({ p, desfase }: { p: Publico; desfase: number }) {
  const q = p.pregunta;
  if (!q) return null;
  const rev = p.fase === "revelar";
  return (
    <>
      <Contador p={p} />
      <div className="fila" style={{ gap: "3vw", justifyContent: "center" }}>
        <div className="tarjeta-preg tv-pregunta">{q.texto}</div>
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
                  {p.bonus?.[e.id] ? <> <Icono n="rayo" />+{fmt(p.bonus[e.id])}</> : null}
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
      <div className="tarjeta-preg tv-pregunta">{q.texto}</div>
      {q.imagen && <img className="tv-imagen" src={q.imagen} alt="" />}
      {!rev ? (
        <>
          <Cuenta fin={p.fin} inicio={p.abiertaEn} desfase={desfase} />
          <Contestados p={p} />
        </>
      ) : (
        <>
          <div className="revela">{euros(precio)}</div>
          <div className="ofertas">
            {ofertas.map(({ e, v }) => (
              <div key={e.id} className={`tv-eq ${p.ganadores?.includes(e.id) ? "on" : ""}`} style={conColor(e.color)}>
                <span>{p.ganadores?.includes(e.id) && <Icono n="trofeo" />} {e.nombre}&nbsp;</span>
                <span className="n">{v === undefined ? "—" : euros(v)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}


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
                    <span style={{ fontSize: "5vh" }}>{rev && m ? <Insignia m={m} tam="6vh" /> : p.contestados.includes(e.id) ? <Icono n="lapiz" /> : "…"}</span>
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
                  <span style={{ fontSize: "4.4vh" }}>{rev && m ? <Insignia m={m} tam="5vh" /> : p.contestados.includes(e.id) ? <Icono n="lapiz" /> : "…"}</span>
                </div>
                <div style={{ fontSize: "3vh", minHeight: "4vh", fontWeight: 700 }}>{rev ? h?.valores[p.indice] || "sin responder" : p.contestados.includes(e.id) ? "¡Respondido!" : "Pensando…"}</div>
                <div className="fila" style={{ gap: 4, marginTop: "1vh" }}>
                  {items.map((_, i) => (
                    <span key={i} className={`mini ${h?.marcas[i] ?? "pend"} ${i === p.indice ? "actual" : ""}`}>{h?.marcas[i] ? <Insignia m={h.marcas[i]!} tam="3vh" /> : i + 1}</span>
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
                    <Insignia m={h?.marcas[i] ?? "nada"} tam="3.4vh" />
                  </div>
                ))
              ) : (
                <div style={{ fontSize: "3.4vh", marginTop: "1vh" }}>{h?.entregada ? <><Icono n="check" /> Entregado</> : `${h?.contestadas ?? 0}/${items.length}`}</div>
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
        <Icono n="nota" tam="12vh" style={{ color: "var(--bombilla)" }} />
        <div className="revela">{p.solucion?.texto}</div>
        {p.ganadores?.length ? (
          p.ganadores.map((id) => {
            const g = equipoDe(p, id)!;
            return <div key={id} className="pulsado" style={{ background: g.color, fontSize: "5vh" }}><Icono n="check" /> {g.nombre} +1</div>;
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
          <Icono n={p.sonando && !progreso?.acabado ? "nota" : "pausa"} tam="14vh" style={{ color: "var(--bombilla)", animation: p.sonando && !progreso?.acabado ? "latido 0.6s infinite alternate" : undefined }} />
          <div className="tv-pregunta">{progreso?.acabado ? "Fin del fragmento… ¿quién la sabe?" : "¿Qué canción es?"}</div>
          {!p.audio && p.sub?.sonido !== "presentador" && <div className="tv-sub">(sin audio: el presentador la pone aparte)</div>}
          {p.sub?.sonido === "presentador" && <div className="tv-sub">¡Pulsad en cuanto la reconozcáis!</div>}
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
            return <span key={id} className="chip si" style={{ ...conColor("#555"), opacity: 0.8 }}><Icono n="cruz" /> {b.nombre}</span>;
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
      <div className="tv-sub etiqueta">Prueba {s.pruebaNum} · {s.titulo}</div>
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
            <div className="revela" style={{ fontSize: p.tarjeta ? "4vh" : undefined }}>{p.crudo[e.id] ?? 0} {(p.crudo[e.id] ?? 0) === 1 ? "acierto" : "aciertos"}</div>
          </div>
          {p.tarjeta ? (
            <div className="tarjeta-tv">
              <div className="aviso"><Icono n="candado" /> Solo mira quien {s.modo === "dibujo" ? "dibuja" : "explica"}</div>
              <div className="pal">{p.tarjeta.palabra}</div>
              {p.tarjeta.condicion && <div className="cond">{p.tarjeta.condicion}</div>}
              {p.tarjeta.prohibidas && p.tarjeta.prohibidas.filter(Boolean).length > 0 && (
                <div className="proh">{p.tarjeta.prohibidas.filter(Boolean).map((x) => <span key={x}>{x}</span>)}</div>
              )}
            </div>
          ) : p.fase === "intro" ? (
            <div className="tv-sub">
              {s.tarjetaEnTv
                ? `Quien ${s.modo === "dibujo" ? "dibuja" : "explica"}, frente a la TV; su equipo, de espaldas. La palabra sale al empezar el turno`
                : `Quien ${s.modo === "dibujo" ? "dibuja" : "explica"} ve la palabra en el móvil del presentador`}
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
      <div className="tv-sub etiqueta">Prueba {s.pruebaNum} · {s.pruebaTitulo}</div>
      <div className="tv-titulo">{s.titulo}</div>
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
              <span className="clasif-pos">{pos + 1}<small>º</small></span>
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
      <div className="tv-sub etiqueta">Prueba {p.sub!.pruebaNum} · {p.sub!.pruebaTitulo}</div>
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
          {p.desglose.map((f, i) => (
            <tr key={f.pruebaId}>
              <td>{f.pruebaId === "ajustes" ? "" : `${i + 1}. `}{f.titulo}</td>
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

  const lista = ganadores.map((id) => equipoDe(p, id)?.nombre ?? "");
  const nombres = lista.length > 1 ? `${lista.slice(0, -1).join(", ")} y ${lista.at(-1)}` : lista[0];
  if (p.equipos.every((e) => !e.total))
    return (
      <>
        <div className="tv-titulo">Aún no hay puntos</div>
        <div className="tv-sub">El podio se llena cuando se jueguen las pruebas</div>
      </>
    );
  return (
    <>
      <div className="tv-titulo">{ganadores.length ? `🏆 ¡${nombres} ${ganadores.length > 1 ? "ganan" : "gana"}!` : paso ? "Y el siguiente puesto es…" : "¿Quién ganará?"}</div>
      <div className={`podio ${ganadores.length ? "con-confeti" : ""}`}>
        {vis.map((e) => {
          const n = puesto(e);
          const ver = revelados.has(e.id);
          return (
            <div key={e.id} className={`peana ${ver ? "vista" : "oculta"}`} style={{ height: `${ver ? alto(n) : 22}%`, background: ver ? e.color : undefined }}>
              {ver ? (
                <>
                  <div className="pos">{n}<small>º</small></div>
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

/** Kahoot del cumpleañero: cómo unirse (PIN en grande y QR directo). */
function ExternoTv({ p }: { p: Publico }) {
  const s = p.sub!;
  const pin = p.externo?.pin;
  const enlace = p.externo?.enlace;
  const url = pin ? `https://kahoot.it/?pin=${pin}&refer_method=link` : enlace ?? "https://kahoot.it";
  return (
    <>
      <div className="tv-sub etiqueta">Prueba {s.pruebaNum} · {s.pruebaTitulo}</div>
      <div className="tv-titulo" style={{ fontSize: "7vh" }}>{s.titulo}</div>
      {pin ? (
        <div className="fila" style={{ gap: "4vw", justifyContent: "center", alignItems: "center" }}>
          <div className="col" style={{ alignItems: "center", gap: "1.5vh" }}>
            <div className="tv-sub">Entrad en <b style={{ color: "var(--texto)" }}>kahoot.it</b> con el PIN</div>
            <div className="marquesina" style={{ padding: "2vh 3vw" }}>
              <div className="tv-numero" style={{ fontSize: "16vh", letterSpacing: "0.08em" }}>{pin}</div>
            </div>
            <div className="tv-sub">y poned de nombre <b style={{ color: "var(--bombilla)" }}>el de vuestro equipo</b></div>
          </div>
          <div className="col" style={{ alignItems: "center", gap: "1vh" }}>
            <div style={{ background: "#fff", padding: "1.6vh", borderRadius: 6, border: "4px solid #050b1c", boxShadow: "8px 8px 0 #050b1c" }}>
              <QRCodeSVG value={url} size={Math.round(window.innerHeight * 0.3)} />
            </div>
            <div className="tv-sub" style={{ fontSize: "2.4vh" }}>o escanead para entrar directo</div>
          </div>
        </div>
      ) : enlace ? (
        <div className="fila" style={{ gap: "4vw", justifyContent: "center", alignItems: "center" }}>
          <div style={{ background: "#fff", padding: "1.6vh", borderRadius: 6, border: "4px solid #050b1c", boxShadow: "8px 8px 0 #050b1c" }}>
            <QRCodeSVG value={url} size={Math.round(window.innerHeight * 0.36)} />
          </div>
          <div className="col" style={{ alignItems: "flex-start", gap: "2vh", maxWidth: "40vw", textAlign: "left" }}>
            <div className="tv-pregunta" style={{ fontSize: "5vh" }}>Escanead el QR con un móvil por equipo</div>
            <div className="tv-sub">y poned de nombre <b style={{ color: "var(--bombilla)" }}>el de vuestro equipo</b></div>
          </div>
        </div>
      ) : (
        <div className="tv-sub">Esperando a que el cumpleañero lance su Kahoot…</div>
      )}
    </>
  );
}

/** Votación del mejor disfraz: QR para votar, recuento y revelación con suspense. */
function VotacionTv({ p, suena }: { p: Publico; suena: boolean }) {
  const v = p.votacion;
  const final = !!v && v.estado === "cerrada" && v.totalPasos > 0 && v.paso >= v.totalPasos;
  const paso = v?.paso ?? 0;
  useEffect(() => {
    if (!paso) return;
    if (final) {
      if (suena) sonidos.fanfarria();
      const fin = Date.now() + 3500;
      const rafaga = () => {
        void confetti({ particleCount: 70, spread: 80, startVelocity: 55, origin: { x: Math.random() * 0.6 + 0.2, y: 0.7 } });
        if (Date.now() < fin) setTimeout(rafaga, 350);
      };
      rafaga();
    } else if (suena) sonidos.redoble();
  }, [paso]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!v || !v.participantes.length) return <div className="tv-titulo">Concurso de disfraces</div>;
  const url = `${location.origin}/votar?c=${p.codigo}`;
  const ganador = final ? v.revelados.at(-1) : null;
  if (v.estado === "cerrada")
    return (
      <>
        <div className="tv-sub etiqueta">Concurso de disfraces</div>
        <div className={`tv-titulo ${ganador ? "" : ""}`}>
          {ganador ? `🏆 ¡${ganador.nombres.join(" y ")}!` : v.paso ? "Y el siguiente es…" : "¿Quién tiene el mejor disfraz?"}
        </div>
        {ganador && ganador.nombres.length > 1 && <div className="tv-sub">¡Empate a {ganador.votos} votos!</div>}
        <div className="fila" style={{ gap: "2vw", justifyContent: "center", alignItems: "flex-end" }}>
          {v.revelados.map((g) => (
            <div key={g.puesto} className={`tarjeta-preg col disfraz-puesto puesto-${g.puesto}`} style={{ alignItems: "center", animation: "pop 0.5s" }}>
              <div className="tv-numero" style={{ fontSize: g.puesto === 1 ? "14vh" : "9vh" }}>{g.puesto}<small style={{ fontFamily: "var(--cond)", fontSize: "0.4em", verticalAlign: "0.9em" }}>º</small></div>
              <div className="tv-pregunta" style={{ fontSize: g.puesto === 1 ? "6vh" : "4vh" }}>{g.nombres.join(" y ")}</div>
              <div className="tv-sub">{g.votos} {g.votos === 1 ? "voto" : "votos"}</div>
            </div>
          ))}
        </div>
      </>
    );
  return (
    <>
      <div className="tv-sub etiqueta">{v.ronda > 1 ? `Desempate entre ${v.candidatos.join(" y ")}` : "Concurso de disfraces"}</div>
      <div className="tv-titulo">¡Votad el mejor disfraz!</div>
      <div className="fila" style={{ gap: "4vw", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: "#fff", padding: "1.6vh", borderRadius: 6, border: "4px solid #050b1c", boxShadow: "8px 8px 0 #050b1c" }}>
          <QRCodeSVG value={url} size={Math.round(window.innerHeight * 0.32)} />
        </div>
        <div className="col" style={{ gap: "2vh", alignItems: "flex-start", maxWidth: "45vw" }}>
          <div className="tv-sub">Cada uno con su móvil: escanead, elegid vuestro nombre y votad (no vale votarse).</div>
          {v.estado === "abierta" ? (
            <div className="marquesina" style={{ padding: "1.5vh 2vw" }}>
              <div className="tv-numero" style={{ fontSize: "10vh" }}>{v.votaron.length}<span style={{ fontSize: "0.45em", color: "var(--texto)" }}> / {v.participantes.length}</span></div>
            </div>
          ) : (
            <div className="tv-sub">La votación empieza en un momento…</div>
          )}
          {v.estado === "abierta" && <div className="tv-sub" style={{ fontSize: "2.4vh" }}>han votado</div>}
        </div>
      </div>
    </>
  );
}

/** Arranca el reproductor de Spotify en la TV cuando el panel la ha autorizado; informa al panel de cómo va. */
function useSpotifyTv(
  autorizada: boolean,
  preguntar: <R>(ev: string, payload: unknown) => Promise<R>,
  informar: (e: EstadoSpotify) => void,
  conectado: boolean,
) {
  const [rep, setRep] = useState<ReproductorSpotify | null>(null);
  const [listo, setListo] = useState(false);
  const ultimo = useRef<EstadoSpotify>({ listo: false, error: null });
  const inf = useRef(informar);
  inf.current = informar;
  const preg = useRef(preguntar);
  preg.current = preguntar;
  useEffect(() => {
    if (!autorizada) return;
    const r = new ReproductorSpotify(
      async () => {
        const d = await preg.current<{ token?: string; error?: string }>("spotifyToken", null);
        if (!d.token) throw new Error(d.error ?? "Sin token de Spotify");
        return d.token;
      },
      (e) => {
        ultimo.current = e;
        setListo(e.listo);
        inf.current(e);
      },
    );
    void r.iniciar();
    setRep(r);
    return () => r.cerrar();
  }, [autorizada]);
  // Al reconectar con el servidor, volver a contarle cómo está Spotify
  useEffect(() => {
    if (conectado && autorizada) inf.current(ultimo.current);
  }, [conectado, autorizada]);
  return listo ? rep : null; // solo se usa cuando ya puede sonar
}

/**
 * Canciones de Spotify: igual que el MP3 (fragmento que se para solo, «Repetir», libre al revelar), pero
 * sonando en el reproductor de Spotify de la TV.
 */
function AudioSpotify({ p, reproductor, onProgreso }: { p: Publico; reproductor: ReproductorSpotify | null; onProgreso: (x: Progreso) => void }) {
  const au = p.audio?.spotify ? p.audio : null;
  const clave = au ? `${p.sub?.id}:${p.indice}:${au.spotify}` : null;
  const cargada = useRef<string | null>(null);
  const libre = useRef(false);
  libre.current = p.fase === "revelar";
  const fin = au && au.fragmento > 0 ? (au.inicio + au.fragmento) * 1000 : null;

  // Sonar / parar según el panel
  useEffect(() => {
    if (!reproductor) return;
    if (!au || !clave) {
      if (cargada.current) void reproductor.pausar();
      cargada.current = null;
      return;
    }
    if (p.sonando) {
      if (cargada.current !== clave) {
        cargada.current = clave;
        onProgreso({ frac: 0, acabado: false });
        reproductor.tocar(au.spotify!, au.inicio * 1000).catch(() => (cargada.current = null));
      } else void reproductor.seguir();
    } else void reproductor.pausar();
  }, [clave, p.sonando, reproductor]); // eslint-disable-line react-hooks/exhaustive-deps

  // Repetir el fragmento
  useEffect(() => {
    if (reproductor && au && p.repetir && cargada.current === clave) {
      void reproductor.ir(au.inicio * 1000);
      void reproductor.seguir();
    }
  }, [p.repetir]); // eslint-disable-line react-hooks/exhaustive-deps

  // Volumen
  useEffect(() => {
    void reproductor?.volumen(p.tv.mudo ? 0 : p.tv.volumen / 100);
  }, [reproductor, p.tv.mudo, p.tv.volumen]);

  // Progreso y corte del fragmento
  useEffect(() => {
    if (!reproductor || !au || !clave) return;
    const id = setInterval(async () => {
      const e = await reproductor.posicion();
      if (!e || cargada.current !== clave) return;
      if (fin === null) return onProgreso({ frac: 0, acabado: false });
      const acabado = e.position >= fin;
      if (acabado && !libre.current && !e.paused) void reproductor.pausar();
      onProgreso({ frac: Math.min(1, Math.max(0, (e.position - au.inicio * 1000) / (au.fragmento * 1000))), acabado });
    }, 250);
    return () => clearInterval(id);
  }, [clave, reproductor]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
