import { brazilNow, weekday, nextType, validTime, validMonth } from "./logic.js";

const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY"
};

function json(data, status = 200) {
  return Response.json(data, { status, headers });
}

async function keyMatches(request, secret) {
  const sent = request.headers.get("Authorization") || "";
  if (!sent.startsWith("Bearer ") || sent.length > 300) return false;
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(sent.slice(7))),
    crypto.subtle.digest("SHA-256", encoder.encode(secret))
  ]);
  const aa = new Uint8Array(a);
  const bb = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < aa.length; i++) difference |= aa[i] ^ bb[i];
  return difference === 0;
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
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Origem não permitida." }, 403);
  let body;
  try { body = await request.json(); } catch { return json({ error: "JSON inválido." }, 400); }
  const time = body?.horario;
  if (!validTime(time)) return json({ error: "Horário inválido." }, 400);

  const now = brazilNow();
  if (time > now.time) return json({ error: "Não é possível registrar horário futuro." }, 400);

  const [schedule, result] = await Promise.all([
    env.DB.prepare("SELECT carga_minutos, usa_intervalo FROM jornada_padrao WHERE dia_semana = ?").bind(weekday(now.date)).first(),
    env.DB.prepare("SELECT tipo, horario FROM pontos WHERE data = ? ORDER BY horario").bind(now.date).all()
  ]);
  const rows = result.results || [];
  const type = nextType(rows, Boolean(schedule?.usa_intervalo), schedule?.carga_minutos || 0);
  if (!type) return json({ error: "Jornada completa, dia de folga ou batidas inconsistentes." }, 409);
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
    if (request.method !== "GET" && request.method !== "POST") return json({ error: "Método não permitido." }, 405);
    if (!env.PONTO_API_KEY || env.PONTO_API_KEY.length < 32) return json({ error: "A chave de segurança do Worker não foi configurada." }, 503);
    if (!env.DB) return json({ error: "Banco não configurado." }, 503);
    if (!(await keyMatches(request, env.PONTO_API_KEY))) return json({ error: "Chave de acesso inválida." }, 401);
    try {
      if (url.pathname === "/api/hoje" && request.method === "GET") return json(await today(env));
      if (url.pathname === "/api/pontos" && request.method === "POST") return await register(request, env);
      if (url.pathname === "/api/historico" && request.method === "GET") return await history(request, env);
      if (url.pathname === "/api/saldo" && request.method === "GET") return await balance(env);
      return json({ error: "Rota não encontrada." }, 404);
    } catch (error) {
      console.error("Falha em operação D1:", error?.name || "Erro");
      return json({ error: "Não foi possível consultar o banco. Tente novamente." }, 500);
    }
  }
};
