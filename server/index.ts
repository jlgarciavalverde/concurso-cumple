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
import { contenidoInicial } from "./contenido-inicial.ts";
import { estadoVacio, Juego, type AccionEquipo, type AccionHost } from "./juego.ts";
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
  return cambio;
}

const contenido = leer<Contenido>(fContenido, contenidoInicial);
if (migrar(contenido)) escribir(fContenido, contenido);
const juego = new Juego(contenido, leer<Estado>(fEstado, estadoVacio));

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
  juego.contenido = nuevo;
  juego.ajustarAlContenido();
  escribir(fContenido, juego.contenido);
  guardar();
  emitir();
  return { ok: true, rev: nuevo.rev };
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

const io = new Server(app.server, { cors: { origin: false }, maxHttpBufferSize: 1e5 });

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

let temporizador: NodeJS.Timeout | null = null;
function programarTic() {
  if (temporizador) clearTimeout(temporizador);
  temporizador = null;
  const fin = juego.estado.vivo.fin;
  if (fin === null || juego.estado.vivo.fase !== "jugando") return;
  temporizador = setTimeout(() => {
    if (juego.tic()) {
      guardar();
      emitir();
    }
  }, Math.max(fin - Date.now() + 600, 50));
}

function emitir() {
  const con = conectados();
  const pub = juego.publico(con);
  io.to("tv").emit("publico", pub);
  for (const id of juego.ids) io.to(`eq:${id}`).emit("equipo", juego.vistaEquipo(pub, id));
  io.to("host").emit("host", {
    ahora: pub.ahora,
    contenido: juego.contenido,
    estado: juego.estado,
    publico: pub,
    conectados: con,
    tv: io.sockets.adapter.rooms.get("tv")?.size ?? 0,
    tvSonido: sonidoTv.size ? [...sonidoTv.values()].some(Boolean) : null,
    deshacer: juego.puedeDeshacer,
  });
  // Equipos sin elegir (pantalla de entrada): solo la lista de equipos
  io.to("lobby").emit("equipo", pub);
  programarTic();
}

io.on("connection", (socket) => {
  const auth = socket.handshake.auth as { rol?: string; pin?: string; codigo?: string; equipo?: string };
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
  } else if (auth.rol === "tv") {
    socket.join("tv");
    // La TV no se toca: cuenta si el navegador le deja sonar para que el presentador lo vea
    socket.on("tvEstado", (d: { sonido?: boolean }) => {
      sonidoTv.set(socket.id, !!d?.sonido);
      emitir();
    });
    socket.on("disconnect", () => sonidoTv.delete(socket.id));
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
      let ultima = 0;
      socket.on("nombre", (nombre: unknown) => {
        if (juego.estado.codigo !== codigo) return;
        const r = juego.renombrar(eq, nombre);
        if (r === "repetido") socket.emit("aviso", "Ese nombre ya lo tiene otro equipo");
        if (r !== true) return;
        escribir(fContenido, juego.contenido);
        emitir();
      });
      socket.on("equipo", (acc: AccionEquipo) => {
        // Contra dobles toques en las respuestas tipo test/precio; hoja, entregar y pulsador van sin freno
        if (acc?.t === "responder") {
          const ahora = Date.now();
          if (ahora - ultima < 150) return;
          ultima = ahora;
        }
        if (juego.estado.codigo !== codigo) return;
        if (juego.equipo(eq, acc)) {
          guardar();
          emitir();
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
