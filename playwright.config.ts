import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  workers: 1, // comparten servidor y partida: uno detrás de otro
  retries: 0,
  use: { baseURL: "http://localhost:3457", locale: "es-ES", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    // Motor de Safari: TV y panel en WebKit de escritorio; los móviles, como iPhone (ver e2e/util.ts)
    { name: "safari", use: { browserName: "webkit" }, timeout: 240_000 }, // WebKit es bastante más lento
  ],
  webServer: {
    command: "rm -rf .e2e-datos && DATA_DIR=.e2e-datos PORT=3457 PIN=1234 node dist/server.js",
    url: "http://localhost:3457/health",
    reuseExistingServer: false,
  },
});
