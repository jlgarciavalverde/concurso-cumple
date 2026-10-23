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
    // Spotify apunta a un Spotify simulado en :3463 (lo levanta e2e/final.spec.ts)
    command:
      "rm -rf .e2e-datos && DATA_DIR=.e2e-datos PORT=3457 PIN=1234 PUBLIC_URL=http://localhost:3457 SPOTIFY_CLIENT_ID=prueba SPOTIFY_CLIENT_SECRET=prueba SPOTIFY_ACCOUNTS=http://localhost:3463 SPOTIFY_API=http://localhost:3463 node dist/server.js",
    url: "http://localhost:3457/health",
    reuseExistingServer: false,
  },
});
