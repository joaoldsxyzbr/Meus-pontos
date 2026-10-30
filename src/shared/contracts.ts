/**
 * Contratos HTTP atuais do Worker. Não substitui validação em runtime:
 * cada resposta externa ainda deve ser validada na fronteira.
 * Os nomes e as unidades refletem a API existente.
 */
export type DateISO = string; // AAAA-MM-DD validado no servidor
export type TimeHHMM = string; // HH:MM validado no servidor
export type Minutes = number; // inteiro, sinalizado quando representa saldo

export type PointType = "entrada" | "ida_intervalo" | "volta_intervalo" | "saida";
export type Origin = "batidas" | "justificada" | "em_andamento" | "falta" | "nao_trabalhado";
export type PointIssue = "sem_entrada" | "sem_saida" |
  "intervalo_incompleto" | "intervalo_inesperado" | "sequencia_invalida";

export interface Point {
  tipo: PointType;
  horario: TimeHHMM;
}
export interface StoredPoint extends Point {
  id: number;
  data: DateISO;
}

export interface TodayResponse {
  date: DateISO;
  now: TimeHHMM;
  points: Point[];
  next_type: PointType | null;
  expected_steps: PointType[];
  usa_intervalo: boolean;
  justificativa: string | null;
  carga_minutos: Minutes;
  total_trabalhado_minutos: Minutes | null;
  saldo_minutos: Minutes | null;
  pendencia: PointIssue | null;
}
export interface RegisterPointRequest {
  data: DateISO;
  tipo: PointType;
  horario: TimeHHMM;
  trabalho_em_folga?: boolean;
}
export type RegisterPointResponse = TodayResponse & { ok: true; type: PointType };

export interface HistoryDay {
  data: DateISO;
  entrada: TimeHHMM | null;
  ida_intervalo: TimeHHMM | null;
  volta_intervalo: TimeHHMM | null;
  saida: TimeHHMM | null;
  total_trabalhado_minutos: Minutes | null;
  carga_prevista: Minutes;
  saldo_minutos: Minutes | null;
  origem: Origin;
  pendencia: PointIssue | null;
}
export interface HistoryResponse {
  month: string;
  days: HistoryDay[];
}

export interface BalanceResponse {
  saldo_batidas_minutos: Minutes;
  saldo_ajustes_minutos: Minutes;
  saldo_total_minutos: Minutes;
  pendencias: number;
  faltas: number;
  ajustes: number;
}

export interface CorrectionBase {
  id: number;
  data: DateISO;
  horario_anterior: TimeHHMM;
  motivo: string;
}
export type CorrectionRequest = CorrectionBase &
  ({ acao: "editar"; horario: TimeHHMM } |
   { acao: "excluir"; horario?: TimeHHMM });

export interface Adjustment {
  id: number;
  data: DateISO;
  minutos: Minutes;
  motivo: string;
  criado_em: string;
}
export interface AdjustmentsPage {
  ajustes: Adjustment[];
  proximo_offset: number | null;
}
export interface ApiError {
  error: string;
}
export type ApiSuccess = { ok: true };
