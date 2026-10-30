import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import releaseWorker from "../src/release-worker.js";

const load = async p => readFile("dist/release/" + p, "utf8");

test("Wrangler de produção publica Svelte automaticamente sem alterar D1, login ou rotas", async () => {
  const cfg = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
  assert.equal(cfg.name, "meus-pontos");
  assert.equal(cfg.main, "src/release-worker.js");
  assert.equal(cfg.compatibility_date, "2026-10-20");
  assert.equal(cfg.assets.directory, "./dist/release");
  assert.equal(cfg.assets.binding, "ASSETS");
  assert.equal(cfg.assets.run_worker_first, true);
  assert.equal(cfg.build.command, "npm run build:release");
  assert.equal(cfg.d1_databases.length, 1);
  assert.deepEqual(cfg.d1_databases[0], {
    binding: "DB",
    database_name: "meus-pontos",
    database_id: "150895af-1ec9-4c6c-af03-a43189a9bb71"
  });
  assert.equal(cfg.ratelimits.length, 1);
  assert.equal(cfg.ratelimits[0].name, "LOGIN_LIMITER");
  assert.equal(cfg.ratelimits[0].namespace_id, "520261020");
  assert.equal(cfg.routes, undefined);
  assert.equal(cfg.route, undefined);
  assert.equal(cfg.migrations, undefined);
});

test("release Svelte contém manifest, novo SW e arquivos legados só para transição", async () => {
  const html = await load("index.html");
  const sw = await load("sw.js");
  const manifest = JSON.parse(await load("manifest.webmanifest"));
  const assets = await readdir("dist/release/assets");
  assert.match(html, /<title>Meus Pontos<\/title>/);
  assert.doesNotMatch(html, /Svelte 5 \(piloto\)/);
  assert.match(html, /rel="manifest"/);
  assert.match(html, /\/assets\/index-[A-Za-z0-9_-]{8,}\.js/);
  assert.ok(assets.some(s => s.endsWith(".css")));
  assert.ok(assets.some(s => s.endsWith(".js")));
  assert.equal(manifest.id, "/");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.match(sw, /meus-pontos-svelte-[a-f0-9]{16}/);
  assert.match(sw, /meus-pontos-shell-/);
  assert.doesNotMatch(sw, /SHELL = .*\/api\//);
  for (const name of ["app.js","ajustes.js","correcoes.js",
      "styles.css","ajustes.css","correcoes.css"]) {
    const legacy = await load(name);
    assert.ok(legacy.length > 100, name);
    assert.ok(!sw.includes('"/' + name + '"'), "Não pre-cachear " + name);
  }
  assert.ok(assets.every(s => !s.endsWith(".map")));
});

test("wrapper conserva a resposta da API sem alterar dados e status", async () => {
  const env = {
    ASSETS: { fetch: async () => new Response("static") },
    PONTO_USERNAME: "invalid"
  };
  // O Worker real retorna 503 sem credenciais, como já fazia antes da release.
  const response = await releaseWorker.fetch(new Request(
    "https://meus-pontos.example.test/api/sessao"), env, {});
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), { error: "Login ainda não configurado no Worker." });
});

test("wrapper impede cache de HTML/SW, mantém legacy no-store e asset imutável", async () => {
  const env = { ASSETS: { fetch: async () => new Response("ok") } };
  for (const name of ["/","/index.html","/sw.js","/manifest.webmanifest",
    "/app.js","/ajustes.js","/correcoes.js","/styles.css"]) {
    const res = await releaseWorker.fetch(new Request(
      "https://meus-pontos.example.test" + name), env, {});
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Cache-Control"), "no-store", name);
    assert.equal(res.headers.get("X-Frame-Options"), "DENY");
  }
  const asset = await releaseWorker.fetch(new Request(
    "https://meus-pontos.example.test/assets/index-Bt7Jqy00.js"), env, {});
  assert.equal(asset.headers.get("Cache-Control"),
    "public, max-age=31536000, immutable");
});

test("o deploy automático usa o Wrangler principal e preserva a API", async () => {
  const ci = await readFile(".github/workflows/ci.yml", "utf8");
  const build = await readFile("scripts/build-release.mjs", "utf8");
  const main = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
  assert.match(ci, /wrangler deploy --config wrangler\.jsonc --dry-run/);
  assert.match(ci, /node --test scripts\/staging-http\.test\.mjs/);
  assert.match(ci, /E2E_RELEASE_LOCAL=1/);
  assert.match(build, /scripts\/build-staging\.mjs/);
  assert.doesNotMatch(build, /wrangler d1/);
  assert.equal(main.build.command, "npm run build:release");
  assert.doesNotMatch(ci, /wrangler d1 .*--remote/);
});
