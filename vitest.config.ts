import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

/**
 * Nunca importa wrangler.jsonc: ele referencia o ID real de produção.
 * Miniflare cria o DB local, e o parser oficial carrega a migração versionada.
 */
export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      main: "./src/worker.js",
      miniflare: {
        compatibilityDate: "2026-10-20",
        d1Databases: ["DB"],
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(path.resolve("migrations"))
        }
      }
    }))
  ],
  test: {
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000
  }
});
