import type { PointIssue, PointType } from "./shared/contracts.ts";

const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
});

export interface BrazilNow {
  date: string;
  time: string;
}

export function brazilNow(date: Date = new Date()): BrazilNow {
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  ) as Record<string, string>;
  return {
    date: parts.year + "-" + parts.month + "-" + parts.day,
    time: parts.hour + ":" + parts.minute
  };
}

export function weekday(date: string): number {
  return new Date(date + "T12:00:00Z").getUTCDay();
}

export function expectedTypes(usesInterval: boolean, loadMinutes: number): PointType[] {
  if (!Number.isFinite(Number(loadMinutes)) || Number(loadMinutes) <= 0) return [];
  return usesInterval
    ? ["entrada", "ida_intervalo", "volta_intervalo", "saida"]
    : ["entrada", "saida"];
}

export interface PointRow {
  tipo: PointType;
  horario: string;
}

export function nextType(
  rows: readonly PointRow[],
  usesInterval: boolean,
  loadMinutes: number
): PointType | null {
  const expected = expectedTypes(usesInterval, loadMinutes);
  if (!expected.length) return null;
  if (rows.length > expected.length) return null;
  if (rows.some((row, i) => row.tipo !== expected[i])) return null;
  return expected[rows.length] ?? null;
}

export function validTime(value: unknown): value is string {
  return typeof value === "string" && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value);
}

export function validMonth(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Valida datas de acertos (sem conversão de datas inexistentes). */
export function validAdjustmentDate(data: unknown, today: string): data is string {
  if (typeof data !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  if (data < "2000-01-01" || data > today) return false;
  const parsed = new Date(data + "T00:00:00Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === data;
}

export interface AdjustmentInput {
  data?: unknown;
  tipo?: unknown;
  duracao?: unknown;
  motivo?: unknown;
}

export interface ParsedAdjustment {
  data: string;
  minutos: number;
  motivo: string;
}

/** Converte um ajuste HH:MM em minutos positivos ou negativos. */
export function parseAdjustment(input: unknown, today: string): ParsedAdjustment | null {
  if (!input || typeof input !== "object") return null;
  const value = input as AdjustmentInput;
  if (!validAdjustmentDate(value.data, today)) return null;
  if (value.tipo !== "credito" && value.tipo !== "debito") return null;
  if (typeof value.duracao !== "string") return null;
  const match = /^([0-9]{1,3}):([0-5][0-9])$/.exec(value.duracao);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  if (!minutes) return null;
  if (typeof value.motivo !== "string") return null;
  const motivo = value.motivo.trim();
  if (motivo.length < 3 || motivo.length > 200 || /[\u0000-\u001f\u007f]/.test(motivo)) return null;
  return { data: value.data, minutos: value.tipo === "credito" ? minutes : -minutes, motivo };
}

// Reexportado para conveniência dos consumidores do domínio.
export type { PointIssue, PointType };
