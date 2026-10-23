// Spotify: conectar la cuenta Premium (OAuth), renovar el token y leer listas. La TV reproduce con el Web Playback SDK.
import { randomBytes } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";

// Se pueden cambiar para los tests (un Spotify simulado en local)
const CUENTAS = process.env.SPOTIFY_ACCOUNTS ?? "https://accounts.spotify.com";
const API = process.env.SPOTIFY_API ?? "https://api.spotify.com";

export const PERMISOS = [
  "streaming", // Web Playback SDK
  "user-read-email",
  "user-read-private",
  "user-modify-playback-state",
  "user-read-playback-state",
  "playlist-read-private",
  "playlist-read-collaborative",
].join(" ");

interface Guardado {
  refresh?: string;
  access?: string;
  caduca?: number; // epoch ms
  cuenta?: string;
  premium?: boolean;
  clavesTv?: string[]; // TVs autorizadas a pedir el token (ver index.ts)
}

export interface CancionSpotify {
  titulo: string;
  artista: string;
  spotify: string;
  duracion: number;
}

/** Saca el id de una lista de «https://open.spotify.com/playlist/ID?si=…», «spotify:playlist:ID» o el id a pelo. */
export function idLista(entrada: string): string | null {
  const t = entrada.trim();
  const m = t.match(/playlist[/:]([A-Za-z0-9]{10,40})/) ?? t.match(/^([A-Za-z0-9]{10,40})$/);
  return m ? m[1] : null;
}

/** Las canciones de una respuesta de items de lista (formato nuevo `item` y antiguo `track`). */
export function cancionesDe(items: unknown[]): CancionSpotify[] {
  const out: CancionSpotify[] = [];
  for (const raw of items as { item?: Pista; track?: Pista }[]) {
    const p = raw?.item ?? raw?.track;
    if (!p || p.type === "episode" || !p.uri?.startsWith("spotify:track:")) continue;
    out.push({
      titulo: p.name ?? "",
      artista: (p.artists ?? []).map((a) => a.name).join(", "),
      spotify: p.uri,
      duracion: Math.round((p.duration_ms ?? 0) / 1000),
    });
  }
  return out;
}
interface Pista {
  type?: string;
  uri?: string;
  name?: string;
  duration_ms?: number;
  artists?: { name: string }[];
}

export class Spotify {
  private g: Guardado;
  private estados = new Map<string, number>(); // state de OAuth → caducidad

  constructor(
    private archivo: string,
    private id = process.env.SPOTIFY_CLIENT_ID ?? "",
    private secreto = process.env.SPOTIFY_CLIENT_SECRET ?? "",
    private redireccion = `${process.env.PUBLIC_URL ?? "https://concurso.redgarverde.com"}/api/spotify/callback`,
    private pedir: typeof fetch = fetch,
  ) {
    try {
      this.g = JSON.parse(readFileSync(archivo, "utf8"));
    } catch {
      this.g = {};
    }
  }

  get configurado() {
    return !!(this.id && this.secreto);
  }

  get conectado() {
    return this.configurado && !!this.g.refresh;
  }

  estado() {
    return { configurado: this.configurado, conectado: this.conectado, cuenta: this.g.cuenta ?? null, premium: this.g.premium ?? null, redireccion: this.redireccion };
  }

  private guardar() {
    const tmp = `${this.archivo}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.g), { mode: 0o600 });
    renameSync(tmp, this.archivo);
  }

  /** URL a la que mandar el navegador para conectar la cuenta. */
  urlConectar(): string {
    const state = randomBytes(16).toString("hex");
    this.estados.set(state, Date.now() + 10 * 60_000);
    const q = new URLSearchParams({ response_type: "code", client_id: this.id, scope: PERMISOS, redirect_uri: this.redireccion, state, show_dialog: "true" });
    return `${CUENTAS}/authorize?${q}`;
  }

  private async pedirToken(cuerpo: Record<string, string>) {
    const r = await this.pedir(`${CUENTAS}/api/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${Buffer.from(`${this.id}:${this.secreto}`).toString("base64")}` },
      body: new URLSearchParams(cuerpo).toString(),
    });
    const d = (await r.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string; error?: string };
    if (!r.ok || !d.access_token) throw new Error(`Spotify no ha dado el token: ${d.error_description ?? d.error ?? r.status}`);
    this.g.access = d.access_token;
    this.g.caduca = Date.now() + (d.expires_in ?? 3600) * 1000;
    if (d.refresh_token) this.g.refresh = d.refresh_token;
  }

  /** Vuelta de Spotify tras aceptar: canjea el código y guarda la cuenta. */
  async alVolver(code: string, state: string) {
    const vale = this.estados.get(state);
    this.estados.delete(state);
    if (!vale || vale < Date.now()) throw new Error("La conexión con Spotify ha caducado: vuelve a intentarlo");
    await this.pedirToken({ grant_type: "authorization_code", code, redirect_uri: this.redireccion });
    const yo = (await this.api("GET", "/v1/me")) as { display_name?: string; email?: string; product?: string };
    this.g.cuenta = yo.display_name || yo.email || "cuenta de Spotify";
    this.g.premium = yo.product === "premium";
    this.guardar();
  }

  /** Token de acceso válido (lo renueva si caduca en menos de 2 min). */
  async token(): Promise<string> {
    if (!this.conectado) throw new Error("Spotify no está conectado");
    if (!this.g.access || (this.g.caduca ?? 0) < Date.now() + 120_000) {
      await this.pedirToken({ grant_type: "refresh_token", refresh_token: this.g.refresh! });
      this.guardar();
    }
    return this.g.access!;
  }

  async api(metodo: string, ruta: string, cuerpo?: unknown): Promise<unknown> {
    const r = await this.pedir(`${API}${ruta}`, {
      method: metodo,
      headers: { authorization: `Bearer ${await this.token()}`, ...(cuerpo ? { "content-type": "application/json" } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    if (r.status === 204) return null;
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error((d as { error?: { message?: string } }).error?.message ?? `Spotify respondió ${r.status}`), { status: r.status });
    return d;
  }

  /** Todas las canciones de una lista (propia o colaborativa). */
  async lista(entrada: string): Promise<{ nombre: string; canciones: CancionSpotify[] }> {
    const id = idLista(entrada);
    if (!id) throw new Error("Eso no parece un enlace de lista de Spotify (debe ser open.spotify.com/playlist/…)");
    const info = (await this.api("GET", `/v1/playlists/${id}?fields=name`).catch(() => ({ name: "" }))) as { name?: string };
    const canciones: CancionSpotify[] = [];
    // Desde 2026 el endpoint es /items (antes /tracks): se prueba el nuevo y, si no existe, el antiguo
    for (const tramo of ["items", "tracks"]) {
      try {
        let ruta: string | null = `/v1/playlists/${id}/${tramo}?limit=50`;
        while (ruta) {
          const d = (await this.api("GET", ruta)) as { items?: unknown[]; next?: string | null };
          canciones.push(...cancionesDe(d.items ?? []));
          ruta = d.next ? d.next.replace(API, "").replace("https://api.spotify.com", "") : null;
        }
        break;
      } catch (e) {
        if ((e as { status?: number }).status === 404 && tramo === "items") continue;
        if ((e as { status?: number }).status === 403 || (e as { status?: number }).status === 404)
          throw new Error("Spotify no deja leer esa lista: tiene que ser tuya o colaborativa (copia sus canciones a una lista tuya y pega ese enlace)");
        throw e;
      }
    }
    return { nombre: info.name ?? "", canciones };
  }

  // ---------- TVs autorizadas a pedir el token ----------
  nuevaClaveTv(): string {
    const k = randomBytes(18).toString("hex");
    this.g.clavesTv = [...(this.g.clavesTv ?? []).slice(-4), k];
    this.guardar();
    return k;
  }
  claveTvValida(k: unknown): boolean {
    return typeof k === "string" && !!this.g.clavesTv?.includes(k);
  }

  desconectar() {
    this.g = {};
    this.guardar();
  }
}
