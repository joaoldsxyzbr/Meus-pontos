import test from "node:test";
import assert from "node:assert/strict";
import { analyzeAttendance } from "../public/mini-ai.js";
import worker from "../src/worker.js";

const format = n => String(Math.floor(n / 60)).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0");
function journey(date, interval = true, offset = 0) {
  const row = { data: date, entrada: format(410 + offset), saida: format(interval ? 1020 + offset : 650 + offset),
    ida_intervalo: interval ? format(630 + offset) : null,
    volta_intervalo: interval ? format(740 + offset) : null,
    carga_prevista: interval ? 480 : 240, pendencia: null, origem: "pontos" };
  return row;
}
function datesBefore(iso, count, weekday) {
  const result = [];
  const target = Date.parse(iso + "T12:00:00Z");
  for (let offset = 1; result.length < count && offset < 200; offset++) {
    const date = new Date(target - offset * 86400000);
    if (date.getUTCDay() === weekday) result.push(date.toISOString().slice(0, 10));
  }
  return result.reverse();
}
function mondayToFridayBefore(iso, count) {
  const result = [];
  const target = Date.parse(iso + "T12:00:00Z");
  for (let offset = 1; result.length < count; offset++) {
    const d = new Date(target - offset * 86400000);
    if (d.getUTCDay() >= 1 && d.getUTCDay() <= 5) result.push(d.toISOString().slice(0,10));
  }
  return result.reverse();
}
const today = (date, interval, next = "entrada") => ({
  date, carga_minutos: interval ? 480 : 240, usa_intervalo: interval, points: [], next_type: next, pendencia: null
});

test("não treina com jornadas posteriores ao dia consultado", () => {
  const future = mondayToFridayBefore("2026-12-30", 20).map((date,i) => journey(date,true,i%3));
  const result = analyzeAttendance(today("2026-10-26",true), future);
  assert.equal(result.training_days,0);
  assert.equal(result.prediction,null);
});

test("não mistura escala sem intervalo com saídas de jornadas com intervalo", () => {
  const normal = mondayToFridayBefore("2026-10-26", 24).map((date,i)=>journey(date,true,i%3));
  const result = analyzeAttendance(today("2026-10-26",false,"saida"), normal);
  assert.equal(result.training_days,0);
  assert.equal(result.prediction,null);
});

test("não mistura sábado de quatro horas e jornada completa nos exemplos", () => {
  const weekdays = mondayToFridayBefore("2026-10-26", 26).map((date,i)=>journey(date,true,i%3));
  const saturdays = datesBefore("2026-10-26", 4, 6).map(date=>journey(date,false));
  const result = analyzeAttendance(today("2026-10-24",false), [...weekdays,...saturdays]);
  assert.equal(result.training_days,3);
  assert.equal(result.prediction,null);
});

test("valida rede neural com holdout e compara baseline antes da previsão", () => {
  const days = mondayToFridayBefore("2026-10-26", 28).map((date,i)=>journey(date,true,i%3));
  const result = analyzeAttendance(today("2026-10-26",true), days);
  assert.equal(result.training_days,28);
  assert.ok(Number.isInteger(result.validation_mae_minutes));
  assert.ok(Number.isInteger(result.validation_baseline_mae_minutes));
  assert.ok(result.validation_samples >= 3);
  if(result.prediction) {
    assert.ok(result.validation_mae_minutes <= result.validation_baseline_mae_minutes + 5);
    assert.equal(result.prediction.type,"entrada");
  }
});

test("sem previsão se batidas atuais já forem inconsistentes", () => {
  const history = mondayToFridayBefore("2026-10-26",28).map((date,i)=>journey(date,true,i%3));
  const day = { ...today("2026-10-26",true,"saida"), points: [
    { tipo: "entrada", horario: "12:00" },
    { tipo: "ida_intervalo", horario: "10:30" },
    { tipo: "volta_intervalo", horario: "12:20" }
  ] };
  const result = analyzeAttendance(day,history);
  assert.ok(result.findings.some(x=>x.code==="SEQUENCIA_INCONSISTENTE"));
  assert.equal(result.prediction,null);
});
