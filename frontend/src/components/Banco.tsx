import type { BalanceResponse } from "../../../src/shared/contracts.ts";
import { minutesText } from "../lib/time.ts";
import Ajustes from "./Ajustes.tsx";

interface Props {
  data: BalanceResponse | null;
  loading: boolean;
  changed: () => void;
  notify: (message: string) => void;
  onError: (error: unknown) => string;
}

export default function Banco({ data, loading, changed, notify, onError }: Props) {
  const total = data?.saldo_total_minutos ?? 0;
  const signed = (value: number | undefined) => (value ?? 0) > 0 ? "positive" : (value ?? 0) < 0 ? "negative" : "";

  return (
    <section className="page" id="page-saldo" aria-labelledby="title-balance">
      <div className="heading">
        <div>
          <p className="eyebrow">SEU ACUMULADO</p>
          <h1 id="title-balance">Banco de horas</h1>
          <p className="muted">Desde o início da contagem</p>
        </div>
      </div>
      <section className="balance-hero" aria-label="Saldo total">
        <p>Saldo total</p>
        <strong id="balance-total">{minutesText(data?.saldo_total_minutos, true)}</strong>
        <span>
          {loading
            ? "Consultando banco…"
            : total > 0
              ? "Horas a favor"
              : total < 0
                ? "Horas a compensar"
                : "Banco de horas zerado"}
        </span>
      </section>
      <div className="balance-grid">
        <div className="metric">
          <span>Saldo das jornadas</span>
          <strong className={signed(data?.saldo_batidas_minutos)}>
            {minutesText(data?.saldo_batidas_minutos, true)}
          </strong>
        </div>
        <div className="metric">
          <span>Ajustes manuais</span>
          <strong className={signed(data?.saldo_ajustes_minutos)}>
            {minutesText(data?.saldo_ajustes_minutos, true)}
          </strong>
        </div>
        <div className="metric">
          <span>Faltas</span>
          <strong>{data?.faltas ?? "—"}</strong>
        </div>
        <div className="metric">
          <span>Pendências</span>
          <strong>{data?.pendencias ?? "—"}</strong>
        </div>
      </div>
      <p className="note">O saldo considera jornadas fechadas, faltas não justificadas e ajustes cadastrados.</p>
      <Ajustes changed={changed} notify={notify} onError={onError} />
    </section>
  );
}
