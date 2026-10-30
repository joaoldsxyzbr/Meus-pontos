import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import worker from "../../src/worker.js";
import { brazilNow } from "../../src/logic.js";
import { initializeLocalD1 } from "./helpers/local-d1.js";

/**
 * HTTP Request/Response do Worker verdadeiro, executado dentro de workerd.
 * Todas as credenciais são SINTÉTICAS e o único banco usado é env.DB do
 * Miniflare (sem wrangler.jsonc, sem API Cloudflare e sem D1 remoto).
 */
const BASE = "https://meus-pontos.example.test";
const USER = "teste-local";
const PASSWORD = "senha-ficticia-de-integracao";
const today = brazilNow().date;
const utc = (date: string) => new Date(date + "T12:00:00Z").getTime();
const iso = (n: number) => new Date(n).toISOString().slice(0, 10);
const previousMonday = iso(utc(today) -
  ((new Date(utc(today)).getUTCDay() + 6) % 7 + 7) * 86400000);

const base64url = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, n => String.fromCharCode(n)).join(""))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function passwordRecord() {
  const salt = new Uint8Array(16).fill(11);
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(PASSWORD), "PBKDF2", false, ["deriveBits"]
  );
  const hash = await crypto.subtle.deriveBits({
    name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256"
  }, key, 256);
  return "v1:100000:" + base64url(salt) + ":" + base64url(new Uint8Array(hash));
}

let attempts = 0;
let blockLogin = false;
let record: string;
const bindings = {
  DB: env.DB,
  PONTO_USERNAME: USER,
  PONTO_PASSWORD_RECORD: "",
  PONTO_SESSION_SECRET: base64url(new Uint8Array(32).fill(5)),
  LOGIN_LIMITER: {
    async limit() {
      attempts += 1;
      return { success: !blockLogin && attempts <= 8 };
    }
  }
};

type HttpOptions = {
  method?: string;
  body?: unknown;
  cookie?: string;
  origin?: string;
  fetchSite?: string;
};

function request(path: string, options: HttpOptions = {}) {
  const headers = new Headers();
  if (options.cookie) headers.set("Cookie", options.cookie);
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (options.method && options.method !== "GET") {
    headers.set("Origin", options.origin ?? BASE);
  }
  if (options.fetchSite) headers.set("Sec-Fetch-Site", options.fetchSite);
  return new Request(BASE + path, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
}

async function call(path: string, options: HttpOptions = {}) {
  return worker.fetch(request(path, options), bindings);
}

async function login() {
  const response = await call("/api/login", {
    method: "POST", body: { usuario: USER, senha: PASSWORD }
  });
  expect(response.status).toBe(200);
  const cookie = response.headers.get("Set-Cookie");
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("Secure");
  expect(cookie).toContain("SameSite=Strict");
  return cookie!.split(";")[0];
}

beforeAll(async () => {
  await initializeLocalD1();
  record = await passwordRecord();
  bindings.PONTO_PASSWORD_RECORD = record;
  await env.DB.prepare("INSERT INTO config (chave, valor) VALUES ('inicio_contagem', ?)")
    .bind(iso(utc(today) - 30 * 86400000)).run();
  for (let day = 0; day <= 6; day++) {
    await env.DB.prepare(
      "INSERT INTO jornada_padrao(dia_semana,carga_minutos,usa_intervalo) VALUES (?,480,1)"
    ).bind(day).run();
  }
});

beforeEach(async () => {
  attempts = 0;
  blockLogin = false;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM auditoria_pontos"),
    env.DB.prepare("DELETE FROM pontos"),
    env.DB.prepare("DELETE FROM ajustes_banco"),
    env.DB.prepare("DELETE FROM justificativas")
  ]);
});

describe("API HTTP real executada no Workers com D1 local", () => {
  it("exige autenticação, permite login e mantém sessão em cookie seguro", async () => {
    expect((await call("/api/hoje")).status).toBe(401);
    expect((await call("/api/saldo")).status).toBe(401);

    const badLogin = await call("/api/login", {
      method: "POST", body: { usuario: USER, senha: "incorreta" }
    });
    expect(badLogin.status).toBe(401);

    const cookie = await login();
    const session = await call("/api/sessao", { cookie });
    expect(await session.json()).toEqual({ autenticado: true, usuario: USER });

    const todayResponse = await call("/api/hoje", { cookie });
    expect(todayResponse.status).toBe(200);
    expect(todayResponse.headers.get("Cache-Control")).toBe("no-store");
    expect(await todayResponse.json()).toMatchObject({
      date: today,
      next_type: "entrada",
      carga_minutos: 480,
      points: []
    });

    const logout = await call("/api/sair", { method: "POST", cookie });
    expect(logout.status).toBe(200);
    expect(logout.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });

  it("impede CSRF, login sem rate limiter e credenciais inválidas", async () => {
    const cookie = await login();
    const csrf = await call("/api/pontos", {
      method: "POST", body: { data: today, tipo: "entrada", horario: "08:00" },
      cookie, origin: "https://origem-maliciosa.invalid"
    });
    expect(csrf.status).toBe(403);
    const browserCsrf = await call("/api/pontos", {
      method: "POST", body: { data: today, tipo: "entrada", horario: "08:00" },
      cookie, fetchSite: "cross-site"
    });
    expect(browserCsrf.status).toBe(403);
    blockLogin = true;
    const limited = await call("/api/login", {
      method: "POST", body: { usuario: USER, senha: PASSWORD }
    });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");
    const total = await env.DB.prepare("SELECT COUNT(*) AS n FROM pontos").first<{ n: number }>();
    expect(total?.n).toBe(0);
  });

  it("registra jornada completa, preserva histórico e calcula saldo no D1", async () => {
    const cookie = await login();
    for (const [tipo, horario] of [
      ["entrada", "09:00"],
      ["ida_intervalo", "12:00"],
      ["volta_intervalo", "13:00"],
      ["saida", "18:00"]
    ] as const) {
      const response = await call("/api/pontos", {
        method: "POST", body: { data: today, tipo, horario }, cookie
      });
      expect(response.status).toBe(201);
    }
    const complete = await call("/api/hoje", { cookie });
    expect(await complete.json()).toMatchObject({
      next_type: null, total_trabalhado_minutos: 480, saldo_minutos: 0
    });
    const history = await call("/api/historico?mes=" + today.slice(0, 7), { cookie });
    expect(history.status).toBe(200);
    const days = (await history.json() as {
      days: Array<{ data: string; saldo_minutos: number | null }>;
    }).days;
    expect(days.find(day => day.data === today)?.saldo_minutos).toBe(0);

    const balance = await call("/api/saldo", { cookie });
    expect(balance.status).toBe(200);
    const total = await balance.json() as { saldo_total_minutos: number };
    const dbTotal = await env.DB.prepare("SELECT saldo_total_minutos FROM saldo_total")
      .first<{ saldo_total_minutos: number }>();
    expect(total.saldo_total_minutos).toBe(dbTotal?.saldo_total_minutos);
  });

  it("não duplica batidas quando cinco requisições concorrentes tentam a mesma entrada", async () => {
    const cookie = await login();
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        call("/api/pontos", {
          method: "POST",
          body: { data: today, tipo: "entrada", horario: "08:00" },
          cookie
        })
      )
    );
    const statuses = responses.map(response => response.status).sort();
    expect(statuses).toEqual([201, 409, 409, 409, 409].sort());
    const inserted = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM pontos WHERE data = ? AND tipo = 'entrada'"
    ).bind(today).first<{ n: number }>();
    expect(inserted?.n).toBe(1);

    // Um retry após timeout não duplica a batida. Contrato atual: 409;
    // idempotência com repetição do mesmo 201 requer decisão/implementação posterior.
    const retry = await call("/api/pontos", {
      method: "POST", cookie,
      body: { data: today, tipo: "entrada", horario: "08:00" }
    });
    expect(retry.status).toBe(409);
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM pontos").first<{ n: number }>();
    expect(count?.n).toBe(1);
  });

  it("edita e exclui última batida mantendo motivo na auditoria transacional", async () => {
    const cookie = await login();
    for (const [tipo, horario] of [
      ["entrada", "09:00"], ["ida_intervalo", "12:00"],
      ["volta_intervalo", "13:00"], ["saida", "17:00"]
    ] as const) {
      await env.DB.prepare("INSERT INTO pontos (data,tipo,horario) VALUES (?,?,?)")
        .bind(previousMonday, tipo, horario).run();
    }
    const consulted = await call("/api/pontos/consultar?data=" + previousMonday, { cookie });
    expect(consulted.status).toBe(200);
    const { pontos } = await consulted.json() as {
      pontos: Array<{ id: number; tipo: string; horario: string }>;
    };
    const last = pontos.find(point => point.tipo === "saida")!;

    const change = await call("/api/pontos/corrigir", {
      method: "POST", cookie,
      body: { id: last.id, data: previousMonday, acao: "editar",
        horario_anterior: "17:00", horario: "18:00", motivo: "Correção fictícia do teste" }
    });
    expect(change.status).toBe(200);
    const day = await env.DB.prepare(
      "SELECT saldo_minutos FROM resumo_diario WHERE data = ?"
    ).bind(previousMonday).first<{ saldo_minutos: number }>();
    expect(day?.saldo_minutos).toBe(0);

    const remove = await call("/api/pontos/corrigir", {
      method: "POST", cookie,
      body: { id: last.id, data: previousMonday, acao: "excluir",
        horario_anterior: "18:00", motivo: "Exclusão fictícia do teste" }
    });
    expect(remove.status).toBe(200);
    const historyDay = await env.DB.prepare(
      "SELECT pendencia, saldo_minutos FROM resumo_diario WHERE data = ?"
    ).bind(previousMonday).first<{ pendencia: string; saldo_minutos: number | null }>();
    expect(historyDay?.pendencia).toBe("sem_saida");
    expect(historyDay?.saldo_minutos).toBeNull();

    const audits = await env.DB.prepare(
      "SELECT acao, horario_anterior, horario_novo, motivo FROM auditoria_pontos ORDER BY id"
    ).all<{ acao: string; horario_anterior: string; horario_novo: string | null; motivo: string }>();
    expect(audits.results).toHaveLength(2);
    expect(audits.results.map(row => row.acao)).toEqual(["editar", "excluir"]);
    expect(audits.results[0]?.horario_novo).toBe("18:00");
    expect(audits.results[1]?.motivo).toBe("Exclusão fictícia do teste");
  });

  it("cria, lista, altera e remove ajustes com impacto correspondente no saldo", async () => {
    const cookie = await login();
    const create = await call("/api/ajustes", {
      method: "POST", cookie,
      body: { data: previousMonday, tipo: "credito", duracao: "01:30",
        motivo: "Crédito fictício para teste" }
    });
    expect(create.status).toBe(201);
    const { id } = await create.json() as { id: number };
    const listed = await call("/api/ajustes?offset=0", { cookie });
    expect(await listed.json()).toMatchObject({
      proximo_offset: null, ajustes: [{ id, minutos: 90 }]
    });
    const update = await call("/api/ajustes/" + id, {
      method: "PUT", cookie,
      body: { data: previousMonday, tipo: "debito", duracao: "00:30",
        motivo: "Débito fictício para teste" }
    });
    expect(update.status).toBe(200);
    const balance = await call("/api/saldo", { cookie });
    expect(await balance.json()).toMatchObject({ saldo_ajustes_minutos: -30, ajustes: 1 });
    const deletion = await call("/api/ajustes/" + id, { method: "DELETE", cookie });
    expect(deletion.status).toBe(200);
    const after = await call("/api/saldo", { cookie });
    expect(await after.json()).toMatchObject({ saldo_ajustes_minutos: 0, ajustes: 0 });
  });
  it("preserva os códigos HTTP antigos para métodos, formatos e rotas desconhecidas", async () => {
    const unauthorizedUnknown = await call("/api/rota-inexistente");
    expect(unauthorizedUnknown.status).toBe(401);

    const invalidCredentials = await call("/api/login", {
      method: "POST", body: { usuario: 123, senha: PASSWORD }
    });
    expect(invalidCredentials.status).toBe(401);
    const cookie = await login();

    const invalidMonth = await call("/api/historico?mes=2026-13", { cookie });
    expect(invalidMonth.status).toBe(400);
    const invalidTime = await call("/api/pontos", {
      method: "POST", cookie, body: { data: today, tipo: "entrada", horario: "24:00" }
    });
    expect(invalidTime.status).toBe(400);
    const staleType = await call("/api/pontos", {
      method: "POST", cookie, body: { data: today, tipo: "tipo-invalido", horario: "09:00" }
    });
    expect(staleType.status).toBe(409);

    const unsupported = await call("/api/hoje", { method: "OPTIONS", cookie });
    expect(unsupported.status).toBe(405);
    const unknown = await call("/api/rota-inexistente", { cookie });
    expect(unknown.status).toBe(404);
    const badAdjustMethod = await call("/api/ajustes/5", {
      method: "POST", body: {}, cookie
    });
    expect(badAdjustMethod.status).toBe(405);
    expect(badAdjustMethod.headers.get("Cache-Control")).toBe("no-store");
  });

});
