import test from "node:test";
import assert from "node:assert/strict";
import { auditWorkspace, buildDiagnosticReport, normalizeApiFailure } from "../public/mini-ai-supervision.js";

const day = () => ({ date: "2026-10-26", carga_minutos: 480, points: [], next_type: "entrada", pendencia: null });
const balance = () => ({ saldo_batidas_minutos: 20, saldo_ajustes_minutos: -5, saldo_total_minutos: 15, pendencias: 0, faltas: 0 });
const sample = () => ({ data: "2026-10-19", entrada: "06:50", ida_intervalo: "10:32",
  volta_intervalo: "12:29", saida: "16:40", carga_prevista: 480, pendencia: null, origem: "pontos" });

test("confere banco de horas sem recalcular nem alterar dados oficiais", () => {
  const d = day();
  const rows = [sample()];
  const b = balance();
  const before = JSON.stringify({ d, rows, b });
  const ok = auditWorkspace(d, rows, b);
  assert.deepEqual(ok.checked, { ponto: true, historico: true, banco: true });
  assert.ok(!ok.findings.some(item => item.code === "SALDO_DIVERGENTE"));
  b.saldo_total_minutos = 17;
  const changed = auditWorkspace(d, rows, b);
  assert.ok(changed.findings.some(item => item.code === "SALDO_DIVERGENTE" && item.severity === "alerta"));
  b.saldo_total_minutos = 15;
  assert.equal(JSON.stringify({ d, rows, b }), before);
});

test("verifica sequência e intervalo no histórico sem indicar datas individuais", () => {
  const ordered = sample();
  const reversed = { ...sample(), data: "2026-10-20", saida: "05:00" };
  const partial = { ...sample(), data: "2026-10-21", volta_intervalo: null };
  const result = auditWorkspace(day(), [ordered, reversed, partial], balance());
  assert.ok(result.findings.some(item => item.code === "HISTORICO_FORA_ORDEM" && item.count === 1));
  assert.ok(result.findings.some(item => item.code === "INTERVALO_PARCIAL" && item.count === 1));
  assert.ok(!JSON.stringify(result).includes("2026-10-21"));
});

test("respeita jornada com folga, justificativa e histórico insuficiente", () => {
  const rest = { date: "2026-10-25", carga_minutos: 0, points: [], next_type: null, pendencia: null };
  const justified = { ...sample(), pendencia: null, origem: "justificada", volta_intervalo: null };
  const result = auditWorkspace(rest, [justified], null);
  assert.equal(result.prediction, null);
  assert.ok(result.findings.some(item => item.code === "SALDO_INDISPONIVEL"));
  assert.ok(!result.findings.some(item => item.code === "INTERVALO_PARCIAL"));
});

test("indisponibilidade do histórico é explícita sem inventar saldo", () => {
  const report = auditWorkspace(day(), [], null, [], { history: false });
  assert.equal(report.checked.historico, false);
  assert.equal(report.checked.banco, false);
  assert.ok(report.findings.some(f => f.code === "HISTORICO_INDISPONIVEL"));
  assert.equal(report.prediction, null);
});

test("erros de API são classificados sem query string, corpos ou credenciais", () => {
  assert.equal(normalizeApiFailure("/api/login", 500), null);
  assert.equal(normalizeApiFailure("/api/sessao", 401), null);
  assert.equal(normalizeApiFailure("/api/ajustes/123?token=secreto", 0)?.area, "banco");
  assert.equal(normalizeApiFailure("/api/saldo", 401), null);
  assert.equal(normalizeApiFailure("/api/saldo", 200), null);
  assert.equal(normalizeApiFailure("https://outro.dominio/api/saldo", 500), null);
  const privatePath = "/api/historico?mes=2026-10&senha=NAO_COPIAR";
  const audit = auditWorkspace(day(), [sample()], balance(), [
    { path: privatePath, status: 503, senha: "SEGREDO_PESSOAL" },
    { path: privatePath, status: 503 },
    { path: "/api/ajustes/9?motivo=SEGREDO", status: 0 }
  ]);
  const report = buildDiagnosticReport(audit);
  const payload = JSON.stringify(report);
  assert.equal(report.metrics.api_failures, 3);
  assert.ok(report.findings.some(item => item.code === "API_ERRO" && item.count === 2 && item.http_status === 503));
  for (const secret of ["NAO_COPIAR", "SEGREDO", "SEGREDO_PESSOAL", "06:50", "2026-10-19"]) {
    assert.ok(!payload.includes(secret));
  }
});

test("relatório aceita apenas códigos conhecidos e ignora texto livre", () => {
  const audit = auditWorkspace(day(), [], balance());
  audit.findings.push({ code: "DESCONHECIDO", suggested_action: "senha=segredo" });
  audit.findings[0].suggested_action = "texto privado";
  audit.findings[0].area = "senha secreta";
  audit.findings[0].severity = "token privado";
  const report = buildDiagnosticReport(audit);
  assert.ok(!JSON.stringify(report).includes("senha=segredo"));
  assert.ok(!JSON.stringify(report).includes("texto privado"));
  assert.ok(!JSON.stringify(report).includes("senha secreta"));
  assert.ok(!JSON.stringify(report).includes("token privado"));
  assert.throws(() => buildDiagnosticReport(null), TypeError);
});

test("audita mês selecionado sem usá-lo no treinamento recente", () => {
  const oldMonth = Array.from({ length: 12 }, (_, i) => ({
    ...sample(), data: "2026-08-" + String(i + 1).padStart(2, "0"),
    pendencia: i === 0 ? "sem_saida" : null
  }));
  const result = auditWorkspace({ ...day(), usa_intervalo: true }, oldMonth, balance(), [], { history: true }, []);
  assert.equal(result.metrics.observed_days, 12);
  assert.equal(result.metrics.usable_training_days, 0);
  assert.equal(result.prediction, null);
  assert.ok(result.findings.some(x => x.code === "HISTORICO_PENDENTE" && x.count === 1));
});
