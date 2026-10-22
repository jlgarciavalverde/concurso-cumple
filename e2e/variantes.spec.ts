// Estados raros vistos de verdad en la TV, los móviles y el panel (con capturas para revisar).
import { expect, test, type Browser, type Page } from "@playwright/test";

const FOTOS = process.env.FOTOS;
const foto = async (p: Page, n: string) => FOTOS && p.screenshot({ path: `${FOTOS}/var-${n}.png` });
const PIN = { "x-pin": "1234" };

async function movil(browser: Browser, codigo: string, equipo: string, nombre?: string) {
  const p = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })).newPage();
  await p.goto(`/?c=${codigo}`);
  await p.getByRole("button", { name: equipo }).click();
  if (nombre) {
    await p.getByPlaceholder(equipo).fill(nombre);
    await p.getByRole("button", { name: "Guardar" }).click();
  } else await p.getByRole("button", { name: `Dejar «${equipo}»` }).click();
  return p;
}

test("variantes: nadie responde, 3 opciones, precios raros, hoja, todos fallan, nombres largos, empates", async ({ browser, request }) => {
  // Contenido de prueba: Kahoot de 1 pregunta con 3 opciones y 3 s, precio de 1.000 €, olores en modo hoja
  await request.post("/api/admin/restaurar", { headers: PIN });
  const c = await (await request.get("/api/admin/contenido", { headers: PIN })).json();
  const subs = c.pruebas.flatMap((p: { subs: unknown[] }) => p.subs);
  const sub = (id: string) => subs.find((s: { id: string }) => s.id === id);
  Object.assign(sub("kahoot"), { segundos: 3, preguntas: [{ texto: "¿Cuántas velas tiene la tarta?", opciones: ["20", "25", "30"], correcta: 1 }] });
  sub("precio").productos = [{ nombre: "Cachimba de lujo", precio: 1000 }];
  Object.assign(sub("olores"), { modo: "hoja", items: [{ etiqueta: "Mezcla 1", respuesta: "Sandía + Menta" }, { etiqueta: "Mezcla 2", respuesta: "Love 66" }] });
  expect((await request.put("/api/admin/contenido", { headers: PIN, data: c })).status()).toBe(200);

  const tv = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto("/tv");
  const codigo = (await tv.locator(".unete b").innerText()).trim();
  const host = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await host.goto("/presentador");
  await host.getByPlaceholder("PIN").fill("1234");
  await host.getByRole("button", { name: "Entrar" }).click();
  // Partida limpia (el otro e2e comparte servidor)
  await host.getByText("Opciones avanzadas").click();
  host.once("dialog", (d) => d.accept());
  await host.getByRole("button", { name: /Reiniciar partida/ }).click();

  // Nombres largos y un intento de nombre repetido
  const rojo = await movil(browser, codigo, "Rojo", "Los Reyes del Humo");
  const azul = await movil(browser, codigo, "Azul");
  await azul.getByRole("button", { name: "Cambiar el nombre del equipo" }).click();
  await azul.getByPlaceholder("Azul").fill("los reyes del humo");
  await azul.getByRole("button", { name: "Guardar" }).click();
  await expect(azul.getByText("Ese nombre ya lo tiene otro equipo")).toBeVisible();
  await foto(azul, "nombre-repetido");
  await azul.getByRole("button", { name: "Dejar «Azul»" }).click();
  const verde = await movil(browser, codigo, "Verde", "Cachimberos Unidos");
  const amarillo = await movil(browser, codigo, "Amarillo", "Humo y Nada");
  await expect(tv.locator(".tv-pie")).toContainText("Los Reyes del Humo");
  await foto(tv, "nombres-largos");

  // Kahoot de 3 opciones en el que nadie responde
  await host.locator(".host-nav").getByRole("button", { name: "¿Cuánto le conocéis?" }).click();
  await host.getByRole("button", { name: /Primera pregunta/ }).click();
  await expect(tv.locator(".op")).toHaveCount(3);
  await expect(rojo.locator(".botones4 .op")).toHaveCount(3);
  await foto(rojo, "tres-opciones");
  await expect(rojo.getByText("Sin respuesta")).toBeVisible({ timeout: 6000 });
  await foto(tv, "nadie-responde");

  // Precio escrito «1.000»: el móvil enseña cómo lo ha entendido
  await host.locator(".host-nav").getByRole("button", { name: "¿Cuánto cuesta?" }).click();
  await host.getByRole("button", { name: /Primer producto/ }).click();
  await rojo.getByPlaceholder("0,00 €").fill("1.000");
  await expect(rojo.getByText("= 1000,00 €")).toBeVisible();
  await foto(rojo, "precio-miles");
  await rojo.getByRole("button", { name: /Enviar precio/ }).click();
  await azul.getByPlaceholder("0,00 €").fill("hola");
  await expect(azul.getByRole("button", { name: /Enviar precio/ })).toBeDisabled();
  await verde.getByPlaceholder("0,00 €").fill("999,99");
  await verde.getByRole("button", { name: /Enviar precio/ }).click();
  await host.getByRole("button", { name: /Revelar precio/ }).click();
  await expect(rojo.getByText("¡El más cercano! +1")).toBeVisible();
  await foto(tv, "precio-revelado");

  // Olores en modo hoja
  await host.locator(".host-nav").getByRole("button", { name: "Identifica las mezclas por el olor" }).click();
  await host.getByRole("button", { name: /Abrir respuestas/ }).click();
  const hojaRojo = rojo.locator("label").filter({ hasText: "Mezcla 1" }).locator("input");
  await hojaRojo.fill("menta y sandia");
  await foto(rojo, "hoja");
  rojo.once("dialog", (d) => d.accept());
  await rojo.getByRole("button", { name: "Entregar" }).click();
  await host.getByRole("button", { name: /Cerrar y corregir/ }).click();
  await expect(tv.locator(".hojas")).toBeVisible();
  await foto(tv, "hoja-corregida");

  // Canción: fallan todos
  await host.locator(".host-nav").getByRole("button", { name: "Clásicos de fiesta" }).click();
  await host.getByRole("button", { name: /Primera canción/ }).click();
  for (const m of [rojo, azul, verde, amarillo]) {
    await m.locator(".pulsador").dispatchEvent("pointerdown");
    await host.getByRole("button", { name: /Fallo/ }).click();
  }
  await expect(tv.getByText("Nadie la acertó")).toBeVisible();
  await foto(tv, "cancion-nadie");

  // Podio con empate en el primer puesto
  await host.getByRole("button", { name: "Podio", exact: true }).click();
  for (let i = 0; i < 6 && (await tv.locator(".con-confeti").count()) === 0; i++) {
    await expect(host.getByRole("button", { name: /Revelar/ })).toBeVisible();
    await host.keyboard.press(" ");
    await tv.waitForTimeout(300);
  }
  await expect(tv.locator(".tv-titulo")).toContainText(/gana/);
  await tv.waitForTimeout(1200);
  await foto(tv, "podio");
  await foto(host, "panel-final");
});
