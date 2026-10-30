<script lang="ts">
  import type { HistoryResponse } from "../../../src/shared/contracts";
  import { displayDate, minutesText } from "../lib/time";

  let { month, data, loading, changeMonth }: {
    month: string;
    data: HistoryResponse | null;
    loading: boolean;
    changeMonth: (month: string) => void;
  } = $props();

  let total = $derived(data?.days.reduce((sum, day) => sum + (day.saldo_minutos ?? 0), 0) ?? 0);
  function state(item: NonNullable<HistoryResponse["days"]>[number]) {
    return item.pendencia === "sem_saida" ? "Sem saída" :
      item.pendencia === "intervalo_incompleto" ? "Intervalo incompleto" :
      item.origem === "falta" ? "Falta" :
      item.origem === "justificada" ? "Justificado" :
      item.origem === "nao_trabalhado" ? "Folga" :
      item.saldo_minutos == null ? "Em andamento" : minutesText(item.total_trabalhado_minutos) + " trabalhadas";
  }
</script>
<section class="page" id="page-historico" aria-labelledby="title-history">
  <div class="heading">
    <div><p class="eyebrow">SUA JORNADA</p><h1 id="title-history">Histórico</h1>
      <p class="muted">Batidas e saldos por dia</p></div>
  </div>
  <div class="month-picker">
    <label for="history-month">Selecione o mês</label>
    <input id="history-month" type="month" value={month} onchange={(event) => changeMonth(event.currentTarget.value)}/>
  </div>
  <div class="history-summary" id="history-summary" aria-live="polite">
    {#if loading}
      Carregando histórico…
    {:else if data}
      {data.days.length} dias no período · Saldo {minutesText(total, true)}
    {/if}
  </div>
  <div class="history-list" id="history-list">
    {#if loading}
      <p class="muted">Buscando registros…</p>
    {:else if data?.days.length === 0}
      <div class="empty">Nenhum dia encontrado neste mês.</div>
    {:else}
      {#each data?.days ?? [] as item (item.data)}
        <article class="history-row">
          <div>
            <div class="history-date">{displayDate(item.data)}</div>
            <div class="history-detail">
              {[
                item.entrada && "Entrada " + item.entrada,
                item.ida_intervalo && "Intervalo " + item.ida_intervalo,
                item.volta_intervalo && "Retorno " + item.volta_intervalo,
                item.saida && "Saída " + item.saida
              ].filter(Boolean).join(" · ") || "Sem batidas"}
            </div>
          </div>
          <div>
            <div class="history-value"
              class:positive={(item.saldo_minutos ?? 0) > 0}
              class:negative={(item.saldo_minutos ?? 0) < 0}>{minutesText(item.saldo_minutos, true)}</div>
            <div class="history-state">{state(item)}</div>
          </div>
        </article>
      {/each}
    {/if}
  </div>
  <p class="hint">Piloto Svelte: correção de batidas será migrada em uma próxima etapa.</p>
</section>
