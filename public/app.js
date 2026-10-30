const $ = (id) => document.getElementById(id);
const state = { authenticated: false, day: null, chosen: null, busy: false, tab: "ponto" };
const kinds = {
  entrada: "Entrada",
  ida_intervalo: "Saída para intervalo",
  volta_intervalo: "Retorno do intervalo",
  saida: "Saída"
};
const hourFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
});

function timeNow() {
  return hourFormatter.format(new Date());
}
function dateNow() {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric"
  }).formatToParts(new Date()).map(part => [part.type, part.value]));
  return values.year + "-" + values.month + "-" + values.day;
}
function minuteValue(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
function timeValue(minute) {
  return String(Math.floor(minute / 60)).padStart(2, "0") + ":" + String(minute % 60).padStart(2, "0");
}
function minutesText(value, signed = false) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const number = Number(value);
  const sign = signed && number > 0 ? "+" : number < 0 ? "−" : "";
  const abs = Math.abs(number);
  return sign + Math.floor(abs / 60) + "h" + String(abs % 60).padStart(2, "0");
}
function signClass(element, minutes) {
  element.classList.toggle("positive", minutes != null && Number(minutes) > 0);
  element.classList.toggle("negative", minutes != null && Number(minutes) < 0);
}
function displayDate(date, long = false) {
  if (!date) return "";
  return new Date(date + "T12:00:00Z").toLocaleDateString("pt-BR", {
    timeZone: "UTC", weekday: long ? "long" : "short", day: "2-digit", month: long ? "long" : "short", year: long ? "numeric" : undefined
  });
}
let toastTimer;
function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4200);
}
function gate(show) {
  $("gate").hidden = !show;
  $("logout").hidden = show;
  if (show) $("login-user").focus();
}
async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}) }
  });
  let data;
  try { data = await response.json(); } catch { throw new Error("Resposta inválida do servidor."); }
  if (!response.ok) {
    if (response.status === 401 && path !== "/api/login") {
      state.authenticated = false;
      gate(true);
    }
    throw new Error(data.error || "Ocorreu um erro na consulta.");
  }
  return data;
}
function drawClock() {
  const chosen = state.chosen ?? timeNow();
  const minutes = minuteValue(chosen);
  $("chosen-time").textContent = chosen;
  $("reset-time").hidden = state.chosen === null;
  $("minus").disabled = minutes === 0;
  $("plus").disabled = minutes === 23 * 60 + 59;
  if (state.day?.next_type && !state.busy) {
    const future = minutes > minuteValue(timeNow());
    $("register").disabled = false;
    $("point-hint").textContent = future
      ? "Horário adiantado: confira antes de registrar."
      : "Confira o horário antes de registrar.";
  }
}
function adjustTime(delta) {
  const old = minuteValue(state.chosen ?? timeNow());
  const next = Math.max(0, Math.min(23 * 60 + 59, old + delta));
  state.chosen = timeValue(next);
  drawClock();
}
function drawToday(day) {
  state.day = day;
  $("today-date").textContent = displayDate(day.date, true);
  const expected = Array.isArray(day.expected_steps) ? day.expected_steps :
    day.carga_minutos > 0 ? (day.usa_intervalo ? ["entrada", "ida_intervalo", "volta_intervalo", "saida"] : ["entrada", "saida"]) : [];
  const complete = expected.length > 0 && day.points.length === expected.length &&
    expected.every((type, i) => day.points[i]?.tipo === type) && !day.pendencia;
  $("today-status").textContent = complete ? "Concluído" : day.justificativa ? "Justificado" :
    !expected.length ? "Folga" : !day.next_type ? "Conferir registros" : "Em andamento";
  $("today-status").classList.toggle("done", complete);
  $("register").disabled = state.busy || !day.next_type;
  const optionalWork = day.carga_minutos === 0 && day.points.length === 0 && day.next_type === "entrada";
  $("register").textContent = optionalWork ? "Registrar trabalho em folga" :
    day.next_type ? "Registrar " + kinds[day.next_type].toLowerCase() :
    complete ? "Jornada concluída" : "Registro indisponível";
  $("point-hint").textContent = optionalWork ? "Não há jornada prevista. Registre apenas se realmente trabalhar." :
    day.next_type ? "Confira o horário antes de registrar." :
    complete ? "Todas as batidas de hoje estão salvas." : "Nenhum novo registro disponível.";
  const container = $("steps");
  container.replaceChildren();
  if (!expected.length) {
    const p = document.createElement("p"); p.className = "muted"; p.textContent = "Sem jornada prevista para hoje."; container.append(p);
  }
  for (const type of expected) {
    const record = day.points.find((point) => point.tipo === type);
    const row = document.createElement("div"); row.className = "step" + (record ? " done" : "");
    const mark = document.createElement("span"); mark.className = "step-mark"; mark.textContent = record ? "✓" : String(expected.indexOf(type) + 1);
    const name = document.createElement("span"); name.className = "step-name"; name.textContent = kinds[type];
    const time = document.createElement("span"); time.className = "step-time"; time.textContent = record?.horario || "--:--";
    row.append(mark, name, time); container.append(row);
  }
  $("day-progress").textContent = day.points.length + " de " + expected.length;
  $("day-worked").textContent = minutesText(day.total_trabalhado_minutos);
  $("day-balance").textContent = minutesText(day.saldo_minutos, true);
  signClass($("day-balance"), day.saldo_minutos);
  drawClock();
}
async function loadToday() {
  const day = await api("/api/hoje");
  if (state.day?.date && state.day.date !== day.date) state.chosen = null;
  drawToday(day);
}
function historyRow(item) {
  const row = document.createElement("article"); row.className = "history-row";
  const left = document.createElement("div");
  const date = document.createElement("div"); date.className = "history-date"; date.textContent = displayDate(item.data);
  const detail = document.createElement("div"); detail.className = "history-detail";
  const parts = [item.entrada && "Entrada " + item.entrada, item.ida_intervalo && "Intervalo " + item.ida_intervalo,
    item.volta_intervalo && "Retorno " + item.volta_intervalo, item.saida && "Saída " + item.saida].filter(Boolean);
  detail.textContent = parts.join(" · ") || "Sem batidas";
  left.append(date, detail);
  const right = document.createElement("div");
  const value = document.createElement("div"); value.className = "history-value"; value.textContent = minutesText(item.saldo_minutos, true);
  signClass(value, item.saldo_minutos);
  const status = document.createElement("div"); status.className = "history-state";
  status.textContent = item.pendencia === "sem_saida" ? "Sem saída" :
    item.pendencia === "intervalo_incompleto" ? "Intervalo incompleto" :
    item.origem === "falta" ? "Falta" :
    item.origem === "justificada" ? "Justificado" :
    item.origem === "nao_trabalhado" ? "Folga" :
    item.saldo_minutos == null ? "Em andamento" : minutesText(item.total_trabalhado_minutos) + " trabalhadas";
  right.append(value, status); row.append(left, right); return row;
}
let historyRequest = 0;
async function loadHistory() {
  const requestId = ++historyRequest;
  const month = $("history-month").value;
  const { days } = await api("/api/historico?mes=" + encodeURIComponent(month));
  if (requestId !== historyRequest || $("history-month").value !== month) return;
  const list = $("history-list"); list.replaceChildren();
  if (!days.length) {
    const div = document.createElement("div"); div.className = "empty"; div.textContent = "Nenhum dia encontrado neste mês."; list.append(div);
  } else days.forEach((item) => list.append(historyRow(item)));
  const total = days.reduce((sum, item) => sum + (item.saldo_minutos || 0), 0);
  $("history-summary").textContent = days.length + " dias no período · Saldo " + minutesText(total, true);
}
async function loadBalance() {
  const data = await api("/api/saldo");
  $("balance-total").textContent = minutesText(data.saldo_total_minutos, true);
  $("balance-days").textContent = minutesText(data.saldo_batidas_minutos, true);
  $("balance-adjustments").textContent = minutesText(data.saldo_ajustes_minutos, true);
  $("balance-absences").textContent = String(data.faltas ?? 0);
  $("balance-pending").textContent = String(data.pendencias ?? 0);
  $("balance-status").textContent = data.saldo_total_minutos > 0 ? "Horas a favor" : data.saldo_total_minutos < 0 ? "Horas a compensar" : "Banco de horas zerado";
  signClass($("balance-days"), data.saldo_batidas_minutos);
  signClass($("balance-adjustments"), data.saldo_ajustes_minutos);
  document.dispatchEvent(new Event("meus-pontos:saldo-atualizado"));
}
async function refresh() {
  if (!state.authenticated) return gate(true);
  try {
    if (state.tab === "ponto") await loadToday();
    if (state.tab === "historico") await loadHistory();
    if (state.tab === "saldo") await loadBalance();
  } catch (error) {
    toast(error.message || "Não foi possível atualizar.");
  }
}
async function registerPoint() {
  if (state.busy || !state.day?.next_type) return;
  if (state.day.date !== dateNow()) {
    state.chosen = null;
    toast("A data mudou. Atualizando a jornada antes de registrar.");
    await loadToday().catch(error => toast(error.message));
    return;
  }
  const optionalWork = state.day.carga_minutos === 0 && state.day.points.length === 0;
  if (optionalWork && !window.confirm("Hoje não há jornada prevista. Confirmar que você está trabalhando neste dia de folga?")) return;
  const hour = state.chosen ?? timeNow();
  if (minuteValue(hour) > minuteValue(timeNow()) &&
      !window.confirm("O horário escolhido é posterior ao atual. Confirma o registro adiantado às " + hour + "?")) return;
  const expectedDate = state.day.date;
  const expectedType = state.day.next_type;
  state.busy = true;
  $("register").disabled = true;
  $("register").textContent = "Salvando…";
  try {
    const result = await api("/api/pontos", { method: "POST", body: JSON.stringify({
      horario: hour, data: expectedDate, tipo: expectedType,
      trabalho_em_folga: optionalWork
    }) });
    state.chosen = null;
    drawToday(result);
    toast("Ponto de " + kinds[result.type].toLowerCase() + " registrado às " + hour + ".");
  } catch (error) {
    toast(error.message || "Não foi possível registrar. Tente novamente.");
    await loadToday().catch(() => {});
  } finally {
    state.busy = false;
    if (state.day) drawToday(state.day);
  }
}
function chooseTab(name) {
  state.tab = name;
  for (const page of ["ponto", "historico", "saldo"]) {
    $("page-" + page).hidden = page !== name;
  }
  document.querySelectorAll(".tab").forEach((button) => {
    const selected = button.dataset.tab === name;
    button.classList.toggle("active", selected);
    if (selected) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
  });
  refresh();
}
$("minus").addEventListener("click", () => adjustTime(-1));
$("plus").addEventListener("click", () => adjustTime(1));
$("reset-time").addEventListener("click", () => { state.chosen = null; drawClock(); });
$("register").addEventListener("click", registerPoint);
$("refresh").addEventListener("click", refresh);
$("history-month").addEventListener("change", loadHistory);
document.querySelectorAll(".tab").forEach((button) => button.addEventListener("click", () => chooseTab(button.dataset.tab)));
$("gate-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const usuario = $("login-user").value.trim();
  const senha = $("login-password").value;
  if (!usuario || !senha) return;
  $("enter").disabled = true;
  $("gate-error").textContent = "";
  try {
    await api("/api/login", { method: "POST", body: JSON.stringify({ usuario, senha }) });
    state.authenticated = true;
    $("login-password").value = "";
    gate(false);
    await refresh();
  } catch (error) {
    $("gate-error").textContent = error.message || "Não foi possível entrar.";
  } finally {
    $("enter").disabled = false;
  }
});
$("logout").addEventListener("click", async () => {
  try {
    await api("/api/sair", { method: "POST" });
    window.location.reload();
  } catch (error) {
    toast(error.message || "Não foi possível sair.");
  }
});
$("history-month").value = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(new Date()).replace("/", "-");
if (!/^\d{4}-\d{2}$/.test($("history-month").value)) {
  const parts = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  $("history-month").value = value.year + "-" + value.month;
}
drawClock();
setInterval(() => {
  drawClock();
  if (state.authenticated && state.tab === "ponto" && !state.busy &&
      document.visibilityState === "visible" && state.day?.date !== dateNow()) {
    state.chosen = null;
    loadToday().catch(error => toast(error.message));
  }
}, 15000);
// Sincroniza dispositivos enquanto a tela de ponto estiver visível.
setInterval(() => {
  if (state.authenticated && state.tab === "ponto" && !state.busy &&
      document.visibilityState === "visible") loadToday().catch(() => {});
}, 60000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.authenticated && !state.busy) refresh();
});
async function restoreSession() {
  try {
    await api("/api/sessao");
    state.authenticated = true;
    gate(false);
    await refresh();
  } catch (error) {
    gate(true);
    if (!/Sessão expirada ou inválida/.test(error.message)) {
      $("gate-error").textContent = error.message || "Não foi possível verificar o login.";
    }
  }
}
restoreSession();
if ("serviceWorker" in navigator && location.protocol === "https:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}