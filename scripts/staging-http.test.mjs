import test from "node:test";
import assert from "node:assert/strict";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";

const runFile = promisify(execFile);
const wrangler = path.resolve("node_modules/wrangler/bin/wrangler.js");
const config = "wrangler.staging.jsonc";
const dbName = "meus-pontos-homologacao-20261030";
const fakeUser = "teste-local";
const fakePassword = "senha-sintetica-apenas-para-ci";
const born = () => {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date()).map(p => [p.type, p.value]));
  return values.year + "-" + values.month + "-" + values.day;
};

function lockedConfig() {
  return readFile(config, "utf8").then(text => {
    const data = JSON.parse(text);
    const expectedId = "bdaf9799-efc1-4f69-b497-c69f3ee39b0b";
    if (data.name !== "meus-pontos-homologacao" ||
        data.workers_dev !== false || data.preview_urls !== false ||
        data.routes || data.route ||
        data.d1_databases?.length !== 1 ||
        data.d1_databases[0].database_id !== expectedId ||
        data.d1_databases[0].database_name !== dbName) {
      throw new Error("Configuração do staging não é isolada. Teste abortado.");
    }
    return data;
  });
}

function localEnv() {
  const env = { ...process.env, NO_COLOR: "1", CI: "1",
    WRANGLER_SEND_METRICS: "false" };
  // Os processos jamais recebem permissão ou token de acesso à nuvem.
  for (const key of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_API_KEY", "CLOUDFLARE_EMAIL", "CF_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_TOKEN"]) delete env[key];
  return env;
}

async function port() {
  const sock = createServer();
  await new Promise(resolve => sock.listen(0, "127.0.0.1", resolve));
  const chosen = sock.address().port;
  await new Promise(resolve => sock.close(resolve));
  return chosen;
}

async function invoke(args) {
  try {
    await runFile(process.execPath, [wrangler, ...args], {
      env: localEnv(), timeout: 60000, maxBuffer: 1024 * 1024
    });
  } catch (error) {
    throw new Error("Falha no Wrangler LOCAL: " +
      String(error.stderr || error.message).slice(-1300));
  }
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function awaitReady(url, proc, output) {
  for (let n = 0; n < 120; n++) {
    if (proc.exitCode !== null) throw new Error("workerd finalizou: " + output().slice(-1500));
    try {
      const response = await fetch(url + "/api/sessao",
        { signal: AbortSignal.timeout(1000), cache: "no-store" });
      if (response.status === 401) return;
    } catch { /* Esperar o Wrangler iniciar. */ }
    await delay(250);
  }
  throw new Error("workerd local não iniciou: " + output().slice(-1500));
}

test("API real + Svelte staging com D1 isolado, via HTTP em workerd local", {
  timeout: 180000
}, async () => {
  await lockedConfig();
  const temp = await mkdtemp(path.join(os.tmpdir(), "meus-pontos-e2e-"));
  const persist = path.join(temp, "database");
  let processWorker;
  let processClosed;
  let stderr = "";
  try {
    const day = born();
    const fixtures = await readFile("tests/fixtures/d1-base.sql", "utf8");
    const migration = await readFile("migrations/0001_integridade_e_auditoria.sql", "utf8");
    const seed = [
      "INSERT INTO config(chave,valor) VALUES ('inicio_contagem','" + day + "');",
      ...Array.from({ length: 7 }, (_, weekday) =>
        "INSERT INTO jornada_padrao(dia_semana,carga_minutos,usa_intervalo) VALUES (" +
        weekday + ",480,1);")
    ].join("\n");
    const sqlFile = path.join(temp, "fixture.sql");
    await writeFile(sqlFile, fixtures + "\n" + migration + "\n" + seed + "\n");

    // Todas as operações D1 são explicitamente --local, com diretório efêmero.
    await invoke(["d1", "execute", dbName, "--local", "--config", config,
      "--persist-to", persist, "--file", sqlFile, "--yes"]);

    const salt = randomBytes(16);
    const secret = randomBytes(32);
    const passwordRecord = "v1:100000:" + salt.toString("base64url") + ":" +
      pbkdf2Sync(fakePassword, salt, 100000, 32, "sha256").toString("base64url");
    const localPort = await port();
    const url = "http://127.0.0.1:" + localPort;
    processWorker = spawn(process.execPath, [wrangler, "dev", "--local",
      "--config", config, "--ip", "127.0.0.1", "--port", String(localPort),
      "--persist-to", persist,
      "--var", "PONTO_USERNAME:" + fakeUser,
      "--var", "PONTO_PASSWORD_RECORD:" + passwordRecord,
      "--var", "PONTO_SESSION_SECRET:" + secret.toString("base64url")], {
      env: localEnv(), stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32"
    });
    processClosed = new Promise(resolve => processWorker.once("exit", resolve));
    processWorker.stdout.on("data", chunk => {
      stderr = (stderr + chunk.toString()).slice(-3500);
    });
    processWorker.stderr.on("data", chunk => {
      stderr = (stderr + chunk.toString()).slice(-3500);
    });
    await awaitReady(url, processWorker, () => stderr);

    async function call(route, { method = "GET", body, cookie, origin } = {}) {
      const headers = {};
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (cookie) headers.Cookie = cookie;
      if (method !== "GET") headers.Origin = origin || url;
      const response = await fetch(url + route, {
        method, headers, cache: "no-store",
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const data = (response.headers.get("Content-Type") || "").includes("application/json")
        ? await response.json() : null;
      return { response, data };
    }

    const doc = await fetch(url + "/");
    assert.equal(doc.status, 200);
    assert.equal(doc.headers.get("X-Robots-Tag"), "noindex, nofollow, noarchive");
    assert.equal(doc.headers.get("Cache-Control"), "no-store");
    const html = await doc.text();
    assert.match(html, /manifest\.webmanifest/);
    assert.match(html, /\/assets\/index-[\w-]+\.js/);
    const script = html.match(/\/assets\/index-[\w-]+\.js/)[0];
    assert.equal((await fetch(url + script)).status, 200);
    const serviceWorker = await fetch(url + "/sw.js");
    assert.equal(serviceWorker.status, 200);
    assert.equal(serviceWorker.headers.get("Cache-Control"), "no-store");
    assert.doesNotMatch(await serviceWorker.text(), /"\/api\/login"/);

    assert.equal((await call("/api/hoje")).response.status, 401);
    assert.equal((await call("/api/login", {
      method: "POST", body: { usuario: fakeUser, senha: "senha-errada" }
    })).response.status, 401);

    const logged = await call("/api/login", {
      method: "POST", body: { usuario: fakeUser, senha: fakePassword }
    });
    assert.equal(logged.response.status, 200, JSON.stringify(logged.data));
    assert.match(logged.response.headers.get("Set-Cookie") || "", /HttpOnly/);
    assert.match(logged.response.headers.get("Set-Cookie") || "", /SameSite=Strict/);
    const cookie = logged.response.headers.get("Set-Cookie").split(";")[0];
    assert.equal((await call("/api/sessao", { cookie })).data.autenticado, true);

    const csrf = await call("/api/pontos", {
      method: "POST", cookie, origin: "https://externo.invalid",
      body: { data: day, tipo: "entrada", horario: "09:00" }
    });
    assert.equal(csrf.response.status, 403);

    const points = [
      ["entrada", "09:00"], ["ida_intervalo", "12:00"],
      ["volta_intervalo", "13:00"], ["saida", "18:00"]
    ];
    for (const [tipo, horario] of points) {
      const answer = await call("/api/pontos", { method: "POST", cookie,
        body: { data: day, tipo, horario } });
      assert.equal(answer.response.status, 201, JSON.stringify(answer.data));
    }
    assert.equal((await call("/api/hoje", { cookie })).data.saldo_minutos, 0);

    const duplicate = await call("/api/pontos", {
      method: "POST", cookie, body: { data: day, tipo: "entrada", horario: "09:00" }
    });
    assert.equal(duplicate.response.status, 409);

    const queried = await call("/api/pontos/consultar?data=" + day, { cookie });
    assert.equal(queried.data.pontos.length, 4);
    const last = queried.data.pontos.find(p => p.tipo === "saida");
    const change = await call("/api/pontos/corrigir", {
      method: "POST", cookie,
      body: { id: last.id, data: day, acao: "editar", horario_anterior: "18:00",
        horario: "17:30", motivo: "Teste HTTP local com auditoria" }
    });
    assert.equal(change.response.status, 200, JSON.stringify(change.data));
    assert.equal((await call("/api/hoje", { cookie })).data.saldo_minutos, -30);

    const adjustment = await call("/api/ajustes", { method: "POST", cookie,
      body: { data: day, tipo: "credito", duracao: "01:30",
        motivo: "Ajuste sintético HTTP" } });
    assert.equal(adjustment.response.status, 201, JSON.stringify(adjustment.data));
    assert.equal((await call("/api/saldo", { cookie })).data.saldo_ajustes_minutos, 90);
    const items = (await call("/api/ajustes?offset=0", { cookie })).data.ajustes;
    assert.equal(items.length, 1);
    assert.equal(items[0].id, adjustment.data.id);
    const updated = await call("/api/ajustes/" + adjustment.data.id, {
      method: "PUT", cookie,
      body: { data: day, tipo: "debito", duracao: "00:30",
        motivo: "Ajuste modificado no teste" }
    });
    assert.equal(updated.response.status, 200);
    assert.equal((await call("/api/saldo", { cookie })).data.saldo_ajustes_minutos, -30);
    assert.equal((await call("/api/ajustes/" + adjustment.data.id, {
      method: "DELETE", cookie
    })).response.status, 200);
    assert.equal((await call("/api/saldo", { cookie })).data.saldo_ajustes_minutos, 0);
    assert.equal((await call("/api/sair", { method: "POST", cookie })).response.status, 200);

    console.log("Homologação HTTP local aprovada: Svelte, SW, sessão, 4 batidas, " +
      "conflito, correção e ajustes; D1 local efêmero.");
  } finally {
    if (processWorker && processWorker.exitCode === null) {
      if (process.platform !== "win32") {
        try { process.kill(-processWorker.pid, "SIGTERM"); }
        catch { processWorker.kill("SIGTERM"); }
      } else processWorker.kill("SIGTERM");
      await Promise.race([processClosed, delay(5000)]);
    }
    await rm(temp, { recursive: true, force: true });
  }
});
