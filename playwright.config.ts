import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  workers: 1, // comparten servidor y partida: uno detrás de otro
  use: { baseURL: "http://localhost:3457", locale: "es-ES" },
  webServer: {
    command: "rm -rf .e2e-datos && DATA_DIR=.e2e-datos PORT=3457 PIN=1234 node dist/server.js",
    url: "http://localhost:3457/health",
    reuseExistingServer: false,
  },
});
