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

export function nextType(rows, usesInterval, loadMinutes) {
  if (!loadMinutes) return null;
  const expected = usesInterval ? ["entrada", "ida_intervalo", "volta_intervalo", "saida"] : ["entrada", "saida"];
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
