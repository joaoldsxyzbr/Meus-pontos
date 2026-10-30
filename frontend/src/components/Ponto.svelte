<script lang="ts">
  import { onMount } from "svelte";
  import type { TodayResponse, RegisterPointRequest, PointType } from "../../../src/shared/contracts";
  import { brazilDate, brazilTime, minutesText, displayDate, minuteValue, clockTime, kinds } from "../lib/time";

  let { day, loading, register, refresh, notify }: {
    day: TodayResponse | null;
    loading: boolean;
    register: (body: RegisterPointRequest) => Promise<void>;
    refresh: () => Promise<void>;
    notify: (text: string) => void;
  } = $props();

  let chosen = $state<string | null>(null);
  let currentTime = $state(brazilTime());
  let busy = $state(false);
  let expected = $derived(day?.expected_steps ?? []);
  let complete = $derived(Boolean(day && expected.length > 0 &&
    day.points.length === expected.length &&
    expected.every((type, i) => day.points[i]?.tipo === type) && !day.pendencia));
  let optionalWork = $derived(Boolean(day && day.carga_minutos === 0 &&
    day.points.length === 0 && day.next_type === "entrada"));
  let timeShown = $derived(chosen ?? currentTime);
  let status = $derived(complete ? "Concluído" : day?.justificativa ? "Justificado" :
    !expected.length ? "Folga" : !day?.next_type ? "Conferir registros" : "Em andamento");
  let actionLabel = $derived(optionalWork ? "Registrar trabalho em folga" :
    day?.next_type ? "Registrar " + kinds[day.next_type].toLowerCase() :
    complete ? "Jornada concluída" : "Registro indisponível");

  onMount(() => {
    const interval = setInterval(() => currentTime = brazilTime(), 15000);
    return () => clearInterval(interval);
  });

  function adjust(delta: number) {
    chosen = clockTime(minuteValue(timeShown) + delta);
  }

  async function submit() {
    if (!day?.next_type || loading || busy) return;
    if (day.date !== brazilDate()) {
      chosen = null;
      notify("A data mudou. Atualize a jornada antes de registrar.");
      await refresh();
      return;
    }
    if (optionalWork && !window.confirm("Hoje não há jornada prevista. Confirmar que você está trabalhando neste dia de folga?")) return;
    const time = timeShown;
    if (minuteValue(time) > minuteValue(brazilTime()) &&
        !window.confirm("O horário escolhido é posterior ao atual. Confirma o registro adiantado às " + time + "?")) return;
    busy = true;
    try {
      await register({
        data: day.date,
        horario: time,
        tipo: day.next_type,
        trabalho_em_folga: optionalWork
      });
      chosen = null;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível registrar o ponto.");
      await refresh().catch(() => {});
    } finally {
      busy = false;
    }
  }
</script>

<section class="page" id="page-ponto" aria-labelledby="title-ponto">
  <div class="heading">
    <div>
      <p class="eyebrow">SEU DIA</p>
      <h1 id="title-ponto">Registrar ponto</h1>
      <p id="today-date" class="muted">{day ? displayDate(day.date, true) : "Carregando data…"}</p>
    </div>
    <span id="today-status" class:done={complete} class="status">{loading ? "Carregando" : status}</span>
  </div>
  <section class="card clock-card" aria-label="Novo registro">
    <p class="eyebrow center">HORÁRIO DO REGISTRO</p>
    <div class="time-control">
      <button class="adjust" type="button" onclick={() => adjust(-1)} aria-label="Diminuir um minuto" disabled={minuteValue(timeShown) === 0}>−</button>
      <time class="big-time" id="chosen-time">{timeShown}</time>
      <button class="adjust" type="button" onclick={() => adjust(1)} aria-label="Aumentar um minuto" disabled={minuteValue(timeShown) === 1439}>+</button>
    </div>
    <button class="text-button" type="button" onclick={() => chosen = null} hidden={chosen === null}>Usar horário atual</button>
    <button id="register" class="primary" type="button" onclick={submit}
      disabled={!day?.next_type || loading || busy}>{busy ? "Salvando…" : actionLabel}</button>
    <p class="hint">
      {#if optionalWork}
        Não há jornada prevista. Registre apenas se realmente trabalhar.
      {:else if day?.next_type}
        {minuteValue(timeShown) > minuteValue(currentTime) ? "Horário adiantado: confira antes de registrar." : "Confira o horário antes de registrar."}
      {:else if complete}
        Todas as batidas de hoje estão salvas.
      {:else}
        Nenhum novo registro disponível.
      {/if}
    </p>
  </section>
  <section class="card daily-card" aria-labelledby="steps-title">
    <div class="card-title">
      <h2 id="steps-title">Registros de hoje</h2>
      <span class="small-label">{day?.points.length ?? 0} de {expected.length}</span>
    </div>
    <div class="steps">
      {#if !day}
        <p class="muted">Buscando registros…</p>
      {:else if !expected.length}
        <p class="muted">Sem jornada prevista para hoje.</p>
      {/if}
      {#each expected as type, i (type)}
        {@const point = day?.points.find(item => item.tipo === type)}
        <div class:done={!!point} class="step">
          <span class="step-mark">{point ? "✓" : i + 1}</span>
          <span class="step-name">{kinds[type as PointType]}</span>
          <span class="step-time">{point?.horario ?? "--:--"}</span>
        </div>
      {/each}
    </div>
  </section>
  <section class="daily-summary" aria-label="Resumo do dia">
    <div><span>Trabalhado</span><strong>{minutesText(day?.total_trabalhado_minutos)}</strong></div>
    <div><span>Saldo do dia</span>
      <strong class:positive={(day?.saldo_minutos ?? 0) > 0}
        class:negative={(day?.saldo_minutos ?? 0) < 0}>{minutesText(day?.saldo_minutos, true)}</strong>
    </div>
  </section>
</section>
