import type {
  PointType, TodayResponse, RegisterPointRequest, CorrectionRequest,
  BalanceResponse, AdjustmentsPage, HistoryDay
} from "../src/shared/contracts.js";

// Estes exemplos são verificados pelo compilador. Não executam requisições.
const today = {
  date: "2026-10-30",
  now: "09:00",
  points: [{ tipo: "entrada", horario: "09:00" }],
  next_type: "ida_intervalo",
  expected_steps: ["entrada", "ida_intervalo", "volta_intervalo", "saida"],
  usa_intervalo: true,
  justificativa: null,
  carga_minutos: 480,
  total_trabalhado_minutos: null,
  saldo_minutos: null,
  pendencia: "sem_saida"
} satisfies TodayResponse;

const request = {
  data: today.date,
  tipo: "entrada",
  horario: "09:00",
  trabalho_em_folga: false
} satisfies RegisterPointRequest;
const edit = {
  id: 1, data: today.date, horario_anterior: "09:00",
  acao: "editar", horario: "09:10", motivo: "Ajuste de horário"
} satisfies CorrectionRequest;
const deletion = {
  id: 1, data: today.date, horario_anterior: "09:00",
  acao: "excluir", motivo: "Registro em duplicidade"
} satisfies CorrectionRequest;
const balance = {
  saldo_batidas_minutos: 0, saldo_ajustes_minutos: -60,
  saldo_total_minutos: -60, pendencias: 1, faltas: 0, ajustes: 1
} satisfies BalanceResponse;
const page = { ajustes: [], proximo_offset: null } satisfies AdjustmentsPage;
const history = {
  data: "2026-10-30", entrada: null, ida_intervalo: null, volta_intervalo: null,
  saida: null, total_trabalhado_minutos: null,
  carga_prevista: 480, saldo_minutos: null, origem: "em_andamento", pendencia: null
} satisfies HistoryDay;

// @ts-expect-error — tipos desconhecidos não podem ser usados como batida.
const invalidType: PointType = "ferias";
// @ts-expect-error — saldo não pode ser texto.
const invalidBalance: BalanceResponse = { ...balance, saldo_total_minutos: "60" };
// @ts-expect-error — correção de horário exige novo horário.
const missingTime: CorrectionRequest = { id: 1, data: "2026-10-30", horario_anterior: "09:00", acao: "editar", motivo: "erro" };

void [today, request, edit, deletion, balance, page, history, invalidType, invalidBalance, missingTime];
