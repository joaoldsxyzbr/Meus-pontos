import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(".");
const pilot = path.join(root, "dist/svelte-pilot");
const staging = path.join(root, "dist/staging");
const vite = path.join(root, "node_modules/vite/bin/vite.js");

// A flag é definida somente durante este build, não no piloto de desenvolvimento.
const result = spawnSync(process.execPath, [vite, "build", "--config", "vite.frontend.config.ts"], {
  cwd: root, stdio: "inherit",
  env: { ...process.env, VITE_STAGING_PWA: "1" }
});
if (result.status !== 0 || result.error) {
  throw new Error("Falha ao compilar o Svelte de homologação.");
}

await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
await cp(pilot, staging, { recursive: true });
for (const name of ["icon.svg", "manifest.webmanifest"]) {
  await cp(path.join(root, "public", name), path.join(staging, name));
}
const htmlPath = path.join(staging, "index.html");
const html = await readFile(htmlPath, "utf8");
if (!html.includes("</head>")) throw new Error("HTML de saída inválido.");
await writeFile(htmlPath, html.replace("</head>",
  '  <link rel="manifest" href="/manifest.webmanifest">\n' +
  '  <link rel="icon" type="image/svg+xml" href="/icon.svg">\n</head>'));

async function assetNames(dir, prefix = "/") {
  const names = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) names.push(...await assetNames(path.join(dir, entry.name), name + "/"));
    else if (entry.isFile() && /\.(js|css)$/.test(entry.name)) names.push(name);
  }
  return names;
}
const assets = (await assetNames(path.join(staging, "assets"), "/assets/")).sort();
if (!assets.some(s => s.endsWith(".js")) || !assets.some(s => s.endsWith(".css"))) {
  throw new Error("Build sem arquivos JS/CSS versionados.");
}
const precache = ["/", "/index.html", "/icon.svg", "/manifest.webmanifest", ...assets];
const digest = createHash("sha256");
for (const filename of precache.filter(name => name !== "/")) {
  digest.update(filename);
  digest.update(await readFile(path.join(staging, filename.slice(1))));
}
const cacheName = "meus-pontos-svelte-" + digest.digest("hex").slice(0, 16);

const serviceWorker = `// Arquivo gerado automaticamente por scripts/build-staging.mjs.
const CACHE = ${JSON.stringify(cacheName)};
const SHELL = ${JSON.stringify(precache)};
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then(names => Promise.all(
    names.filter(name => (name.startsWith("meus-pontos-svelte-") ||
      name.startsWith("meus-pontos-shell-")) && name !== CACHE)
      .map(name => caches.delete(name))
  )).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin ||
      url.pathname.startsWith("/api/") || url.pathname === "/sw.js") return;
  if (url.pathname === "/" || url.pathname === "/index.html") {
    // HTML sempre consultado na rede para descobrir versões novas.
    event.respondWith(fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)));
      }
      return response;
    }).catch(async () =>
      (await caches.match(request)) ||
      (await caches.match("/index.html")) || Response.error()));
    return;
  }
  if (!SHELL.includes(url.pathname)) return;
  // JS/CSS possuem nomes com hash. Os assets públicos são imutáveis por versão.
  event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
});
`;
await writeFile(path.join(staging, "sw.js"), serviceWorker);
console.log("PWA de homologação compilada:", assets.length, "assets; cache", cacheName);
