<script lang="ts">
  import type { BalanceResponse } from "../../../src/shared/contracts";
  import { minutesText } from "../lib/time";
  import Ajustes from "./Ajustes.svelte";

  let { data, loading, changed, notify, onError }: {
    data: BalanceResponse | null;
    loading: boolean;
    changed: () => void;
    notify: (message: string) => void;
    onError: (error: unknown) => string;
  } = $props();
</script>
<section class="page" id="page-saldo" aria-labelledby="title-balance">
  <div class="heading">
    <div><p class="eyebrow">SEU ACUMULADO</p><h1 id="title-balance">Banco de horas</h1>
      <p class="muted">Desde o início da contagem</p></div>
  </div>
  <section class="balance-hero" aria-label="Saldo total">
    <p>Saldo total</p>
    <strong id="balance-total">{minutesText(data?.saldo_total_minutos, true)}</strong>
    <span>{loading ? "Consultando banco…" :
      (data?.saldo_total_minutos ?? 0) > 0 ? "Horas a favor" :
      (data?.saldo_total_minutos ?? 0) < 0 ? "Horas a compensar" : "Banco de horas zerado"}</span>
  </section>
  <div class="balance-grid">
    <div class="metric"><span>Saldo das jornadas</span>
      <strong class:positive={(data?.saldo_batidas_minutos ?? 0) > 0}
        class:negative={(data?.saldo_batidas_minutos ?? 0) < 0}>{minutesText(data?.saldo_batidas_minutos, true)}</strong>
    </div>
    <div class="metric"><span>Ajustes manuais</span>
      <strong class:positive={(data?.saldo_ajustes_minutos ?? 0) > 0}
        class:negative={(data?.saldo_ajustes_minutos ?? 0) < 0}>{minutesText(data?.saldo_ajustes_minutos, true)}</strong>
    </div>
    <div class="metric"><span>Faltas</span><strong>{data?.faltas ?? "—"}</strong></div>
    <div class="metric"><span>Pendências</span><strong>{data?.pendencias ?? "—"}</strong></div>
  </div>
  <p class="note">O saldo considera jornadas fechadas, faltas não justificadas e ajustes cadastrados.</p>
  <Ajustes {changed} {notify} {onError}/>
</section>
