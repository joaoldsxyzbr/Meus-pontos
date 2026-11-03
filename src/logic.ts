import type { PointType } from "./shared/contracts.ts";

const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
});

export function brazilNow(date = new Date()): { date: string; time: string } {
  const parts = formatter.formatToParts(date);
  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? "";
  return { date: get("year") + "-" + get("month") + "-" + get("day"), time: get("hour") + ":" + get("minute") };
}

export function weekday(date: string): number {
  return new Date(date + "T12:00:00Z").getUTCDay();
}

export function expectedTypes(usesInterval: boolean, loadMinutes: number): PointType[] {
  if (!Number.isFinite(Number(loadMinutes)) || Number(loadMinutes) <= 0) return [];
  return usesInterval ? ["entrada", "ida_intervalo", "volta_intervalo", "saida"] : ["entrada", "saida"];
}

export function nextType(rows: { tipo: PointType }[], usesInterval: boolean, loadMinutes: number): PointType | null {
  const expected = expectedTypes(usesInterval, loadMinutes);
  if (!expected.length) return null;
  if (rows.length > expected.length) return null;
  if (rows.some((row, i) => row.tipo !== expected[i])) return null;
  return expected[rows.length] ?? null;
}

export function validTime(value: unknown): boolean {
  return typeof value === "string" && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value);
}

export function validMonth(value: unknown): boolean {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}
/** Valida datas de acertos (sem conversão de datas inexistentes). */
export function validAdjustmentDate(data: unknown, today: string): boolean {
  if (typeof data !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  if (data < "2000-01-01" || data > today) return false;
  const parsed = new Date(data + "T00:00:00Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === data;
}

/** Entrada de ajuste vinda do corpo JSON da requisição. */
export interface AdjustmentInput {
  data?: unknown;
  tipo?: unknown;
  duracao?: unknown;
  motivo?: unknown;
}

/** Converte um ajuste HH:MM em minutos positivos ou negativos. */
export function parseAdjustment(input: unknown, today: string): { data: string; minutos: number; motivo: string } | null {
  const body = input as AdjustmentInput | null | undefined;
  if (!body || typeof body !== "object" || !validAdjustmentDate(body.data, today)) return null;
  if (body.tipo !== "credito" && body.tipo !== "debito") return null;
  if (typeof body.duracao !== "string") return null;
  const match = /^([0-9]{1,3}):([0-5][0-9])$/.exec(body.duracao);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  if (!minutes) return null;
  if (typeof body.motivo !== "string") return null;
  const motivo = body.motivo.trim();
  if (motivo.length < 3 || motivo.length > 200 || /[\u0000-\u001f\u007f]/.test(motivo)) return null;
  return { data: body.data as string, minutos: body.tipo === "credito" ? minutes : -minutes, motivo };
}
