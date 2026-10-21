// Despliega en joseluis-vps: tests → imagen amd64 → subida por SSH → /health. Si falla, vuelve a la anterior.
//
//   node tools/deploy.mjs <X.Y.Z> [--skip-tests]
//
// Requisitos: Docker en marcha y `ssh-add --apple-use-keychain ~/.ssh/id_ed25519` hecho en una terminal normal.
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

// Fuera de casa: VPS_HOST=joseluis@100.124.235.108 (Tailscale)
const HOST = process.env.VPS_HOST ?? "joseluis@192.168.18.7";
const DIR = "~/servicios/concurso";
const IMAGE = "concurso-cumple";
const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Uso: node tools/deploy.mjs <X.Y.Z>");

const root = resolve(import.meta.dirname, "..");
const sh = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit", cwd: root });
const out = (cmd, args) => execFileSync(cmd, args, { cwd: root, encoding: "utf8" }).trim();
const ssh = (c) => sh("ssh", [HOST, c]);

if (!process.argv.includes("--skip-tests")) {
  console.log("→ Typecheck y tests…");
  sh("pnpm", ["typecheck"]);
  sh("pnpm", ["test"]);
}

console.log(`→ Imagen ${IMAGE}:${version} (linux/amd64)…`);
sh("docker", ["buildx", "build", "--platform", "linux/amd64", "--build-arg", `APP_VERSION=${version}`, "-t", `${IMAGE}:${version}`, "--load", "."]);

console.log("→ Subiendo la imagen al VPS…");
execFileSync("sh", ["-c", `docker save ${IMAGE}:${version} | gzip | ssh ${HOST} 'docker load'`], { stdio: "inherit" });

const previous = out("ssh", [HOST, `grep -o 'image: ${IMAGE}:[^ ]*' ${DIR}/docker-compose.yml 2>/dev/null | head -1 | cut -d: -f3 || true`]);
ssh(`mkdir -p ${DIR}/data && chmod 700 ${DIR}`);
sh("scp", ["deploy/docker-compose.yml", `${HOST}:${DIR}/docker-compose.yml`]);
// PIN del presentador: se genera en el VPS la primera vez (6 cifras) y no sale de allí salvo que lo pidas.
ssh(
  `cd ${DIR} && touch .env && chmod 600 .env && ` +
    `{ grep -q '^PIN=.' .env || { sed -i '/^PIN=/d' .env; echo "PIN=$(shuf -i 100000-999999 -n 1)" >> .env; }; } && ` +
    `{ grep -q '^APP_VERSION=' .env || echo "APP_VERSION=${version}" >> .env; }`,
);
if (previous) ssh(`cd ${DIR} && cp -a data/estado.json data/estado.pre-${version}.json 2>/dev/null; cp -a data/contenido.json data/contenido.pre-${version}.json 2>/dev/null; true`);

const up = (v) => `cd ${DIR} && sed -i "s|image: ${IMAGE}:.*|image: ${IMAGE}:${v}|" docker-compose.yml && sed -i "s|^APP_VERSION=.*|APP_VERSION=${v}|" .env && docker compose up -d`;
console.log(`→ Arrancando ${version}…`);
ssh(up(version));

console.log("→ Verificando /health…");
let ok = false;
for (let i = 0; i < 15 && !ok; i++) {
  try {
    const h = JSON.parse(out("ssh", [HOST, `sleep 2; docker exec concurso node -e "fetch('http://127.0.0.1:3000/health').then(r=>r.text()).then(console.log)"`]));
    ok = h.version === version;
  } catch {
    // arrancando
  }
}
if (!ok) {
  ssh("docker logs concurso --tail 40");
  if (previous && previous !== version) {
    console.error(`✗ ${version} no responde: volviendo a ${previous}…`);
    ssh(up(previous));
  }
  throw new Error(`Despliegue de ${version} fallido.`);
}
ssh("docker ps --filter name=concurso --format 'table {{.Names}}\\t{{.Status}}'");
console.log(`\n✓ ${IMAGE}:${version} desplegada. PIN: ssh ${HOST} "grep PIN ${DIR}/.env"`);
