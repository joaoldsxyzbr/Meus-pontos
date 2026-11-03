import test from "node:test";
import assert from "node:assert/strict";
import { balanceSchema, historySchema, todaySchema } from "../frontend/src/lib/schemas.ts";

/**
 * Estes schemas protegem o navegador de mudanças silenciosas de contrato.
 * Um campo renomeado na API deve falhar aqui, não virar `undefined` na tela.
 */
const today = {
  date: "2026-11-02",
  now: "09:00",
  points: [{ tipo: "entrada", horario: "09:00" }],
  next_type: "ida_intervalo",
  expected_steps: ["entrada", "ida_intervalo", "volta_intervalo", "saida"],
  usa_intervalo: true,
  justificativa: null,
  carga_minutos: 480,
  total_trabalhado_minutos: null,
  saldo_minutos: null,
  pendencia: null
};

test("resposta válida do dia é aceita", () => {
  assert.equal(todaySchema.safeParse(today).success, true);
});

test("campo renomeado no dia é rejeitado em vez de virar undefined", () => {
  const { next_type: _renamed, ...withoutNext } = today;
  const result = todaySchema.safeParse({ ...withoutNext, proximo_tipo: "ida_intervalo" });
  assert.equal(result.success, false);
});

test("tipo de batida desconhecido é rejeitado", () => {
  const result = todaySchema.safeParse({
    ...today,
    points: [{ tipo: "ferias", horario: "09:00" }]
  });
  assert.equal(result.success, false);
});

test("horário fora do formato HH:MM é rejeitado", () => {
  const result = todaySchema.safeParse({ ...today, now: "9:00" });
  assert.equal(result.success, false);
});

test("saldo textual é rejeitado", () => {
  const result = balanceSchema.safeParse({
    saldo_batidas_minutos: "0",
    saldo_ajustes_minutos: 0,
    saldo_total_minutos: 0,
    pendencias: 0,
    faltas: 0,
    ajustes: 0
  });
  assert.equal(result.success, false);
});

test("histórico exige origem conhecida", () => {
  const day = {
    data: "2026-11-02",
    entrada: null,
    ida_intervalo: null,
    volta_intervalo: null,
    saida: null,
    total_trabalhado_minutos: null,
    carga_prevista: 480,
    saldo_minutos: null,
    origem: "folga_especial",
    pendencia: null
  };
  assert.equal(historySchema.safeParse({ month: "2026-11", days: [day] }).success, false);
  assert.equal(historySchema.safeParse({ month: "2026-11", days: [{ ...day, origem: "falta" }] }).success, true);
});

test("schema é compatível com z.ZodType (uso em api())", () => {
  assert.equal(typeof todaySchema.safeParse, "function");
  assert.equal(typeof balanceSchema.safeParse, "function");
});
