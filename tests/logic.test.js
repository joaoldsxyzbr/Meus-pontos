import test from "node:test";
import assert from "node:assert/strict";
import { brazilNow, weekday, nextType, validTime, validMonth } from "../src/logic.js";

test("Brasília usa data e horário locais", () => {
  assert.deepEqual(brazilNow(new Date("2026-10-20T20:35:00Z")), { date: "2026-10-20", time: "17:35" });
  assert.deepEqual(brazilNow(new Date("2026-10-21T01:00:00Z")), { date: "2026-10-20", time: "22:00" });
});
test("Semana segue numeração SQLite: domingo 0 e sábado 6", () => {
  assert.equal(weekday("2026-10-20"), 2);
  assert.equal(weekday("2026-10-24"), 6);
  assert.equal(weekday("2026-10-25"), 0);
});
test("Próxima batida na jornada com intervalo", () => {
  const rows = [{ tipo: "entrada" }, { tipo: "ida_intervalo" }, { tipo: "volta_intervalo" }];
  assert.equal(nextType([], true, 480), "entrada");
  assert.equal(nextType(rows, true, 480), "saida");
  assert.equal(nextType([...rows, { tipo: "saida" }], true, 480), null);
  assert.equal(nextType([{ tipo: "saida" }], true, 480), null);
});
test("Sábado possui entrada e saída, folga sem batida", () => {
  assert.equal(nextType([], false, 240), "entrada");
  assert.equal(nextType([{ tipo: "entrada" }], false, 240), "saida");
  assert.equal(nextType([{ tipo: "entrada" }, { tipo: "saida" }], false, 240), null);
  assert.equal(nextType([], false, 0), null);
});
test("Validações de horários e mês", () => {
  for (const value of ["00:00", "06:44", "17:04", "23:59"]) assert.equal(validTime(value), true);
  for (const value of ["6:44", "24:00", "17:99", "12:00:00", "", null]) assert.equal(validTime(value), false);
  assert.equal(validMonth("2026-10"), true);
  assert.equal(validMonth("2026-13"), false);
  assert.equal(validMonth("2026-2"), false);
});
