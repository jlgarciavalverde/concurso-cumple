// Piezas de formulario del admin: pensadas para quien no conoce la app (ejemplos, «falta rellenar», sugerencias).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icono } from "../../components/iconos.tsx";

const PLANTILLA = "✏️";
export const esPlantilla = (v: string | undefined) => !!v && v.includes(PLANTILLA);
const sinMarca = (v: string) => v.replace(PLANTILLA, "").trim();

export function Campo({ etiqueta, ayuda, children, flex }: { etiqueta: string; ayuda?: string; children: ReactNode; flex?: number }) {
  return (
    <label className="col campo-admin" style={{ gap: 4, flex: flex ?? 1, minWidth: 150 }}>
      <span className="campo-etiqueta">{etiqueta}</span>
      {children}
      {ayuda && <span className="campo-ayuda">{ayuda}</span>}
    </label>
  );
}

/**
 * Texto con «falta rellenar». Si el valor es una plantilla (✏️…), el campo sale vacío con la plantilla como
 * ejemplo, y si es una sugerencia útil se puede aceptar tal cual.
 */
export function Texto({ v, on, ph, obligatorio = true, largo }: { v: string | undefined; on: (s: string) => void; ph?: string; obligatorio?: boolean; largo?: boolean }) {
  const plantilla = esPlantilla(v);
  const sugerencia = plantilla ? sinMarca(v!) : "";
  // Las plantillas tipo «Opción A» / «Producto 1» no sirven como sugerencia; las preguntas de ejemplo sí
  const util = sugerencia.length > 14 && !/^(opción|producto|mezcla|cachimba)\b/i.test(sugerencia);
  const valor = plantilla ? "" : (v ?? "");
  const falta = obligatorio && !valor.trim();
  const props = {
    className: `campo ${falta ? "falta" : ""}`,
    value: valor,
    placeholder: plantilla ? sugerencia : ph,
    onChange: (e: { target: { value: string } }) => on(e.target.value),
  };
  return (
    <>
      {largo ? <textarea rows={2} {...props} /> : <input {...props} />}
      {falta && (
        <span className="falta-aviso">
          Falta rellenar
          {util && (
            <button type="button" className="btn peq" onClick={() => on(sugerencia)}>
              Usar «{sugerencia.length > 40 ? `${sugerencia.slice(0, 40)}…` : sugerencia}»
            </button>
          )}
        </span>
      )}
    </>
  );
}

export function Numero({ v, on, falta }: { v: number; on: (n: number) => void; falta?: boolean }) {
  const [t, setT] = useState(String(v));
  useEffect(() => setT(String(v)), [v]);
  return (
    <>
      <input
        className={`campo ${falta ? "falta" : ""}`}
        inputMode="decimal"
        value={t}
        onChange={(e) => {
          setT(e.target.value);
          const n = Number(e.target.value.replace(",", "."));
          if (e.target.value.trim() !== "" && Number.isFinite(n)) on(n);
        }}
      />
      {falta && <span className="falta-aviso">Falta rellenar</span>}
    </>
  );
}

/** Subir foto o MP3. Con audio: reproductor y botón «Empezar aquí» (copia el segundo actual). */
export function Archivo({
  url,
  tipo,
  subir,
  on,
  onEmpezarAqui,
  inicio,
}: {
  url?: string;
  tipo: "audio" | "imagen";
  subir: (f: File) => Promise<string>;
  on: (u: string | undefined) => void;
  onEmpezarAqui?: (segundo: number) => void;
  inicio?: number;
}) {
  const [cargando, setCargando] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  return (
    <div className="col" style={{ gap: 6 }}>
      {url && tipo === "imagen" && <img src={url} alt="" style={{ maxHeight: 110, maxWidth: 180, borderRadius: 4, border: "2px solid var(--borde)" }} />}
      {url && tipo === "audio" && (
        <>
          <audio ref={audio} controls src={url} style={{ width: "100%" }} preload="metadata" />
          {onEmpezarAqui && (
            <div className="fila">
              <button type="button" className="btn peq prim" onClick={() => onEmpezarAqui(Math.floor(audio.current?.currentTime ?? 0))}>
                <Icono n="bandera" /> Empezar aquí
              </button>
              <button
                type="button"
                className="btn peq"
                onClick={() => {
                  const a = audio.current;
                  if (!a) return;
                  a.currentTime = inicio ?? 0;
                  void a.play();
                }}
              >
                <Icono n="play" /> Escuchar desde el {inicio ?? 0}
              </button>
              <span className="campo-ayuda">Dale al play, para en la parte que quieras que suene y pulsa «Empezar aquí».</span>
            </div>
          )}
        </>
      )}
      <div className="fila">
        <label className="btn peq">
          <Icono n={tipo === "audio" ? "nota" : "subir"} /> {cargando ? "Subiendo…" : url ? "Cambiar" : tipo === "audio" ? "Subir MP3" : "Subir foto (opcional)"}
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
        {url && <button type="button" className="btn peq" onClick={() => on(undefined)}>Quitar</button>}
        {err && <span style={{ color: "var(--ko)" }}>{err}</span>}
      </div>
    </div>
  );
}

/** Lista de elementos (preguntas, mezclas…) con añadir, mover y borrar. */
export function Lista<T>({ items, onChange, nuevo, render, nombre, titulo }: { items: T[]; onChange: (l: T[]) => void; nuevo: () => T; render: (it: T, set: (n: T) => void, i: number) => ReactNode; nombre: string; titulo?: (it: T, i: number) => string }) {
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
            <b className="etiqueta">{titulo ? titulo(it, i) : `${nombre} ${i + 1}`}</b>
            <div className="fila">
              <button type="button" className="btn peq" onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Subir"><Icono n="subir" /></button>
              <button type="button" className="btn peq" onClick={() => mover(i, 1)} disabled={i === items.length - 1} aria-label="Bajar"><Icono n="bajar" /></button>
              <button type="button" className="btn peq" onClick={() => confirm(`¿Borrar ${nombre.toLowerCase()} ${i + 1}?`) && onChange(items.filter((_, j) => j !== i))} aria-label="Borrar"><Icono n="basura" /></button>
            </div>
          </div>
          {render(it, (n) => onChange(items.map((x, j) => (j === i ? n : x))), i)}
        </div>
      ))}
      <button type="button" className="btn" style={{ alignSelf: "flex-start" }} onClick={() => onChange([...items, nuevo()])}>
        <Icono n="mas" /> Añadir {nombre.toLowerCase()}
      </button>
    </div>
  );
}

/** Ajustes que casi nadie necesita tocar, plegados. */
export function Avanzados({ children }: { children: ReactNode }) {
  return (
    <details className="avanzados">
      <summary>Ajustes avanzados (no hace falta tocarlos)</summary>
      <div className="col" style={{ marginTop: 10 }}>{children}</div>
    </details>
  );
}
