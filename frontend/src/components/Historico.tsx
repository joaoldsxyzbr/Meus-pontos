import type { HistoryResponse } from "../../../src/shared/contracts";
import { displayDate, minutesText } from "../lib/time";
import Correcoes from "./Correcoes";

type Props = {
  month: string;
  data: HistoryResponse | null;
  loading: boolean;
  changeMonth: (month: string) => void;
  changed: () => void;
  notify: (message: string) => void;
  onError: (error: unknown) => string;
};

type HistoryDayItem = NonNullable<HistoryResponse["days"]>[number];

export default function Historico({ month, data, loading, changeMonth, changed, notify, onError }: Props) {
  const total = data?.days.reduce((sum, day) => sum + (day.saldo_minutos ?? 0), 0) ?? 0;

  function state(item: HistoryDayItem) {
    return item.pendencia === "sem_saida" ? "Sem saída" :
      item.pendencia === "intervalo_incompleto" ? "Intervalo incompleto" :
      item.origem === "falta" ? "Falta" :
      item.origem === "justificada" ? "Justificado" :
      item.origem === "nao_trabalhado" ? "Folga" :
      item.saldo_minutos == null ? "Em andamento" : minutesText(item.total_trabalhado_minutos) + " trabalhadas";
  }

  return <section className="page" id="page-historico" aria-labelledby="title-history">
    <div className="heading">
      <div><p className="eyebrow">SUA JORNADA</p><h1 id="title-history">Histórico</h1>
        <p className="muted">Batidas e saldos por dia</p></div>
    </div>
    <div className="month-picker">
      <label htmlFor="history-month">Selecione o mês</label>
      <input id="history-month" type="month" value={month}
        onChange={event => changeMonth(event.target.value)}/>
    </div>
    <div className="history-summary" id="history-summary" aria-live="polite">
      {loading
        ? "Carregando histórico…"
        : data
          ? data.days.length + " dias no período · Saldo " + minutesText(total, true)
          : null}
    </div>
    <div className="history-list" id="history-list">
      {loading
        ? <p className="muted">Buscando registros…</p>
        : data?.days.length === 0
          ? <div className="empty">Nenhum dia encontrado neste mês.</div>
          : (data?.days ?? []).map(item =>
            <article key={item.data} className="history-row">
              <div>
                <div className="history-date">{displayDate(item.data)}</div>
                <div className="history-detail">
                  {[
                    item.entrada && "Entrada " + item.entrada,
                    item.ida_intervalo && "Intervalo " + item.ida_intervalo,
                    item.volta_intervalo && "Retorno " + item.volta_intervalo,
                    item.saida && "Saída " + item.saida
                  ].filter(Boolean).join(" · ") || "Sem batidas"}
                </div>
              </div>
              <div>
                <div className={"history-value" +
                  ((item.saldo_minutos ?? 0) > 0 ? " positive" : "") +
                  ((item.saldo_minutos ?? 0) < 0 ? " negative" : "")}>{minutesText(item.saldo_minutos, true)}</div>
                <div className="history-state">{state(item)}</div>
              </div>
            </article>)}
    </div>
    <Correcoes changed={changed} notify={notify} onError={onError}/>
  </section>;
}
