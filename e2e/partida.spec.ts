import { expect, test, type Browser, type Page } from "@playwright/test";

const FOTOS = process.env.FOTOS; // carpeta para capturas de revisión (opcional)
const foto = async (p: Page, n: string) => FOTOS && p.screenshot({ path: `${FOTOS}/${n}.png` });

async function movil(browser: Browser, codigo: string, equipo: string) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(`/?c=${codigo}`);
  await p.getByRole("button", { name: equipo }).click();
  await expect(p.locator(".movil-cab")).toContainText(equipo);
  return p;
}

test("partida completa: tv + presentador + 4 móviles", async ({ browser }) => {
  const tvCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tv = await tvCtx.newPage();
  await tv.goto("/tv");
  await tv.getByRole("button", { name: /Activar pantalla/ }).click();
  const codigo = (await tv.locator(".unete b").innerText()).trim();
  expect(codigo).toMatch(/^[A-Z]{4}$/);

  const host = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await host.goto("/presentador");
  await host.getByPlaceholder("PIN").fill("1234");
  await host.getByRole("button", { name: "Entrar" }).click();
  await expect(host.getByText(`Código ${codigo}`)).toBeVisible();

  const [rojo, azul, verde, amarillo] = await Promise.all(["Rojo", "Azul", "Verde", "Amarillo"].map((e) => movil(browser, codigo, e)));
  await expect(tv.getByText("✅ 1 móvil").first()).toBeVisible();
  await foto(tv, "tv-lobby");
  await foto(rojo, "movil-espera");

  // --- Cultura general: 1 punto por acierto
  await host.locator(".host-nav").getByRole("button", { name: "Cultura general" }).click();
  await host.getByRole("button", { name: /Primera pregunta/ }).click();
  await expect(tv.locator(".tv-pregunta")).toContainText("planeta más grande");
  await foto(tv, "tv-pregunta");
  if (FOTOS) {
    await host.setViewportSize({ width: 390, height: 844 });
    await foto(host, "host-movil");
    await host.setViewportSize({ width: 1280, height: 900 });
  }
  await foto(rojo, "movil-pregunta");
  await rojo.getByRole("button", { name: /Júpiter/ }).click();
  await azul.getByRole("button", { name: /Júpiter/ }).click();
  await verde.getByRole("button", { name: /Saturno/ }).click();
  await expect(rojo.getByText("Respuesta enviada")).toBeVisible();
  await amarillo.getByRole("button", { name: /Urano/ }).click();
  // contestan todos → se revela solo
  await expect(rojo.getByText("¡Correcto!")).toBeVisible();
  await expect(verde.getByText("Fallo")).toBeVisible();
  await foto(tv, "tv-revelar");
  await host.getByRole("button", { name: /Terminar ya/ }).click();
  await expect(tv.locator(".tabla-res")).toBeVisible();
  await host.getByRole("button", { name: /Confirmar y sumar/ }).click();
  await expect(tv.locator(".tv-eq").filter({ hasText: "Rojo" })).toContainText("1");

  // --- Canción con pulsador
  await host.locator(".host-nav").getByRole("button", { name: "Rap español" }).click();
  await host.getByRole("button", { name: /Primera canción/ }).click();
  await foto(verde, "movil-pulsador");
  await verde.locator(".pulsador").dispatchEvent("pointerdown");
  await expect(tv.locator(".pulsado")).toHaveText("Verde");
  await expect(rojo.locator(".pulsador")).toBeDisabled();
  await foto(tv, "tv-pulsado");
  await host.getByRole("button", { name: /Fallo/ }).click();
  await expect(verde.locator(".pulsador")).toHaveText("Bloqueados");
  await azul.locator(".pulsador").dispatchEvent("pointerdown");
  await expect(tv.locator(".pulsado")).toHaveText("Azul");
  await host.getByRole("button", { name: "✅ Acierto" }).click();
  await expect(tv.locator(".revela")).toContainText("Mazas y catapultas");

  // --- Rosco
  await host.locator(".host-nav").getByRole("button", { name: "Rosco cachimbero" }).click();
  await host.getByRole("button", { name: /Empezar/ }).click();
  await amarillo.getByPlaceholder("Respuesta").fill("cazoleta");
  await amarillo.getByRole("button", { name: /Pasapalabra/ }).click();
  await amarillo.getByPlaceholder("Respuesta").fill("aluminio");
  await foto(amarillo, "movil-rosco");
  await foto(tv, "tv-rosco");
  amarillo.once("dialog", (d) => d.accept());
  await amarillo.getByRole("button", { name: "Entregar" }).click();
  await expect(amarillo.getByText("Entregado")).toBeVisible();
  await host.getByRole("button", { name: /Cerrar y corregir/ }).click();
  await expect(amarillo.getByText("2/8 aciertos")).toBeVisible();
  await foto(tv, "tv-rosco-revelar");
  await foto(host, "host-rosco");

  // --- Palabra prohibida: la tarjeta solo en el presentador
  await host.locator(".host-nav").getByRole("button", { name: "Palabra prohibida" }).click();
  await host.getByRole("button", { name: /^Rojo/ }).click();
  await host.getByRole("button", { name: /Empezar turno/ }).click();
  await expect(host.locator(".tarjeta-host")).toBeVisible();
  const palabra = await host.locator(".tarjeta-host .pal").innerText();
  await expect(tv.getByText(palabra, { exact: true })).toHaveCount(0);
  await host.getByRole("button", { name: "✅ Acierto" }).click();
  await expect(tv.locator(".revela")).toContainText("1 aciertos");
  await foto(host, "host-tarjeta");
  await foto(tv, "tv-tarjeta");

  // --- Torre de vasos con cronómetro
  await host.locator(".host-nav").getByRole("button", { name: "Torre de vasos" }).click();
  await host.getByRole("button", { name: /Cronómetro/ }).click();
  await host.waitForTimeout(1200);
  await host.getByRole("button", { name: "⏱️ Verde" }).click();
  await expect(tv.locator(".tv-eq").filter({ hasText: "Verde" }).first()).toContainText(/1\.\d/);
  await foto(tv, "tv-torre");

  // --- Marcador y podio
  await host.getByRole("button", { name: "📊 Marcador" }).click();
  await expect(tv.locator(".desglose")).toBeVisible();
  await foto(tv, "tv-marcador");
  await host.getByRole("button", { name: "🏆 Podio" }).click();
  await expect(tv.locator(".podio")).toBeVisible();
  await tv.waitForTimeout(1500);
  await foto(tv, "tv-podio");
  await foto(host, "host-general");

  // --- El estado sobrevive a recargar
  await rojo.reload();
  await expect(rojo.locator(".movil-cab")).toContainText("1 pts");
});

test("admin: PIN, edición y guardado", async ({ page }) => {
  await page.goto("/admin");
  await page.getByPlaceholder("PIN").fill("0000");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("PIN incorrecto")).toBeVisible();
  await page.getByPlaceholder("PIN").fill("1234");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText(/Quedan \d+ campos/)).toBeVisible();
  await page.getByText("¿Cuánto cuesta?").click();
  await page.locator('details[open] input[value="✏️ Producto 1"]').fill("Cachimba Kaloud");
  await page.getByRole("button", { name: "💾 Guardar" }).click();
  await expect(page.getByText("Guardado ✅")).toBeVisible();
  await page.reload();
  await page.getByText("¿Cuánto cuesta?").click();
  await expect(page.locator('details[open] input[value="Cachimba Kaloud"]')).toHaveCount(1);
  await foto(page, "admin");
});
