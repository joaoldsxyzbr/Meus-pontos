-- Migração da branch de estabilização. Executar somente em cópia validada e após backup.
-- Recria views, sem alterar linhas existentes de pontos ou ajustes.
CREATE TABLE IF NOT EXISTS auditoria_pontos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ponto_id INTEGER NOT NULL,
  data TEXT NOT NULL,
  tipo TEXT NOT NULL,
  acao TEXT NOT NULL CHECK (acao IN ('editar', 'excluir')),
  horario_anterior TEXT NOT NULL,
  horario_novo TEXT,
  motivo TEXT NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_auditoria_pontos_data ON auditoria_pontos(data, id);
DROP VIEW IF EXISTS banco_horas;
DROP VIEW IF EXISTS saldo_total;
DROP VIEW IF EXISTS resumo_diario;

CREATE VIEW resumo_diario AS
WITH RECURSIVE dias(data) AS (
  SELECT valor FROM config WHERE chave = 'inicio_contagem'
    AND valor <= date('now', '-3 hours')
  UNION ALL
  SELECT date(data, '+1 day') FROM dias
  WHERE data < date('now', '-3 hours')
),
b AS (
  SELECT data,
    MAX(CASE WHEN tipo = 'entrada' THEN horario END) AS entrada,
    MAX(CASE WHEN tipo = 'ida_intervalo' THEN horario END) AS ida_intervalo,
    MAX(CASE WHEN tipo = 'volta_intervalo' THEN horario END) AS volta_intervalo,
    MAX(CASE WHEN tipo = 'saida' THEN horario END) AS saida
  FROM pontos GROUP BY data
),
m AS (
  SELECT dias.data, b.entrada, b.ida_intervalo, b.volta_intervalo, b.saida,
    CAST(strftime('%w', dias.data) AS INTEGER) AS dia_semana,
    CAST(substr(b.entrada, 1, 2) AS INTEGER) * 60 +
      CAST(substr(b.entrada, 4, 2) AS INTEGER) AS entrada_min,
    CAST(substr(b.ida_intervalo, 1, 2) AS INTEGER) * 60 +
      CAST(substr(b.ida_intervalo, 4, 2) AS INTEGER) AS ida_min,
    CAST(substr(b.volta_intervalo, 1, 2) AS INTEGER) * 60 +
      CAST(substr(b.volta_intervalo, 4, 2) AS INTEGER) AS volta_min,
    CAST(substr(b.saida, 1, 2) AS INTEGER) * 60 +
      CAST(substr(b.saida, 4, 2) AS INTEGER) AS saida_min
  FROM dias LEFT JOIN b ON b.data = dias.data
),
avaliado AS (
  SELECT m.*, j.usa_intervalo,
    CASE WHEN jus.data IS NOT NULL OR (
      m.dia_semana = 6
      AND date(sab.valor) = sab.valor
      AND strftime('%w', sab.valor) = '6'
      AND m.data >= sab.valor
      AND CAST((julianday(m.data) - julianday(sab.valor)) / 7 AS INTEGER) % 2 = 1
    ) THEN 0 ELSE j.carga_minutos END AS carga_prevista,
    CASE WHEN jus.data IS NOT NULL THEN 1 ELSE 0 END AS justificado,
    CASE
      WHEN m.entrada IS NULL OR m.saida IS NULL THEN 0
      WHEN j.usa_intervalo = 1 AND m.entrada_min < m.ida_min
        AND m.ida_min < m.volta_min AND m.volta_min < m.saida_min THEN 1
      WHEN j.usa_intervalo = 0 AND m.ida_min IS NULL AND m.volta_min IS NULL
        AND m.entrada_min < m.saida_min THEN 1
      ELSE 0
    END AS completo
  FROM m
  JOIN jornada_padrao j ON j.dia_semana = m.dia_semana
  LEFT JOIN justificativas jus ON jus.data = m.data
  LEFT JOIN config sab ON sab.chave = 'sabado_trabalhado_inicio'
)
SELECT data, dia_semana, entrada, ida_intervalo, volta_intervalo, saida,
  CASE WHEN completo = 1 THEN
    (saida_min - entrada_min) -
      CASE WHEN usa_intervalo = 1 THEN volta_min - ida_min ELSE 0 END
    ELSE NULL END AS total_trabalhado_minutos,
  carga_prevista,
  CASE
    WHEN completo = 1 THEN (saida_min - entrada_min) -
      CASE WHEN usa_intervalo = 1 THEN volta_min - ida_min ELSE 0 END - carga_prevista
    WHEN entrada IS NULL AND ida_intervalo IS NULL AND volta_intervalo IS NULL AND saida IS NULL
      AND justificado = 1 THEN 0
    WHEN entrada IS NULL AND ida_intervalo IS NULL AND volta_intervalo IS NULL AND saida IS NULL
      AND data = date('now', '-3 hours') AND carga_prevista > 0 THEN NULL
    WHEN entrada IS NULL AND ida_intervalo IS NULL AND volta_intervalo IS NULL AND saida IS NULL
      AND carga_prevista > 0 THEN -carga_prevista
    WHEN entrada IS NULL AND ida_intervalo IS NULL AND volta_intervalo IS NULL AND saida IS NULL
      THEN 0
    ELSE NULL
  END AS saldo_minutos,
  CASE
    WHEN entrada IS NOT NULL OR ida_intervalo IS NOT NULL OR volta_intervalo IS NOT NULL
      OR saida IS NOT NULL THEN 'batidas'
    WHEN justificado = 1 THEN 'justificada'
    WHEN data = date('now', '-3 hours') AND carga_prevista > 0 THEN 'em_andamento'
    WHEN carga_prevista > 0 THEN 'falta'
    ELSE 'nao_trabalhado'
  END AS origem,
  CASE
    WHEN entrada IS NULL AND ida_intervalo IS NULL AND volta_intervalo IS NULL AND saida IS NULL THEN NULL
    WHEN completo = 1 THEN NULL
    WHEN entrada IS NULL THEN 'sem_entrada'
    WHEN saida IS NULL THEN 'sem_saida'
    WHEN usa_intervalo = 1 AND (ida_intervalo IS NULL OR volta_intervalo IS NULL)
      THEN 'intervalo_incompleto'
    WHEN usa_intervalo = 0 AND (ida_intervalo IS NOT NULL OR volta_intervalo IS NOT NULL)
      THEN 'intervalo_inesperado'
    ELSE 'sequencia_invalida'
  END AS pendencia
FROM avaliado;

CREATE VIEW saldo_total AS
SELECT
  (SELECT COALESCE(SUM(saldo_minutos), 0) FROM resumo_diario) AS saldo_batidas_minutos,
  (SELECT COALESCE(SUM(minutos), 0) FROM ajustes_banco) AS saldo_ajustes_minutos,
  (SELECT COALESCE(SUM(saldo_minutos), 0) FROM resumo_diario) +
    (SELECT COALESCE(SUM(minutos), 0) FROM ajustes_banco) AS saldo_total_minutos,
  (SELECT COUNT(*) FROM resumo_diario WHERE pendencia IS NOT NULL) AS pendencias,
  (SELECT COUNT(*) FROM resumo_diario WHERE origem = 'falta') AS faltas;

-- Mantém o formato antigo da view usado em relatórios externos.
CREATE VIEW banco_horas AS
SELECT data, entrada, ida_intervalo, volta_intervalo, saida,
  total_trabalhado_minutos,
  CASE WHEN total_trabalhado_minutos IS NOT NULL THEN carga_prevista ELSE NULL END AS carga_minutos,
  saldo_minutos,
  COALESCE(pendencia, 'ok') AS pendencia
FROM resumo_diario
WHERE entrada IS NOT NULL OR ida_intervalo IS NOT NULL
  OR volta_intervalo IS NOT NULL OR saida IS NOT NULL;
