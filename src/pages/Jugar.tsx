import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Publico, VistaEquipo } from "../../shared/tipos.ts";
import { conColor, Cuenta, equipoDe, FORMAS, posRosco } from "../components/comun.tsx";
import { guardado, useCanal } from "../socket.ts";

export function Jugar() {
  const url = new URLSearchParams(location.search).get("c");
  const [codigo, setCodigo] = useState((url ?? guardado.leer("codigo") ?? "").toUpperCase());
  const [equipo, setEquipo] = useState(guardado.leer("equipo") ?? "");
  const [enviado, setEnviado] = useState(codigo.length === 4);
  const auth = enviado ? { rol: "equipo", codigo, equipo } : null;
  const { datos, error, conectado, desfase, enviar } = useCanal<VistaEquipo | Publico>(auth, "equipo");

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
          <div className="espera"><div className="grande">🎉</div>¡Al concurso!</div>
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
                }}
              >
                {e.nombre}
                <span style={{ fontWeight: 400, fontSize: "0.7em" }}>{e.conectados ? `${e.conectados} 📱` : ""}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );

  const v = datos as VistaEquipo;
  return (
    <div className="movil">
      <div className="movil-cab" style={{ background: yo.color }}>
        <span>{yo.nombre}</span>
        <span>{yo.total} pts {!conectado && "· ⚠️"}</span>
      </div>
      <div className="movil-cuerpo">
        <Cuerpo v={v} desfase={desfase} enviar={(a) => enviar("equipo", a)} />
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

function Espera({ emoji = "👀", texto }: { emoji?: string; texto: string }) {
  return (
    <div className="espera">
      <div className="grande">{emoji}</div>
      {texto}
    </div>
  );
}

function Cuerpo({ v, desfase, enviar }: { v: VistaEquipo; desfase: number; enviar: Enviar }) {
  const s = v.sub;
  if (!s || v.vista !== "juego") return <Espera texto="Mirad la pantalla" />;
  if (v.fase === "resultado") {
    const p = v.ranking?.[v.yo] ?? 0;
    return (
      <>
        <Espera emoji={p >= 10 ? "🏆" : p > 0 ? "👏" : "😅"} texto={s.titulo} />
        <div className="resultado-movil bien">+{p} puntos{v.confirmado ? "" : " (provisional)"}</div>
      </>
    );
  }
  if (v.fase === "intro" && s.tipo !== "tarjetas" && s.tipo !== "manual") return <Espera emoji={s.emoji} texto={`${s.titulo} — ¡preparados!`} />;

  switch (s.tipo) {
    case "test":
      return <TestMovil v={v} desfase={desfase} enviar={enviar} />;
    case "precio":
      return <PrecioMovil v={v} desfase={desfase} enviar={enviar} />;
    case "adivinar":
      return <HojaMovil v={v} desfase={desfase} enviar={enviar} />;
    case "cancion":
      return <Pulsador v={v} enviar={enviar} />;
    case "tarjetas":
    case "manual": {
      const t = equipoDe(v, v.turno);
      if (t?.id === v.yo) return <Espera emoji="🔥" texto={s.tipo === "tarjetas" ? "¡Os toca! El presentador tiene la tarjeta." : "¡Os toca!"} />;
      return <Espera emoji={s.emoji} texto={t ? `Turno de ${t.nombre}` : s.descripcion ?? s.titulo} />;
    }
  }
}

function TestMovil({ v, desfase, enviar }: { v: VistaEquipo; desfase: number; enviar: Enviar }) {
  const q = v.pregunta;
  if (!q) return null;
  const mia = v.miRespuesta as number | undefined;
  if (v.fase === "revelar") {
    const bien = mia === v.solucion?.correcta;
    return (
      <>
        <div className={`resultado-movil ${bien ? "bien" : "mal"}`}>{mia === undefined ? "⏰ Sin respuesta" : bien ? "✅ ¡Correcto!" : "❌ Fallo"}</div>
        <div className="espera suave">Correcta: {FORMAS[v.solucion?.correcta ?? 0]} {q.opciones?.[v.solucion?.correcta ?? 0]}</div>
      </>
    );
  }
  if (mia !== undefined) return <Espera emoji={FORMAS[mia]} texto="Respuesta enviada. ¡A esperar!" />;
  return (
    <>
      <div className="fila" style={{ justifyContent: "space-between" }}>
        <b>{v.indice + 1}/{v.sub!.total}</b>
        <Cuenta fin={v.fin} inicio={v.abiertaEn} desfase={desfase} tam="56px" />
      </div>
      <div style={{ fontWeight: 700, fontSize: "1.15em" }}>{q.texto}</div>
      <div className="botones4">
        {q.opciones?.map((o, i) => (
          <button key={i} className={`op op${i % 4}`} onClick={() => enviar({ t: "responder", valor: i })}>
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
        <div className="resultado-movil bien">Precio: {v.solucion?.precio} €</div>
        <div className="espera suave">Vosotros: {mia ?? "—"} €</div>
      </>
    );
  const n = Number(txt.replace(",", "."));
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
          if (txt && Number.isFinite(n)) enviar({ t: "responder", valor: n });
        }}
      >
        <input className="campo" style={{ fontSize: "2.2em", textAlign: "center" }} inputMode="decimal" placeholder="0,00 €" value={txt} onChange={(e) => setTxt(e.target.value.replace(/[^0-9.,]/g, ""))} />
        <button className="btn prim grande" disabled={!txt || !Number.isFinite(n)}>{mia === undefined ? "Enviar precio" : "Cambiar precio"}</button>
      </form>
      {mia !== undefined && <div className="espera suave">Enviado: {mia} € (podéis cambiarlo hasta que acabe el tiempo)</div>}
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
    const ac = v.hojas?.[v.yo]?.aciertos ?? [];
    return (
      <>
        <div className="resultado-movil bien">{ac.filter(Boolean).length}/{items.length} aciertos</div>
        <div className="panel col">
          {items.map((it, i) => (
            <div key={i} className="fila" style={{ justifyContent: "space-between" }}>
              <span>{it.etiqueta}: {hoja?.valores[i] || "—"}</span>
              <span>{ac[i] ? "✅" : `❌ ${v.solucion?.respuestas?.[i] ?? ""}`}</span>
            </div>
          ))}
        </div>
      </>
    );
  }
  if (hoja?.entregada) return <Espera emoji="✅" texto="Entregado. ¡A esperar la corrección!" />;

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
              <button className="btn" onClick={() => setActual((actual + 1) % items.length)}>Pasapalabra ➜</button>
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
  if (v.fase === "revelar") return <Espera emoji="🎶" texto={v.solucion?.texto ?? ""} />;
  const bloqueado = v.bloqueados.includes(v.yo);
  const otro = v.pulsado && v.pulsado !== v.yo ? equipoDe(v, v.pulsado) : null;
  return (
    <>
      <div className="espera suave">{v.sub!.titulo} · {v.indice + 1}/{v.sub!.total}</div>
      <button
        className="pulsador"
        disabled={!!v.pulsado || bloqueado}
        onPointerDown={() => {
          navigator.vibrate?.(80);
          enviar({ t: "pulsar" });
        }}
      >
        {v.pulsado === v.yo ? "¡Vuestro turno!" : bloqueado ? "Bloqueados" : otro ? otro.nombre : "¡PULSA!"}
      </button>
      <div className="espera">{v.pulsado === v.yo ? "Decid la canción en voz alta 🎤" : otro ? `Contesta ${otro.nombre}…` : bloqueado ? "Habéis fallado esta" : ""}</div>
    </>
  );
}
