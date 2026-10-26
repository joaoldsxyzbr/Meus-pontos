import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";

const root = path.resolve("public");
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const smokeScript = String.raw`
(async () => {
  let stage = "start";
  const log = (ok, issue = "") => {
    const e = document.createElement("output");
    e.id = "__browser_smoke";
    e.textContent = JSON.stringify({ ok, issue, stage, width: innerWidth,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 3,
      miniAi: document.querySelector("#mini-ai-status")?.textContent,
      today: document.querySelector("#today-date")?.textContent,
      gate: document.querySelector("#gate-error")?.textContent,
      gateHidden: document.querySelector("#gate")?.hidden,
      resources: [...document.scripts].map(x=>x.src?.split("/").at(-1)) });
    document.body.append(e);
  };
  const wait = async (predicate) => {
    for (let i = 0; i < 100; i++) {
      if (predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 45));
    }
    throw new Error("Tempo esgotado: " + stage);
  };
  try {
    stage = "ponto-e-analise";
    await wait(() => document.querySelector("#mini-ai-copy")?.disabled === false);
    if (!document.querySelector("#today-date")?.textContent.includes("2026")) throw new Error("Dia não renderizado");
    stage = "historico";
    document.querySelector('[data-tab="historico"]').click();
    await wait(() => document.querySelector("#history-summary")?.textContent.includes("dias no período"));
    stage = "banco";
    document.querySelector('[data-tab="saldo"]').click();
    await wait(() => document.querySelector("#balance-total")?.textContent.includes("0h00"));
    stage = "ponto-retorno";
    document.querySelector('[data-tab="ponto"]').click();
    await wait(() => document.querySelector("#page-ponto")?.hidden === false);
    const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 3;
    if (overflow) throw new Error("Rolagem horizontal");
    log(true);
  } catch (e) {
    log(false, String(e?.message || e));
  }
})();
`;

function mockedApi(pathname) {
  if (pathname === "/api/sessao") return { autenticado: true };
  if (pathname === "/api/hoje") return { date: "2026-10-26", now: "08:00",
    points: [], next_type: "entrada", carga_minutos: 480, usa_intervalo: true,
    total_trabalhado_minutos: null, saldo_minutos: null, pendencia: null };
  if (pathname === "/api/historico") return { month: "2026-10", days: [] };
  if (pathname === "/api/saldo") return { saldo_batidas_minutos: 0,
    saldo_ajustes_minutos: 0, saldo_total_minutos: 0, faltas: 0, pendencias: 0 };
  if (pathname === "/api/ajustes") return { ajustes: [] };
  return null;
}
function chromeBinary() {
  for (const name of ["google-chrome", "google-chrome-stable", "chromium"]) {
    const check = spawnSync("which", [name], { encoding: "utf8" });
    if (check.status === 0) return check.stdout.trim();
  }
  throw new Error("Chrome/Chromium ausente — teste visual obrigatório indisponível");
}
async function serve() {
  const apiLog = [];
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    response.setHeader("Cache-Control", "no-store");
    if (url.pathname.startsWith("/api/")) {
      apiLog.push({ method: request.method, path: url.pathname });
      const data = request.method === "GET" ? mockedApi(url.pathname) : null;
      response.writeHead(data ? 200 : 405, { "Content-Type": "application/json" });
      response.end(JSON.stringify(data || { error: "Apenas leitura no teste" }));
      return;
    }
    if (url.pathname === "/__smoke.js") {
      response.writeHead(200, { "Content-Type": "text/javascript" });
      response.end(smokeScript);
      return;
    }
    let pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    let filepath = path.resolve(root, "." + pathname);
    if (!filepath.startsWith(root + path.sep)) { response.writeHead(404); response.end(); return; }
    try {
      // Reproduz rede lenta: a tela pode carregar antes do módulo da mini IA.
      if (pathname === "/mini-ai-ui.js") await new Promise(resolve => setTimeout(resolve, 900));
      let file = await fs.readFile(filepath);
      if (pathname === "/index.html") file = Buffer.from(file.toString()
        .replace("</body>", '<script type="module" src="/__smoke.js"></script></body>'));
      response.writeHead(200, { "Content-Type": (mime[path.extname(filepath)] || "application/octet-stream") + "; charset=utf-8" });
      response.end(file);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return { server, apiLog, port: server.address().port };
}
async function browse(bin, url, width, tmp) {
  const args = ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
    "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check",
    "--disable-background-networking", "--window-size=" + width + ",860",
    "--user-data-dir=" + tmp, "--virtual-time-budget=12000", "--dump-dom", url];
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk.toString().slice(0, 1024 * 1024); });
    child.stderr.on("data", chunk => { stderr = (stderr + chunk.toString()).slice(-5000); });
    child.on("error", reject);
    child.on("exit", code => {
      if (code !== 0) return reject(new Error("Chrome saiu com código " + code + ": " + stderr.slice(-750)));
      const match = stdout.match(/<output id="__browser_smoke">([^<]*)<\/output>/);
      if (!match) return reject(new Error("Nenhum resultado do teste no DOM: " + stdout.slice(-900)));
      try { resolve(JSON.parse(match[1])); } catch (error) { reject(error); }
    });
  });
}

test("Chrome real renderiza Ponto, Histórico e Banco em desktop e mobile", { timeout: 120000 }, async () => {
  const binary = chromeBinary();
  const { server, port, apiLog } = await serve();
  try {
    for (const width of [1280, 390]) {
      const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "meus-pontos-chrome-"));
      try {
        const result = await browse(binary, "http://127.0.0.1:" + port + "/", width, tmp);
        assert.equal(result.ok, true, JSON.stringify(result));
        assert.equal(result.overflow, false, JSON.stringify(result));
      } finally { await fs.rm(tmp, { recursive: true, force: true }); }
    }
    assert.ok(apiLog.some(r => r.path === "/api/hoje"));
    assert.ok(apiLog.some(r => r.path === "/api/historico"));
    assert.ok(apiLog.some(r => r.path === "/api/saldo"));
    assert.ok(apiLog.every(r => r.method === "GET"), "O teste e a IA não podem gravar registros.");
  } finally { server.close(); }
});
