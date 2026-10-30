import { brazilNow, validTime } from "./logic.js";

const reply = (value, status = 200) => Response.json(value, {
  status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
});
function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      value < "2000-01-01" || value > brazilNow().date) return false;
  const d = new Date(value + "T12:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
function validReason(value) {
  return typeof value === "string" && value.trim().length >= 3 &&
    value.trim().length <= 200 && !/[\x00-\x1f\x7f]/.test(value);
}
function validSequence(rows) {
  const types = rows.map(row => row.tipo);
  const long = ["entrada", "ida_intervalo", "volta_intervalo", "saida"];
  const short = ["entrada", "saida"];
  return rows.every((p, i) => i === 0 || rows[i - 1].horario < p.horario) &&
    (types.every((type, i) => long[i] === type) ||
     types.every((type, i) => short[i] === type));
}

export async function correctionsApi(request, env, url) {
  if (url.pathname === "/api/pontos/consultar" && request.method === "GET") {
    const date = url.searchParams.get("data");
    if (!validDate(date)) return reply({ error: "Data inválida." }, 400);
    const rows = await env.DB.prepare(
      "SELECT id, data, tipo, horario FROM pontos WHERE data = ? ORDER BY horario"
    ).bind(date).all();
    return reply({ data: date, pontos: rows.results || [] });
  }
  if (url.pathname !== "/api/pontos/corrigir" || request.method !== "POST") return null;
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json"))
    return reply({ error: "Envie JSON." }, 415);
  if (Number(request.headers.get("Content-Length") || 0) > 4096)
    return reply({ error: "Dados muito longos." }, 413);
  let input;
  try { input = await request.json(); } catch { return reply({ error: "JSON inválido." }, 400); }
  if (!Number.isSafeInteger(input?.id) || input.id < 1 || !validDate(input?.data) ||
      !validReason(input?.motivo) || !["editar", "excluir"].includes(input?.acao))
    return reply({ error: "Registro, data, operação ou motivo inválidos." }, 400);
  const found = await env.DB.prepare(
    "SELECT id, data, tipo, horario FROM pontos WHERE data = ? ORDER BY horario"
  ).bind(input.data).all();
  const points = found.results || [];
  const index = points.findIndex(item => item.id === input.id);
  if (index < 0 || points[index].horario !== input.horario_anterior)
    return reply({ error: "Os dados mudaram. Atualize os registros antes de corrigir." }, 409);
  if (!validSequence(points))
    return reply({ error: "Registros inconsistentes. É necessária revisão assistida." }, 409);
  const previous = points[index];
  if (input.acao === "editar") {
    if (!validTime(input.horario) || input.horario === previous.horario ||
        (index > 0 && input.horario <= points[index - 1].horario) ||
        (index < points.length - 1 && input.horario >= points[index + 1].horario))
      return reply({ error: "Horário fora da sequência permitida." }, 400);
  } else if (index !== points.length - 1) {
    return reply({ error: "Exclua primeiro a última batida do dia." }, 409);
  }

  const lastGuard = input.acao === "excluir" ?
    " AND id = (SELECT id FROM pontos WHERE data = ? ORDER BY horario DESC LIMIT 1)" : "";
  const identity = [input.id, input.data, previous.horario];
  const guard = input.acao === "excluir" ? [input.data] : [];
  const audit = env.DB.prepare(
    "INSERT INTO auditoria_pontos (ponto_id, data, tipo, acao, horario_anterior, horario_novo, motivo) " +
    "SELECT id, data, tipo, ?, horario, ?, ? FROM pontos WHERE id = ? AND data = ? AND horario = ?" + lastGuard
  ).bind(input.acao, input.acao === "editar" ? input.horario : null, input.motivo.trim(), ...identity, ...guard);
  const mutation = input.acao === "editar" ?
    env.DB.prepare("UPDATE pontos SET horario = ? WHERE id = ? AND data = ? AND horario = ?")
      .bind(input.horario, ...identity) :
    env.DB.prepare("DELETE FROM pontos WHERE id = ? AND data = ? AND horario = ?" + lastGuard)
      .bind(...identity, ...guard);
  // D1.batch é transacional: uma falha da mutação reverte o registro de auditoria.
  const result = await env.DB.batch([audit, mutation]);
  if (!result?.[0]?.meta?.changes || !result?.[1]?.meta?.changes)
    return reply({ error: "Registro alterado simultaneamente. Atualize a lista." }, 409);
  return reply({ ok: true });
}
