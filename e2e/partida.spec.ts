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
  // marcador en directo: sin confirmar, rojo (1º en acertar) lleva 1,5 y azul 1,25
  await expect(tv.locator(".tv-eq").filter({ hasText: "Rojo" })).toContainText("1,5");
  await expect(tv.locator(".tv-eq").filter({ hasText: "Azul" })).toContainText("1,25");
  await expect(host.getByText("Puntos automáticos, ya en el marcador")).toBeVisible();

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

  // --- Rosco letra a letra
  await host.locator(".host-nav").getByRole("button", { name: "Rosco cachimbero" }).click();
  await host.getByRole("button", { name: "15", exact: true }).click();
  await expect(host.getByText("15 s", { exact: true })).toBeVisible();
  await host.getByRole("button", { name: /Primera letra/ }).click();
  await expect(tv.locator(".tv-pregunta")).toContainText("pieza donde se coloca el tabaco");
  await rojo.getByPlaceholder("Respuesta").fill("la cazoleta");
  await rojo.getByRole("button", { name: "Responder" }).click();
  await expect(rojo.getByText("Enviado")).toBeVisible();
  await azul.getByPlaceholder("Respuesta").fill("cachimba");
  await azul.getByRole("button", { name: "Responder" }).click();
  await verde.getByPlaceholder("Respuesta").fill("KAZOLETA");
  await verde.getByRole("button", { name: "Responder" }).click();
  await foto(rojo, "movil-rosco");
  await foto(tv, "tv-rosco");
  // amarillo no responde: el presentador cierra
  await host.getByRole("button", { name: /Cerrar y corregir ya/ }).click();
  await expect(rojo.getByText("¡Correcto!")).toBeVisible();
  await expect(azul.getByText("Fallo")).toBeVisible();
  await expect(amarillo.getByText("Sin responder")).toBeVisible();
  // medio punto a mano para azul
  await host.getByRole("row", { name: /Azul/ }).getByRole("button", { name: "Medio punto" }).click();
  await expect(azul.getByText("Medio acierto")).toBeVisible();
  await expect(tv.locator(".revela")).toHaveText("Cazoleta");
  await foto(tv, "tv-rosco-revelar");
  await foto(amarillo, "movil-rosco-nada");
  await host.getByRole("button", { name: /Siguiente letra/ }).click();
  await expect(tv.locator(".tv-pregunta")).toContainText("papel metálico");
  await expect(tv.locator(".cuenta")).toContainText(/1[0-5]/);
  for (const m of [rojo, azul, verde, amarillo]) {
    await m.getByPlaceholder("Respuesta").fill("aluminio");
    await m.getByRole("button", { name: "Responder" }).click();
  }
  // todos respondieron: se corrige solo
  await expect(verde.getByText("¡Correcto!")).toBeVisible();
  await foto(host, "host-rosco");

  // --- Olores: botones de sabores combinables
  await host.locator(".host-nav").getByRole("button", { name: "Identifica las mezclas por el olor" }).click();
  await host.getByRole("button", { name: /Primera mezcla/ }).click();
  await rojo.getByRole("button", { name: "Sandía", exact: true }).click();
  await rojo.getByRole("button", { name: "Menta", exact: true }).click();
  await expect(rojo.getByPlaceholder(/Toca los sabores/)).toHaveValue("Sandía + Menta");
  await foto(rojo, "movil-olores");
  await rojo.getByRole("button", { name: "Responder" }).click();
  await foto(tv, "tv-olores");
  await host.getByRole("button", { name: /Cerrar y corregir ya/ }).click();
  await foto(tv, "tv-olores-revelar");

  // --- Palabra prohibida: la tarjeta solo en el presentador
  await host.locator(".host-nav").getByRole("button", { name: "Palabra prohibida" }).click();
  await host.getByRole("button", { name: /^Rojo/ }).click();
  await host.getByRole("button", { name: /Empezar turno/ }).click();
  await expect(host.locator(".tarjeta-host")).toBeVisible();
  const palabra = await host.locator(".tarjeta-host .pal").innerText();
  await expect(tv.locator(".tarjeta-tv .pal")).toHaveText(palabra); // en la TV, para quien explica
  await expect(rojo.getByText(palabra, { exact: true })).toHaveCount(0); // nunca en los móviles
  await host.getByText("Mostrar la tarjeta en la TV").click();
  await expect(tv.locator(".tarjeta-tv")).toHaveCount(0);
  await host.getByText("Mostrar la tarjeta en la TV").click();
  await host.getByRole("button", { name: "✅ Acierto" }).click();
  await expect(tv.locator(".revela")).toContainText("1 aciertos");
  await foto(host, "host-tarjeta");
  await foto(tv, "tv-tarjeta");

  // --- Torre de vasos: cuenta atrás y vasos por equipo
  await host.locator(".host-nav").getByRole("button", { name: "Torre de vasos" }).click();
  await host.getByRole("button", { name: /Empezar cuenta atrás/ }).click();
  await expect(tv.locator(".cuenta")).toBeVisible();
  const vasos = host.getByRole("row", { name: /Verde/ }).getByRole("textbox");
  await vasos.fill("12");
  await vasos.press("Enter");
  await expect(tv.locator(".tv-centro .tv-eq").filter({ hasText: "Verde" })).toContainText("12 vasos");
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
  const antes = (await rojo.locator(".movil-cab").textContent()) ?? "";
  await rojo.reload();
  await expect(rojo.locator(".movil-cab")).toHaveText(antes);
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
