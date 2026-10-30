"""Regressões reais das views SQLite. Nunca abre o D1 de produção."""
import datetime as dt
import pathlib
import sqlite3
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
LEGACY = (ROOT / "tests/fixtures/legacy_views.sql").read_text()
MIGRATION = (ROOT / "migrations/0001_integridade_e_auditoria.sql").read_text()
TODAY = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date()


def iso(value):
    return value.isoformat()


class TestViews(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
        CREATE TABLE config(chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
        CREATE TABLE jornada_padrao(dia_semana INTEGER PRIMARY KEY, carga_minutos INTEGER NOT NULL, usa_intervalo INTEGER NOT NULL);
        CREATE TABLE justificativas(data TEXT PRIMARY KEY, tipo TEXT, observacao TEXT);
        CREATE TABLE pontos(id INTEGER PRIMARY KEY, data TEXT NOT NULL, tipo TEXT NOT NULL, horario TEXT NOT NULL,
            UNIQUE(data, tipo));
        CREATE TABLE ajustes_banco(id INTEGER PRIMARY KEY, data TEXT NOT NULL, minutos INTEGER, motivo TEXT);
        """)
        self.begin = TODAY - dt.timedelta(days=50)
        self.db.execute("INSERT INTO config VALUES ('inicio_contagem', ?)", (iso(self.begin),))
        for i in range(7):
            # Em testes, domingo também é dia útil para testar qualquer data atual.
            self.db.execute("INSERT INTO jornada_padrao VALUES (?, ?, ?)", (i, 240 if i == 6 else 480, 0 if i == 6 else 1))
        self.db.executescript(LEGACY)

    def tearDown(self):
        self.db.close()

    def point(self, day, *entries):
        for tipo, time in entries:
            self.db.execute("INSERT INTO pontos(data,tipo,horario) VALUES (?,?,?)", (iso(day),tipo,time))

    def get(self, day):
        result = self.db.execute("SELECT * FROM resumo_diario WHERE data=?", (iso(day),)).fetchone()
        self.assertIsNotNone(result)
        return dict(result)

    def migrate(self):
        self.db.executescript(MIGRATION)

    def week_day(self, weeks=1):
        d = TODAY - dt.timedelta(days=7*weeks)
        return d - dt.timedelta(days=(d.weekday() - 0) % 7)

    def test_jornada_valida_preserva_o_saldo(self):
        day = self.week_day()
        self.point(day, ("entrada","09:00"),("ida_intervalo","12:00"),
                   ("volta_intervalo","13:00"),("saida","18:00"))
        before = self.get(day)
        self.migrate()
        after = self.get(day)
        self.assertEqual(before["saldo_minutos"], after["saldo_minutos"])
        self.assertEqual(after["saldo_minutos"], 0)
        self.assertEqual(after["pendencia"], None)

    def test_intervalo_incompleto_nao_gera_credito(self):
        day = self.week_day()
        self.point(day, ("entrada","09:00"),("ida_intervalo","12:00"),("saida","18:00"))
        self.assertEqual(self.get(day)["saldo_minutos"], 60)  # Resultado legado incorreto
        self.migrate()
        after = self.get(day)
        self.assertIsNone(after["saldo_minutos"])
        self.assertEqual(after["pendencia"], "intervalo_incompleto")

    def test_intervalo_inexistente_em_jornada_com_intervalo(self):
        day = self.week_day()
        self.point(day, ("entrada","09:00"),("saida","18:00"))
        self.migrate()
        row = self.get(day)
        self.assertIsNone(row["saldo_minutos"])
        self.assertEqual(row["pendencia"], "intervalo_incompleto")

    def test_jornada_sem_intervalo_e_saldo_valido(self):
        saturday = self.week_day() - dt.timedelta(days=2)
        self.point(saturday, ("entrada","08:00"),("saida","12:00"))
        self.migrate()
        row = self.get(saturday)
        self.assertEqual(row["saldo_minutos"], 0)
        self.assertIsNone(row["pendencia"])

    def test_hoje_sem_batida_nao_e_falta(self):
        self.migrate()
        row = self.get(TODAY)
        self.assertIsNone(row["saldo_minutos"])
        self.assertEqual(row["origem"], "em_andamento")

    def test_falta_antiga_sem_justificativa_continua_negativa(self):
        day = self.week_day()
        self.migrate()
        row = self.get(day)
        self.assertEqual(row["saldo_minutos"], -480)
        self.assertEqual(row["origem"], "falta")

    def test_justificativa_zerar_obrigacao_e_preservar_trabalho(self):
        day = self.week_day()
        self.point(day,("entrada","09:00"),("ida_intervalo","12:00"),
                  ("volta_intervalo","13:00"),("saida","18:00"))
        self.db.execute("INSERT INTO justificativas(data,tipo) VALUES(?,?)",(iso(day),"feriado"))
        self.migrate()
        row = self.get(day)
        self.assertEqual(row["carga_prevista"], 0)
        self.assertEqual(row["saldo_minutos"], 480)

    def test_sabados_alternados_so_apos_referencia(self):
        ref = self.week_day(3) - dt.timedelta(days=2)
        self.db.execute("INSERT INTO config VALUES ('sabado_trabalhado_inicio',?)",(iso(ref),))
        self.migrate()
        self.assertEqual(self.get(ref)["carga_prevista"],240)
        self.assertEqual(self.get(ref + dt.timedelta(days=7))["carga_prevista"],0)
        self.assertEqual(self.get(ref + dt.timedelta(days=14))["carga_prevista"],240)

    def test_migracao_cria_auditoria_sem_reescrever_pontos(self):
        day = self.week_day()
        self.point(day,("entrada","08:00"))
        before=self.db.execute("SELECT data,tipo,horario FROM pontos").fetchall()
        self.migrate()
        after=self.db.execute("SELECT data,tipo,horario FROM pontos").fetchall()
        self.assertEqual([tuple(x) for x in before],[tuple(x) for x in after])
        table=self.db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='auditoria_pontos'").fetchone()
        self.assertIsNotNone(table)


if __name__ == "__main__":
    unittest.main()
