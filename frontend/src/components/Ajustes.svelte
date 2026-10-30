<script lang="ts">
  import { onMount } from "svelte";
  import type { Adjustment, AdjustmentsPage } from "../../../src/shared/contracts";
  import { api } from "../lib/api";
  import { brazilDate, displayDate, minutesText } from "../lib/time";

  let { changed, notify, onError }: {
    changed: () => void;
    notify: (message: string) => void;
    onError: (error: unknown) => string;
  } = $props();

  let items = $state<Adjustment[]>([]);
  let nextOffset = $state<number | null>(null);
  let loading = $state(false);
  let moreBusy = $state(false);
  let busy = $state(false);
  let opened = $state(false);
  let editId = $state<number | null>(null);
  let action = $state<"credito" | "debito">("credito");
  let duration = $state("");
  let date = $state(brazilDate());
  let reason = $state("");
  let message = $state("");
  let sequence = 0;

  function closeForm() {
    opened = false;
    editId = null;
    action = "credito";
    duration = "";
    date = brazilDate();
    reason = "";
  }

  function openForm(item: Adjustment | null = null) {
    editId = item?.id ?? null;
    action = item && item.minutos < 0 ? "debito" : "credito";
    const abs = Math.abs(item?.minutos ?? 0);
    duration = item ? `${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}` : "";
    date = item?.data ?? brazilDate();
    reason = item?.motivo ?? "";
    opened = true;
  }

  async function load() {
    const current = ++sequence;
    loading = true;
    message = "";
    try {
      const result = await api<AdjustmentsPage>("/api/ajustes?offset=0");
      if (current === sequence) {
        items = result.ajustes;
        nextOffset = result.proximo_offset;
      }
    } catch (error) {
      if (current === sequence) message = onError(error);
    } finally {
      if (current === sequence) loading = false;
    }
  }

  onMount(() => {
    void load();
  });

  async function loadMore() {
    if (nextOffset == null || moreBusy || loading) return;
    const offset = nextOffset;
    moreBusy = true;
    try {
      const page = await api<AdjustmentsPage>(`/api/ajustes?offset=${offset}`);
      const ids = new Set(items.map(item => item.id));
      items = [...items, ...page.ajustes.filter(item => !ids.has(item.id))];
      nextOffset = page.proximo_offset;
    } catch (error) {
      message = onError(error);
    } finally {
      moreBusy = false;
    }
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    busy = true;
    const id = editId;
    try {
      await api<{ ok: true }>(id === null ? "/api/ajustes" : `/api/ajustes/${id}`, {
        method: id === null ? "POST" : "PUT",
        body: { tipo: action, duracao: duration.trim(), data: date, motivo: reason.trim() }
      });
      closeForm();
      notify(id === null ? "Ajuste salvo." : "Ajuste atualizado.");
      changed();
      await load();
    } catch (error) {
      message = onError(error);
    } finally {
      busy = false;
    }
  }

  async function remove(item: Adjustment) {
    if (busy || !window.confirm(`Excluir ${minutesText(item.minutos, true)} (${item.motivo})? O saldo será recalculado.`)) return;
    busy = true;
    try {
      await api<{ ok: true }>(`/api/ajustes/${item.id}`, { method: "DELETE" });
      if (editId === item.id) closeForm();
      notify("Ajuste excluído.");
      changed();
      await load();
    } catch (error) {
      message = onError(error);
    } finally {
      busy = false;
    }
  }
</script>

<section class="card ledger-card" aria-labelledby="ledger-title">
  <div class="card-title ledger-heading">
    <div><h2 id="ledger-title">Acertos manuais</h2>
      <p class="muted">Créditos e descontos sem mexer nas batidas.</p>
    </div>
    <button type="button" class="ledger-outline" hidden={opened}
      onclick={() => openForm()} disabled={busy}>Novo ajuste</button>
  </div>
  {#if opened}
    <form id="ledger-form" class="ledger-form" onsubmit={save}>
      <h3>{editId === null ? "Novo ajuste" : "Editar ajuste"}</h3>
      <div class="ledger-grid">
        <label>Operação
          <select required bind:value={action} disabled={busy}>
            <option value="credito">Creditar (+)</option>
            <option value="debito">Descontar (−)</option>
          </select>
        </label>
        <label>Duração (HH:MM)
          <input required maxlength="6" placeholder="01:30" pattern="[0-9]{1,3}:[0-5][0-9]"
            bind:value={duration} disabled={busy}/>
        </label>
        <label class="ledger-wide">Data
          <input type="date" min="2000-01-01" max={brazilDate()} required
            bind:value={date} disabled={busy}/>
        </label>
        <label class="ledger-wide">Motivo
          <input minlength="3" maxlength="200" required
            placeholder="Ex.: compensação autorizada" bind:value={reason} disabled={busy}/>
        </label>
      </div>
      <div class="ledger-form-actions">
        <button type="submit" class="primary" disabled={busy}>
          {busy ? "Salvando…" : editId === null ? "Salvar ajuste" : "Salvar alterações"}
        </button>
        <button type="button" class="ledger-outline" onclick={closeForm} disabled={busy}>Cancelar</button>
      </div>
    </form>
  {/if}
  <div class="ledger-list" id="ledger-list" aria-live="polite">
    {#if loading}
      <p class="muted">Carregando ajustes…</p>
    {:else if !items.length}
      <p class="muted">Nenhum ajuste manual registrado.</p>
    {:else}
      {#each items as item (item.id)}
        <article class="ledger-item">
          <div class="ledger-info">
            <small>{displayDate(item.data)}</small>
            <strong>{item.motivo}</strong>
          </div>
          <div class="ledger-side">
            <strong class:positive={item.minutos > 0} class:negative={item.minutos < 0}>
              {minutesText(item.minutos, true)}
            </strong>
            <div class="ledger-actions">
              <button type="button" class="ledger-link" onclick={() => openForm(item)}
                disabled={busy}>Editar</button>
              <button type="button" class="ledger-link ledger-danger" onclick={() => void remove(item)}
                disabled={busy}>Excluir</button>
            </div>
          </div>
        </article>
      {/each}
    {/if}
  </div>
  {#if nextOffset !== null && !loading}
    <button type="button" class="ledger-outline" onclick={loadMore} disabled={moreBusy || busy}>
      {moreBusy ? "Carregando…" : "Carregar mais ajustes"}
    </button>
  {/if}
  <p role="status" aria-live="polite">{message}</p>
</section>
