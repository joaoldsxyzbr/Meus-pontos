import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";

/** Smoke de frontend isolado, com API simulada — nunca faz chamadas externas. */
const root = path.resolve(process.env.PILOT_ROOT || "dist/svelte-pilot");
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml" };
const script = String.raw`
(async () => {
  let stage = "login";
  const wait = async (predicate) => {
    for (let i = 0; i < 120; i++) {
      if (predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error("Não concluiu: " + stage);
  };
  const report = (ok, error = "") => {
    const result = document.createElement("output");
    result.id = "__svelte_smoke";
    result.textContent = JSON.stringify({
      ok, error, stage, width: innerWidth,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 3,
      date: document.querySelector("#today-date")?.textContent,
      saldo: document.querySelector("#balance-total")?.textContent,
      loginVisible: !document.querySelector("#gate")?.hidden
    });
    document.body.append(result);
  };
  try {
    await wait(() => document.querySelector("#login-user")?.disabled === false);
    document.querySelector("#login-user").value = "teste-ui";
    document.querySelector("#login-user").dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#login-password").value = "senha-ficticia";
    document.querySelector("#login-password").dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#gate form button[type=submit]").click();
    stage = "ponto";
    await wait(() => document.querySelector("#gate")?.hidden === true);
    await wait(() => document.querySelector("#today-date")?.textContent.includes("2026"));
    document.querySelector("#register").click();
    await wait(() => document.querySelectorAll("#page-ponto .step.done").length === 1);
    stage = "historico";
    document.querySelector('[data-tab="historico"]').click();
    await wait(() => document.querySelector("#history-summary")?.textContent.includes("dias no período"));
    stage = "correcoes";
    window.confirm = () => true;
    await wait(() => document.querySelector("#correction-heading"));
    document.querySelector(".correction-row .ledger-outline").click();
    await wait(() => document.querySelector("#correction-list button"));
    document.querySelector("#correction-list button").click();
    await wait(() => document.querySelector("#correction-form"));
    const edited = document.querySelector("#correction-time");
    edited.value = "08:30";
    edited.dispatchEvent(new Event("input", { bubbles: true }));
    const correctionReason = document.querySelector("#correction-reason");
    correctionReason.value = "Teste sintético de correção";
    correctionReason.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#correction-form").requestSubmit();
    await wait(() => document.querySelector(".correction-card [role=\"status\"]")?.textContent.includes("Correção salva."));
    stage = "saldo";
    document.querySelector('[data-tab="saldo"]').click();
    await wait(() => document.querySelector("#balance-total")?.textContent.includes("0h00"));
    stage = "ajustes";
    await wait(() => document.querySelector("#ledger-list") &&
      !document.querySelector("#ledger-list").textContent.includes("Carregando"));
    document.querySelector(".ledger-heading button").click();
    await wait(() => document.querySelector("#ledger-form"));
    const durationInput = document.querySelector('#ledger-form input[placeholder="01:30"]');
    durationInput.value = "01:30";
    durationInput.dispatchEvent(new Event("input", { bubbles: true }));
    const adjustmentReason = document.querySelector('#ledger-form input[placeholder^="Ex.:"]');
    adjustmentReason.value = "Crédito sintético de teste";
    adjustmentReason.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#ledger-form").requestSubmit();
    await wait(() => document.querySelectorAll(".ledger-item").length === 1);
    await wait(() => document.querySelector("#balance-total")?.textContent.includes("+1h30"));
    stage = "editar-ajuste";
    document.querySelector(".ledger-item .ledger-link").click();
    await wait(() => document.querySelector("#ledger-form"));
    const editedDuration = document.querySelector('#ledger-form input[placeholder="01:30"]');
    editedDuration.value = "00:30";
    editedDuration.dispatchEvent(new Event("input", { bubbles: true }));
    const debit = document.querySelector("#ledger-form select");
    debit.value = "debito";
    debit.dispatchEvent(new Event("change", { bubbles: true }));
    document.querySelector("#ledger-form").requestSubmit();
    await wait(() => document.querySelector(".ledger-item")?.textContent.includes("−0h30"));
    await wait(() => document.querySelector("#balance-total")?.textContent.includes("−0h30"));
    stage = "excluir-ajuste";
    document.querySelector(".ledger-item .ledger-danger").click();
    await wait(() => document.querySelectorAll(".ledger-item").length === 0);
    await wait(() => document.querySelector("#balance-total")?.textContent.includes("0h00"));
    stage = "retorno";
    document.querySelector('[data-tab="ponto"]').click();
    await wait(() => Boolean(document.querySelector("#page-ponto")));
    if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 3) {
      throw new Error("Rolagem horizontal");
    }
    report(true);
  } catch (err) { report(false, String(err?.message || err)); }
})();
`;

function dateBrazil() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return p.year + "-" + p.month + "-" + p.day;
}
function chromeBinary() {
  for (const candidate of ["google-chrome", "google-chrome-stable", "chromium"]) {
    const found = spawnSync("which", [candidate], { encoding: "utf8" });
    if (found.status === 0) return found.stdout.trim();
  }
  throw new Error("Chrome/Chromium obrigatório não disponível");
}

async function serve() {
  const requests = [];
  const state = { authenticated: false, points: [], adjustments: [], nextId: 1 };
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    response.setHeader("Cache-Control", "no-store");
    if (url.pathname.startsWith("/api/")) {
      requests.push({ method: request.method, path: url.pathname });
      let data, status = 200;
      if (url.pathname === "/api/sessao") {
        if (!state.authenticated) { status = 401; data = { error: "Sessão expirada ou inválida." }; }
        else data = { autenticado: true };
      } else if (url.pathname === "/api/login" && request.method === "POST") {
        state.authenticated = true; state.points = []; state.adjustments = []; data = { ok: true, usuario: "teste-ui" };
      } else if (!state.authenticated) {
        status = 401; data = { error: "Sessão expirada ou inválida." };
      } else if (url.pathname === "/api/pontos" && request.method === "POST") {
        let body = "";
        for await (const chunk of request) body += chunk;
        const point = JSON.parse(body);
        if (state.points.length) { status = 409; data = { error: "Conflito." }; }
        else {
          state.points.push({ id: 1, data: dateBrazil(), tipo: point.tipo, horario: point.horario });
          status = 201;
          data = { ok: true, type: point.tipo, date: dateBrazil(), now: point.horario,
            points: state.points, next_type: "ida_intervalo",
            expected_steps: ["entrada","ida_intervalo","volta_intervalo","saida"],
            carga_minutos: 480, usa_intervalo: true, justificativa: null,
            total_trabalhado_minutos: null, saldo_minutos: null, pendencia: null };
        }
      } else if (url.pathname === "/api/pontos/consultar") {
        data = { data: url.searchParams.get("data"), pontos: state.points };
      } else if (url.pathname === "/api/pontos/corrigir" && request.method === "POST") {
        let raw = "";
        for await (const part of request) raw += part;
        const change = JSON.parse(raw);
        const point = state.points.find(item => item.id === change.id);
        if (!point) { status = 409; data = { error: "Registro mudou." }; }
        else {
          if (change.acao === "editar") point.horario = change.horario;
          else state.points = state.points.filter(item => item.id !== change.id);
          data = { ok: true };
        }
      } else if (url.pathname === "/api/hoje") {
        data = { date: dateBrazil(), now: "09:00", points: state.points,
          next_type: state.points.length ? "ida_intervalo" : "entrada",
          expected_steps: ["entrada","ida_intervalo","volta_intervalo","saida"],
          carga_minutos: 480, usa_intervalo: true, justificativa: null,
          total_trabalhado_minutos: null, saldo_minutos: null, pendencia: null };
      } else if (url.pathname === "/api/historico") {
        data = { month: dateBrazil().slice(0, 7), days: [] };
      } else if (url.pathname === "/api/ajustes" && request.method === "GET") {
        data = { ajustes: state.adjustments, proximo_offset: null };
      } else if (url.pathname === "/api/ajustes" && request.method === "POST") {
        let raw = "";
        for await (const part of request) raw += part;
        const body = JSON.parse(raw);
        const [hours, minutes] = body.duracao.split(":").map(Number);
        const valor = (hours * 60 + minutes) * (body.tipo === "debito" ? -1 : 1);
        const item = { id: state.nextId++, data: body.data, minutos: valor,
          motivo: body.motivo, criado_em: new Date().toISOString() };
        state.adjustments.unshift(item); status = 201; data = { ok: true, id: item.id };
      } else if (/^\/api\/ajustes\/\d+$/.test(url.pathname)) {
        const id = Number(url.pathname.split("/").at(-1));
        const item = state.adjustments.find(row => row.id === id);
        if (!item) { status = 404; data = { error: "Ajuste não encontrado." }; }
        else if (request.method === "DELETE") {
          state.adjustments = state.adjustments.filter(row => row.id !== id);
          data = { ok: true };
        } else if (request.method === "PUT") {
          let raw = "";
          for await (const part of request) raw += part;
          const body = JSON.parse(raw);
          const [hours, minutes] = body.duracao.split(":").map(Number);
          item.data = body.data;
          item.minutos = (hours * 60 + minutes) * (body.tipo === "debito" ? -1 : 1);
          item.motivo = body.motivo;
          data = { ok: true, id };
        } else { status = 405; data = { error: "Método não permitido." }; }
      } else if (url.pathname === "/api/saldo") {
        const sum = state.adjustments.reduce((a, row) => a + row.minutos, 0);
        data = { saldo_total_minutos: sum, saldo_ajustes_minutos: sum, saldo_batidas_minutos: 0,
          faltas: 0, pendencias: 0, ajustes: state.adjustments.length };
      } else if (url.pathname === "/api/sair" && request.method === "POST") {
        state.authenticated = false; data = { ok: true };
      } else { status = 404; data = { error: "Rota não encontrada." }; }
      response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(data));
      return;
    }
    if (url.pathname === "/__pilot_smoke.js") {
      response.writeHead(200, { "Content-Type": "text/javascript" });
      response.end(script);
      return;
    }
    const filename = path.resolve(root, "." + (url.pathname === "/" ? "/index.html" : url.pathname));
    if (!filename.startsWith(root + path.sep)) {
      response.writeHead(404); response.end(); return;
    }
    try {
      let file = await fs.readFile(filename);
      if (filename.endsWith("/index.html")) {
        file = Buffer.from(file.toString().replace("</body>",
          '<script type="module" src="/__pilot_smoke.js"></script></body>'));
      }
      response.writeHead(200, { "Content-Type": (mime[path.extname(filename)] || "application/octet-stream") + "; charset=utf-8" });
      response.end(file);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return { server, port: server.address().port, requests };
}

async function browse(chrome, url, width, temp) {
  const args = ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
    "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check",
    "--disable-background-networking", "--window-size=" + width + ",860",
    "--user-data-dir=" + temp, "--virtual-time-budget=15000", "--dump-dom", url];
  return new Promise((resolve, reject) => {
    const child = spawn(chrome, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", buf => stdout += buf.toString().slice(0, 1024 * 1024));
    child.stderr.on("data", buf => stderr = (stderr + buf.toString()).slice(-3000));
    child.on("error", reject);
    child.on("exit", code => {
      if (code !== 0) return reject(new Error("Chrome saiu com código " + code + ": " + stderr.slice(-600)));
      const match = stdout.match(/<output id="__svelte_smoke">([^<]*)<\/output>/);
      if (!match) return reject(new Error("Svelte não retornou resultado no DOM: " + stdout.slice(-1200)));
      resolve(JSON.parse(match[1]));
    });
  });
}

test("Svelte 5 renderiza, autentica e navega em desktop/mobile sem API real", { timeout: 120000 }, async () => {
  const { server, port, requests } = await serve();
  try {
    const chrome = chromeBinary();
    for (const width of [1280, 390]) {
      const temp = await fs.mkdtemp(path.join(os.tmpdir(), "meus-pontos-svelte-"));
      try {
        const result = await browse(chrome, "http://127.0.0.1:" + port + "/", width, temp);
        assert.equal(result.ok, true, JSON.stringify(result));
        assert.equal(result.overflow, false, JSON.stringify(result));
        if (width === 390) assert.ok(result.width <= 600, JSON.stringify(result));
        if (width === 1280) assert.ok(result.width >= 800, JSON.stringify(result));
      } finally { await fs.rm(temp, { recursive: true, force: true }); }
    }
    assert.ok(requests.some(r => r.path === "/api/login" && r.method === "POST"));
    assert.ok(requests.some(r => r.path === "/api/pontos" && r.method === "POST"));
    assert.ok(requests.some(r => r.path === "/api/historico"));
    assert.ok(requests.some(r => r.path === "/api/saldo"));
    assert.ok(requests.some(r => r.path === "/api/pontos/consultar" && r.method === "GET"));
    assert.ok(requests.some(r => r.path === "/api/pontos/corrigir" && r.method === "POST"));
    assert.ok(requests.some(r => r.path === "/api/ajustes" && r.method === "POST"));
    assert.ok(requests.some(r => r.path.startsWith("/api/ajustes/") && r.method === "PUT"));
    assert.ok(requests.some(r => r.path.startsWith("/api/ajustes/") && r.method === "DELETE"));
  } finally { server.close(); }
});
