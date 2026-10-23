// Lo del final y lo externo: votación de disfraces, Kahoot del cumpleañero y canciones desde Spotify (simulado).
import { createServer, type Server } from "node:http";
import { expect, test, type Page } from "@playwright/test";
import { foto as fotoBase, ganchos, nuevaPagina, nuevaTv, opcionesMovil } from "./util.ts";

ganchos();
const foto = (p: Page, n: string) => fotoBase(p, "fin-" + n);
const PIN = { "x-pin": "1234" };
const INVITADOS = ["Ana", "Luis", "Marta", "Pepe", "Sara", "Toni"];

/** Spotify simulado: autoriza al momento y tiene una lista con 3 canciones. */
let spotifyFalso: Server | null = null;
test.beforeAll(async () => {
  spotifyFalso = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost:3463");
    const json = (d: unknown) => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(d));
    if (url.pathname === "/authorize") {
      const vuelta = new URL(url.searchParams.get("redirect_uri")!);
      vuelta.searchParams.set("code", "codigo");
      vuelta.searchParams.set("state", url.searchParams.get("state")!);
      return res.writeHead(302, { location: vuelta.toString() }).end();
    }
    if (url.pathname === "/api/token") return json({ access_token: "acc", refresh_token: "ref", expires_in: 3600 });
    if (url.pathname === "/v1/me") return json({ display_name: "Cuenta de prueba", product: "premium" });
    if (url.pathname === "/v1/playlists/FIESTA2000s") return json({ name: "Fiesta 2000" });
    if (url.pathname === "/v1/playlists/FIESTA2000s/items")
      return json({
        items: [1, 2, 3].map((n) => ({ item: { type: "track", uri: `spotify:track:pista${n}`, name: `Éxito ${n}`, duration_ms: 180_000, artists: [{ name: "Grupo" }] } })),
        next: null,
      });
    res.writeHead(404).end("{}");
  }).listen(3463);
});
test.afterAll(() => spotifyFalso?.close());

test("votación de disfraces, Kahoot del cumpleañero y lista de Spotify", async ({ browser, request }) => {
  await request.post("/api/admin/spotify/desconectar", { headers: PIN }); // Chrome y Safari comparten servidor de pruebas
  const c = await (await request.get("/api/admin/contenido", { headers: PIN })).json();
  c.disfraces = { participantes: INVITADOS };
  expect((await request.put("/api/admin/contenido", { headers: PIN, data: c })).status()).toBe(200);

  const tv = await nuevaTv(browser);
  await tv.goto("/tv");
  const codigo = (await tv.locator(".unete b").innerText()).trim();
  const host = await nuevaPagina(browser, "panel", { viewport: { width: 1280, height: 900 } });
  await host.goto("/presentador");
  await host.getByPlaceholder("PIN").fill("1234");
  await host.getByRole("button", { name: "Entrar" }).click();

  // --- Kahoot del cumpleañero: PIN en la TV con QR, botón en el móvil, puestos al marcador
  const rojo = await nuevaPagina(browser, "móvil Rojo", opcionesMovil());
  await rojo.goto(`/?c=${codigo}`);
  await rojo.getByRole("button", { name: "Rojo" }).click();
  await rojo.getByRole("button", { name: "Dejar «Rojo»" }).click();
  await host.locator(".host-nav").getByRole("button", { name: "¿Cuánto le conocéis?" }).click();
  await expect(tv.getByText("Esperando a que el cumpleañero lance su Kahoot")).toBeVisible();
  await host.getByLabel("PIN del Kahoot").fill("9876543");
  await host.getByRole("button", { name: /Enseñar en la TV/ }).click();
  await expect(tv.locator(".tv-numero")).toHaveText("9876543");
  await expect(rojo.getByRole("link", { name: /Abrir Kahoot/ })).toHaveAttribute("href", /kahoot\.it\/\?pin=9876543/);
  await foto(tv, "kahoot-pin");
  await host.getByRole("row", { name: /Rojo/ }).getByRole("textbox").fill("1");
  await host.getByRole("row", { name: /Rojo/ }).getByRole("textbox").press("Enter");
  await expect(tv.locator(".tv-eq").filter({ hasText: "Rojo" })).toContainText("10");

  // --- Votación: 6 invitados votan desde su móvil; duplicados y auto-votos no valen
  await host.locator(".host-nav").getByRole("button", { name: "Votación de disfraces" }).click();
  await host.getByRole("button", { name: /Abrir la votación/ }).click();
  await expect(tv.getByText("¡Votad el mejor disfraz!")).toBeVisible();
  await foto(tv, "votacion-qr");
  const votos: [string, string][] = [["Ana", "Luis"], ["Marta", "Luis"], ["Pepe", "Luis"], ["Sara", "Marta"], ["Toni", "Marta"], ["Luis", "Pepe"]];
  for (const [i, [quien, a]] of votos.entries()) {
    const m = await nuevaPagina(browser, `votante ${quien}`, opcionesMovil());
    await m.goto(`/votar?c=${codigo}`);
    await m.getByRole("button", { name: quien, exact: true }).click();
    await expect(m.getByText(`${quien}, ¿qué disfraz te ha gustado más?`)).toBeVisible();
    await expect(m.getByRole("button", { name: quien, exact: true })).toHaveCount(0); // no puede votarse
    await m.getByRole("button", { name: a, exact: true }).click();
    if (i === 0) await foto(m, "votar-movil");
    await m.getByRole("button", { name: `Votar a ${a}` }).click();
    await expect(m.getByText(`¡Voto enviado, ${quien}!`)).toBeVisible();
    if (i === 0) {
      // Otro móvil no puede volver a votar como Ana
      const otro = await nuevaPagina(browser, "votante repetido", opcionesMovil());
      await otro.goto(`/votar?c=${codigo}`);
      await expect(otro.getByRole("button", { name: /Ana · ya ha votado/ })).toBeDisabled();
    }
  }
  await expect(tv.locator(".tv-numero").first()).toContainText("6");
  await expect(host.getByText("Abierta · 6/6 han votado")).toBeVisible();
  await host.getByRole("button", { name: /Cerrar la votación/ }).click();
  for (let i = 0; i < 4 && !((await tv.locator(".tv-titulo").textContent()) ?? "").includes("¡Luis!"); i++) {
    await expect(host.getByRole("button", { name: /Revelar/ })).toBeVisible();
    await host.getByRole("button", { name: /Revelar/ }).click();
    await tv.waitForTimeout(300);
  }
  await expect(tv.locator(".tv-titulo")).toContainText("¡Luis!");
  await expect(host.getByText(/Ganador: Luis \(3 votos\)/)).toBeVisible();
  await tv.waitForTimeout(1200);
  await foto(tv, "votacion-ganador");

  // --- Spotify (simulado): conectar la cuenta y cargar una lista en una ronda de canciones
  const admin = await nuevaPagina(browser, "admin", { viewport: { width: 1280, height: 900 } });
  await admin.goto("/admin");
  await admin.getByPlaceholder("PIN").fill("1234");
  await admin.getByRole("button", { name: "Entrar" }).click();
  await admin.locator(".fila-revision").filter({ hasText: "Canciones de los 2000" }).click();
  await admin.getByRole("button", { name: "Conectar con Spotify" }).click();
  await expect(admin.getByText("Spotify conectado. Ya puedes cargar listas")).toBeVisible();
  await admin.locator(".fila-revision").filter({ hasText: "Canciones de los 2000" }).click();
  await admin.getByLabel("Enlace de la lista de Spotify").fill("https://open.spotify.com/playlist/FIESTA2000s?si=x");
  admin.once("dialog", (d) => d.accept());
  await admin.getByRole("button", { name: "Cargar canciones" }).click();
  await expect(admin.getByText(/Cargadas 3 canciones de «Fiesta 2000»/)).toBeVisible();
  await expect(admin.getByText(/Guardado ahora/)).toBeVisible({ timeout: 8000 });
  await foto(admin, "spotify-lista");
  const guardado = await (await request.get("/api/admin/contenido", { headers: PIN })).json();
  const ronda = guardado.pruebas.flatMap((p: { subs: { id: string }[] }) => p.subs).find((s: { id: string }) => s.id === "c-2000");
  expect(ronda.canciones.map((x: { spotify: string; titulo: string }) => [x.titulo, x.spotify])).toEqual([
    ["Éxito 1", "spotify:track:pista1"],
    ["Éxito 2", "spotify:track:pista2"],
    ["Éxito 3", "spotify:track:pista3"],
  ]);
  // El panel avisa de que la TV aún no está autorizada para Spotify
  await host.reload();
  await expect(host.getByText(/la TV no está autorizada/)).toBeVisible();
});

test("cinco equipos con sus integrantes: admin, TV y móvil", async ({ browser, request }) => {
  await request.post("/api/admin/restaurar", { headers: PIN }); // el de serie: 5 equipos
  const admin = await nuevaPagina(browser, "admin", { viewport: { width: 1280, height: 900 } });
  await admin.goto("/admin");
  await admin.getByPlaceholder("PIN").fill("1234");
  await admin.getByRole("button", { name: "Entrar" }).click();
  await expect(admin.getByLabel("Nombre del equipo 5")).toHaveValue("Morado");
  await admin.getByLabel("Nombre del equipo 5").fill("Los Moraos");
  await admin.getByLabel("Integrantes del equipo 5").fill("Ana, Luis, Marta");
  await admin.getByLabel("Integrantes del equipo 1").fill("Pepe, Sara");
  // Añadir y quitar un sexto
  await admin.getByRole("button", { name: "Añadir equipo" }).click();
  await expect(admin.getByLabel("Nombre del equipo 6")).toHaveValue("Naranja");
  admin.once("dialog", (d) => d.accept());
  await admin.getByRole("button", { name: "Quitar el equipo Naranja" }).click();
  await expect(admin.getByLabel("Nombre del equipo 6")).toHaveCount(0);
  await expect(admin.getByText(/Guardado ahora/)).toBeVisible({ timeout: 8000 });
  await foto(admin, "admin-equipos");
  const c = await (await request.get("/api/admin/contenido", { headers: PIN })).json();
  expect(c.equipos.map((e: { nombre: string }) => e.nombre)).toEqual(["Rojo", "Azul", "Verde", "Amarillo", "Los Moraos"]);
  expect(c.equipos[4].miembros.map((m: string) => m.trim())).toEqual(["Ana", "Luis", "Marta"]);

  const tv = await nuevaTv(browser);
  await tv.goto("/tv");
  await expect(tv.getByText("Ana · Luis · Marta")).toBeVisible();
  await expect(tv.getByText("Pepe · Sara")).toBeVisible();
  await foto(tv, "tv-cinco-equipos");
  const codigo = (await tv.locator(".unete b").innerText()).trim();
  const movil = await nuevaPagina(browser, "móvil", opcionesMovil());
  await movil.goto(`/?c=${codigo}`);
  await expect(movil.locator(".equipos-elegir button")).toHaveCount(5);
  await expect(movil.getByRole("button", { name: /Los Moraos.*Ana, Luis, Marta/ })).toBeVisible();
  await foto(movil, "movil-cinco-equipos");
  await expect(tv.locator(".tv-pie .tv-eq")).toHaveCount(5);
});
