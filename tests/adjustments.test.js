import test from "node:test";
import assert from "node:assert/strict";
import { parseAdjustment, validAdjustmentDate } from "../src/logic.js";
const today = "2026-10-21";
const valid = { data: "2026-10-20", tipo: "credito", duracao: "01:30", motivo: "Correção de saldo" };
test("Créditos e descontos geram minutos assinados", () => {
  assert.deepEqual(parseAdjustment(valid, today), { data: "2026-10-20", minutos: 90, motivo: "Correção de saldo" });
  assert.deepEqual(parseAdjustment({ ...valid, tipo: "debito", duracao: "00:45" }, today), { data: "2026-10-20", minutos: -45, motivo: "Correção de saldo" });
  assert.equal(parseAdjustment({ ...valid, duracao: "00:00" }, today), null);
  assert.equal(parseAdjustment({ ...valid, duracao: "999:59" }, today)?.minutos, 59999);
});
test("Ajustes inválidos são rejeitados", () => {
  for(const duracao of ["-01:00", "01:60", "1:5", "1000:00", "", null])
    assert.equal(parseAdjustment({ ...valid, duracao }, today), null);
  for(const tipo of ["outro", "", null])
    assert.equal(parseAdjustment({ ...valid, tipo }, today), null);
  for(const motivo of ["", " ", "a", "a".repeat(201), "in\nvalido"])
    assert.equal(parseAdjustment({ ...valid, motivo }, today), null);
  assert.equal(parseAdjustment({ ...valid, data: "2026-10-22" }, today), null);
});
test("Datas seguem calendário real", () => {
  assert.equal(validAdjustmentDate("2024-02-29", today), true);
  for(const date of ["2026-02-29", "2026-02-30", "2026-13-01", "2026-00-01", "2026-10-22", "1999-12-31", "2026-1-02"])
    assert.equal(validAdjustmentDate(date, today), false, date);
});
