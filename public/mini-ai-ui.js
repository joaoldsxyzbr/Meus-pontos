import { auditWorkspace, buildDiagnosticReport, normalizeApiFailure } from "./mini-ai-supervision.js";

const get = id => document.getElementById(id);
const status = get("mini-ai-status");
const detail = get("mini-ai-detail");
const findingsView = get("mini-ai-findings");
const analyzeButton = get("mini-ai-analyze");
const copyButton = get("mini-ai-copy");

let currentDay = null;
let selectedHistory = null;
let currentReport = null;
let failures = [];
let revision = 0;
let scheduled = null;

function monthBefore(value) {
  const date = new Date(value + "-01T12:00:00Z");
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
}
function recordFailure(path, statusCode) {
  const item = normalizeApiFailure(path, statusCode);
  if (!item) return;
  failures.push({ path, status: statusCode });
  failures = failures.slice(-20);
}
async function getJson(path) {
  let response;
  try {
    response = await fetch(path, { credentials: "same-origin", cache: "no-store" });
  } catch {
    recordFailure(path, 0);
    throw new Error("Sem conexão.");
  }
  if (!response.ok) {
    recordFailure(path, response.status);
    throw new Error("Falha na consulta.");
  }
  return response.json();
}
function createFinding(finding) {
  const wrapper = document.createElement("article");
  wrapper.className = "mini-ai-finding";
  wrapper.dataset.severity = finding.severity;
  const name = document.createElement("strong");
  const areas = { ponto: "Ponto", historico: "Histórico", banco: "Banco de horas", sistema: "Sistema" };
  name.textContent = (areas[finding.area] || "Sistema") + " · " + finding.title +
    (finding.count > 1 ? " (" + finding.count + " ocorrências)" : "");
  const cause = document.createElement("p");
  cause.textContent = "Possível causa: " + finding.probable_cause;
  const action = document.createElement("p");
  action.textContent = "Recomendação: " + finding.suggested_action;
  wrapper.append(name, cause, action);
  return wrapper;
}
function render(audit) {
  const actionable = audit.findings.filter(item => item.severity !== "info");
  status.textContent = actionable.length
    ? actionable.length + " alerta(s) para conferir"
    : "Nenhum alerta relevante nesta análise";
  const lines = [];
  const prediction = audit.prediction;
  if (prediction) {
    lines.push((prediction.method === "neural" ? "Previsão neural indicativa: " : "Referência estatística (rede neural não superou a referência): ") + prediction.type.replaceAll("_", " ") +
      " por volta de " + prediction.time + " (erro médio de validação: " +
      prediction.error_minutes + " min).");
  } else {
    lines.push("Sem previsão neural confiável neste momento.");
  }
  lines.push("Verificações: ponto ✓ · histórico " + (audit.checked.historico ? "✓" : "indisponível") +
    " · banco de horas " + (audit.checked.banco ? "✓" : "indisponível") + ".");
  lines.push("A mini IA apenas observa e recomenda. Registros e saldos oficiais não são modificados.");
  detail.textContent = lines.join("\n");

  findingsView.replaceChildren();
  if (!audit.findings.length) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "Não foram identificadas situações que precisem de conferência.";
    findingsView.append(p);
  } else {
    for (const finding of audit.findings) findingsView.append(createFinding(finding));
  }
  copyButton.disabled = false;
}

async function analyze() {
  if (!currentDay) return;
  const id = ++revision;
  currentReport = null;
  copyButton.disabled = true;
  status.textContent = "Verificando os três painéis…";
  detail.textContent = "A análise é executada neste dispositivo, sem armazenamento de diagnósticos.";
  const month = currentDay.date.slice(0, 7);
  const results = await Promise.allSettled([
    getJson("/api/historico?mes=" + month),
    getJson("/api/historico?mes=" + monthBefore(month)),
    getJson("/api/saldo")
  ]);
  if (id !== revision) return;
  const historyAvailable = results[0].status === "fulfilled" && results[1].status === "fulfilled" &&
    Array.isArray(results[0].value?.days) && Array.isArray(results[1].value?.days);
  const recent = historyAvailable ? [...results[1].value.days, ...results[0].value.days] : [];
  // Treino limitado aos meses recentes. Histórico selecionado serve apenas à auditoria.
  const uniqueByDay = rows => [...new Map(rows.filter(item => item && typeof item.data === "string")
    .map(item => [item.data, item])).values()];
  const trainingDays = uniqueByDay(recent);
  // Registros recém-consultados prevalecem sobre versões de uma visita anterior.
  const selectedDays = Array.isArray(selectedHistory?.days) ? selectedHistory.days : [];
  const inspected = uniqueByDay([...selectedDays, ...recent]);
  // Não reutilizar saldo possivelmente desatualizado após falha na consulta.
  const balance = results[2].status === "fulfilled" ? results[2].value : null;
  try {
    currentReport = auditWorkspace(currentDay, inspected, balance, failures,
      { history: historyAvailable }, trainingDays);
    render(currentReport);
  } catch {
    status.textContent = "Análise indisponível";
    detail.textContent = "Não foi possível avaliar os dados recebidos; nenhum registro foi alterado.";
  }
}
function schedule() {
  clearTimeout(scheduled);
  scheduled = setTimeout(() => void analyze(), 250);
}

window.addEventListener("meus-pontos:dia-atualizado", event => {
  if (!event.detail) return;
  currentDay = event.detail;
  schedule();
});
window.addEventListener("meus-pontos:historico-atualizado", event => {
  if (!event.detail || !Array.isArray(event.detail.days)) return;
  selectedHistory = event.detail;
  if (currentDay) schedule();
});
window.addEventListener("meus-pontos:saldo-atualizado", () => {
  if (currentDay) schedule();
});
window.addEventListener("meus-pontos:api-falha", event => {
  if (!event.detail) return;
  recordFailure(event.detail.path, event.detail.status);
  if (currentDay) schedule();
});
analyzeButton.addEventListener("click", async () => {
  if (currentDay) {
    void analyze();
    return;
  }
  try {
    currentDay = await getJson("/api/hoje");
    void analyze();
  } catch {
    status.textContent = "Entre no aplicativo e atualize o ponto para iniciar.";
  }
});
copyButton.addEventListener("click", async () => {
  if (!currentReport) return;
  const report = buildDiagnosticReport(currentReport);
  try {
    await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    copyButton.textContent = "Relatório copiado";
    setTimeout(() => { copyButton.textContent = "Copiar relatório técnico"; }, 2500);
  } catch {
    status.textContent = "Cópia indisponível neste navegador. Tente atualizar a página.";
  }
});

// Informa à tela principal que seus listeners já estão registrados.
// Evita perder o primeiro carregamento do dia em conexões lentas.
window.dispatchEvent(new Event("meus-pontos:mini-ia-iniciada"));
