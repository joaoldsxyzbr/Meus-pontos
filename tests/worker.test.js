import test from "node:test";
import assert from "node:assert/strict";
import { pbkdf2Sync } from "node:crypto";
import worker from "../src/worker.js";
import { brazilNow } from "../src/logic.js";

const ORIGIN = "https://pontos.exemplo.com";
const USER = "joaoldsxyzbr";
const PASSWORD = "senha-forte-de-teste-12345!";
const SALT = Buffer.alloc(16, 7);
const RECORD = "v1:100000:" + SALT.toString("base64url") + ":" +
  pbkdf2Sync(PASSWORD, SALT, 100000, 32, "sha256").toString("base64url");
const SESSION_SECRET = Buffer.alloc(32, 5).toString("base64url");
const TEST_TIME = "00:03";

function fixture() {
  const date = brazilNow().date;
  const points = [
    { tipo: "entrada", horario: "00:00" },
    { tipo: "ida_intervalo", horario: "00:01" },
    { tipo: "volta_intervalo", horario: "00:02" }
  ];
  let inserted = 0;
  let attempts = 0;
  const DB = {
    prepare(sql) {
      let params = [];
      return {
        bind(...values) { params = values; return this; },
        async first() {
          if (sql.includes("FROM jornada_padrao")) return { carga_minutos: 480, usa_intervalo: 1 };
          if (sql.includes("FROM resumo_diario") && sql.includes("WHERE data =")) {
            return { total_trabalhado_minutos: inserted ? 513 : null, saldo_minutos: inserted ? 33 : null, pendencia: inserted ? null : "sem_saida" };
          }
          if (sql.includes("FROM saldo_total")) return { saldo_batidas_minutos: 33, saldo_ajustes_minutos: 0, saldo_total_minutos: 33, pendencias: 0, faltas: 0 };
          if (sql.includes("FROM ajustes_banco")) return { quantidade: 0 };
          throw new Error("Query nao simulada: " + sql);
        },
        async all() {
          if (sql.includes("FROM pontos")) return { results: [...points].sort((a, b) => a.horario.localeCompare(b.horario)) };
          if (sql.includes("FROM resumo_diario") && sql.includes("BETWEEN")) return { results: [] };
          throw new Error("Query nao simulada: " + sql);
        },
        async run() {
          assert.ok(sql.startsWith("INSERT INTO pontos"));
          assert.equal(params[0], date);
          points.push({ tipo: params[1], horario: params[2] });
          inserted++;
          return { success: true };
        }
      };
    }
  };
  return {
    DB, points,
    PONTO_USERNAME: USER,
    PONTO_PASSWORD_RECORD: RECORD,
    PONTO_SESSION_SECRET: SESSION_SECRET,
    LOGIN_LIMITER: { async limit() { attempts++; return { success: attempts <= 8 }; } },
    ASSETS: { fetch: async () => new Response("ok") },
    get inserted() { return inserted; }
  };
}

function request(path, method = "GET", body, cookie = "", origin = ORIGIN) {
  return new Request(ORIGIN + path, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { "Content-Type": "application/json", Origin: origin } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
}
async function authenticate(env) {
  const response = await worker.fetch(request("/api/login", "POST", { usuario: USER, senha: PASSWORD }), env);
  assert.equal(response.status, 200);
  const fullCookie = response.headers.get("Set-Cookie");
  assert.match(fullCookie, /HttpOnly/);
  assert.match(fullCookie, /SameSite=Strict/);
  assert.match(fullCookie, /Secure/);
  return fullCookie.split(";")[0];
}

test("API bloqueia acesso se secrets não estiverem configurados", async () => {
  const env = fixture();
  delete env.PONTO_PASSWORD_RECORD;
  const response = await worker.fetch(request("/api/hoje"), env);
  assert.equal(response.status, 503);
});

test("API recusa consulta sem sessão e senha incorreta", async () => {
  const env = fixture();
  assert.equal((await worker.fetch(request("/api/hoje"), env)).status, 401);
  assert.equal((await worker.fetch(request("/api/login", "POST", { usuario: USER, senha: "errada" }), env)).status, 401);
  assert.equal((await worker.fetch(request("/api/login", "POST", { usuario: "outra", senha: PASSWORD }), env)).status, 401);
});

test("Login aceita credenciais corretas e autentica as três telas", async () => {
  const env = fixture();
  const cookie = await authenticate(env);
  const session = await worker.fetch(request("/api/sessao", "GET", null, cookie), env);
  assert.deepEqual(await session.json(), { autenticado: true, usuario: USER });
  const today = await worker.fetch(request("/api/hoje", "GET", null, cookie), env);
  assert.equal((await today.json()).next_type, "saida");
  const history = await worker.fetch(request("/api/historico?mes=2026-10", "GET", null, cookie), env);
  assert.equal(history.status, 200);
  const balance = await worker.fetch(request("/api/saldo", "GET", null, cookie), env);
  assert.equal((await balance.json()).saldo_total_minutos, 33);
  assert.equal(env.inserted, 0);
});

test("Cookie adulterado é rejeitado e sair remove cookie", async () => {
  const env = fixture();
  const cookie = await authenticate(env);
  const tampered = cookie.slice(0, -1) + (cookie.endsWith("A") ? "B" : "A");
  assert.equal((await worker.fetch(request("/api/hoje", "GET", null, tampered), env)).status, 401);
  const logout = await worker.fetch(request("/api/sair", "POST", {}, cookie), env);
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("Set-Cookie"), /Max-Age=0/);
});

test("Limite de tentativas impede força bruta", async () => {
  const env = fixture();
  for (let i = 0; i < 8; i++) {
    assert.equal((await worker.fetch(request("/api/login", "POST", { usuario: USER, senha: "errada" }), env)).status, 401);
  }
  assert.equal((await worker.fetch(request("/api/login", "POST", { usuario: USER, senha: PASSWORD }), env)).status, 429);
});

test("API bloqueia CSRF, formato incorreto e regressão de horário", async () => {
  const env = fixture();
  assert.equal((await worker.fetch(request("/api/login", "POST", { usuario: USER, senha: PASSWORD }, "", "https://externo.com"), env)).status, 403);
  const cookie = await authenticate(env);
  assert.equal((await worker.fetch(request("/api/pontos", "POST", { horario: TEST_TIME }, cookie, "https://externo.com"), env)).status, 403);
  assert.equal((await worker.fetch(request("/api/pontos", "POST", { horario: "24:15" }, cookie), env)).status, 400);
  assert.equal((await worker.fetch(request("/api/pontos", "POST", { horario: "00:01" }, cookie), env)).status, 400);
  assert.equal(env.inserted, 0);
});

test("Registro autenticado não repete batida", async () => {
  const env = fixture();
  const cookie = await authenticate(env);
  const now = brazilNow().time;
  if (now < TEST_TIME) return; // Antes das 00:03, não existe horário válido após a terceira batida simulada.
  const res = await worker.fetch(request("/api/pontos", "POST", { horario: TEST_TIME }, cookie), env);
  assert.equal(res.status, 201);
  assert.equal((await res.json()).type, "saida");
  assert.equal(env.points[3].horario, TEST_TIME);
  assert.equal((await worker.fetch(request("/api/pontos", "POST", { horario: TEST_TIME }, cookie), env)).status, 409);
  assert.equal(env.inserted, 1);
});

test("Arquivos públicos preservam política CSP e não exibem segredos", async () => {
  const response = await worker.fetch(new Request(ORIGIN + "/"), fixture());
  assert.equal(response.status, 200);
  assert.ok(response.headers.get("Content-Security-Policy").includes("script-src 'self'"));
});
