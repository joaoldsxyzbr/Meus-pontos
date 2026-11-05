import type { HistoryDay, HistoryResponse } from "../../../src/shared/contracts.ts";
import { displayDate, minutesText } from "../lib/time.ts";

interface Props {
  month: string;
  data: HistoryResponse | null;
  loading: boolean;
  changeMonth: (month: string) => void;
}

const CHART_MIN_RANGE = 60;

function dayLabel(date: string): string {
  return date.slice(8, 10);
}

function barState(item: HistoryDay): string {
  if (item.origem === "falta") return "Falta";
  if (item.origem === "justificada") return "Justificado";
  if (item.origem === "nao_trabalhado") return "Folga";
  if (item.saldo_minutos == null) return "Em andamento";
  return "Saldo " + minutesText(item.saldo_minutos, true);
}

interface BarGeometry {
  top: number;
  height: number;
}

function barGeometry(value: number, range: number, zeroTop: number): BarGeometry {
  const safeRange = Math.max(range, CHART_MIN_RANGE);
  const height = (Math.abs(value) / safeRange) * 100;
  if (value >= 0) return { top: zeroTop - height, height };
  return { top: zeroTop, height };
}

function Chart({ days, cumulative }: { days: HistoryDay[]; cumulative?: boolean }) {
  const values = days.map((day) => day.saldo_minutos ?? 0);
  const series = cumulative
    ? values.reduce<number[]>((acc, value) => [...acc, (acc.at(-1) ?? 0) + value], [])
    : values;
  const maxPos = Math.max(0, ...series);
  const maxNeg = Math.min(0, ...series);
  const range = maxPos - maxNeg;
  const zeroTop = range > 0 ? (maxPos / range) * 100 : 100;
  const safeRange = Math.max(range, CHART_MIN_RANGE);

  return (
    <div className="chart" role="img">
      {days.map((day, index) => {
        const value = series[index] ?? 0;
        const geometry = value === 0 ? null : barGeometry(value, safeRange, zeroTop);
        const tone =
          value > 0 ? "pos" : value < 0 ? "neg" : day.origem === "falta" ? "absent" : "flat";
        return (
          <div
            className="chart-bar"
            key={day.data}
            title={`${displayDate(day.data, true)} · ${barState(day)}${
              day.total_trabalhado_minutos != null
                ? " · " + minutesText(day.total_trabalhado_minutos) + " trabalhadas"
                : ""
            }`}
          >
            {geometry ? (
              <span
                className={`chart-fill ${tone}`}
                style={{ top: `${geometry.top}%`, height: `${Math.max(geometry.height, 1.5)}%` }}
              />
            ) : (
              <span className="chart-zero" style={{ top: `${zeroTop}%` }} />
            )}
            <span className="chart-label">{dayLabel(day.data)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function Visual({ month, data, loading, changeMonth }: Props) {
  const days = data?.days ?? [];
  const worked = days.filter((day) => day.total_trabalhado_minutos != null);
  const totalWorked = worked.reduce((sum, day) => sum + (day.total_trabalhado_minutos ?? 0), 0);
  const expected = days.reduce((sum, day) => sum + day.carga_prevista, 0);
  const balance = days.reduce((sum, day) => sum + (day.saldo_minutos ?? 0), 0);
  const absences = days.filter((day) => day.origem === "falta").length;
  const pendencies = days.filter((day) => day.pendencia != null).length;

  return (
    <section className="page" id="page-visual" aria-labelledby="title-visual">
      <div className="heading">
        <div>
          <p className="eyebrow">PANORAMA</p>
          <h1 id="title-visual">Visual</h1>
          <p className="muted">Seus pontos do m&ecirc;s em gr&aacute;ficos</p>
        </div>
      </div>
      <div className="month-picker">
        <label htmlFor="visual-month">Selecione o m&ecirc;s</label>
        <input
          id="visual-month"
          type="month"
          value={month}
          onChange={(event) => changeMonth(event.currentTarget.value)}
        />
      </div>
      {loading ? (
        <p className="muted">Carregando visual&hellip;</p>
      ) : days.length === 0 ? (
        <div className="empty">Nenhum dia encontrado neste m&ecirc;s.</div>
      ) : (
        <>
          <div className="balance-grid visual-metrics">
            <div className="metric">
              <span>Saldo do m&ecirc;s</span>
              <strong className={balance > 0 ? "positive" : balance < 0 ? "negative" : ""}>
                {minutesText(balance, true)}
              </strong>
            </div>
            <div className="metric">
              <span>Trabalhadas</span>
              <strong>{minutesText(totalWorked)}</strong>
            </div>
            <div className="metric">
              <span>Carga prevista</span>
              <strong>{minutesText(expected)}</strong>
            </div>
            <div className="metric">
              <span>Faltas</span>
              <strong>{absences}</strong>
            </div>
          </div>
          <div className="card daily-card">
            <div className="card-title">
              <h2>Saldo por dia</h2>
              <span className="small-label">{pendencies} pend&ecirc;ncia(s)</span>
            </div>
            <Chart days={days} />
          </div>
          <div className="card daily-card">
            <div className="card-title">
              <h2>Saldo acumulado</h2>
              <span className="small-label">{data?.month}</span>
            </div>
            <Chart days={days} cumulative />
          </div>
        </>
      )}
    </section>
  );
}
