// Pulsador justo con red real: un móvil con datos (150 ms) pulsa ANTES que uno en wifi, pero su pulsación llega después.
import { createServer, connect, type Server } from "node:net";
import { expect, test } from "@playwright/test";
import { nuevaPagina, nuevaTv, opcionesMovil, ganchos } from "./util.ts";

ganchos();

/** Proxy TCP que retrasa cada trozo de datos `ms` en cada sentido: una red móvil lenta de verdad (también el WebSocket). */
function proxyLento(puerto: number, destino: number, ms: number): Server {
  return createServer((cliente) => {
    const servidor = connect(destino, "127.0.0.1");
    const pasar = (de: NodeJS.ReadableStream, a: NodeJS.WritableStream) => de.on("data", (d) => setTimeout(() => a.write(d), ms));
    pasar(cliente, servidor);
    pasar(servidor, cliente);
    const cerrar = () => {
      cliente.destroy();
      servidor.destroy();
    };
    cliente.on("error", cerrar).on("close", cerrar);
    servidor.on("error", cerrar).on("close", cerrar);
  }).listen(puerto);
}

test("con red lenta gana quien pulsó antes, no quien llegó antes", async ({ browser }) => {
  test.skip(test.info().project.name !== "chromium", "una vez basta: la lógica es la misma en Safari");
  const proxy = proxyLento(3462, 3457, 150);
  test.info().attach("proxy", { body: "150 ms por sentido" });
  const tv = await nuevaTv(browser);
  await tv.goto("/tv");
  const codigo = (await tv.locator(".unete b").innerText()).trim();
  const host = await nuevaPagina(browser, "panel", { viewport: { width: 1280, height: 900 } });
  await host.goto("/presentador");
  await host.getByPlaceholder("PIN").fill("1234");
  await host.getByRole("button", { name: "Entrar" }).click();

  const entrar = async (equipo: string, base = "") => {
    const p = await nuevaPagina(browser, `móvil ${equipo}`, opcionesMovil());
    await p.goto(`${base}/?c=${codigo}`);
    await p.getByRole("button", { name: equipo }).click();
    await p.getByRole("button", { name: `Dejar «${equipo}»` }).click();
    return p;
  };
  const lento = await entrar("Rojo", "http://localhost:3462"); // «datos móviles»: todo su tráfico va por el proxy lento
  const rapido = await entrar("Azul"); // «wifi»
  // Dar tiempo a medir la latencia (pings cada 2 s)
  await host.waitForTimeout(7000);
  const lat = (await host.locator(".host-barra .chip").allInnerTexts()).map((x) => x.replace(/\s+/g, " "));
  console.log("latencias vistas en el panel:", lat.join(" | "));
  expect(lat.join(" ")).toMatch(/1[3-9]\d ms|2\d\d ms/); // el lento ronda los 150 ms

  await host.locator(".host-nav").getByRole("button", { name: "Canciones de los 2000" }).click();
  await host.getByRole("button", { name: /Primera canción/ }).click();
  await expect(lento.locator(".pulsador")).toBeEnabled();
  await expect(rapido.locator(".pulsador")).toBeEnabled();
  // El lento pulsa primero; el rápido 60 ms después. Sin compensar ganaría el rápido: su pulsación llega ~90 ms antes.
  await Promise.all([
    lento.locator(".pulsador").dispatchEvent("pointerdown"),
    rapido.waitForTimeout(60).then(() => rapido.locator(".pulsador").dispatchEvent("pointerdown")),
  ]);
  await expect(tv.locator(".pulsado")).toHaveText("Rojo", { timeout: 5000 });
  proxy.close();
});
