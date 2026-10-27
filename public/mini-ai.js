/** Mini IA de jornada, executada somente no dispositivo do usuário.
 * Um MLP pequeno aprende padrões de horários para sugerir (nunca gravar) batidas.
 * O banco e as regras de jornada continuam sendo a fonte de verdade.
 */
export const AI_VERSION = "mini-ia-ponto/0.2.0";
const KINDS = ["entrada", "ida_intervalo", "volta_intervalo", "saida"];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function timeMinutes(value) {
  return typeof value === "string" && TIME_RE.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null;
}
function weekDay(iso) {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(iso + "T12:00:00Z");
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso ? null : date.getUTCDay();
}
function features(day, kind, previous) {
  const weekday = weekDay(day);
  if (weekday === null || !KINDS.includes(kind)) return null;
  const angle = weekday * 2 * Math.PI / 7;
  return [...KINDS.map((name) => Number(name === kind)), Math.sin(angle), Math.cos(angle), previous / 1440];
}
function scheduleGroup(date) {
  const day = weekDay(date);
  if (day === null) return null;
  return day === 6 ? "sabado" : day === 0 ? "domingo" : "semana";
}
function cohortForDay(date, usesInterval) {
  const group = scheduleGroup(date);
  if (group === null || typeof usesInterval !== "boolean") return null;
  return (usesInterval ? "intervalo:" : "direta:") + group;
}
function examples(days, beforeDate, cohort) {
  if (!cohort) return [];
  const result = [];
  const seen = new Set();
  for (const row of days) {
    if (!row || typeof row.data !== "string" || row.data >= beforeDate ||
      weekDay(row.data) === null || seen.has(row.data) || row.pendencia ||
      ["justificada", "nao_trabalhado", "falta"].includes(row.origem) ||
      !Number.isFinite(Number(row.carga_prevista)) || Number(row.carga_prevista) <= 0) continue;
    const complete = row.entrada && row.saida && Boolean(row.ida_intervalo) === Boolean(row.volta_intervalo);
    if (!complete) continue;
    const withInterval = Boolean(row.ida_intervalo);
    if (cohortForDay(row.data, withInterval) !== cohort) continue;
    const sequence = withInterval ? KINDS : ["entrada", "saida"];
    let previous = -1;
    const candidate = [];
    for (const kind of sequence) {
      const minutes = timeMinutes(row[kind]);
      if (minutes === null || minutes <= previous) { candidate.length = 0; break; }
      candidate.push({ day: row.data, kind, x: features(row.data, kind, Math.max(0, previous)), y: minutes / 1440 });
      previous = minutes;
    }
    if (candidate.length === sequence.length) {
      seen.add(row.data);
      result.push(...candidate);
    }
  }
  return result;
}
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function network(seed = 41) {
  const rand = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  return {
    w: Array.from({ length: 10 }, () => Array.from({ length: 7 }, () => (rand() - 0.5) * 0.36)),
    b: Array(10).fill(0),
    v: Array.from({ length: 10 }, () => (rand() - 0.5) * 0.36),
    c: 0
  };
}
function forward(net, x) {
  const hidden = net.w.map((weights, j) => Math.tanh(weights.reduce((a, weight, k) => a + weight * x[k], net.b[j])));
  const z = net.v.reduce((a, value, j) => a + value * hidden[j], net.c);
  return { hidden, out: 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z)))) };
}
function train(rows) {
  const net = network();
  for (let epoch = 0; epoch < 320; epoch++) {
    const rate = 0.20 * (1 - epoch / 400);
    for (const sample of rows) {
      const { hidden, out } = forward(net, sample.x);
      const delta = 2 * (out - sample.y) * out * (1 - out);
      const previousV = net.v.slice();
      for (let j = 0; j < hidden.length; j++) {
        const d = delta * previousV[j] * (1 - hidden[j] * hidden[j]);
        for (let k = 0; k < sample.x.length; k++) net.w[j][k] -= rate * d * sample.x[k];
        net.b[j] -= rate * d;
        net.v[j] -= rate * delta * hidden[j];
      }
      net.c -= rate * delta;
    }
  }
  return net;
}

/** Resultado seguro para exibição; não inclui histórico, usuário nem motivos pessoais. */
export function analyzeAttendance(day, history) {
  if (!day || !Array.isArray(day.points) || !Array.isArray(history)) throw new TypeError("Dados de jornada inválidos");
  const issues = [];
  const add = (severity, code, detail) => issues.push({ severity, code, detail });
  const usesInterval = typeof day.usa_intervalo === "boolean" ? day.usa_intervalo : null;
  // Para dados antigos sem essa propriedade, ainda validamos a ordem,
  // mas não treinamos sem saber qual escala o D1 definiu.
  const expected = day.carga_minutos > 0 ? ((usesInterval === true ||
    day.points.some(p => p.tipo?.includes("intervalo")) ||
    day.next_type?.includes("intervalo")) ? KINDS : ["entrada", "saida"]) : [];
  let previous = -1;
  let inconsistent = false;
  for (let index = 0; index < day.points.length; index++) {
    const point = day.points[index];
    const time = timeMinutes(point.horario);
    if (time === null || time <= previous || point.tipo !== expected[index]) {
      inconsistent = true;
      add("alerta", "SEQUENCIA_INCONSISTENTE", "Ordem ou horários das batidas precisam de conferência.");
      break;
    }
    previous = time;
  }
  if (day.pendencia) add("atencao", "PENDENCIA_OFICIAL", "O resumo diário do banco informa uma pendência.");
  const pendingDays = history.filter(row => row?.pendencia).length;
  if (pendingDays) add("atencao", "HISTORICO_PENDENTE", pendingDays + " dia(s) com pendências no período consultado.");
  if (!day.next_type && day.carga_minutos > 0 && day.points.length === 0 && !day.pendencia) {
    add("info", "SEM_PROXIMA_BATIDA", "Sem próxima batida habilitada. Confira a escala e os registros oficiais.");
  }

  // Treinar exclusivamente com jornadas anteriores, mesma modalidade
  // de intervalo e mesma categoria de dia (semana, sábado ou domingo).
  const samples = examples(history, day.date, cohortForDay(day.date, usesInterval));
  const dates = [...new Set(samples.map(p => p.day))].sort();
  const cutoff = Math.max(1, Math.floor(dates.length * 0.8));
  const trainDates = new Set(dates.slice(0, cutoff));
  const training = samples.filter(p => trainDates.has(p.day));
  const validation = samples.filter(p => !trainDates.has(p.day));

  let prediction = null;
  let neuralMae = null;
  let baselineMae = null;
  let validationSamples = 0;
  const kind = day.next_type;
  const trainKind = training.filter(p => p.kind === kind);
  const validationKind = validation.filter(p => p.kind === kind);
  const enough = !inconsistent && dates.length >= 10 && trainKind.length >= 6 &&
    validationKind.length >= 3 && KINDS.includes(kind);
  if (enough) {
    // Baseline estatístico simples: referência de segurança, não um
    // substituto silencioso da rede neural.
    const baseline = median(trainKind.map(p => p.y));
    baselineMae = Math.round(validationKind.reduce((sum, p) => sum + Math.abs(baseline - p.y) * 1440, 0) / validationKind.length);
    const model = train(training);
    neuralMae = Math.round(validationKind.reduce((sum, p) =>
      sum + Math.abs(forward(model, p.x).out - p.y) * 1440, 0) / validationKind.length);
    validationSamples = validationKind.length;
    const candidate = neuralMae <= baselineMae + 5 && neuralMae <= 45
      ? { source: "neural", error: neuralMae, value: forward(model, features(day.date, kind, Math.max(0, previous))).out }
      : baselineMae <= 45
        ? { source: "referencia_estatistica", error: baselineMae, value: baseline }
        : null;
    if (candidate) {
      const inferred = Math.round(candidate.value * 1440 / 5) * 5;
      // Nunca sugerir batida anterior à última registrada.
      if (inferred > previous && inferred < 1440) {
        const label = String(Math.floor(inferred / 60)).padStart(2, "0") + ":" + String(inferred % 60).padStart(2, "0");
        prediction = { type: kind, time: label, method: candidate.source, error_minutes: candidate.error };
      }
    }
  }
  if (!prediction && kind) add("info", "SEM_PREVISAO_SEGURA", "A IA ainda não tem histórico validado suficiente para estimar a próxima batida.");
  return {
    version: AI_VERSION,
    source: "inferência neural local com verificação estatística; D1 permanece oficial",
    date: day.date,
    history_days: history.length,
    training_days: dates.length,
    training_samples: training.length,
    validation_samples: validationSamples,
    validation_mae_minutes: neuralMae,
    validation_baseline_mae_minutes: baselineMae,
    prediction,
    findings: issues
  };
}
