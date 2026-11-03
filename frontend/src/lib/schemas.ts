import { z } from "zod";
import type {
  Adjustment,
  BalanceResponse,
  HistoryResponse,
  PointType,
  RegisterPointResponse,
  TodayResponse
} from "../../../src/shared/contracts.ts";

/**
 * Validação das respostas da API na fronteira do navegador.
 * Se o servidor mudar um nome de campo, o erro aparece aqui com mensagem
 * clara em vez de virar `undefined` silencioso na tela.
 */
const pointType = z.enum(["entrada", "ida_intervalo", "volta_intervalo", "saida"]);
const time = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const minutes = z.number().int();

const point = z.object({ tipo: pointType, horario: time });

export const todaySchema = z.object({
  date,
  now: time,
  points: z.array(point),
  next_type: pointType.nullable(),
  expected_steps: z.array(pointType),
  usa_intervalo: z.boolean(),
  justificativa: z.string().nullable(),
  carga_minutos: minutes,
  total_trabalhado_minutos: minutes.nullable(),
  saldo_minutos: minutes.nullable(),
  pendencia: z
    .enum(["sem_entrada", "sem_saida", "intervalo_incompleto", "intervalo_inesperado", "sequencia_invalida"])
    .nullable()
}) satisfies z.ZodType<TodayResponse>;

export const registerPointSchema = todaySchema.extend({
  ok: z.literal(true),
  type: pointType
}) satisfies z.ZodType<RegisterPointResponse>;

export const historySchema = z.object({
  month: z.string(),
  days: z.array(
    z.object({
      data: date,
      entrada: time.nullable(),
      ida_intervalo: time.nullable(),
      volta_intervalo: time.nullable(),
      saida: time.nullable(),
      total_trabalhado_minutos: minutes.nullable(),
      carga_prevista: minutes,
      saldo_minutos: minutes.nullable(),
      origem: z.enum(["batidas", "justificada", "em_andamento", "falta", "nao_trabalhado"]),
      pendencia: z
        .enum(["sem_entrada", "sem_saida", "intervalo_incompleto", "intervalo_inesperado", "sequencia_invalida"])
        .nullable()
    })
  )
}) satisfies z.ZodType<HistoryResponse>;

export const balanceSchema = z.object({
  saldo_batidas_minutos: minutes,
  saldo_ajustes_minutos: minutes,
  saldo_total_minutos: minutes,
  pendencias: minutes,
  faltas: minutes,
  ajustes: minutes
}) satisfies z.ZodType<BalanceResponse>;

const adjustment = z.object({
  id: minutes,
  data: date,
  minutos: minutes,
  motivo: z.string(),
  criado_em: z.string()
}) satisfies z.ZodType<Adjustment>;

export const adjustmentsPageSchema = z.object({
  ajustes: z.array(adjustment),
  proximo_offset: minutes.nullable()
});

export const storedPointsSchema = z.object({
  data: date,
  pontos: z.array(z.object({ id: minutes, data: date, tipo: pointType, horario: time }))
});

export const sessionSchema = z.object({ autenticado: z.literal(true), usuario: z.string().optional() });
export const okSchema = z.object({ ok: z.literal(true) });

export type { PointType };
