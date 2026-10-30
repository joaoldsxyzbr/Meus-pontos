const DAY_MS = 86400000;
function parseDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(value + "T12:00:00Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0,10) === value ? time : null;
}

/**
 * Calcula somente a carga prevista, nunca altera pontos ou saldo.
 * Uma referência é o primeiro sábado TRABALHADO de um ciclo quinzenal.
 * Não retroage para datas anteriores à referência nem faz suposições se ausente.
 */
export function effectiveSchedule(date, schedule = {}) {
  const base = Number.isSafeInteger(schedule.carga_minutos) && schedule.carga_minutos >= 0 ?
    schedule.carga_minutos : 0;
  const dateTime = parseDate(date);
  const referenceTime = parseDate(schedule.sabado_referencia);
  const restSaturday = dateTime !== null && referenceTime !== null &&
    new Date(dateTime).getUTCDay() === 6 && new Date(referenceTime).getUTCDay() === 6 &&
    dateTime >= referenceTime && Math.round((dateTime - referenceTime) / (7 * DAY_MS)) % 2 === 1;
  const justified = typeof schedule.justificativa === "string" && schedule.justificativa.length > 0;
  const minutes = restSaturday || justified ? 0 : base;
  return {
    carga_minutos: minutes,
    usa_intervalo: minutes > 0 && Boolean(schedule.usa_intervalo),
    justificativa: justified ? schedule.justificativa : null
  };
}
