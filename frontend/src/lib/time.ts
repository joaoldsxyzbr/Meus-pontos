import type { PointType } from "../../../src/shared/contracts";

const formatters = {
  date: new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"
  }),
  time: new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  })
};

export const kinds: Record<PointType, string> = {
  entrada: "Entrada",
  ida_intervalo: "Saída para intervalo",
  volta_intervalo: "Retorno do intervalo",
  saida: "Saída"
};

export function brazilDate(date = new Date()): string {
  const fields = Object.fromEntries(formatters.date.formatToParts(date).map(part => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

export function brazilTime(date = new Date()): string {
  return formatters.time.format(date);
}

export function minuteValue(time: string): number {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function clockTime(minutes: number): string {
  const safe = Math.max(0, Math.min(1439, minutes));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

export function minutesText(value: number | null | undefined, signed = false): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const mark = value < 0 ? "−" : signed && value > 0 ? "+" : "";
  const abs = Math.abs(value);
  return `${mark}${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, "0")}`;
}

export function displayDate(date: string, long = false): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  return new Date(date + "T12:00:00Z").toLocaleDateString("pt-BR", {
    timeZone: "UTC", weekday: long ? "long" : "short",
    day: "2-digit", month: long ? "long" : "short",
    year: long ? "numeric" : undefined
  });
}
