import type { CSSProperties } from "react";

// Iconos de trazo propios (24×24, 2 px, color del texto). Sustituyen a los emojis.
const TRAZOS = {
  play: <path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" />,
  pausa: (
    <>
      <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
      <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
    </>
  ),
  siguiente: <path d="M5 12h13M13 6l6 6-6 6" />,
  revelar: (
    <>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  deshacer: <path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />,
  tv: (
    <>
      <rect x="2.5" y="5" width="19" height="13" rx="1.5" />
      <path d="M8 21h8M8 2l4 3 4-3" />
    </>
  ),
  sonido: <path d="M4 9.5v5h4l5 4v-13l-5 4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />,
  silencio: <path d="M4 9.5v5h4l5 4v-13l-5 4zM17 9.5l5 5M22 9.5l-5 5" />,
  recargar: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />,
  check: <path d="M4.5 12.5l5 5 10-11" />,
  cruz: <path d="M6 6l12 12M18 6 6 18" />,
  reloj: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2.5M9.5 2.5h5" />
    </>
  ),
  trofeo: <path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8M9.5 18h5" />,
  lapiz: <path d="M4 20l1-4.5L16 4.5l3.5 3.5L8.5 19zM14 7l3.5 3.5" />,
  nota: (
    <>
      <path d="M9 18V5l11-2v13" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="17.5" cy="16" r="2.5" />
    </>
  ),
  micro: <path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />,
  usuarios: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14a6.5 6.5 0 0 1 3 6" />
    </>
  ),
  bandera: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  marcador: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  inicio: <path d="M3 11 12 4l9 7M5.5 9.5V20h13V9.5" />,
  bocina: <path d="M3 10v4h3l7 5V5L6 10zM16 9h5M16 15h5M16 12h6" />,
  aviso: <path d="M12 3 2 20h20zM12 10v4M12 17v.5" />,
  telefono: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2" />
      <path d="M11 18h2" />
    </>
  ),
  editar: <path d="M4 20h16M6 16l1-4 9-9 3 3-9 9z" />,
  mas: <path d="M12 5v14M5 12h14" />,
  menos: <path d="M5 12h14" />,
  enlace: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  basura: <path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13" />,
  subir: <path d="M12 19V5M6 11l6-6 6 6" />,
  bajar: <path d="M12 5v14M6 13l6 6 6-6" />,
  candado: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="1.5" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </>
  ),
  rayo: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
} as const;

export type NombreIcono = keyof typeof TRAZOS;
export const ICONOS = TRAZOS;

export function Icono({ n, tam = "1.1em", style, titulo }: { n: NombreIcono; tam?: string; style?: CSSProperties; titulo?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={tam}
      height={tam}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: "none", verticalAlign: "-0.15em", ...style }}
      role={titulo ? "img" : undefined}
      aria-hidden={titulo ? undefined : true}
      aria-label={titulo}
    >
      {TRAZOS[n]}
    </svg>
  );
}

/** Insignia redonda de acierto / fallo / medio / sin responder (sustituye a ✅❌🟡⚫). */
export function Insignia({ m, tam = "1.4em" }: { m: "ok" | "medio" | "ko" | "nada"; tam?: string }) {
  const titulo = { ok: "Acierto", medio: "Medio acierto", ko: "Fallo", nada: "Sin responder" }[m];
  return (
    <span className={`insignia insignia-${m}`} style={{ width: tam, height: tam }} role="img" aria-label={titulo} title={titulo}>
      {m === "ok" && <Icono n="check" tam="70%" />}
      {m === "ko" && <Icono n="cruz" tam="62%" />}
      {m === "medio" && "½"}
    </span>
  );
}
