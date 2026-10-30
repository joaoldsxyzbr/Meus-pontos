<script lang="ts">
  import type { StoredPoint, CorrectionRequest } from "../../../src/shared/contracts";
  import { api } from "../lib/api";
  import { brazilDate, kinds } from "../lib/time";

  let { changed, notify, onError }: {
    changed: () => void;
    notify: (message: string) => void;
    onError: (error: unknown) => string;
  } = $props();

  let selectedDate = $state(brazilDate());
  let consulted = $state<StoredPoint[]>([]);
  let selected = $state<StoredPoint | null>(null);
  let correctedTime = $state("");
  let reason = $state("");
  let loading = $state(false);
  let busy = $state(false);
  let message = $state("");
  let searched = $state(false);
  let sequence = 0;

  async function consult() {
    if (!selectedDate) {
      message = "Escolha uma data.";
      return;
    }
    const current = ++sequence;
    searched = true;
    selected = null;
    loading = true;
    message = "";
    try {
      const response = await api<{ data: string; pontos: StoredPoint[] }>(
        `/api/pontos/consultar?data=${encodeURIComponent(selectedDate)}`
      );
      if (current === sequence) consulted = response.pontos;
    } catch (error) {
      if (current === sequence) {
        consulted = [];
        message = onError(error);
      }
    } finally {
      if (current === sequence) loading = false;
    }
  }

  function selectPoint(point: StoredPoint) {
    selected = point;
    correctedTime = point.horario;
    reason = "";
  }

  async function mutate(action: "editar" | "excluir") {
    if (!selected || busy || loading) return;
    const text = reason.trim();
    if (text.length < 3 || text.length > 200) {
      message = "Informe um motivo entre 3 e 200 caracteres.";
      return;
    }
    if (action === "excluir" && consulted.at(-1)?.id !== selected.id) {
      message = "Somente a última batida pode ser excluída.";
      return;
    }
    if (!window.confirm(action === "excluir"
      ? "Excluir a última batida? O motivo ficará registrado na auditoria."
      : "Confirmar a alteração do horário desta batida?")) return;
    const payload: CorrectionRequest = action === "editar"
      ? { id: selected.id, data: selected.data, acao: "editar",
          horario_anterior: selected.horario, horario: correctedTime, motivo: text }
      : { id: selected.id, data: selected.data, acao: "excluir",
          horario_anterior: selected.horario, motivo: text };

    busy = true;
    try {
      await api<{ ok: true }>("/api/pontos/corrigir", { method: "POST", body: payload });
      message = "Correção registrada e auditada.";
      notify("Correção salva.");
      changed();
      await consult();
      message = "Correção salva. Registros atualizados.";
    } catch (error) {
      message = onError(error);
    } finally {
      busy = false;
    }
  }
</script>

<section class="card correction-card" aria-labelledby="correction-heading">
  <h2 id="correction-heading">Corrigir batida</h2>
  <p class="muted">Altere um horário ou exclua a última batida. É obrigatório informar o motivo; as operações ficam auditadas.</p>
  <label for="correction-date">Data dos registros</label>
  <div class="correction-row">
    <input id="correction-date" type="date" min="2000-01-01" max={brazilDate()}
      bind:value={selectedDate} onchange={() => { consulted = []; selected = null; searched = false; message = ""; sequence++; }}/>
    <button type="button" class="ledger-outline" onclick={consult} disabled={loading || busy}>
      {loading ? "Consultando…" : "Consultar"}
    </button>
  </div>

  <div id="correction-list" aria-live="polite">
    {#if loading}
      <p class="muted">Consultando registros…</p>
    {:else if searched && consulted.length === 0}
      <p class="muted">Sem batidas nesta data.</p>
    {:else}
      {#each consulted as point (point.id)}
        <button type="button" class="ledger-outline" onclick={() => selectPoint(point)}
          disabled={busy}>
          {kinds[point.tipo]} · {point.horario}
        </button>
      {/each}
    {/if}
  </div>
  {#if selected}
    <form id="correction-form" onsubmit={(event) => { event.preventDefault(); void mutate("editar"); }}>
      <strong>{kinds[selected.tipo]} · {selected.horario}</strong>
      <label for="correction-time">Horário correto</label>
      <input id="correction-time" type="time" required bind:value={correctedTime} disabled={busy}/>
      <label for="correction-reason">Motivo obrigatório</label>
      <input id="correction-reason" minlength="3" maxlength="200" required
        placeholder="Por que precisa corrigir?" bind:value={reason} disabled={busy}/>
      <div class="correction-row">
        <button class="primary" type="submit" disabled={busy}>Salvar correção</button>
        <button class="ledger-outline" type="button" onclick={() => selected = null} disabled={busy}>Cancelar</button>
      </div>
      {#if consulted.at(-1)?.id === selected.id}
        <button type="button" class="ledger-link ledger-danger" onclick={() => void mutate("excluir")}
          disabled={busy || reason.trim().length < 3}>Excluir última batida</button>
      {/if}
    </form>
  {/if}
  <p role="status" aria-live="polite">{message}</p>
</section>
