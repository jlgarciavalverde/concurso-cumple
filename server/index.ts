import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import multipart from "@fastify/multipart";
import { Server } from "socket.io";
import type { Contenido, Estado, EquipoId } from "../shared/tipos.ts";
import { contenidoInicial, kahootExterno } from "./contenido-inicial.ts";
import { Spotify } from "./spotify.ts";
import { estadoVacio, Juego, normalizarEstado, type AccionEquipo, type AccionHost } from "./juego.ts";
import { validarContenido } from "./validar.ts";

const PORT = Number(process.env.PORT ?? 3000);
const DATA = resolve(process.env.DATA_DIR ?? "data");
const WEB = resolve(process.env.WEB_DIR ?? "dist/client");
const PIN = process.env.PIN ?? "1234";
const VERSION = process.env.APP_VERSION ?? "dev";
const MEDIA = resolve(DATA, "media");
mkdirSync(MEDIA, { recursive: true });

const fContenido = resolve(DATA, "contenido.json");
const fEstado = resolve(DATA, "estado.json");

function leer<T>(f: string, defecto: () => T): T {
  try {
    return JSON.parse(readFileSync(f, "utf8")) as T;
  } catch {
    return defecto();
  }
}
function escribir(f: string, datos: unknown) {
  const tmp = `${f}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(datos, null, 1));
  renameSync(tmp, f);
}

if (!existsSync(fContenido)) escribir(fContenido, contenidoInicial());

/** Ajustes de reglas sobre contenido ya guardado, solo si sigue con los valores antiguos de fábrica. */
function migrar(c: Contenido): boolean {
  let cambio = false;
  for (const p of c.pruebas)
    for (const s of p.subs)
      if (s.id === "torre" && s.tipo === "manual" && s.medida === "segundos" && !s.mayorMejor) {
        // v0.3.0: la torre se puntúa por vasos apilados, no por tiempo
        Object.assign(s, { medida: "vasos", mayorMejor: true, cronometro: false, segundos: 60, descripcion: "¡A apilar vasos! Gana quien más vasos consiga poner." });
        cambio = true;
      }
  // Cambios de versión que se aplican una sola vez (si luego se deshacen a mano, no vuelven)
  const una = (nombre: string, fn: () => void) => {
    if (c.migraciones?.includes(nombre)) return;
    fn();
    c.migraciones = [...(c.migraciones ?? []), nombre];
    cambio = true;
  };
  // v0.11.0: cinco equipos (si siguen los cuatro de serie, se añade el morado sin tocar nombres ni puntos)
  una("5-equipos", () => {
    if (c.equipos.map((e) => e.id).join() === "rojo,azul,verde,amarillo")
      c.equipos.push({ id: "morado", nombre: c.equipos.some((e) => e.nombre.toLocaleLowerCase("es") === "morado") ? "Equipo 5" : "Morado", color: "#a855f7" });
  });
  // v0.11.0: el Kahoot lo hace el cumpleañero en Kahoot. Si nadie ha escrito preguntas propias, se pasa a ronda
  // externa (las preguntas quedan guardadas por si se vuelve a «Preguntas aquí»).
  una("kahoot-externo", () => {
    for (const p of c.pruebas)
      p.subs = p.subs.map((s) => (s.id === "kahoot" && s.tipo === "test" && s.preguntas.every((q) => q.texto.includes("✏️")) ? kahootExterno(s) : s));
  });
  return cambio;
}

const contenido = leer<Contenido>(fContenido, contenidoInicial);
if (migrar(contenido)) escribir(fContenido, contenido);
const juego = new Juego(contenido, normalizarEstado(leer<Estado>(fEstado, estadoVacio)));

const pinOk = (p: unknown) => {
  const a = Buffer.from(String(p ?? ""));
  const b = Buffer.from(PIN);
  return a.length === b.length && timingSafeEqual(a, b);
};

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "warn" }, bodyLimit: 2 * 1024 * 1024 });
await app.register(multipart, { limits: { fileSize: 30 * 1024 * 1024, files: 1 } });

app.get("/health", async () => ({ ok: true, version: VERSION }));

app.addHook("onRequest", async (req, reply) => {
  if (req.url.startsWith("/api/admin") && !pinOk(req.headers["x-pin"])) {
    await new Promise((r) => setTimeout(r, 500));
    return reply.code(401).send({ error: "PIN incorrecto" });
  }
});

app.get("/api/admin/contenido", async () => juego.contenido);
app.put("/api/admin/contenido", async (req, reply) => {
  const err = validarContenido(req.body);
  if (err) return reply.code(400).send({ error: err });
  const nuevo = req.body as Contenido;
  const actual = juego.contenido.rev ?? 0;
  if ((nuevo.rev ?? 0) !== actual)
    return reply.code(409).send({ error: "El contenido ha cambiado desde que abriste esta página (p. ej. el presentador cambió algo en directo). Recarga y vuelve a hacer tus cambios." });
  nuevo.rev = actual + 1;
  nuevo.migraciones = juego.contenido.migraciones; // las lleva el servidor, no el panel
  juego.contenido = nuevo;
  juego.ajustarAlContenido();
  escribir(fContenido, juego.contenido);
  guardar();
  emitir();
  return { ok: true, rev: nuevo.rev };
});
// Partida nueva (mismos equipos y contenido, mismo código): útil tras un ensayo
// ---------- Spotify (la cuenta Premium que hace sonar las canciones en la TV) ----------
const spotify = new Spotify(resolve(DATA, "spotify.json"));
app.get("/api/admin/spotify/estado", async () => spotify.estado());
app.post("/api/admin/spotify/conectar", async (_req, reply) => {
  if (!spotify.configurado) return reply.code(400).send({ error: "Falta configurar la app de Spotify en el servidor (SPOTIFY_CLIENT_ID y SPOTIFY_CLIENT_SECRET)" });
  return { url: spotify.urlConectar() };
});
app.post("/api/admin/spotify/desconectar", async () => {
  spotify.desconectar();
  emitirHost();
  return { ok: true };
});
app.post("/api/admin/spotify/lista", async (req, reply) => {
  try {
    return await spotify.lista(String((req.body as { url?: string })?.url ?? ""));
  } catch (e) {
    return reply.code(400).send({ error: (e as Error).message });
  }
});
app.get("/api/spotify/callback", async (req, reply) => {
  const q = req.query as { code?: string; state?: string; error?: string };
  try {
    if (q.error) throw new Error(q.error === "access_denied" ? "Has cancelado la conexión" : q.error);
    await spotify.alVolver(String(q.code ?? ""), String(q.state ?? ""));
    emitirHost();
    return reply.redirect("/admin?spotify=ok");
  } catch (e) {
    return reply.redirect(`/admin?spotify=error&msg=${encodeURIComponent((e as Error).message)}`);
  }
});

app.post("/api/admin/reiniciar", async () => {
  juego.host({ t: "reiniciar" });
  guardar();
  emitir();
  return { ok: true };
});
app.post("/api/admin/restaurar", async () => {
  juego.contenido = { ...contenidoInicial(), rev: (juego.contenido.rev ?? 0) + 1 };
  juego.ajustarAlContenido();
  escribir(fContenido, juego.contenido);
  guardar();
  emitir();
  return juego.contenido;
});

const TIPOS = new Set([".mp3", ".m4a", ".ogg", ".wav", ".aac", ".jpg", ".jpeg", ".png", ".webp", ".gif"]);
app.post("/api/admin/subir", async (req, reply) => {
  const f = await req.file();
  if (!f) return reply.code(400).send({ error: "Sin archivo" });
  const ext = extname(f.filename).toLowerCase();
  if (!TIPOS.has(ext)) return reply.code(400).send({ error: `Tipo no admitido (${ext})` });
  const nombre = `${randomBytes(8).toString("hex")}${ext}`;
  await pipeline(f.file, createWriteStream(resolve(MEDIA, nombre)));
  if (f.file.truncated) return reply.code(413).send({ error: "Archivo demasiado grande (máx. 30 MB)" });
  return { url: `/media/${nombre}` };
});

await app.register(fastifyStatic, {
  root: MEDIA,
  prefix: "/media/",
  decorateReply: false,
  cacheControl: false,
  // Cada subida tiene nombre aleatorio nuevo y nunca se sobrescribe: se puede cachear para siempre (y precargar)
  setHeaders: (res) => void res.header("Cache-Control", "public, max-age=31536000, immutable"),
});
if (existsSync(WEB)) {
  await app.register(fastifyStatic, { root: WEB, prefix: "/", wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    if (req.method === "GET" && !req.url.startsWith("/api") && !req.url.startsWith("/media")) return reply.sendFile("index.html");
    return reply.code(404).send({ error: "No encontrado" });
  });
}

// ---------- Tiempo real ----------

// Latido cada 8 s (por defecto 25 s): un móvil que pierde la red se da por caído en ~13 s, no en ~45 s
const io = new Server(app.server, { cors: { origin: false }, maxHttpBufferSize: 1e5, pingInterval: 8000, pingTimeout: 5000 });

let guardarPendiente: NodeJS.Timeout | null = null;
function guardar() {
  if (guardarPendiente) return;
  guardarPendiente = setTimeout(() => {
    guardarPendiente = null;
    escribir(fEstado, juego.estado);
  }, 150);
}

function conectados(): Record<EquipoId, number> {
  const out: Record<EquipoId, number> = {};
  for (const id of juego.ids) out[id] = io.sockets.adapter.rooms.get(`eq:${id}`)?.size ?? 0;
  return out;
}

const sonidoTv = new Map<string, boolean>();
const estadoSpotifyTv = new Map<string, { autorizada: boolean; listo: boolean; error: string | null }>();

let temporizador: NodeJS.Timeout | null = null;
function programarTic() {
  if (temporizador) clearTimeout(temporizador);
  temporizador = null;
  const t = juego.proximoTic();
  if (t === null) return;
  // Fin de tiempo: 600 ms de margen para respuestas en vuelo. Ventana del pulsador: justo a su hora.
  const margen = t === juego.estado.vivo.ventana?.hasta ? 5 : 600;
  temporizador = setTimeout(() => {
    if (juego.tic()) {
      guardar();
      emitir();
    } else programarTic();
  }, Math.max(t - Date.now() + margen, 5));
}

// ---------- Latencia de cada móvil (para el pulsador justo) ----------
/** Mitad del ida y vuelta, media móvil, por socket. */
const latencias = new Map<string, { equipo: EquipoId; ms: number }>();
setInterval(() => {
  for (const [, s] of io.sockets.sockets) {
    const eq = s.data.equipo as EquipoId | undefined;
    if (!eq) continue;
    const t0 = Date.now();
    s.timeout(3000).emit("latido", (err: unknown) => {
      if (err) return;
      const medio = (Date.now() - t0) / 2;
      const prev = latencias.get(s.id)?.ms;
      latencias.set(s.id, { equipo: eq, ms: prev === undefined ? medio : prev * 0.7 + medio * 0.3 });
    });
  }
  // Que el panel vea las latencias aunque la partida esté parada
  setTimeout(emitirHost, 1000);
}, 2000).unref();

function latenciasEquipos(): Record<EquipoId, number> {
  const out: Record<EquipoId, number> = {};
  for (const { equipo, ms } of latencias.values()) out[equipo] = Math.round(Math.min(out[equipo] ?? Infinity, ms));
  return out;
}

function vistaHost(con: Record<EquipoId, number>, pub: ReturnType<Juego["publico"]>) {
  return {
    ahora: pub.ahora,
    contenido: juego.contenido,
    estado: juego.estado,
    publico: pub,
    conectados: con,
    tv: io.sockets.adapter.rooms.get("tv")?.size ?? 0,
    tvSonido: sonidoTv.size ? [...sonidoTv.values()].some(Boolean) : null,
    latencias: latenciasEquipos(),
    deshacer: juego.puedeDeshacer,
    spotify: { ...spotify.estado(), tvs: [...estadoSpotifyTv.values()] },
  };
}

function emitirHost() {
  if (!io.sockets.adapter.rooms.get("host")?.size) return;
  const con = conectados();
  io.to("host").emit("host", vistaHost(con, juego.publico(con)));
}

function emitir() {
  const con = conectados();
  const pub = juego.publico(con);
  io.to("tv").emit("publico", pub);
  for (const id of juego.ids) io.to(`eq:${id}`).emit("equipo", juego.vistaEquipo(pub, id));
  io.to("host").emit("host", vistaHost(con, pub));
  // Equipos sin elegir (pantalla de entrada): solo la lista de equipos
  io.to("lobby").emit("equipo", pub);
  io.to("votantes").emit("votacion", { ahora: pub.ahora, titulo: pub.titulo, votacion: juego.publicoVotacion() });
  programarTic();
}

io.on("connection", (socket) => {
  const auth = socket.handshake.auth as { rol?: string; pin?: string; codigo?: string; equipo?: string; claveSpotify?: string };
  if (auth.rol === "host") {
    if (!pinOk(auth.pin)) {
      setTimeout(() => {
        socket.emit("error", "PIN incorrecto");
        socket.disconnect(true);
      }, 500);
      return;
    }
    socket.join("host");
    socket.on("tvRecargar", () => io.to("tv").emit("recargar"));
    // Autorizar las TVs conectadas ahora mismo a usar Spotify (se les da una clave que guardan para siempre)
    socket.on("spotifyConfiarTv", () => {
      for (const id of io.sockets.adapter.rooms.get("tv") ?? []) {
        const tv = io.sockets.sockets.get(id);
        if (!tv) continue;
        tv.data.spotify = true;
        tv.emit("spotifyClave", spotify.nuevaClaveTv());
      }
    });
    socket.on("host", (acc: AccionHost) => {
      try {
        juego.host(acc);
        if (acc.t === "codigo") for (const id of [...juego.ids, "lobby"]) io.in(id === "lobby" ? id : `eq:${id}`).disconnectSockets(true);
        if (acc.t === "config") {
          juego.contenido.rev = (juego.contenido.rev ?? 0) + 1;
          escribir(fContenido, juego.contenido);
        }
        guardar();
        emitir();
      } catch (e) {
        app.log.error(e);
      }
    });
  } else if (auth.rol === "votante") {
    // Votación del mejor disfraz: con el código de la partida (va en el QR de la TV), sin PIN
    if (String(auth.codigo ?? "").toUpperCase() !== juego.estado.codigo) {
      socket.emit("error", "Código incorrecto");
      socket.disconnect(true);
      return;
    }
    socket.join("votantes");
    socket.on("votar", (d: { votante?: string; votado?: string }, ack?: (r: { ok: boolean; error?: string }) => void) => {
      const error = juego.votar(d?.votante, d?.votado);
      if (typeof ack === "function") ack(error ? { ok: false, error } : { ok: true });
      if (!error) {
        guardar();
        emitir();
      }
    });
  } else if (auth.rol === "tv") {
    socket.join("tv");
    // La TV no se toca: cuenta si el navegador le deja sonar para que el presentador lo vea
    socket.on("tvEstado", (d: { sonido?: boolean }) => {
      sonidoTv.set(socket.id, !!d?.sonido);
      emitir();
    });
    socket.on("disconnect", () => {
      sonidoTv.delete(socket.id);
      estadoSpotifyTv.delete(socket.id);
      emitirHost();
    });
    // Spotify: solo una TV autorizada desde el panel recibe el token (si no, cualquiera que abra /tv lo tendría)
    socket.data.spotify = spotify.claveTvValida(auth.claveSpotify);
    socket.on("spotifyToken", async (_: unknown, ack?: (r: { token?: string; error?: string }) => void) => {
      if (typeof ack !== "function") return;
      if (!socket.data.spotify) return ack({ error: "Esta TV no está autorizada para Spotify (autorízala desde el panel)" });
      try {
        ack({ token: await spotify.token() });
      } catch (e) {
        ack({ error: (e as Error).message });
      }
    });
    socket.on("spotifyEstado", (d: { listo?: boolean; error?: string | null }) => {
      estadoSpotifyTv.set(socket.id, { autorizada: !!socket.data.spotify, listo: !!d?.listo, error: d?.error ?? null });
      emitirHost();
    });
    estadoSpotifyTv.set(socket.id, { autorizada: !!socket.data.spotify, listo: false, error: null });
  } else if (auth.rol === "equipo") {
    const codigo = String(auth.codigo ?? "").toUpperCase();
    const eq = String(auth.equipo ?? "");
    if (codigo !== juego.estado.codigo) {
      socket.emit("error", "Código incorrecto");
      socket.disconnect(true);
      return;
    }
    if (!juego.ids.includes(eq)) {
      socket.join("lobby");
    } else {
      socket.join(`eq:${eq}`);
      socket.data.equipo = eq;
      socket.on("disconnect", () => latencias.delete(socket.id));
      let ultima = 0;
      socket.on("nombre", (nombre: unknown) => {
        if (juego.estado.codigo !== codigo) return;
        const r = juego.renombrar(eq, nombre);
        if (r === "repetido") socket.emit("aviso", "Ese nombre ya lo tiene otro equipo");
        if (r !== true) return;
        escribir(fContenido, juego.contenido);
        emitir();
      });
      socket.on("equipo", (acc: AccionEquipo, ack?: (ok: boolean) => void) => {
        // Confirmación al móvil (aunque se descarte): si no le llega, lo reenvía al reconectar
        if (typeof ack === "function") ack(true);
        // Contra dobles toques en las respuestas tipo test/precio; hoja, entregar y pulsador van sin freno
        if (acc?.t === "responder") {
          const ahora = Date.now();
          if (ahora - ultima < 150) return;
          ultima = ahora;
        }
        if (juego.estado.codigo !== codigo) return;
        try {
          if (juego.equipo(eq, acc, { latencia: latencias.get(socket.id)?.ms })) {
            guardar();
            emitir();
          }
        } catch (e) {
          // Un fallo con una respuesta no puede tumbar la partida entera
          app.log.error({ err: e, equipo: eq, accion: acc }, "fallo procesando una acción de equipo");
          console.error("Fallo procesando una acción de equipo:", e);
        }
      });
    }
  } else {
    socket.disconnect(true);
    return;
  }
  socket.on("disconnect", () => emitir());
  emitir();
});

await app.listen({ port: PORT, host: "0.0.0.0" });
console.log(`Concurso ${VERSION} en :${PORT} (datos en ${DATA})`);

// Al parar el contenedor (docker stop/restart) se guarda al momento: el guardado normal espera 150 ms
function cerrar(señal: string) {
  if (guardarPendiente) clearTimeout(guardarPendiente);
  escribir(fEstado, juego.estado);
  console.log(`${señal}: partida guardada, cerrando`);
  io.close();
  void app.close().finally(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on("SIGTERM", () => cerrar("SIGTERM"));
process.on("SIGINT", () => cerrar("SIGINT"));

// Último recurso: un error inesperado se registra pero no reinicia el servidor en mitad del concurso
process.on("uncaughtException", (e) => console.error("Error no capturado (el servidor sigue):", e));
process.on("unhandledRejection", (e) => console.error("Promesa rechazada sin capturar (el servidor sigue):", e));
