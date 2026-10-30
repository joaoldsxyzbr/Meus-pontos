import { applyD1Migrations, env } from "cloudflare:test";
import schema from "../../fixtures/d1-base.sql?raw";

/**
 * Esquema e migração SQL executados exclusivamente pelo D1 local do Miniflare.
 * Nunca ler wrangler.jsonc nem configurar D1 remoto neste helper.
 */
export async function initializeLocalD1() {
  const statements = schema.split("\n")
    .filter(line => !line.trimStart().startsWith("--"))
    .join("\n").split(";").map(sql => sql.trim()).filter(Boolean);
  for (const statement of statements) {
    await env.DB.prepare(statement).run();
  }
  const migrations = (env as typeof env & {
    TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
  }).TEST_MIGRATIONS;
  await applyD1Migrations(env.DB, migrations);
}
