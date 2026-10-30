import { brazilNow, weekday, nextType, expectedTypes, validTime, validMonth } from "./logic.js";
import { authConfigured, checkCredentials, createSession, verifySession, sessionCookie, clearSessionCookie } from "./auth.js";
import { adjustmentsApi } from "./adjustments.js";

const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY"
};

function json(data, status = 200, extraHeaders = {}) {
  return Response.json(data, { status, headers: { ...headers, ...extraHeaders } });
}

function acceptedPostOrigin(request) {
  const origin = request.headers.get("Origin");
  const site = request.headers.get("Sec-Fetch-Site");
  return (!origin || origin === new URL(request.url).origin) && site !== "cross-site";
}

async function login(request, env) {
  if (!env.LOGIN_LIMITER) return json({ error: "Limite de tentativas indisponível." }, 503);
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  const limit = await env.LOGIN_LIMITER.limit({ key: "login:" + ip });
  if (!limit.success) return json({ error: "Muitas tentativas. Aguarde um minuto." }, 429, { "Retry-After": "60" });

  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: "Envie usuário e senha em JSON." }, 415);
  }
  if (Number(request.headers.get("Content-Length") || 0) > 2048) return json({ error: "Dados muito longos." }, 413);
  let input;
  try { input = await request.json(); } catch { return json({ error: "Dados inválidos." }, 400); }
  const username = input?.usuario;
  const password = input?.senha;
  if (typeof username !== "string" || username.length > 80 || typeof password !== "string" || password.length > 256) {
    return json({ error: "Usuário ou senha inválidos." }, 401);
  }
  if (!(await checkCredentials(username, password, env))) {
    return json({ error: "Usuário ou senha inválidos." }, 401);
  }
  const token = await createSession(env);
  return json({ ok: true, usuario: env.PONTO_USERNAME }, 200, { "Set-Cookie": sessionCookie(token) });
}

async function today(env) {
  const now = brazilNow();
  const [schedule, points, day] = await Promise.all([
    env.DB.prepare("SELECT carga_minutos, usa_intervalo FROM jornada_padrao WHERE dia_semana = ?").bind(weekday(now.date)).first(),
    env.DB.prepare("SELECT tipo, horario FROM pontos WHERE data = ? ORDER BY horario").bind(now.date).all(),
    env.DB.prepare("SELECT total_trabalhado_minutos, carga_prevista, saldo_minutos, pendencia FROM resumo_diario WHERE data = ?").bind(now.date).first()
  ]);
  const rows = points.results || [];
  return {
    date: now.date,
    now: now.time,
    points: rows,
    next_type: nextType(rows, Boolean(schedule?.usa_intervalo), schedule?.carga_minutos || 0),
    expected_steps: expectedTypes(Boolean(schedule?.usa_intervalo), schedule?.carga_minutos || 0),
    usa_intervalo: Boolean(schedule?.usa_intervalo),
    carga_minutos: schedule?.carga_minutos || 0,
    total_trabalhado_minutos: day?.total_trabalhado_minutos ?? null,
    saldo_minutos: day?.saldo_minutos ?? null,
    pendencia: day?.pendencia || null
  };
}

async function register(request, env) {
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: "Envie JSON." }, 415);
  }
  let body;
  try { body = await request.json(); } catch { return json({ error: "JSON inválido." }, 400); }
  const time = body?.horario;
  if (!validTime(time)) return json({ error: "Horário inválido." }, 400);
  const now = brazilNow();
  // A data e o tipo precisam corresponder ao que a pessoa viu na tela.
  // Clientes antigos sem esses campos falham de forma segura, sem gravar um tipo inesperado.
  if (body?.data !== now.date) return json({ error: "O dia mudou. Atualize os registros antes de bater o ponto." }, 409);
  if (!["entrada", "ida_intervalo", "volta_intervalo", "saida"].includes(body?.tipo))
    return json({ error: "Atualize o aplicativo antes de registrar um novo ponto." }, 409);

  const [schedule, result] = await Promise.all([
    env.DB.prepare("SELECT carga_minutos, usa_intervalo FROM jornada_padrao WHERE dia_semana = ?").bind(weekday(now.date)).first(),
    env.DB.prepare("SELECT tipo, horario FROM pontos WHERE data = ? ORDER BY horario").bind(now.date).all()
  ]);
  const rows = result.results || [];
  const type = nextType(rows, Boolean(schedule?.usa_intervalo), schedule?.carga_minutos || 0);
  if (!type) return json({ error: "Jornada completa, dia de folga ou batidas inconsistentes." }, 409);
  if (body.tipo !== type) return json({ error: "Os registros mudaram. Atualize a tela e confirme a próxima batida." }, 409);
  if (rows.length && time <= rows[rows.length - 1].horario) {
    return json({ error: "Horário deve ser posterior à batida anterior." }, 400);
  }
  try {
    await env.DB.prepare("INSERT INTO pontos (data, tipo, horario) VALUES (?, ?, ?)")
      .bind(now.date, type, time).run();
  } catch (error) {
    if (String(error).includes("UNIQUE") || String(error).includes("constraint")) {
      return json({ error: "Esse tipo de ponto já foi registrado. Atualize a tela." }, 409);
    }
    throw error;
  }
  return json({ ok: true, type, ...(await today(env)) }, 201);
}

async function history(request, env) {
  const currentMonth = brazilNow().date.slice(0, 7);
  const month = new URL(request.url).searchParams.get("mes") || currentMonth;
  if (!validMonth(month)) return json({ error: "Mês inválido." }, 400);
  const records = await env.DB.prepare(
    "SELECT data, entrada, ida_intervalo, volta_intervalo, saida, total_trabalhado_minutos, carga_prevista, saldo_minutos, origem, pendencia FROM resumo_diario WHERE data BETWEEN ? AND ? ORDER BY data DESC"
  ).bind(month + "-01", month + "-31").all();
  return json({ month, days: records.results || [] });
}

async function balance(env) {
  const [summary, adjustments] = await Promise.all([
    env.DB.prepare("SELECT saldo_batidas_minutos, saldo_ajustes_minutos, saldo_total_minutos, pendencias, faltas FROM saldo_total").first(),
    env.DB.prepare("SELECT COUNT(*) AS quantidade FROM ajustes_banco").first()
  ]);
  return json({ ...summary, ajustes: adjustments?.quantidade || 0 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      if (!env.ASSETS) return new Response("Assets não configurados.", { status: 503 });
      const response = await env.ASSETS.fetch(request);
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set("X-Content-Type-Options", "nosniff");
      responseHeaders.set("Referrer-Policy", "no-referrer");
      responseHeaders.set("X-Frame-Options", "DENY");
      responseHeaders.set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
      return new Response(response.body, { status: response.status, headers: responseHeaders });
    }
    if (!["GET", "POST", "PUT", "DELETE"].includes(request.method)) return json({ error: "Método não permitido." }, 405);
    if (request.method !== "GET" && !acceptedPostOrigin(request)) return json({ error: "Origem não permitida." }, 403);
    if (!authConfigured(env)) return json({ error: "Login ainda não configurado no Worker." }, 503);
    try {
      if (url.pathname === "/api/login" && request.method === "POST") return await login(request, env);
      if (url.pathname === "/api/sessao" && request.method === "GET") {
        return await verifySession(request, env) ? json({ autenticado: true, usuario: env.PONTO_USERNAME }) :
          json({ error: "Sessão expirada ou inválida." }, 401);
      }
      if (url.pathname === "/api/sair" && request.method === "POST") {
        return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
      }
      if (!(await verifySession(request, env))) return json({ error: "Sessão expirada ou inválida." }, 401);
      if (!env.DB) return json({ error: "Banco não configurado." }, 503);
      if (url.pathname === "/api/hoje" && request.method === "GET") return json(await today(env));
      if (url.pathname === "/api/pontos" && request.method === "POST") return await register(request, env);
      if (url.pathname === "/api/historico" && request.method === "GET") return await history(request, env);
      if (url.pathname === "/api/saldo" && request.method === "GET") return await balance(env);
      const adjustmentResponse = await adjustmentsApi(request, env, url);
      if (adjustmentResponse) return adjustmentResponse;
      return json({ error: "Rota não encontrada." }, 404);
    } catch (error) {
      console.error("Falha em operação D1:", error?.name || "Erro");
      return json({ error: "Não foi possível consultar o banco. Tente novamente." }, 500);
    }
  }
};