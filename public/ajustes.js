const $a = (id) => document.getElementById(id);
const balancePage = $a("page-saldo");
const footer = balancePage.querySelector(".note");
footer.insertAdjacentHTML("beforebegin", `
<section class="card ledger-card" aria-labelledby="ledger-title">
  <div class="card-title ledger-heading">
    <div><h2 id="ledger-title">Acertos manuais</h2><p class="muted">Créditos e descontos sem mexer nas batidas.</p></div>
    <button type="button" class="ledger-outline" id="ledger-new">Novo ajuste</button>
  </div>
  <form id="ledger-form" class="ledger-form" hidden>
    <h3 id="ledger-form-title">Novo ajuste</h3>
    <div class="ledger-grid">
      <label>Operação<select id="ledger-type" required>
        <option value="credito">Creditar (+)</option><option value="debito">Descontar (−)</option>
      </select></label>
      <label>Duração (HH:MM)<input id="ledger-duration" required maxlength="6" placeholder="01:30" pattern="[0-9]{1,3}:[0-5][0-9]"></label>
      <label class="ledger-wide">Data<input id="ledger-date" type="date" min="2000-01-01" required></label>
      <label class="ledger-wide">Motivo<input id="ledger-reason" maxlength="200" minlength="3" placeholder="Ex.: compensação autorizada" required></label>
    </div>
    <div class="ledger-form-actions"><button type="submit" class="primary" id="ledger-save">Salvar ajuste</button>
      <button type="button" class="ledger-outline" id="ledger-cancel">Cancelar</button></div>
  </form>
  <div id="ledger-list" class="ledger-list" aria-live="polite"><p class="muted">Carregando ajustes…</p></div>
</section>`);

const ledger = { editId: null, busy: false, items: [], nextOffset: null };
const duration = (n) => String(Math.floor(Math.abs(n) / 60)).padStart(2, "0") + ":" + String(Math.abs(n) % 60).padStart(2, "0");
const minutesText = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.floor(Math.abs(n) / 60) + "h" + String(Math.abs(n) % 60).padStart(2, "0");
const dateNow = () => {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return p.year + "-" + p.month + "-" + p.day;
};
function closeForm() {
  $a("ledger-form").reset();
  $a("ledger-form").hidden = true;
  $a("ledger-new").hidden = false;
  $a("ledger-date").value = dateNow();
  ledger.editId = null;
}
function openForm(item = null) {
  ledger.editId = item?.id ?? null;
  $a("ledger-date").max = dateNow();
  $a("ledger-date").value = item?.data ?? dateNow();
  $a("ledger-type").value = item?.minutos < 0 ? "debito" : "credito";
  $a("ledger-duration").value = item ? duration(item.minutos) : "";
  $a("ledger-reason").value = item?.motivo ?? "";
  $a("ledger-form-title").textContent = item ? "Editar ajuste" : "Novo ajuste";
  $a("ledger-save").textContent = item ? "Salvar alterações" : "Salvar ajuste";
  $a("ledger-form").hidden = false;
  $a("ledger-new").hidden = true;
  $a("ledger-duration").focus();
}
async function request(path, options = {}) {
  const res = await fetch(path, {
    ...options, credentials: "same-origin", cache: "no-store",
    headers: options.body ? { "Content-Type": "application/json" } : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Não foi possível completar a operação.");
  return data;
}
function alertUser(message) {
  const toast = $a("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(alertUser.timer);
  alertUser.timer = setTimeout(() => { toast.hidden = true; }, 4200);
}
function makeButton(text, className, click) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.className = className;
  button.addEventListener("click", click);
  return button;
}
function render(items) {
  const list = $a("ledger-list");
  list.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Nenhum ajuste manual registrado.";
    list.append(empty);
    return;
  }
  for (const item of items) {
    const card = document.createElement("article");
    card.className = "ledger-item";
    const info = document.createElement("div");
    info.className = "ledger-info";
    const date = document.createElement("small");
    date.textContent = new Date(item.data + "T12:00:00Z").toLocaleDateString("pt-BR", { timeZone: "UTC" });
    const reason = document.createElement("strong");
    reason.textContent = item.motivo;
    info.append(date, reason);
    const side = document.createElement("div");
    side.className = "ledger-side";
    const amount = document.createElement("strong");
    amount.className = item.minutos > 0 ? "positive" : "negative";
    amount.textContent = minutesText(item.minutos);
    const actions = document.createElement("div");
    actions.className = "ledger-actions";
    actions.append(
      makeButton("Editar", "ledger-link", () => openForm(item)),
      makeButton("Excluir", "ledger-link ledger-danger", () => removeItem(item))
    );
    side.append(amount, actions);
    card.append(info, side);
    list.append(card);
  }
}
async function loadLedger() {
  const { ajustes, proximo_offset } = await request("/api/ajustes?offset=0");
  ledger.items = ajustes;
  ledger.nextOffset = proximo_offset;
  render(ledger.items);
  renderMore();
}
function renderMore() {
  $a("ledger-more")?.remove();
  if (ledger.nextOffset === null) return;
  const button = makeButton("Carregar mais ajustes", "ledger-outline", async () => {
    button.disabled = true;
    try {
      const { ajustes, proximo_offset } = await request("/api/ajustes?offset=" + ledger.nextOffset);
      const seen = new Set(ledger.items.map(item => item.id));
      ledger.items.push(...ajustes.filter(item => !seen.has(item.id)));
      ledger.nextOffset = proximo_offset;
      render(ledger.items);
      renderMore();
    } catch (error) { button.disabled = false; alertUser(error.message); }
  });
  button.id = "ledger-more";
  $a("ledger-list").insertAdjacentElement("afterend", button);
}
async function reloadBalance() {
  const data = await request("/api/saldo");
  const set = (id, n, signed) => {
    const el = $a(id);
    el.textContent = signed ? minutesText(n) : n;
    if (signed) {
      el.classList.toggle("positive", n > 0);
      el.classList.toggle("negative", n < 0);
    }
  };
  set("balance-total", data.saldo_total_minutos, true);
  set("balance-days", data.saldo_batidas_minutos, true);
  set("balance-adjustments", data.saldo_ajustes_minutos, true);
  set("balance-absences", data.faltas, false);
  set("balance-pending", data.pendencias, false);
  $a("balance-status").textContent = data.saldo_total_minutos > 0 ? "Horas a favor" : data.saldo_total_minutos < 0 ? "Horas a compensar" : "Banco de horas zerado";
}
async function reload() { await Promise.all([loadLedger(), reloadBalance()]); }
async function save(event) {
  event.preventDefault();
  if (ledger.busy) return;
  ledger.busy = true;
  $a("ledger-save").disabled = true;
  const id = ledger.editId;
  const data = {
    tipo: $a("ledger-type").value, duracao: $a("ledger-duration").value.trim(),
    data: $a("ledger-date").value, motivo: $a("ledger-reason").value.trim()
  };
  try {
    await request(id === null ? "/api/ajustes" : "/api/ajustes/" + id, {
      method: id === null ? "POST" : "PUT", body: JSON.stringify(data)
    });
    closeForm();
    alertUser(id === null ? "Ajuste salvo." : "Ajuste atualizado.");
    await reload().catch(() => alertUser("Salvo, mas a atualização do saldo falhou."));
  } catch (error) {
    alertUser(error.message);
  } finally { ledger.busy = false; $a("ledger-save").disabled = false; }
}
async function removeItem(item) {
  if (ledger.busy || !confirm("Excluir " + minutesText(item.minutos) + " (" + item.motivo + ")? O saldo será recalculado.")) return;
  ledger.busy = true;
  try {
    await request("/api/ajustes/" + item.id, { method: "DELETE" });
    if (ledger.editId === item.id) closeForm();
    alertUser("Ajuste excluído.");
    await reload().catch(() => alertUser("Excluído, mas a atualização do saldo falhou."));
  } catch (error) {
    alertUser(error.message);
  } finally { ledger.busy = false; }
}
$a("ledger-new").addEventListener("click", () => openForm());
$a("ledger-cancel").addEventListener("click", closeForm);
$a("ledger-form").addEventListener("submit", save);
document.addEventListener("meus-pontos:saldo-atualizado", () => {
  loadLedger().catch(error => alertUser(error.message));
});
$a("ledger-date").max = dateNow();
$a("ledger-date").value = dateNow();
