// La TV como reproductor de Spotify (Web Playback SDK, requiere Premium). Sin interfaz: no se ve el título.

interface SdkPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  pause(): Promise<void>;
  resume(): Promise<void>;
  seek(ms: number): Promise<void>;
  setVolume(v: number): Promise<void>;
  activateElement?(): Promise<void>;
  getCurrentState(): Promise<{ position: number; paused: boolean; track_window?: { current_track?: { uri: string } } } | null>;
  addListener(ev: string, fn: (d: { device_id?: string; message?: string }) => void): void;
}
declare global {
  interface Window {
    Spotify?: { Player: new (o: { name: string; getOAuthToken: (cb: (t: string) => void) => void; volume?: number }) => SdkPlayer };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

const API = "https://api.spotify.com/v1";
let cargando: Promise<void> | null = null;

function cargarSdk(): Promise<void> {
  if (window.Spotify) return Promise.resolve();
  cargando ??= new Promise<void>((ok, mal) => {
    window.onSpotifyWebPlaybackSDKReady = () => ok();
    const s = document.createElement("script");
    s.src = "https://sdk.scdn.co/spotify-player.js";
    s.async = true;
    s.onerror = () => mal(new Error("No se ha podido cargar Spotify (¿sin internet?)"));
    document.head.appendChild(s);
  });
  return cargando;
}

export type EstadoSpotify = { listo: boolean; error: string | null };

export class ReproductorSpotify {
  private player: SdkPlayer | null = null;
  private dispositivo: string | null = null;
  estado: EstadoSpotify = { listo: false, error: null };

  constructor(
    private pedirToken: () => Promise<string>,
    private alCambiar: (e: EstadoSpotify) => void,
  ) {}

  private poner(e: EstadoSpotify) {
    this.estado = e;
    this.alCambiar(e);
  }

  async iniciar() {
    try {
      await cargarSdk();
      const P = window.Spotify!.Player;
      this.player = new P({
        name: "Concurso TV",
        volume: 0.8,
        getOAuthToken: (cb) => {
          this.pedirToken().then(cb, (e) => this.poner({ listo: false, error: (e as Error).message }));
        },
      });
      this.player.addListener("ready", ({ device_id }) => {
        this.dispositivo = device_id ?? null;
        this.poner({ listo: true, error: null });
      });
      this.player.addListener("not_ready", () => this.poner({ listo: false, error: "La TV ha perdido la conexión con Spotify" }));
      for (const ev of ["initialization_error", "authentication_error", "account_error", "playback_error"])
        this.player.addListener(ev, ({ message }) =>
          this.poner({ listo: ev === "playback_error" && this.estado.listo, error: ev === "account_error" ? "La cuenta de Spotify no es Premium" : (message ?? ev) }),
        );
      await this.player.activateElement?.().catch(() => {});
      if (!(await this.player.connect())) this.poner({ listo: false, error: "Spotify no ha podido arrancar en esta TV" });
    } catch (e) {
      this.poner({ listo: false, error: (e as Error).message });
    }
  }

  /** Pone una canción en esta TV desde `ms`. */
  async tocar(uri: string, ms: number) {
    if (!this.dispositivo) throw new Error("La TV aún no está lista como reproductor de Spotify");
    const r = await fetch(`${API}/me/player/play?device_id=${this.dispositivo}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${await this.pedirToken()}`, "content-type": "application/json" },
      body: JSON.stringify({ uris: [uri], position_ms: Math.max(0, Math.round(ms)) }),
    });
    if (!r.ok && r.status !== 204) {
      const d = await r.json().catch(() => ({}));
      throw new Error((d as { error?: { message?: string } }).error?.message ?? `Spotify respondió ${r.status}`);
    }
  }

  pausar = () => this.player?.pause().catch(() => {});
  seguir = () => this.player?.resume().catch(() => {});
  ir = (ms: number) => this.player?.seek(Math.max(0, Math.round(ms))).catch(() => {});
  volumen = (v: number) => this.player?.setVolume(Math.max(0, Math.min(1, v))).catch(() => {});
  posicion = () => this.player?.getCurrentState().catch(() => null) ?? Promise.resolve(null);
  cerrar = () => this.player?.disconnect();
}
