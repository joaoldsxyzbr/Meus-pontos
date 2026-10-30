import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

/**
 * Nunca importa wrangler.jsonc: ele referencia o ID real de produção.
 * Miniflare cria o DB em memória local, isolado dos recursos da conta.
 */
export default defineConfig({
  plugins: [
    cloudflareTest({
      main: "./src/worker.js",
      miniflare: {
        compatibilityDate: "2026-10-20",
        d1Databases: ["DB"]
      }
    })
  ],
  test: {
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000
  }
});
