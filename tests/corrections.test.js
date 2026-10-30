import test from "node:test";
import assert from "node:assert/strict";
import { correctionsApi } from "../src/corrections.js";
import { brazilNow } from "../src/logic.js";

const origin = "https://pontos.example";
const today = brazilNow().date;
const url = path => new URL(origin + path);
const request = (path, body) => new Request(origin + path, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
});
const correction = (overrides = {}) => ({
  id: 2, data: today, acao: "editar", horario_anterior: "12:00",
  horario: "12:15", motivo: "Correção aprovada", ...overrides
});
function fixture() {
  let transactions = 0;
  const rows = [
    {id:1,data:today,tipo:"entrada",horario:"09:00"},
    {id:2,data:today,tipo:"ida_intervalo",horario:"12:00"},
    {id:3,data:today,tipo:"volta_intervalo",horario:"13:00"}
  ];
  const env = { DB: {
    prepare() { return {bind(){return this},async all(){return {results:rows}}} },
    async batch(items){ assert.equal(items.length,2); transactions++; return [{meta:{changes:1}},{meta:{changes:1}}] }
  }};
  return {env,get transactions(){return transactions}};
}
test("Consulta de batidas mostra id, data, tipo e horário", async () => {
  const f = fixture();
  const path = "/api/pontos/consultar?data=" + today;
  const res = await correctionsApi(new Request(origin+path),f.env,url(path));
  assert.equal(res.status,200);
  assert.equal((await res.json()).pontos.length,3);
});
test("Correções recusam horário inválido, motivo vazio e estado obsoleto", async () => {
  const f=fixture();
  for(const item of [correction({horario:"08:00"}),correction({motivo:""}),
    correction({horario_anterior:"11:00"}),correction({data:"2999-01-01"})]) {
    const res=await correctionsApi(request("/api/pontos/corrigir",item),f.env,url("/api/pontos/corrigir"));
    assert.ok(res.status>=400);
  }
  assert.equal(f.transactions,0);
  const result=await correctionsApi(request("/api/pontos/corrigir",correction()),f.env,url("/api/pontos/corrigir"));
  assert.equal(result.status,200);
  assert.equal(f.transactions,1);
});
test("Exclusão de batida permite somente a última do dia", async () => {
  const f=fixture();
  let res=await correctionsApi(request("/api/pontos/corrigir",correction({acao:"excluir"})),f.env,url("/api/pontos/corrigir"));
  assert.equal(res.status,409);
  res=await correctionsApi(request("/api/pontos/corrigir",correction({
    acao:"excluir",id:3,horario_anterior:"13:00"
  })),f.env,url("/api/pontos/corrigir"));
  assert.equal(res.status,200);
  assert.equal(f.transactions,1);
});
test("Retificação sem API de auditoria não expõe motivo", async () => {
  const f=fixture();
  const res=await correctionsApi(new Request(origin+"/api/pontos/consultar?data=2025-02-30"),
    f.env,url("/api/pontos/consultar?data=2025-02-30"));
  assert.equal(res.status,400);
});
