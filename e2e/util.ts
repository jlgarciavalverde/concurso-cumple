import { chromium, devices, expect, test, type Browser, type BrowserContextOptions, type Page } from "@playwright/test";

/** Errores de JavaScript vistos en cualquier página del test: si hay alguno, el test falla. */
const errores: string[] = [];
// Ruido esperado al cortar la red o reiniciar el servidor a propósito
const RUIDO = /websocket|socket\.io|net::|ERR_INTERNET_DISCONNECTED|Failed to load resource|NotAllowedError|wakeLock/i;

export function vigilar(p: Page, nombre: string) {
  p.on("pageerror", (e) => errores.push(`[${nombre}] ${e.message}`));
  p.on("console", (m) => {
    if (m.type() === "error" && !RUIDO.test(m.text())) errores.push(`[${nombre}] console.error: ${m.text()}`);
  });
  return p;
}

test.beforeEach(async ({ request }) => {
  errores.length = 0;
  // Cada test empieza con el contenido de fábrica y la partida a cero (aunque se repita sobre el mismo servidor)
  const h = { "x-pin": "1234" };
  await request.post("/api/admin/restaurar", { headers: h });
  await request.post("/api/admin/reiniciar", { headers: h });
});
test.afterEach(() => {
  expect(errores, "errores de JavaScript en las páginas").toEqual([]);
});

export const esSafari = () => test.info().project.name === "safari";

/** Contexto de móvil: iPhone de verdad en el proyecto Safari; Chrome móvil en el otro. */
export function opcionesMovil(): BrowserContextOptions {
  if (esSafari()) {
    const { defaultBrowserType: _, ...iphone } = devices["iPhone 13"];
    void _;
    return iphone;
  }
  return { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
}

export async function nuevaPagina(browser: Browser, nombre: string, opciones: BrowserContextOptions) {
  const ctx = await browser.newContext(opciones);
  return vigilar(await ctx.newPage(), nombre);
}

export const FOTOS = process.env.FOTOS;
export const foto = async (p: Page, n: string) => FOTOS && p.screenshot({ path: `${FOTOS}/${test.info().project.name}-${n}.png` });

let chromeTv: Browser | null = null;
test.afterAll(async () => {
  await chromeTv?.close();
  chromeTv = null;
});

/**
 * La TV siempre va en Chrome (el lanzador «Concurso TV» abre Chrome con sonido permitido), también cuando
 * los móviles se prueban como iPhone.
 */
export async function nuevaTv(browser: Browser) {
  const opciones = { viewport: { width: 1920, height: 1080 } };
  if (!esSafari()) return nuevaPagina(browser, "tv", opciones);
  chromeTv ??= await chromium.launch();
  return nuevaPagina(chromeTv, "tv", opciones);
}
