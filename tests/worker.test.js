import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";
import { brazilNow } from "../src/logic.js";

const KEY = "chave-de-teste-1234567890-abcdefghijklmnopqrstuvwxyz";
const ORIGIN = "https://pontos.exemplo.com";
function fixture() {
  const date = brazilNow().date;
  const points = [{ tipo: "entrada", horario: "06:44" }, { tipo: "ida_intervalo", horario: "11:07" }, { tipo: "volta_intervalo", horario: "12:54" }];
  let inserted = 0;
  const DB = {
    prepare(sql) {
      let params = [];
      return {
        bind(...args) { params = args; return this; },
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
  return { DB, PONTO_API_KEY: KEY, ASSETS: { fetch: async () => new Response("ok") }, points, get inserted() { return inserted; } };
}
function request(path, method = "GET", body, key = KEY, origin = ORIGIN) {
  return new Request(ORIGIN + path, { method, headers: { Authorization: "Bearer " + key, ...(body ? { "Content-Type": "application/json", Origin: origin } : {}) }, body: body ? JSON.stringify(body) : undefined });
}
test("API nega acesso sem chave forte e sem autorização", async () => {
  const env = fixture();
  delete env.PONTO_API_KEY;
  assert.equal((await worker.fetch(request("/api/hoje"), env)).status, 503);
  env.PONTO_API_KEY = KEY;
  assert.equal((await worker.fetch(request("/api/hoje", "GET", null, "errada"), env)).status, 401);
});
test("API consulta as três telas sem modificar banco", async () => {
  const env = fixture();
  const today = await worker.fetch(request("/api/hoje"), env);
  assert.equal(today.status, 200);
  assert.equal((await today.json()).next_type, "saida");
  const history = await worker.fetch(request("/api/historico?mes=2026-10"), env);
  assert.equal(history.status, 200);
  const saldo = await worker.fetch(request("/api/saldo"), env);
  assert.equal((await saldo.json()).saldo_total_minutos, 33);
  assert.equal(env.inserted, 0);
});
test("API registra saída uma vez e impede duplicidade", async () => {
  const env = fixture();
  const post = await worker.fetch(request("/api/pontos", "POST", { horario: "17:04" }), env);
  assert.equal(post.status, 201);
  const data = await post.json();
  assert.equal(data.type, "saida");
  assert.equal(data.next_type, null);
  assert.equal(env.points[3].horario, "17:04");
  const again = await worker.fetch(request("/api/pontos", "POST", { horario: "17:05" }), env);
  assert.equal(again.status, 409);
  assert.equal(env.inserted, 1);
});
test("API bloqueia origem externa, formatos errados e hora regressiva", async () => {
  const env = fixture();
  assert.equal((await worker.fetch(request("/api/pontos", "POST", { horario: "17:04" }, KEY, "https://externo.com"), env)).status, 403);
  assert.equal((await worker.fetch(request("/api/pontos", "POST", { horario: "24:15" }), env)).status, 400);
  assert.equal((await worker.fetch(request("/api/pontos", "POST", { horario: "11:00" }), env)).status, 400);
  assert.equal(env.inserted, 0);
});
test("Assets são servidos com CSP", async () => {
  const res = await worker.fetch(new Request(ORIGIN + "/"), fixture());
  assert.equal(res.status, 200);
  assert.ok(res.headers.get("Content-Security-Policy").includes("script-src 'self'"));
});
