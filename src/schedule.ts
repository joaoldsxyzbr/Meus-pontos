const DAY_MS = 86400000;

function parseDate(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(value + "T12:00:00Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null;
}

export interface ScheduleInput {
  carga_minutos?: unknown;
  usa_intervalo?: unknown;
  sabado_referencia?: unknown;
  justificativa?: unknown;
}

export interface EffectiveSchedule {
  carga_minutos: number;
  usa_intervalo: boolean;
  justificativa: string | null;
}

/**
 * Calcula somente a carga prevista, nunca altera pontos ou saldo.
 * Uma referência é o primeiro sábado TRABALHADO de um ciclo quinzenal.
 * Não retroage para datas anteriores à referência nem faz suposições se ausente.
 */
export function effectiveSchedule(date: string, schedule: ScheduleInput = {}): EffectiveSchedule {
  const base =
    Number.isSafeInteger(schedule.carga_minutos) && (schedule.carga_minutos as number) >= 0
      ? (schedule.carga_minutos as number)
      : 0;
  const dateTime = parseDate(date);
  const referenceTime = parseDate(schedule.sabado_referencia);
  const restSaturday =
    dateTime !== null &&
    referenceTime !== null &&
    new Date(dateTime).getUTCDay() === 6 &&
    new Date(referenceTime).getUTCDay() === 6 &&
    dateTime >= referenceTime &&
    Math.round((dateTime - referenceTime) / (7 * DAY_MS)) % 2 === 1;
  const justified =
    typeof schedule.justificativa === "string" && schedule.justificativa.length > 0;
  const minutes = restSaturday || justified ? 0 : base;
  return {
    carga_minutos: minutes,
    usa_intervalo: Boolean(schedule.usa_intervalo),
    justificativa: justified ? (schedule.justificativa as string) : null
  };
}
