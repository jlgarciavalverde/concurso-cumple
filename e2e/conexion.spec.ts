// Cortes de red y reinicio del servidor en plena partida. Usa un servidor propio para poder matarlo.
import { spawn, type ChildProcess } from "node:child_process";
import { rmSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { foto as fotoBase, nuevaPagina, nuevaTv, opcionesMovil } from "./util.ts";

const PUERTO = 3460;
const URL = `http://localhost:${PUERTO}`;
const DATOS = ".e2e-conexion";
const PIN = { "x-pin": "1234" };
const foto = (p: Page, n: string) => fotoBase(p, "con-" + n);

let servidor: ChildProcess | null = null;

async function arrancar() {
  servidor = spawn("node", ["dist/server.js"], { env: { ...process.env, DATA_DIR: DATOS, PORT: String(PUERTO), PIN: "1234" }, stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${URL}/health`)).ok) return;
    } catch {
      /* arrancando */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("el servidor de pruebas no arranca");
}

async function parar(señal: NodeJS.Signals = "SIGTERM") {
  const s = servidor;
  servidor = null;
  if (!s || s.exitCode !== null) return;
  await new Promise<void>((r) => {
    s.once("exit", () => r());
    s.kill(señal);
  });
}

test.beforeAll(async () => {
  rmSync(DATOS, { recursive: true, force: true });
  await arrancar();
});
test.afterAll(async () => {
  await parar();
  rmSync(DATOS, { recursive: true, force: true });
});

async function movil(browser: Browser, codigo: string, equipo: string) {
  const p = await nuevaPagina(browser, `móvil ${equipo}`, opcionesMovil());
  await p.goto(`${URL}/?c=${codigo}`);
  await p.getByRole("button", { name: equipo }).click();
  await p.getByRole("button", { name: `Dejar «${equipo}»` }).click();
  return p;
}

test("cortes de red y reinicio del servidor sin perder nada", async ({ browser }) => {
  // Cultura general con 5 s por pregunta para poder dejar pasar el tiempo
  const c = await (await fetch(`${URL}/api/admin/contenido`, { headers: PIN })).json();
  c.pruebas.flatMap((p: { subs: { id: string; segundos?: number }[] }) => p.subs).find((s: { id: string }) => s.id === "cultura").segundos = 5;
  await fetch(`${URL}/api/admin/contenido`, { method: "PUT", headers: { ...PIN, "content-type": "application/json" }, body: JSON.stringify(c) });

  const tv = await nuevaTv(browser);
  await tv.goto(`${URL}/tv`);
  const codigo = (await tv.locator(".unete b").innerText()).trim();
  const host = await nuevaPagina(browser, "panel", { viewport: { width: 1280, height: 900 } });
  await host.goto(`${URL}/presentador`);
  await host.getByPlaceholder("PIN").fill("1234");
  await host.getByRole("button", { name: "Entrar" }).click();
  const rojo = await movil(browser, codigo, "Rojo");
  const azul = await movil(browser, codigo, "Azul");

  // 1) Rojo pierde la red a mitad de pregunta, responde sin conexión y le llega al volver
  await host.locator(".host-nav").getByRole("button", { name: "Cultura general" }).click();
  await host.getByRole("button", { name: /Primera pregunta/ }).click();
  await rojo.context().setOffline(true);
  await expect(rojo.getByText(/Reconectando/)).toBeVisible({ timeout: 8000 });
  await rojo.getByRole("button", { name: /Júpiter/ }).click();
  await expect(rojo.getByText(/Sin conexión: se enviará/)).toBeVisible();
  await foto(rojo, "sin-red");
  await rojo.context().setOffline(false);
  await expect(rojo.getByText("Respuesta enviada. ¡A esperar!")).toBeVisible({ timeout: 8000 });
  await expect(rojo.getByText(/Reconectando/)).toHaveCount(0);

  // 2) Azul pierde la red, responde y no vuelve hasta que se acaba el tiempo → «No llegó a tiempo»
  await azul.context().setOffline(true);
  await expect(azul.getByText(/Reconectando/)).toBeVisible({ timeout: 8000 });
  await azul.getByRole("button", { name: /Júpiter/ }).click();
  await expect(host.getByText(/Corregido/)).toBeVisible({ timeout: 10_000 }); // se cierra por tiempo
  await azul.context().setOffline(false);
  await expect(azul.getByText("No llegó a tiempo")).toBeVisible({ timeout: 8000 });
  await expect(rojo.getByText("¡Correcto!")).toBeVisible();
  await foto(azul, "no-llego");

  // 3) Reinicio del servidor justo después de una respuesta (antes de que se guarde a los 150 ms)
  await host.locator(".host-nav").getByRole("button", { name: "Rosco cachimbero" }).click();
  await host.getByRole("button", { name: "30", exact: true }).click();
  await host.getByRole("button", { name: /Primera letra/ }).click();
  await rojo.getByPlaceholder("Respuesta").fill("cazoleta");
  await rojo.getByRole("button", { name: "Responder" }).click();
  await expect(rojo.getByText(/Enviado: «cazoleta»/)).toBeVisible();
  await parar("SIGTERM");
  await expect(rojo.getByText(/Reconectando/)).toBeVisible({ timeout: 8000 });
  await arrancar();
  // Todos vuelven solos, en la misma letra y con la respuesta guardada
  await expect(rojo.getByText(/Reconectando/)).toHaveCount(0, { timeout: 15_000 });
  await expect(rojo.getByText(/Enviado: «cazoleta»/)).toBeVisible();
  await expect(tv.locator(".tv-pregunta")).toContainText("pieza donde se coloca el tabaco", { timeout: 15_000 });
  await expect(host.getByText(/Esperando respuestas \(1\/4\)/)).toBeVisible({ timeout: 15_000 });
  await expect(tv.locator(".tv-eq").filter({ hasText: "Rojo" })).toContainText("1,5");
  await foto(tv, "tras-reinicio");
});
