import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import releaseWorker from "../src/release-worker.js";

const load = async p => readFile("dist/release/" + p, "utf8");

test("release difere da produção atual SOMENTE em Worker wrapper e assets", async () => {
  const old = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
  const future = JSON.parse(await readFile("wrangler.release.jsonc", "utf8"));
  assert.equal(future.name, old.name);
  assert.equal(future.compatibility_date, old.compatibility_date);
  assert.deepEqual(future.d1_databases, old.d1_databases);
  assert.deepEqual(future.ratelimits, old.ratelimits);
  assert.equal(future.main, "src/release-worker.js");
  assert.equal(future.assets.binding, "ASSETS");
  assert.equal(future.assets.directory, "./dist/release");
  assert.equal(future.assets.run_worker_first, old.assets.run_worker_first);
  for (const key of ["route","routes","workers_dev","preview_urls","env","vars"]) {
    assert.deepEqual(future[key], old[key], key);
  }
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

test("não há deploy automático, release exige confirmação e branch main", async () => {
  const workflow = await readFile(".github/workflows/svelte-release.yml","utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /PUBLICAR_SVELTE_5/);
  assert.match(workflow, /BACKUP_E_RESTAURACAO_VERIFICADOS/);
  assert.match(workflow, /ROLLBACK_PREPARADO/);
  assert.match(workflow, /npm run test:release/);
  assert.match(workflow, /wrangler deploy --config wrangler\.release\.jsonc/);
  assert.doesNotMatch(workflow, /wrangler d1 .*--remote/);
});
