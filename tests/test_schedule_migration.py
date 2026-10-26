"""Verificação SQLite real da migração de escala — sem tocar o D1 remoto."""
from pathlib import Path
import sqlite3
import unittest

MIGRATION = Path(__file__).resolve().parents[1] / "migrations" / "0001_escala_justificativas.sql"


def connection():
    conn = sqlite3.connect(":memory:")
    conn.executescript("""
        CREATE TABLE config(chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
        CREATE TABLE jornada_padrao(dia_semana INTEGER PRIMARY KEY, carga_minutos INTEGER NOT NULL, usa_intervalo INTEGER NOT NULL);
        CREATE TABLE pontos(id INTEGER PRIMARY KEY, data TEXT NOT NULL, tipo TEXT NOT NULL, horario TEXT NOT NULL);
        CREATE TABLE justificativas(data TEXT PRIMARY KEY, tipo TEXT NOT NULL, observacao TEXT);
        CREATE TABLE ajustes_banco(id INTEGER PRIMARY KEY, data TEXT NOT NULL, minutos INTEGER NOT NULL, motivo TEXT NOT NULL);
        INSERT INTO config VALUES ('inicio_contagem', '2025-06-01');
    """)
    conn.executemany("INSERT INTO jornada_padrao VALUES (?,?,?)", [
        (day, 0 if day == 0 else 240 if day == 6 else 480, 0 if day in (0, 6) else 1)
        for day in range(7)
    ])
    conn.executescript(MIGRATION.read_text(encoding="utf-8"))
    return conn


def daily(conn, date):
    return conn.execute(
        "SELECT carga_prevista, saldo_minutos, origem, pendencia FROM resumo_diario WHERE data = ?", (date,)
    ).fetchone()


class ScheduleMigrationTests(unittest.TestCase):
    def setUp(self):
        self.db = connection()

    def tearDown(self):
        self.db.close()

    def test_sem_referencia_preserva_todos_os_sabados(self):
        self.assertEqual(daily(self.db, "2025-06-14")[:2], (240, -240))
        self.assertEqual(daily(self.db, "2025-06-21")[:2], (240, -240))

    def test_alternancia_so_a_partir_da_referencia(self):
        self.db.execute("INSERT INTO config VALUES ('sabado_trabalhado_inicio','2025-06-21')")
        self.assertEqual(daily(self.db, "2025-06-14")[:2], (240, -240))
        self.assertEqual(daily(self.db, "2025-06-21")[:2], (240, -240))
        self.assertEqual(daily(self.db, "2025-06-28")[:2], (0, 0))
        self.assertEqual(daily(self.db, "2025-07-05")[:2], (240, -240))
        self.assertEqual(daily(self.db, "2025-07-12")[:2], (0, 0))

    def test_referencia_invalida_nao_altera_saldo(self):
        for ref in ("2025-06-20", "sem-data"):
            self.db.execute("INSERT OR REPLACE INTO config VALUES ('sabado_trabalhado_inicio',?)", (ref,))
            self.assertEqual(daily(self.db, "2025-06-28")[:2], (240, -240))

    def test_feriado_justificativa_zeram_carga_e_falta(self):
        before = daily(self.db, "2025-06-10")
        self.assertEqual(before[0], 480)
        self.db.execute("INSERT INTO justificativas VALUES ('2025-06-10','feriado',NULL)")
        self.assertEqual(daily(self.db, "2025-06-10"), (0, 0, "justificada", None))
        self.db.execute("INSERT INTO justificativas VALUES ('2025-06-11','atestado',NULL)")
        self.assertEqual(daily(self.db, "2025-06-11"), (0, 0, "justificada", None))

    def test_trabalho_em_dia_justificado_e_credite_extra_sem_mudar_ponto(self):
        self.db.execute("INSERT INTO justificativas VALUES ('2025-06-12','feriado',NULL)")
        self.db.executemany("INSERT INTO pontos(data,tipo,horario) VALUES (?,?,?)", [
            ("2025-06-12", "entrada", "07:00"), ("2025-06-12", "saida", "11:00")
        ])
        self.assertEqual(daily(self.db, "2025-06-12"), (0, 240, "batidas", None))
        count = self.db.execute("SELECT COUNT(*) FROM pontos").fetchone()[0]
        self.assertEqual(count, 2)

    def test_saldo_consolidado_consistente(self):
        self.db.execute("INSERT INTO ajustes_banco(data,minutos,motivo) VALUES ('2025-06-20',30,'ajuste')")
        subtotal, adjustments, total, *_ = self.db.execute("SELECT * FROM saldo_total").fetchone()
        self.assertEqual(subtotal + adjustments, total)
        self.assertEqual(adjustments, 30)


if __name__ == "__main__":
    unittest.main()
