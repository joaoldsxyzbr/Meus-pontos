import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { adjustmentsApi } from "../src/adjustments.js";

const makeEnv = () => {
  const calls = [];
  const env = { DB: { prepare(sql) {
    const statement = {
      bind(...params) { calls.push({ sql, params }); return statement; },
      async all() { return { results: [{ id: 1, data: "2026-10-20", minutos: 45, motivo: "Acerto" }] }; },
      async run() { return { meta: { last_row_id: 99, changes: 1 } }; }
    };
    return statement;
  } } };
  return { env, calls };
};
const url = (path) => new URL("https://ponto.example" + path);
const body = { data: "2026-10-20", duracao: "01:15", tipo: "credito", motivo: "Correção aprovada" };
const request = (path, method, data) => new Request("https://ponto.example" + path, {
  method, headers: data ? { "Content-Type": "application/json" } : undefined,
  body: data ? JSON.stringify(data) : undefined
});

test("API permite consultar, incluir, editar e excluir ajustes", async () => {
  const { env, calls } = makeEnv();
  const get = await adjustmentsApi(request("/api/ajustes", "GET"), env, url("/api/ajustes"));
  assert.equal(get.status, 200);
  assert.equal((await get.json()).ajustes.length, 1);
  const post = await adjustmentsApi(request("/api/ajustes", "POST", body), env, url("/api/ajustes"));
  assert.equal(post.status, 201);
  assert.ok(calls.some(c => c.sql.startsWith("INSERT") && c.params[1] === 75));
  const put = await adjustmentsApi(request("/api/ajustes/2", "PUT", { ...body, tipo: "debito" }), env, url("/api/ajustes/2"));
  assert.equal(put.status, 200);
  assert.ok(calls.some(c => c.sql.startsWith("UPDATE") && c.params[1] === -75 && c.params[3] === 2));
  const del = await adjustmentsApi(request("/api/ajustes/2", "DELETE"), env, url("/api/ajustes/2"));
  assert.equal(del.status, 200);
  assert.ok(calls.some(c => c.sql.startsWith("DELETE") && c.params[0] === 2));
});

test("API bloqueia ajuste inválido", async () => {
  const { env } = makeEnv();
  const future = await adjustmentsApi(request("/api/ajustes", "POST", { ...body, data: "2999-01-01" }), env, url("/api/ajustes"));
  assert.equal(future.status, 400);
  const badId = await adjustmentsApi(request("/api/ajustes/9999999999999999999999", "DELETE"), env, url("/api/ajustes/9999999999999999999999"));
  assert.equal(badId.status, 400);
  const noRoute = await adjustmentsApi(request("/api/nada", "GET"), env, url("/api/nada"));
  assert.equal(noRoute, null);
});

test("Scripts adicionais passam na verificação de sintaxe nativa", () => {
  for (const path of ["src/adjustments.js"]) {
    const run = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
    assert.equal(run.status, 0, path + ": " + run.stderr);
  }
});

test("Ajustes são paginados, com validação do deslocamento", async () => {
  const {env, calls} = makeEnv();
  const res = await adjustmentsApi(request("/api/ajustes?offset=100", "GET"), env, url("/api/ajustes?offset=100"));
  assert.equal(res.status, 200);
  assert.ok(calls.some(x => x.sql.includes("LIMIT 101 OFFSET ?") && x.params[0] === 100));
  assert.equal((await adjustmentsApi(request("/api/ajustes?offset=-1", "GET"), env, url("/api/ajustes?offset=-1"))).status, 400);
});
