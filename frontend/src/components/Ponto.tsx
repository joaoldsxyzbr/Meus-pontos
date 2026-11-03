import { useEffect, useState } from "react";
import type { RegisterPointRequest, TodayResponse } from "../../../src/shared/contracts.ts";
import { brazilDate, brazilTime, minutesText, displayDate, minuteValue, clockTime, kinds } from "../lib/time.ts";

interface Props {
  day: TodayResponse | null;
  loading: boolean;
  register: (body: RegisterPointRequest) => Promise<void>;
  refresh: () => Promise<void>;
  notify: (text: string) => void;
}

export default function Ponto({ day, loading, register, refresh, notify }: Props) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => brazilTime());
  const [busy, setBusy] = useState(false);

  const expected = day?.expected_steps ?? [];
  const complete =
    Boolean(day) &&
    expected.length > 0 &&
    (day?.points.length ?? 0) === expected.length &&
    expected.every((type, i) => day?.points[i]?.tipo === type) &&
    !day?.pendencia;
  const optionalWork = Boolean(
    day && day.carga_minutos === 0 && day.points.length === 0 && day.next_type === "entrada"
  );
  const timeShown = chosen ?? currentTime;
  const status = complete
    ? "Concluído"
    : day?.justificativa
      ? "Justificado"
      : !expected.length
        ? "Folga"
        : !day?.next_type
          ? "Conferir registros"
          : "Em andamento";
  const actionLabel = optionalWork
    ? "Registrar trabalho em folga"
    : day?.next_type
      ? "Registrar " + kinds[day.next_type].toLowerCase()
      : complete
        ? "Jornada concluída"
        : "Registro indisponível";

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(brazilTime()), 15000);
    return () => clearInterval(interval);
  }, []);

  function adjust(delta: number) {
    setChosen(clockTime(minuteValue(timeShown) + delta));
  }

  function openEditor() {
    setDraft(timeShown);
  }

  function commitDraft() {
    const value = draft;
    setDraft(null);
    if (/^\d{2}:\d{2}$/.test(value ?? "")) setChosen(clockTime(minuteValue(value)));
  }

  async function submit() {
    if (!day?.next_type || loading || busy) return;
    if (day.date !== brazilDate()) {
      setChosen(null);
      notify("A data mudou. Atualize a jornada antes de registrar.");
      await refresh();
      return;
    }
    if (
      optionalWork &&
      !window.confirm("Hoje não há jornada prevista. Confirmar que você está trabalhando neste dia de folga?")
    )
      return;
    const time = timeShown;
    if (
      minuteValue(time) > minuteValue(brazilTime()) &&
      !window.confirm("O horário escolhido é posterior ao atual. Confirma o registro adiantado às " + time + "?")
    )
      return;
    setBusy(true);
    try {
      await register({
        data: day.date,
        horario: time,
        tipo: day.next_type,
        trabalho_em_folga: optionalWork
      });
      setChosen(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível registrar o ponto.");
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page" id="page-ponto" aria-labelledby="title-ponto">
      <div className="heading">
        <div>
          <p className="eyebrow">SEU DIA</p>
          <h1 id="title-ponto">Registrar ponto</h1>
          <p id="today-date" className="muted">
            {day ? displayDate(day.date, true) : "Carregando data…"}
          </p>
        </div>
        <span id="today-status" className={`status${complete ? " done" : ""}`}>
          {loading ? "Carregando" : status}
        </span>
      </div>
      <section className="card clock-card" aria-label="Novo registro">
        <p className="eyebrow center">HORÁRIO DO REGISTRO</p>
        <div className="time-control">
          <button
            className="adjust"
            type="button"
            onClick={() => adjust(-1)}
            aria-label="Diminuir um minuto"
            disabled={minuteValue(timeShown) === 0}
          >
            −
          </button>
          {draft === null ? (
            <time
              className="big-time"
              id="chosen-time"
              role="button"
              tabIndex={0}
              title="Toque para digitar o horário"
              aria-label={"Horário do registro: " + timeShown + ". Toque para digitar outro horário."}
              onClick={openEditor}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openEditor();
                }
              }}
            >
              {timeShown}
            </time>
          ) : (
            <input
              className="big-time"
              id="chosen-time"
              type="time"
              autoFocus
              value={draft}
              aria-label="Digitar horário do registro"
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commitDraft}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitDraft();
                }
                if (event.key === "Escape") setDraft(null);
              }}
            />
          )}
          <button
            className="adjust"
            type="button"
            onClick={() => adjust(1)}
            aria-label="Aumentar um minuto"
            disabled={minuteValue(timeShown) === 1439}
          >
            +
          </button>
        </div>
        <button className="text-button" type="button" onClick={() => setChosen(null)} hidden={chosen === null}>
          Usar horário atual
        </button>
        <button
          id="register"
          className="primary"
          type="button"
          onClick={submit}
          disabled={!day?.next_type || loading || busy}
        >
          {busy ? "Salvando…" : actionLabel}
        </button>
        <p className="hint">
          {optionalWork ? (
            <>Não há jornada prevista. Registre apenas se realmente trabalhar.</>
          ) : day?.next_type ? (
            <>
              {minuteValue(timeShown) > minuteValue(currentTime)
                ? "Horário adiantado: confira antes de registrar."
                : "Confira o horário antes de registrar."}
            </>
          ) : complete ? (
            <>Todas as batidas de hoje estão salvas.</>
          ) : (
            <>Nenhum novo registro disponível.</>
          )}
        </p>
      </section>
      <section className="card daily-card" aria-labelledby="steps-title">
        <div className="card-title">
          <h2 id="steps-title">Registros de hoje</h2>
          <span className="small-label">
            {day?.points.length ?? 0} de {expected.length}
          </span>
        </div>
        <div className="steps">
          {!day ? (
            <p className="muted">Buscando registros…</p>
          ) : !expected.length ? (
            <p className="muted">Sem jornada prevista para hoje.</p>
          ) : null}
          {expected.map((type, i) => {
            const point = day?.points.find((item) => item.tipo === type);
            return (
              <div key={type} className={`step${point ? " done" : ""}`}>
                <span className="step-mark">{point ? "✓" : i + 1}</span>
                <span className="step-name">{kinds[type]}</span>
                <span className="step-time">{point?.horario ?? "--:--"}</span>
              </div>
            );
          })}
        </div>
      </section>
      <section className="daily-summary" aria-label="Resumo do dia">
        <div>
          <span>Trabalhado</span>
          <strong>{minutesText(day?.total_trabalhado_minutos)}</strong>
        </div>
        <div>
          <span>Saldo do dia</span>
          <strong
            className={
              (day?.saldo_minutos ?? 0) > 0 ? "positive" : (day?.saldo_minutos ?? 0) < 0 ? "negative" : ""
            }
          >
            {minutesText(day?.saldo_minutos, true)}
          </strong>
        </div>
      </section>
    </section>
  );
}
