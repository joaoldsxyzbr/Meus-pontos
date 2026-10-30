const $c = (id) => document.getElementById(id);
const panel = document.createElement("section");
panel.className = "card correction-card";
panel.setAttribute("aria-labelledby", "correction-heading");
panel.innerHTML = `
<h2 id="correction-heading">Corrigir batida</h2>
<p class="muted">Altere um horário ou exclua a última batida. É obrigatório informar o motivo; as operações ficam auditadas.</p>
<label for="correction-date">Data dos registros</label>
<div class="correction-row">
  <input type="date" id="correction-date" min="2000-01-01">
  <button type="button" class="ledger-outline" id="correction-search">Consultar</button>
</div>
<div id="correction-list" aria-live="polite"></div>
<form id="correction-form" hidden>
  <strong id="correction-selected"></strong>
  <label for="correction-time">Horário correto</label>
  <input type="time" id="correction-time" required>
  <label for="correction-reason">Motivo obrigatório</label>
  <input id="correction-reason" minlength="3" maxlength="200" required placeholder="Por que precisa corrigir?">
  <div class="correction-row">
    <button class="primary" type="submit" id="correction-save">Salvar correção</button>
    <button class="ledger-outline" type="button" id="correction-cancel">Cancelar</button>
  </div>
  <button type="button" class="ledger-link ledger-danger" id="correction-delete">Excluir última batida</button>
</form>`;
$c("page-historico").append(panel);

function dateNow() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date()).map(p => [p.type, p.value]));
  return parts.year + "-" + parts.month + "-" + parts.day;
}
async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options, credentials: "same-origin", cache: "no-store",
    headers: options.body ? { "Content-Type": "application/json" } : undefined
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Não foi possível consultar o registro.");
  return body;
}
let current = [], selected = null, busy = false;
function message(value) { $c("correction-list").textContent = value; }
async function consult() {
  selected = null;
  $c("correction-form").hidden = true;
  const date = $c("correction-date").value;
  if (!date) return message("Escolha uma data.");
  try {
    const { pontos } = await api("/api/pontos/consultar?data=" + encodeURIComponent(date));
    current = pontos;
    const list = $c("correction-list");
    list.replaceChildren();
    if (!current.length) return message("Sem batidas nesta data.");
    for (const p of current) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ledger-outline";
      const label = { entrada: "Entrada", ida_intervalo: "Início intervalo",
        volta_intervalo: "Fim intervalo", saida: "Saída" }[p.tipo] || p.tipo;
      button.textContent = label + " · " + p.horario;
      button.addEventListener("click", () => {
        selected = p;
        $c("correction-selected").textContent = button.textContent;
        $c("correction-time").value = p.horario;
        $c("correction-reason").value = "";
        $c("correction-delete").hidden = current.at(-1)?.id !== p.id;
        $c("correction-form").hidden = false;
        $c("correction-reason").focus();
      });
      list.append(button);
    }
  } catch (error) { message(error.message); }
}
async function perform(acao) {
  if (busy || !selected) return;
  const motivo = $c("correction-reason").value.trim();
  if (motivo.length < 3 || motivo.length > 200) {
    $c("correction-reason").reportValidity();
    return;
  }
  if (!window.confirm(acao === "excluir"
    ? "Excluir a última batida? O motivo ficará no histórico de auditoria."
    : "Confirmar a alteração do horário desta batida?")) return;
  busy = true;
  $c("correction-save").disabled = true;
  $c("correction-delete").disabled = true;
  try {
    await api("/api/pontos/corrigir", {
      method: "POST", body: JSON.stringify({
        id: selected.id, data: selected.data, acao,
        horario_anterior: selected.horario,
        horario: $c("correction-time").value, motivo
      })
    });
    await consult();
    $c("refresh").click();
    message("Correção salva. Consulte novamente para ver os registros atualizados.");
  } catch (error) { message(error.message); }
  finally {
    busy = false;
    $c("correction-save").disabled = false;
    $c("correction-delete").disabled = false;
  }
}
$c("correction-date").value = dateNow();
$c("correction-date").max = dateNow();
$c("correction-search").addEventListener("click", consult);
$c("correction-cancel").addEventListener("click", () => {
  selected = null; $c("correction-form").hidden = true;
});
$c("correction-form").addEventListener("submit", e => {
  e.preventDefault(); perform("editar");
});
$c("correction-delete").addEventListener("click", () => perform("excluir"));
