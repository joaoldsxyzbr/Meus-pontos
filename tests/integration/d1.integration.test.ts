import { beforeAll, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import schema from "../fixtures/d1-base.sql?raw";
import migration from "../../migrations/0001_integridade_e_auditoria.sql?raw";
import { brazilNow } from "../../src/logic.js";

/**
 * Usa o D1 local do Miniflare/workerd. Nenhum código aqui possui
 * ID do banco de produção, credenciais Cloudflare ou rede remota.
 */
const db = env.DB;
// D1.exec interpreta algumas linhas de comentário como instruções vazias.
const executableSql = (sql: string) => sql.split("\n")
  .filter(line => !line.trimStart().startsWith("--")).join("\n").trim();
const utcDay = (date: string) => new Date(date + "T12:00:00Z").getTime();
const iso = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);
const today = brazilNow().date;
const mondayOffset = (new Date(utcDay(today)).getUTCDay() + 6) % 7;
const previousMonday = iso(utcDay(today) - (mondayOffset + 7) * 86400000);
const tuesday = iso(utcDay(previousMonday) + 86400000);
const wednesday = iso(utcDay(previousMonday) + 2 * 86400000);

describe("D1 local e migração real do projeto", () => {
  beforeAll(async () => {
    await db.exec(executableSql(schema));
    await db.exec(executableSql(migration));
    const start = iso(utcDay(today) - 30 * 86400000);
    await db.prepare("INSERT INTO config(chave,valor) VALUES ('inicio_contagem', ?)").bind(start).run();
    for (let weekday = 0; weekday < 7; weekday++) {
      await db.prepare("INSERT INTO jornada_padrao (dia_semana,carga_minutos,usa_intervalo) VALUES (?,?,?)")
        .bind(weekday, weekday >= 1 && weekday <= 5 ? 480 : 0, weekday >= 1 && weekday <= 5 ? 1 : 0).run();
    }
  });

  it("calcula jornada completa em banco D1, sem alterar regras antigas", async () => {
    await db.batch([
      db.prepare("INSERT INTO pontos (data,tipo,horario) VALUES (?,'entrada','09:00')").bind(previousMonday),
      db.prepare("INSERT INTO pontos (data,tipo,horario) VALUES (?,'ida_intervalo','12:00')").bind(previousMonday),
      db.prepare("INSERT INTO pontos (data,tipo,horario) VALUES (?,'volta_intervalo','13:00')").bind(previousMonday),
      db.prepare("INSERT INTO pontos (data,tipo,horario) VALUES (?,'saida','18:00')").bind(previousMonday)
    ]);
    const day = await db.prepare("SELECT total_trabalhado_minutos,saldo_minutos,pendencia FROM resumo_diario WHERE data=?")
      .bind(previousMonday).first<{total_trabalhado_minutos:number,saldo_minutos:number,pendencia:string|null}>();
    expect(day).toMatchObject({ total_trabalhado_minutos: 480, saldo_minutos: 0, pendencia: null });
  });

  it("jornada incompleta fica pendente sem crédito e ajuste altera o total", async () => {
    await db.batch([
      db.prepare("INSERT INTO pontos (data,tipo,horario) VALUES (?,'entrada','09:00')").bind(tuesday),
      db.prepare("INSERT INTO pontos (data,tipo,horario) VALUES (?,'ida_intervalo','12:00')").bind(tuesday),
      db.prepare("INSERT INTO pontos (data,tipo,horario) VALUES (?,'saida','18:00')").bind(tuesday)
    ]);
    const row = await db.prepare("SELECT saldo_minutos, pendencia FROM resumo_diario WHERE data = ?").bind(tuesday).first();
    expect(row?.saldo_minutos).toBeNull();
    expect(row?.pendencia).toBe("intervalo_incompleto");
    await db.prepare("INSERT INTO ajustes_banco (data,minutos,motivo) VALUES (?,?,?)")
      .bind(tuesday, 90, "Ajuste sintético de teste").run();
    const total = await db.prepare("SELECT saldo_ajustes_minutos FROM saldo_total").first<{saldo_ajustes_minutos:number}>();
    expect(total?.saldo_ajustes_minutos).toBe(90);
  });

  it("audita correção de horário no mesmo batch transacional", async () => {
    await db.prepare("INSERT INTO pontos (data,tipo,horario) VALUES (?,'entrada','08:30')").bind(wednesday).run();
    const record = await db.prepare("SELECT id FROM pontos WHERE data = ? AND tipo = 'entrada'")
      .bind(wednesday).first<{id:number}>();
    expect(record?.id).toBeTypeOf("number");
    const [audit, change] = await db.batch([
      db.prepare("INSERT INTO auditoria_pontos(ponto_id,data,tipo,acao,horario_anterior,horario_novo,motivo) SELECT id,data,tipo,'editar',horario,'08:45','Motivo sintético de teste' FROM pontos WHERE id = ? AND horario = '08:30'")
        .bind(record!.id),
      db.prepare("UPDATE pontos SET horario = '08:45' WHERE id = ? AND horario = '08:30'")
        .bind(record!.id)
    ]);
    expect(audit.meta.changes).toBe(1);
    expect(change.meta.changes).toBe(1);
    const check = await db.prepare("SELECT horario_novo,motivo FROM auditoria_pontos WHERE ponto_id = ?")
      .bind(record!.id).first<{horario_novo:string,motivo:string}>();
    expect(check?.horario_novo).toBe("08:45");
    expect(check?.motivo).toBe("Motivo sintético de teste");
  });
});
