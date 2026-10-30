const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
});

export function brazilNow(date = new Date()) {
  const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  return { date: parts.year + "-" + parts.month + "-" + parts.day, time: parts.hour + ":" + parts.minute };
}

export function weekday(date) {
  return new Date(date + "T12:00:00Z").getUTCDay();
}

export function expectedTypes(usesInterval, loadMinutes) {
  if (!Number.isFinite(Number(loadMinutes)) || Number(loadMinutes) <= 0) return [];
  return usesInterval ? ["entrada", "ida_intervalo", "volta_intervalo", "saida"] : ["entrada", "saida"];
}

export function nextType(rows, usesInterval, loadMinutes) {
  const expected = expectedTypes(usesInterval, loadMinutes);
  if (!expected.length) return null;
  if (rows.length > expected.length) return null;
  if (rows.some((row, i) => row.tipo !== expected[i])) return null;
  return expected[rows.length] || null;
}

export function validTime(value) {
  return typeof value === "string" && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value);
}

export function validMonth(value) {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}
/** Valida datas de acertos (sem conversão de datas inexistentes). */
export function validAdjustmentDate(data, today) {
  if (typeof data !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  if (data < "2000-01-01" || data > today) return false;
  const parsed = new Date(data + "T00:00:00Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === data;
}

/** Converte um ajuste HH:MM em minutos positivos ou negativos. */
export function parseAdjustment(input, today) {
  if (!input || typeof input !== "object" || !validAdjustmentDate(input.data, today)) return null;
  if (input.tipo !== "credito" && input.tipo !== "debito") return null;
  if (typeof input.duracao !== "string") return null;
  const match = /^([0-9]{1,3}):([0-5][0-9])$/.exec(input.duracao);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  if (!minutes) return null;
  if (typeof input.motivo !== "string") return null;
  const motivo = input.motivo.trim();
  if (motivo.length < 3 || motivo.length > 200 || /[\u0000-\u001f\u007f]/.test(motivo)) return null;
  return { data: input.data, minutos: input.tipo === "credito" ? minutes : -minutes, motivo };
}
