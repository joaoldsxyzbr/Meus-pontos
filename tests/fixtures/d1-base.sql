-- EXCLUSIVAMENTE PARA O D1 LOCAL DOS TESTES, sem dados reais.
-- Replica as colunas e constraints necessárias aos endpoints e às views.
CREATE TABLE config(chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
CREATE TABLE jornada_padrao(
  dia_semana INTEGER PRIMARY KEY,
  carga_minutos INTEGER NOT NULL,
  usa_intervalo INTEGER NOT NULL
);
CREATE TABLE justificativas(
  data TEXT PRIMARY KEY,
  tipo TEXT,
  observacao TEXT
);
CREATE TABLE pontos(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT NOT NULL,
  tipo TEXT NOT NULL,
  horario TEXT NOT NULL,
  UNIQUE(data, tipo)
);
CREATE TABLE ajustes_banco(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT NOT NULL,
  minutos INTEGER NOT NULL,
  motivo TEXT NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
