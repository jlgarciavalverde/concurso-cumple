import { expect, test, type Browser, type Page } from "@playwright/test";
import { foto as fotoBase, FOTOS, nuevaPagina, nuevaTv, opcionesMovil, vigilar, ganchos } from "./util.ts";

ganchos();

const foto = (p: Page, n: string) => fotoBase(p, "" + n);

async function movil(browser: Browser, codigo: string, equipo: string, nombre?: string) {
  const p = await nuevaPagina(browser, `móvil ${equipo}`, opcionesMovil());
  await p.goto(`/?c=${codigo}`);
  await p.getByRole("button", { name: equipo }).click();
  // la primera vez piden nombre de equipo
  if (nombre) {
    await p.getByPlaceholder(equipo).fill(nombre);
    await p.getByRole("button", { name: "Guardar" }).click();
  } else await p.getByRole("button", { name: `Dejar «${equipo}»` }).click();
  await expect(p.locator(".movil-cab")).toContainText(nombre ?? equipo);
  return p;
}

/** WAV de prueba (3 s de tono) para subirlo como canción. */
function wav(segundos: number): Buffer {
  const hz = 8000;
  const n = hz * segundos;
  const b = Buffer.alloc(44 + n);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n, 4); b.write("WAVE", 8); b.write("fmt ", 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(hz, 24);
  b.writeUInt32LE(hz, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write("data", 36); b.writeUInt32LE(n, 40);
  for (let i = 0; i < n; i++) b[44 + i] = 128 + Math.round(40 * Math.sin((2 * Math.PI * 440 * i) / hz));
  return b;
}

test("partida completa: tv + presentador + 4 móviles", async ({ browser }) => {
  const tv = await nuevaTv(browser);
  await tv.goto("/tv");
  // La TV no tiene nada que tocar
  await expect(tv.locator(".tv-cab")).toBeVisible();
  await expect(tv.getByRole("button")).toHaveCount(0);
  const codigo = (await tv.locator(".unete b").innerText()).trim();
  expect(codigo).toMatch(/^[A-Z]{4}$/);

  const host = await nuevaPagina(browser, "panel", { viewport: { width: 1280, height: 900 } });
  await host.goto("/presentador");
  await host.getByPlaceholder("PIN").fill("1234");
  await host.getByRole("button", { name: "Entrar" }).click();
  await expect(host.getByText(`Código ${codigo}`)).toBeVisible();
  await expect(host.getByText(/TV conectada/)).toBeVisible();
  // sonido y recarga de la TV desde el presentador
  await host.getByRole("button", { name: "Silenciar la TV" }).click();
  await expect(host.getByRole("button", { name: "Activar sonido de la TV" })).toBeVisible();
  await host.getByRole("button", { name: "Activar sonido de la TV" }).click();
  host.once("dialog", (d) => d.accept());
  const recarga = tv.waitForEvent("load");
  await host.getByRole("button", { name: "Recargar TV" }).click();
  await recarga;
  await expect(tv.locator(".unete b")).toHaveText(codigo);

  // Antes de empezar: la primera canción del rap con un audio de 3 s y fragmento de 1 s
  const h = { "x-pin": "1234" };
  const subida = await host.request.post("/api/admin/subir", { headers: h, multipart: { archivo: { name: "prueba.wav", mimeType: "audio/wav", buffer: wav(3) } } });
  const { url } = await subida.json();
  expect((await host.request.get(url)).headers()["cache-control"]).toContain("immutable");
  const cont = await (await host.request.get("/api/admin/contenido", { headers: h })).json();
  const rap = cont.pruebas.flatMap((x: { subs: { id: string }[] }) => x.subs).find((x: { id: string }) => x.id === "c-rap");
  rap.fragmento = 1;
  rap.canciones[0].audio = url;
  expect((await host.request.put("/api/admin/contenido", { headers: h, data: cont })).status()).toBe(200);

  const [rojo, azul, verde, amarillo] = await Promise.all(
    ["Rojo", "Azul", "Verde", "Amarillo"].map((e) => movil(browser, codigo, e, e === "Amarillo" ? "Los Cachimberos" : undefined)),
  );
  await expect(tv.locator(".tv-pie")).toContainText("Los Cachimberos");
  await expect(tv.getByText("1 móvil").first()).toBeVisible();
  await foto(tv, "tv-lobby");
  await foto(rojo, "movil-espera");

  // --- Cultura general: 1 punto por acierto
  await host.locator(".host-nav").getByRole("button", { name: "Cultura general" }).click();
  await host.getByRole("button", { name: /Primera pregunta/ }).click();
  await expect(tv.locator(".tv-pregunta")).toContainText("planeta más grande");
  await foto(tv, "tv-pregunta");
  await foto(tv, "tv-intro-o-pregunta");
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
  await expect(tv.getByText("Clasificación general")).toBeVisible({ timeout: 9000 });
  await tv.waitForTimeout(1500);
  await foto(tv, "tv-clasificacion");
  // atajos: M enseña el marcador, J vuelve al juego
  await host.keyboard.press("m");
  await expect(tv.locator(".desglose")).toBeVisible();
  await host.keyboard.press("j");
  await expect(tv.locator(".tabla-res, .clasif").first()).toBeVisible();
  // volver a una prueba jugada ofrece continuar en lugar de sumar otra vez
  await host.locator(".host-nav").getByRole("button", { name: "Rap español" }).click();
  await host.locator(".host-nav").getByRole("button", { name: /Cultura general/ }).click();
  await expect(host.getByText("Esta prueba ya se empezó.")).toBeVisible();
  await foto(host, "host-retomar");
  await host.keyboard.press(" ");
  await expect(host.getByText("Puntos automáticos, ya en el marcador")).toBeVisible();
  await expect(tv.locator(".tv-eq").filter({ hasText: "Rojo" })).toContainText("1,5");

  // --- Canción con pulsador
  await host.locator(".host-nav").getByRole("button", { name: "Rap español" }).click();
  await host.getByRole("button", { name: /Primera canción/ }).click();
  await foto(verde, "movil-pulsador");
  // el fragmento (1 s) se para solo
  await expect(tv.getByText(/Fin del fragmento/)).toBeVisible({ timeout: 6000 });
  await foto(tv, "tv-fragmento");
  await verde.locator(".pulsador").dispatchEvent("pointerdown");
  await expect(tv.locator(".pulsado")).toHaveText("Verde");
  await expect(rojo.locator(".pulsador")).toBeDisabled();
  await foto(tv, "tv-pulsado");
  await host.getByRole("button", { name: /Fallo/ }).click();
  await expect(verde.locator(".pulsador")).toHaveText("Bloqueados");
  await azul.locator(".pulsador").dispatchEvent("pointerdown");
  await expect(tv.locator(".pulsado")).toHaveText("Azul");
  await host.getByRole("button", { name: "Acierto", exact: true }).click();
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
  const palabra = (await host.locator(".tarjeta-host .pal").textContent()) ?? "";
  await expect(tv.locator(".tarjeta-tv .pal")).toHaveText(palabra, { ignoreCase: true }); // en la TV, para quien explica
  // nunca en los móviles (palabra entera: «Ex» no debe confundirse con «explica»)
  await expect(rojo.getByText(new RegExp(`(^|[^\\p{L}])${palabra}([^\\p{L}]|$)`, "iu"))).toHaveCount(0);
  await host.getByText("Mostrar la tarjeta en la TV").click();
  await expect(tv.locator(".tarjeta-tv")).toHaveCount(0);
  await host.getByText("Mostrar la tarjeta en la TV").click();
  await host.getByRole("button", { name: "Acierto", exact: true }).click();
  await expect(tv.locator(".revela")).toContainText("1 acierto");
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
  await host.getByRole("button", { name: "Marcador", exact: true }).click();
  await expect(tv.locator(".desglose")).toBeVisible();
  await foto(tv, "tv-marcador");
  await host.getByRole("button", { name: "Podio", exact: true }).click();
  await expect(tv.locator(".podio")).toBeVisible();
  await expect(tv.getByText("¿Quién ganará?")).toBeVisible();
  await expect(tv.locator(".peana.vista")).toHaveCount(0);
  await foto(tv, "tv-podio-0");
  await expect(host.getByRole("button", { name: /Revelar el \d+º puesto/ })).toBeVisible();
  await host.keyboard.press(" ");
  await expect(tv.locator(".peana.vista").first()).toBeVisible();
  for (let i = 0; i < 4 && (await tv.locator(".con-confeti").count()) === 0; i++) await host.keyboard.press(" ");
  await expect(tv.locator(".con-confeti")).toBeVisible();
  await expect(tv.locator(".tv-titulo")).toContainText("gana");
  await tv.waitForTimeout(1500);
  await foto(tv, "tv-podio");
  await foto(rojo, "movil-podio");
  await foto(host, "host-general");

  // --- El estado sobrevive a recargar
  const antes = (await rojo.locator(".movil-cab").textContent()) ?? "";
  await rojo.reload();
  await expect(rojo.locator(".movil-cab")).toHaveText(antes);
});

test("admin: guía, lo que falta, guardado automático, «Empezar aquí» y conflictos", async ({ page, request }) => {
  vigilar(page, "admin");
  const h = { "x-pin": "1234" };
  // Una canción con MP3 para probar «Empezar aquí»
  const { url } = await (await request.post("/api/admin/subir", { headers: h, multipart: { archivo: { name: "p.wav", mimeType: "audio/wav", buffer: wav(3) } } })).json();
  const c0 = await (await request.get("/api/admin/contenido", { headers: h })).json();
  c0.pruebas.flatMap((x: { subs: { id: string }[] }) => x.subs).find((x: { id: string }) => x.id === "c-rap").canciones[0].audio = url;
  await request.put("/api/admin/contenido", { headers: h, data: c0 });

  await page.goto("/admin");
  await page.getByPlaceholder("PIN").fill("0000");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("PIN incorrecto")).toBeVisible();
  await page.getByPlaceholder("PIN").fill("1234");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Preparar el concurso" })).toBeVisible();
  await expect(page.getByText(/Faltan \d+ de \d+ rondas/)).toBeVisible();
  await expect(page.locator(".preparacion")).toContainText("cachimbas o boles");
  await foto(page, "admin-portada");

  // Desde «¿Está todo listo?» se va directo a la ronda, con su guía
  const filaPrecio = page.locator(".fila-revision").filter({ hasText: "¿Cuánto cuesta?" });
  await expect(filaPrecio).toContainText("6 productos con precio 0");
  await filaPrecio.click();
  const precio = page.locator("#ronda-precio");
  await expect(precio.getByText("Cómo se juega el día")).toBeVisible();
  await expect(precio.getByText("Falta rellenar").first()).toBeVisible();
  await precio.getByPlaceholder("Producto 1").fill("Cachimba Kaloud");
  await precio.locator(".campo-admin").filter({ hasText: "Precio real en euros" }).first().locator("input").fill("120");
  await expect(page.getByText(/Guardado ahora/)).toBeVisible({ timeout: 8000 });
  await expect(filaPrecio).toContainText("5 productos con precio 0");
  await foto(page, "admin-precio");

  // Kahoot: aceptar una pregunta de ejemplo con un clic
  await page.locator(".fila-revision").filter({ hasText: "¿Cuánto le conocéis?" }).click();
  page.once("dialog", (d) => d.accept());
  await page.locator("#ronda-kahoot").getByRole("button", { name: "Mejor escribir las preguntas aquí" }).click();
  await page.locator("#ronda-kahoot").getByRole("button", { name: /Usar «¿En qué año nació el cumpleañero\?»/ }).click();
  await expect(page.locator("#ronda-kahoot textarea").first()).toHaveValue("¿En qué año nació el cumpleañero?");
  await foto(page, "admin-kahoot");

  // Canción: «Empezar aquí» copia el segundo en que está el reproductor
  await page.locator(".fila-revision").filter({ hasText: "Rap español" }).click();
  const rap = page.locator("#ronda-c-rap");
  const audio = rap.locator("audio").first();
  await audio.evaluate(async (a: HTMLAudioElement) => {
    if (a.readyState < 1) await new Promise((r) => a.addEventListener("loadedmetadata", r, { once: true }));
    a.currentTime = 2.4;
  });
  await rap.getByRole("button", { name: "Empezar aquí" }).first().click();
  await expect(rap.locator(".campo-admin").filter({ hasText: "Empieza a sonar en el segundo" }).first().locator("input")).toHaveValue("2");
  await expect(page.getByText(/Guardado ahora/)).toBeVisible({ timeout: 8000 });

  // Todo sigue tras recargar
  await page.reload();
  await page.locator(".fila-revision").filter({ hasText: "¿Cuánto cuesta?" }).click();
  await expect(page.locator("#ronda-precio input[value=\"Cachimba Kaloud\"]")).toHaveCount(1);

  // Conflicto: alguien cambia el contenido por otro lado y aquí se avisa en vez de machacarlo
  const actual = await (await request.get("/api/admin/contenido", { headers: h })).json();
  expect((await request.put("/api/admin/contenido", { headers: h, data: actual })).status()).toBe(200);
  await page.locator("#ronda-precio").getByPlaceholder("Producto 2").fill("Botella");
  await expect(page.getByText(/Alguien ha cambiado el contenido/)).toBeVisible({ timeout: 8000 });
  await foto(page, "admin-conflicto");

  // En móvil también se usa bien
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await foto(page, "admin-movil");
});
