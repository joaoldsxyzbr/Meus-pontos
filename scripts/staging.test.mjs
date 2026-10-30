import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import vm from "node:vm";
import stagingWorker from "../src/staging-worker.js";

const source = async (name) => readFile("dist/staging/" + name, "utf8");

test("staging usa Worker e D1 exclusivos, sem endpoints públicos", async () => {
  const prod = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
  const stage = JSON.parse(await readFile("wrangler.staging.jsonc", "utf8"));
  assert.notEqual(stage.name, prod.name);
  assert.equal(stage.workers_dev, false);
  assert.equal(stage.preview_urls, false);
  assert.equal(stage.route, undefined);
  assert.equal(stage.routes, undefined);
  assert.equal(stage.assets.directory, "./dist/staging");
  assert.equal(stage.assets.run_worker_first, true);
  assert.notEqual(stage.d1_databases[0].database_id, prod.d1_databases[0].database_id);
  assert.notEqual(stage.ratelimits[0].namespace_id, prod.ratelimits[0].namespace_id);
  assert.equal(stage.d1_databases[0].database_name, "meus-pontos-homologacao-20261030");
});

test("build gera arquivos versionados, manifest e SW sem scripts antigos", async () => {
  const html = await source("index.html");
  const sw = await source("sw.js");
  const manifest = JSON.parse(await source("manifest.webmanifest"));
  const assets = await readdir("dist/staging/assets");
  assert.match(html, /rel="manifest"/);
  assert.match(html, /\/assets\/.*\.js/);
  assert.ok(assets.some(name => name.endsWith(".css")));
  assert.ok(assets.some(name => name.endsWith(".js")));
  assert.equal(manifest.scope, "/");
  assert.match(sw, /meus-pontos-svelte-[a-f0-9]{16}/);
  assert.doesNotMatch(html, /\/app\.js|\/ajustes\.js|\/correcoes\.js/);
  assert.ok(assets.every(name => !name.endsWith(".map")));
});

test("Service Worker não intercepta API, login ou gravações e só pré-cacheia assets", async () => {
  const handlers = new Map();
  let cachedShell = [];
  const cache = {
    addAll: async (list) => { cachedShell = Array.from(list); },
    put: async () => {}
  };
  const fakeCaches = {
    open: async () => cache,
    match: async () => undefined,
    keys: async () => [],
    delete: async () => true
  };
  const self = {
    location: { origin: "https://staging.example.test" },
    addEventListener: (name, fn) => handlers.set(name, fn),
    skipWaiting: async () => {},
    clients: { claim: async () => {} }
  };
  vm.runInNewContext(await source("sw.js"), {
    self, caches: fakeCaches, URL, Response, Promise, fetch: async () => new Response("ok")
  });
  function fetchEvent(path, method = "GET") {
    let intercepted = false;
    handlers.get("fetch")({
      request: new Request("https://staging.example.test" + path, { method }),
      respondWith() { intercepted = true; },
      waitUntil() {}
    });
    return intercepted;
  }
  for (const route of ["/api/login", "/api/sessao", "/api/hoje", "/api/pontos",
    "/api/historico", "/api/saldo", "/api/pontos/corrigir", "/api/ajustes",
    "/api/ajustes/1"]) assert.equal(fetchEvent(route), false, route);
  assert.equal(fetchEvent("/api/pontos", "POST"), false);
  assert.equal(fetchEvent("/sw.js"), false);
  assert.equal(fetchEvent("/"), true);
  assert.equal(fetchEvent("/index.html"), true);
  assert.equal(fetchEvent("/favicon.ico"), false);
  let install;
  handlers.get("install")({ waitUntil(promise) { install = promise; } });
  await install;
  assert.ok(cachedShell.includes("/"));
  assert.ok(cachedShell.includes("/index.html"));
  assert.ok(cachedShell.some(s => s.startsWith("/assets/")));
  assert.ok(!cachedShell.some(s => s.startsWith("/api/")));
});

test("Worker de homologação usa noindex e no-store no HTML e SW", async () => {
  const env = { ASSETS: { fetch: async () => new Response("ok") } };
  for (const path of ["/", "/index.html", "/sw.js", "/manifest.webmanifest"]) {
    const result = await stagingWorker.fetch(new Request("https://staging.example.test" + path), env, {});
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("Cache-Control"), "no-store");
    assert.equal(result.headers.get("X-Robots-Tag"), "noindex, nofollow, noarchive");
    assert.equal(result.headers.get("X-Frame-Options"), "DENY");
  }
});
