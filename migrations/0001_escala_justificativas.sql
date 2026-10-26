-- Meus Pontos | revisão das visões de jornada (não insere nem altera pontos).
-- MIGRAÇÃO NÃO APLICADA EM PRODUÇÃO AUTOMATICAMENTE.
-- Requer as tabelas existentes: config, pontos, jornada_padrao, justificativas, ajustes_banco.
--
-- Ativação opcional DEPOIS de confirmar um sábado trabalhado:
-- INSERT INTO config (chave, valor) VALUES ('sabado_trabalhado_inicio', 'AAAA-MM-DD')
-- ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor;
-- A referência só altera os sábados posteriores a ela. Sem referência,
-- mantém exatamente a jornada padrão atual.
--
-- Execute somente com backup/inspeção de saldos antes e depois.
DROP VIEW IF EXISTS saldo_total;
DROP VIEW IF EXISTS resumo_diario;

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
),
escala AS (
  SELECT m.*, jus.data AS justificada,
    CASE
      WHEN jus.data IS NOT NULL THEN 0
      WHEN m.dia_semana = 6
        AND cfg.referencia IS NOT NULL
        AND length(cfg.referencia) = 10
        AND date(cfg.referencia) = cfg.referencia
        AND strftime('%w', cfg.referencia) = '6'
        AND m.data >= cfg.referencia
        AND (CAST((julianday(m.data) - julianday(cfg.referencia)) / 7 AS INTEGER) % 2) = 1
      THEN 0
      ELSE j.carga_minutos
    END AS carga_efetiva
  FROM m
  JOIN jornada_padrao j ON j.dia_semana = m.dia_semana
  LEFT JOIN justificativas jus ON jus.data = m.data
  CROSS JOIN (
    SELECT (SELECT valor FROM config WHERE chave = 'sabado_trabalhado_inicio') AS referencia
  ) cfg
)
SELECT
  e.data, e.dia_semana, e.entrada, e.ida_intervalo, e.volta_intervalo, e.saida,
  CASE
    WHEN e.entrada IS NOT NULL AND e.saida IS NOT NULL THEN
      (e.saida_min - e.entrada_min) -
      CASE WHEN e.ida_min IS NOT NULL AND e.volta_min IS NOT NULL
        THEN e.volta_min - e.ida_min ELSE 0 END
    ELSE NULL
  END AS total_trabalhado_minutos,
  e.carga_efetiva AS carga_prevista,
  CASE
    WHEN e.entrada IS NOT NULL AND e.saida IS NOT NULL THEN
      (e.saida_min - e.entrada_min) -
      CASE WHEN e.ida_min IS NOT NULL AND e.volta_min IS NOT NULL
        THEN e.volta_min - e.ida_min ELSE 0 END
      - e.carga_efetiva
    WHEN e.entrada IS NULL AND e.justificada IS NOT NULL THEN 0
    WHEN e.entrada IS NULL AND e.carga_efetiva > 0 THEN -e.carga_efetiva
    WHEN e.entrada IS NULL THEN 0
    ELSE NULL
  END AS saldo_minutos,
  CASE
    WHEN e.entrada IS NOT NULL THEN 'batidas'
    WHEN e.justificada IS NOT NULL THEN 'justificada'
    WHEN e.carga_efetiva > 0 THEN 'falta'
    ELSE 'nao_trabalhado'
  END AS origem,
  CASE
    WHEN e.entrada IS NOT NULL AND e.saida IS NULL THEN 'sem_saida'
    WHEN e.entrada IS NOT NULL AND (e.ida_min IS NULL) <> (e.volta_min IS NULL)
      THEN 'intervalo_incompleto'
    ELSE NULL
  END AS pendencia
FROM escala e;

CREATE VIEW saldo_total AS
SELECT
  (SELECT COALESCE(SUM(saldo_minutos), 0) FROM resumo_diario) AS saldo_batidas_minutos,
  (SELECT COALESCE(SUM(minutos), 0) FROM ajustes_banco) AS saldo_ajustes_minutos,
  (SELECT COALESCE(SUM(saldo_minutos), 0) FROM resumo_diario)
    + (SELECT COALESCE(SUM(minutos), 0) FROM ajustes_banco) AS saldo_total_minutos,
  (SELECT COUNT(*) FROM resumo_diario WHERE pendencia IS NOT NULL) AS pendencias,
  (SELECT COUNT(*) FROM resumo_diario WHERE origem = 'falta') AS faltas;
