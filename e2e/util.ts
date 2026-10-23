import { chromium, devices, expect, test, type Browser, type BrowserContext, type APIRequestContext, type BrowserContextOptions, type Page } from "@playwright/test";

/** Errores de JavaScript vistos en cualquier página del test: si hay alguno, el test falla. */
const errores: string[] = [];
const contextos: BrowserContext[] = [];
// Ruido esperado al cortar la red o reiniciar el servidor a propósito
const RUIDO = /websocket|socket\.io|net::|ERR_INTERNET_DISCONNECTED|Failed to load resource|NotAllowedError|wakeLock/i;

export function vigilar(p: Page, nombre: string) {
  p.on("pageerror", (e) => errores.push(`[${nombre}] ${e.message}`));
  p.on("console", (m) => {
    if (m.type() === "error" && !RUIDO.test(m.text())) errores.push(`[${nombre}] console.error: ${m.text()}`);
  });
  return p;
}

/**
 * Ganchos comunes: partida y contenido limpios antes de cada test, cerrar sus ventanas y fallar si hubo
 * errores de JavaScript. Hay que llamarla en cada archivo de tests: un `test.beforeEach` suelto en este módulo
 * solo se registraría en el primer archivo que lo importe (Playwright carga el módulo una vez).
 */
export function ganchos({ limpiar = true } = {}) {
  test.beforeEach(async ({ request }) => {
    errores.length = 0;
    if (!limpiar) return;
    // Cada test empieza con el contenido de fábrica y la partida a cero (aunque se repita sobre el mismo servidor)
    const h = { "x-pin": "1234" };
    await request.post("/api/admin/restaurar", { headers: h });
    await cuatroEquipos(request);
    await request.post("/api/admin/reiniciar", { headers: h });
  });
  test.afterEach(async () => {
    // Cerrar las ventanas del test: si no, sus móviles siguen conectados en el siguiente
    await Promise.all(contextos.splice(0).map((c) => c.close().catch(() => {})));
    expect(errores, "errores de JavaScript en las páginas").toEqual([]);
  });
  test.afterAll(async () => {
    await chromeTv?.close();
    chromeTv = null;
  });
}

/** El contenido de serie trae 5 equipos; casi todos los tests se escribieron con 4 móviles (rojo, azul, verde, amarillo). */
export async function cuatroEquipos(request: APIRequestContext) {
  const h = { "x-pin": "1234" };
  const c = await (await request.get("/api/admin/contenido", { headers: h })).json();
  c.equipos = c.equipos.slice(0, 4);
  expect((await request.put("/api/admin/contenido", { headers: h, data: c })).status()).toBe(200);
}

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
  contextos.push(ctx);
  return vigilar(await ctx.newPage(), nombre);
}

export const FOTOS = process.env.FOTOS;
export const foto = async (p: Page, n: string) => FOTOS && p.screenshot({ path: `${FOTOS}/${test.info().project.name}-${n}.png` });

let chromeTv: Browser | null = null;

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
