import test from "node:test";
import assert from "node:assert/strict";

class MockElement extends EventTarget {
  constructor() { super(); this.dataset = {}; this.children = []; this.textContent = ""; this.disabled = false; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
}
async function until(predicate, label, maxMs = 2000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > maxMs) throw new Error("Timeout: " + label);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

test("integra três leituras, audita mês anterior e copia diagnóstico sem gravar", async () => {
  const ids = ["mini-ai-status", "mini-ai-detail", "mini-ai-findings", "mini-ai-analyze", "mini-ai-copy"];
  const elements = new Map(ids.map(id => [id, new MockElement()]));
  let copied = null;
  const requests = [];
  globalThis.window = new EventTarget();
  globalThis.document = {
    getElementById: id => elements.get(id) ?? null,
    createElement: () => new MockElement()
  };
  if (typeof globalThis.CustomEvent !== "function") {
    globalThis.CustomEvent = class extends Event {
      constructor(name, props) { super(name); this.detail = props?.detail; }
    };
  }
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {
    clipboard: { async writeText(value) { copied = value; } }
  } });
  globalThis.fetch = async (path, options = {}) => {
    requests.push({ path, method: options.method || "GET" });
    if (path.startsWith("/api/historico?mes=")) return Response.json({ days: [] });
    if (path === "/api/saldo") return Response.json({
      saldo_batidas_minutos: 90, saldo_ajustes_minutos: 10, saldo_total_minutos: 100,
      pendencias: 0, faltas: 0
    });
    throw new Error("Requisição não prevista: " + path);
  };
  await import("../public/mini-ai-ui.js");

  const history = Array.from({ length: 12 }, (_, i) => ({
    data: "2026-08-" + String(i + 1).padStart(2, "0"),
    entrada: "06:50", ida_intervalo: "10:30", volta_intervalo: "12:30", saida: "16:30",
    carga_prevista: 480, pendencia: i === 0 ? "sem_saida" : null
  }));
  window.dispatchEvent(new CustomEvent("meus-pontos:historico-atualizado", {
    detail: { month: "2026-08", days: history }
  }));
  window.dispatchEvent(new CustomEvent("meus-pontos:dia-atualizado", {
    detail: { date: "2026-10-26", usa_intervalo: true, carga_minutos: 480,
      points: [], next_type: "entrada", pendencia: null }
  }));

  await until(() => elements.get("mini-ai-copy").disabled === false, "diagnóstico disponível");
  assert.deepEqual(requests.map(r=>r.path).sort(), [
    "/api/historico?mes=2026-09", "/api/historico?mes=2026-10", "/api/saldo"
  ].sort());
  assert.ok(requests.every(r => r.method === "GET"), "a mini IA não grava nem altera registros");
  assert.match(elements.get("mini-ai-status").textContent, /alerta/);
  elements.get("mini-ai-copy").dispatchEvent(new Event("click"));
  await until(() => typeof copied === "string", "cópia do relatório");
  const report = JSON.parse(copied);
  assert.equal(report.metrics.observed_days, 12);
  assert.equal(report.metrics.usable_training_days, 0);
  assert.ok(report.findings.some(x => x.code === "HISTORICO_PENDENTE"));
  for (const secret of ["06:50","10:30","16:30","sem_saida","2026-08-01"]) {
    assert.ok(!copied.includes(secret), "o relatório não deve incluir " + secret);
  }
});
