import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cancionesDe, idLista, Spotify } from "../server/spotify.ts";

const pista = (n: number) => ({ type: "track", uri: `spotify:track:t${n}`, name: `Canción ${n}`, duration_ms: 200_000 + n, artists: [{ name: "A" }, { name: "B" }] });

/** Spotify simulado: guarda las peticiones y responde según la ruta. */
function falso(rutas: Record<string, (url: URL, init: RequestInit) => [number, unknown]>) {
  const pedidas: { url: string; init: RequestInit }[] = [];
  const f = (async (u: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(u));
    pedidas.push({ url: url.toString(), init });
    const clave = Object.keys(rutas).find((k) => url.pathname.endsWith(k));
    const [estado, cuerpo] = clave ? rutas[clave](url, init) : [404, { error: { message: "no existe" } }];
    return new Response(estado === 204 ? null : JSON.stringify(cuerpo), { status: estado });
  }) as typeof fetch;
  return { f, pedidas };
}

describe("Spotify", () => {
  it("entiende enlaces, URIs e ids de listas", () => {
    expect(idLista("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc")).toBe("37i9dQZF1DXcBWIGoYBM5M");
    expect(idLista("spotify:playlist:37i9dQZF1DXcBWIGoYBM5M")).toBe("37i9dQZF1DXcBWIGoYBM5M");
    expect(idLista("37i9dQZF1DXcBWIGoYBM5M")).toBe("37i9dQZF1DXcBWIGoYBM5M");
    expect(idLista("https://open.spotify.com/track/xyz")).toBeNull();
  });

  it("lee el formato nuevo (item) y el antiguo (track) y se salta podcasts", () => {
    expect(cancionesDe([{ item: pista(1) }, { track: pista(2) }, { item: { type: "episode", uri: "spotify:episode:x" } }])).toEqual([
      { titulo: "Canción 1", artista: "A, B", spotify: "spotify:track:t1", duracion: 200 },
      { titulo: "Canción 2", artista: "A, B", spotify: "spotify:track:t2", duracion: 200 },
    ]);
  });

  it("conecta la cuenta, renueva el token y lee listas paginadas", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sp-"));
    let tokens = 0;
    const { f, pedidas } = falso({
      "/api/token": (_u, init) => {
        tokens++;
        const cuerpo = String(init.body);
        return [200, { access_token: `acc${tokens}`, expires_in: cuerpo.includes("refresh_token=") ? 3600 : 1, ...(cuerpo.includes("authorization_code") ? { refresh_token: "ref" } : {}) }];
      },
      "/v1/me": () => [200, { display_name: "Jose", product: "premium" }],
      "/v1/playlists/LISTA12345": () => [200, { name: "Fiesta" }],
      "/v1/playlists/LISTA12345/items": (u) =>
        u.searchParams.get("offset") ? [200, { items: [{ item: pista(3) }], next: null }] : [200, { items: [{ item: pista(1) }, { item: pista(2) }], next: "https://api.spotify.com/v1/playlists/LISTA12345/items?offset=2" }],
    });
    const sp = new Spotify(join(dir, "spotify.json"), "id", "secreto", "https://x/api/spotify/callback", f);
    expect(sp.conectado).toBe(false);
    const url = new URL(sp.urlConectar());
    expect(url.searchParams.get("scope")).toContain("streaming");
    await expect(sp.alVolver("codigo", "estado-falso")).rejects.toThrow(/caducado/);
    await sp.alVolver("codigo", url.searchParams.get("state")!);
    expect(sp.estado()).toMatchObject({ conectado: true, cuenta: "Jose", premium: true });
    // El primer token caducaba en 1 s: al pedir la lista se renueva solo con el refresh token
    const r = await sp.lista("https://open.spotify.com/playlist/LISTA12345?si=1");
    expect(r.nombre).toBe("Fiesta");
    expect(r.canciones.map((c) => c.spotify)).toEqual(["spotify:track:t1", "spotify:track:t2", "spotify:track:t3"]);
    expect(pedidas.filter((p) => p.url.endsWith("/api/token")).length).toBe(2);
    // Persistencia: otra instancia sigue conectada (refresh guardado en disco)
    expect(new Spotify(join(dir, "spotify.json"), "id", "secreto", "https://x/cb", f).conectado).toBe(true);
  });

  it("si la lista no es suya, lo explica", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sp-"));
    const { f } = falso({
      "/api/token": () => [200, { access_token: "a", refresh_token: "r", expires_in: 3600 }],
      "/v1/me": () => [200, { display_name: "Jose", product: "premium" }],
      "/v1/playlists/AJENA12345": () => [200, { name: "Ajena" }],
      "/v1/playlists/AJENA12345/items": () => [403, { error: { message: "Forbidden" } }],
    });
    const sp = new Spotify(join(dir, "s.json"), "id", "secreto", "https://x/cb", f);
    await sp.alVolver("c", new URL(sp.urlConectar()).searchParams.get("state")!);
    await expect(sp.lista("spotify:playlist:AJENA12345")).rejects.toThrow(/tiene que ser tuya o colaborativa/);
  });

  it("claves de TV: solo valen las dadas por el panel", () => {
    const sp = new Spotify(join(mkdtempSync(join(tmpdir(), "sp-")), "s.json"), "id", "s");
    const k = sp.nuevaClaveTv();
    expect(sp.claveTvValida(k)).toBe(true);
    expect(sp.claveTvValida("inventada")).toBe(false);
    expect(sp.claveTvValida(undefined)).toBe(false);
  });
});
