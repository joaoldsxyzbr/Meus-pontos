-- Snapshot das definicoes SQLite atuais; extraidas em modo somente leitura.
-- Sem registros pessoais, senhas, saldos ou dados de producao.
CREATE VIEW resumo_diario AS
WITH RECURSIVE dias(data) AS (
  SELECT valor FROM config WHERE chave = 'inicio_contagem'
  UNION ALL
  SELECT date(data, '+1 day') FROM dias WHERE data < date('now', '-3 hours')
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
    CAST(substr(b.entrada, 1, 2) AS INTEGER) * 60 + CAST(substr(b.entrada, 4, 2) AS INTEGER) AS entrada_min,
    CAST(substr(b.ida_intervalo, 1, 2) AS INTEGER) * 60 + CAST(substr(b.ida_intervalo, 4, 2) AS INTEGER) AS ida_min,
    CAST(substr(b.volta_intervalo, 1, 2) AS INTEGER) * 60 + CAST(substr(b.volta_intervalo, 4, 2) AS INTEGER) AS volta_min,
    CAST(substr(b.saida, 1, 2) AS INTEGER) * 60 + CAST(substr(b.saida, 4, 2) AS INTEGER) AS saida_min
  FROM dias LEFT JOIN b ON b.data = dias.data
)
SELECT
  m.data,
  m.dia_semana,
  m.entrada,
  m.ida_intervalo,
  m.volta_intervalo,
  m.saida,
  CASE
    WHEN m.entrada IS NOT NULL AND m.saida IS NOT NULL THEN
      (m.saida_min - m.entrada_min) -
      CASE WHEN m.ida_min IS NOT NULL AND m.volta_min IS NOT NULL THEN m.volta_min - m.ida_min ELSE 0 END
    ELSE NULL
  END AS total_trabalhado_minutos,
  j.carga_minutos AS carga_prevista,
  CASE
    WHEN m.entrada IS NOT NULL AND m.saida IS NOT NULL THEN
      (m.saida_min - m.entrada_min) -
      CASE WHEN m.ida_min IS NOT NULL AND m.volta_min IS NOT NULL THEN m.volta_min - m.ida_min ELSE 0 END
      - j.carga_minutos
    WHEN m.entrada IS NULL AND jus.data IS NOT NULL THEN 0
    WHEN m.entrada IS NULL AND j.carga_minutos > 0 THEN -j.carga_minutos
    WHEN m.entrada IS NULL THEN 0
    ELSE NULL
  END AS saldo_minutos,
  CASE
    WHEN m.entrada IS NOT NULL THEN 'batidas'
    WHEN jus.data IS NOT NULL THEN 'justificada'
    WHEN j.carga_minutos > 0 THEN 'falta'
    ELSE 'nao_trabalhado'
  END AS origem,
  CASE
    WHEN m.entrada IS NOT NULL AND m.saida IS NULL THEN 'sem_saida'
    WHEN m.entrada IS NOT NULL AND (m.ida_min IS NULL) <> (m.volta_min IS NULL) THEN 'intervalo_incompleto'
    ELSE NULL
  END AS pendencia
FROM m
JOIN jornada_padrao j ON j.dia_semana = m.dia_semana
LEFT JOIN justificativas jus ON jus.data = m.data;

CREATE VIEW saldo_total AS
SELECT
  (SELECT COALESCE(SUM(saldo_minutos), 0) FROM resumo_diario) AS saldo_batidas_minutos,
  (SELECT COALESCE(SUM(minutos), 0) FROM ajustes_banco) AS saldo_ajustes_minutos,
  (SELECT COALESCE(SUM(saldo_minutos), 0) FROM resumo_diario)
    + (SELECT COALESCE(SUM(minutos), 0) FROM ajustes_banco) AS saldo_total_minutos,
  (SELECT COUNT(*) FROM resumo_diario WHERE pendencia IS NOT NULL) AS pendencias,
  (SELECT COUNT(*) FROM resumo_diario WHERE origem = 'falta') AS faltas;

CREATE VIEW banco_horas AS
WITH b AS (
  SELECT
    data,
    MAX(CASE WHEN tipo = 'entrada' THEN horario END) AS entrada,
    MAX(CASE WHEN tipo = 'ida_intervalo' THEN horario END) AS ida_intervalo,
    MAX(CASE WHEN tipo = 'volta_intervalo' THEN horario END) AS volta_intervalo,
    MAX(CASE WHEN tipo = 'saida' THEN horario END) AS saida
  FROM pontos
  GROUP BY data
),
m AS (
  SELECT
    b.*,
    CAST(substr(entrada, 1, 2) AS INTEGER) * 60 + CAST(substr(entrada, 4, 2) AS INTEGER) AS entrada_min,
    CAST(substr(ida_intervalo, 1, 2) AS INTEGER) * 60 + CAST(substr(ida_intervalo, 4, 2) AS INTEGER) AS ida_min,
    CAST(substr(volta_intervalo, 1, 2) AS INTEGER) * 60 + CAST(substr(volta_intervalo, 4, 2) AS INTEGER) AS volta_min,
    CAST(substr(saida, 1, 2) AS INTEGER) * 60 + CAST(substr(saida, 4, 2) AS INTEGER) AS saida_min,
    CAST(strftime('%w', data) AS INTEGER) AS dow
  FROM b
)
SELECT
  m.data,
  m.entrada,
  m.ida_intervalo,
  m.volta_intervalo,
  m.saida,
  CASE
    WHEN m.entrada IS NOT NULL AND m.saida IS NOT NULL THEN
      (m.saida_min - m.entrada_min) -
      CASE WHEN m.ida_min IS NOT NULL AND m.volta_min IS NOT NULL THEN m.volta_min - m.ida_min ELSE 0 END
    ELSE NULL
  END AS total_trabalhado_minutos,
  CASE WHEN m.entrada IS NOT NULL AND m.saida IS NOT NULL THEN j.carga_minutos ELSE NULL END AS carga_minutos,
  CASE
    WHEN m.entrada IS NOT NULL AND m.saida IS NOT NULL THEN
      (m.saida_min - m.entrada_min) -
      CASE WHEN m.ida_min IS NOT NULL AND m.volta_min IS NOT NULL THEN m.volta_min - m.ida_min ELSE 0 END
      - j.carga_minutos
    ELSE NULL
  END AS saldo_minutos,
  CASE
    WHEN m.entrada IS NULL THEN 'sem_entrada'
    WHEN m.saida IS NULL THEN 'sem_saida'
    WHEN (m.ida_min IS NULL) <> (m.volta_min IS NULL) THEN 'intervalo_incompleto'
    ELSE 'ok'
  END AS pendencia
FROM m JOIN jornada_padrao j ON j.dia_semana = m.dow;
