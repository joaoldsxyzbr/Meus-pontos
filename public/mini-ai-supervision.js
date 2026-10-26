import { analyzeAttendance } from "./mini-ai.js";

/**
 * Supervisor local, sem acesso de escrita. Regras explícitas conferem dados
 * oficiais e enriquecem alertas; a previsão é a única parte neural.
 */
export const SUPERVISOR_VERSION = "mini-ia-supervisor/0.2.0";

const KNOWN = Object.freeze({
  SEQUENCIA_INCONSISTENTE: ["ponto", "alerta", "Registros do dia fora de sequência.", "Batida duplicada, fora de ordem ou incompatível com a jornada.", "Conferir o registro no histórico; não corrigir automaticamente."],
  PENDENCIA_OFICIAL: ["ponto", "atencao", "Pendência informada pelo controle oficial.", "O resumo diário do D1 marcou uma pendência.", "Conferir as batidas e as justificativas no sistema."],
  HISTORICO_PENDENTE: ["historico", "atencao", "Há pendências no histórico consultado.", "Um ou mais dias foram marcados como pendentes pelo D1.", "Abrir o histórico para conferir os dias pendentes."],
  SEM_PROXIMA_BATIDA: ["ponto", "info", "Não há próxima batida disponível.", "A escala, o descanso ou a sequência podem bloquear um registro.", "Conferir a jornada configurada antes de agir."],
  SEM_PREVISAO_SEGURA: ["ponto", "info", "Ainda não existe previsão neural confiável.", "Histórico insuficiente, alta margem de erro ou sequência incompatível.", "Continuar registrando normalmente; nenhuma ação automática é necessária."],
  HISTORICO_FORA_ORDEM: ["historico", "alerta", "Horários inconsistentes no histórico.", "Há horários inválidos, repetidos ou fora de ordem em jornadas consultadas.", "Conferir os registros oficiais. A IA não altera esses dias."],
  INTERVALO_PARCIAL: ["historico", "atencao", "Intervalos incompletos sem pendência explícita.", "Há jornada com apenas uma marcação de intervalo, mas sem pendência indicada.", "Conferir se o resumo do D1 está atualizado."],
  SALDO_DIVERGENTE: ["banco", "alerta", "O saldo consolidado não fecha.", "O total informado difere da soma do saldo das batidas e dos ajustes.", "Conferir a consulta ou a visão de saldo no D1 antes de usar o valor."],
  SALDO_INDISPONIVEL: ["banco", "info", "Saldo não verificado nesta análise.", "A consulta não retornou todos os componentes numéricos exigidos.", "Atualizar a página e conferir o painel de banco de horas."],
  HISTORICO_INDISPONIVEL: ["historico", "atencao", "Histórico indisponível para avaliação.", "A consulta do D1 falhou ou a sessão foi interrompida.", "Verificar conexão e tentar novamente, sem deduzir pontos ausentes."],
  API_INDISPONIVEL: ["sistema", "atencao", "Uma consulta do aplicativo falhou.", "Instabilidade de rede, sessão ou API; nenhuma causa específica foi confirmada.", "Tentar atualizar. Se persistir, copiar o diagnóstico para investigação."],
  API_ERRO: ["sistema", "atencao", "Uma operação retornou erro HTTP.", "A API recusou uma requisição ou falhou ao processá-la.", "Conferir o estado do aplicativo e investigar o endpoint indicado no diagnóstico."]
});
const API_AREAS = Object.freeze({
  "/api/hoje": "ponto",
  "/api/pontos": "ponto",
  "/api/historico": "historico",
  "/api/saldo": "banco",
  "/api/ajustes": "banco"
});
const SEVERITY_ORDER = { alerta: 0, atencao: 1, info: 2 };
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const KINDS = ["entrada", "ida_intervalo", "volta_intervalo", "saida"];

function numberMinutes(time) {
  return typeof time === "string" && HHMM.test(time) ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : null;
}
function makeFinding(code, count = 1, meta = {}) {
  const entry = KNOWN[code];
  if (!entry) return null;
  return { code, area: meta.area || entry[0], severity: entry[1], title: entry[2],
    probable_cause: entry[3], suggested_action: entry[4], count };
}
function auditHistory(history) {
  let disorder = 0;
  let partial = 0;
  for (const row of history) {
    if (!row || typeof row !== "object" || !row.entrada || !row.saida) continue;
    // Dias justificados, sem trabalho e pendentes não são tratados como falhas.
    if (row.origem === "justificada" || row.origem === "nao_trabalhado" || row.pendencia) continue;
    const hasOut = Boolean(row.ida_intervalo);
    const hasBack = Boolean(row.volta_intervalo);
    if (hasOut !== hasBack) {
      partial++;
      continue;
    }
    const sequence = hasOut ? KINDS : ["entrada", "saida"];
    let previous = -1;
    for (const key of sequence) {
      const current = numberMinutes(row[key]);
      if (current === null || current <= previous) {
        disorder++;
        break;
      }
      previous = current;
    }
  }
  return { disorder, partial };
}

/**
 * Only allow a fixed endpoint category and numeric status.
 * Raw URL parameters, payload, cookies and response bodies never enter reports.
 */
export function normalizeApiFailure(path, status) {
  if (typeof path !== "string" || !Number.isInteger(status) || status < 0 || status > 599) return null;
  let pathname = path.split("?")[0];
  if (/^\/api\/ajustes\/[1-9]\d*$/.test(pathname)) pathname = "/api/ajustes";
  const area = API_AREAS[pathname];
  if (!area || status === 401 || (status > 0 && status < 400)) return null;
  return { code: status === 0 ? "API_INDISPONIVEL" : "API_ERRO", area, status };
}

/** Produces a bounded, non-sensitive diagnostic from current authorized data. */
export function auditWorkspace(day, history, balance, apiFailures = [], availability = {}) {
  if (!Array.isArray(history)) throw new TypeError("Histórico inválido.");
  const historyAvailable = availability.history !== false;
  const neural = analyzeAttendance(day, historyAvailable ? history : []);
  const findings = neural.findings.map(entry => makeFinding(entry.code)).filter(Boolean);
  if (!historyAvailable) findings.push(makeFinding("HISTORICO_INDISPONIVEL"));
  const { disorder, partial } = auditHistory(history);
  if (disorder) findings.push(makeFinding("HISTORICO_FORA_ORDEM", disorder));
  if (partial) findings.push(makeFinding("INTERVALO_PARCIAL", partial));

  const keys = ["saldo_batidas_minutos", "saldo_ajustes_minutos", "saldo_total_minutos"];
  const validBalance = balance && keys.every(key => Number.isSafeInteger(balance[key]));
  if (!validBalance) findings.push(makeFinding("SALDO_INDISPONIVEL"));
  else if (balance.saldo_batidas_minutos + balance.saldo_ajustes_minutos !== balance.saldo_total_minutos) {
    findings.push(makeFinding("SALDO_DIVERGENTE"));
  }

  // Dedup operational failures; never include caller-supplied text in findings.
  const failures = new Map();
  for (const failure of apiFailures.slice(-20)) {
    const normalized = normalizeApiFailure(failure?.path, failure?.status);
    if (!normalized) continue;
    const key = normalized.area + ":" + normalized.status;
    failures.set(key, { ...normalized, occurrences: (failures.get(key)?.occurrences || 0) + 1 });
  }
  for (const entry of failures.values()) {
    const item = makeFinding(entry.code, entry.occurrences, { area: entry.area });
    findings.push({ ...item, http_status: entry.status });
  }

  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return {
    version: SUPERVISOR_VERSION,
    engine: neural.version,
    source: "leitura do D1 + verificações determinísticas + previsão neural local",
    checked: { ponto: true, historico: historyAvailable, banco: Boolean(validBalance) },
    metrics: {
      observed_days: history.length,
      usable_training_days: neural.training_days,
      training_samples: neural.training_samples,
      validation_error_minutes: neural.validation_mae_minutes,
      api_failures: [...failures.values()].reduce((sum, item) => sum + item.occurrences, 0)
    },
    prediction: neural.prediction,
    findings
  };
}

/** Explicit allowlist prevents accidental inclusion of raw personal data. */
export function buildDiagnosticReport(audit) {
  if (!audit || audit.version !== SUPERVISOR_VERSION || !Array.isArray(audit.findings)) throw new TypeError("Diagnóstico inválido.");
  return {
    schema: "meus-pontos-diagnostico/v2",
    version: SUPERVISOR_VERSION,
    engine: audit.engine,
    checked: {
      ponto: audit.checked?.ponto === true,
      historico: audit.checked?.historico === true,
      banco: audit.checked?.banco === true
    },
    metrics: {
      observed_days: audit.metrics?.observed_days ?? 0,
      usable_training_days: audit.metrics?.usable_training_days ?? 0,
      validation_error_minutes: audit.metrics?.validation_error_minutes ?? null,
      api_failures: audit.metrics?.api_failures ?? 0
    },
    findings: audit.findings.filter(item => KNOWN[item.code]).map(item => ({
      code: item.code,
      area: ["ponto", "historico", "banco", "sistema"].includes(item.area) ? item.area : KNOWN[item.code][0],
      severity: KNOWN[item.code][1],
      count: Number.isSafeInteger(item.count) && item.count >= 1 ? Math.min(item.count, 100) : 1,
      ...(Number.isInteger(item.http_status) && item.http_status >= 0 && item.http_status <= 599 ? { http_status: item.http_status } : {}),
      probable_cause: KNOWN[item.code][3],
      suggested_action: KNOWN[item.code][4]
    }))
  };
}
