import { brazilNow, parseAdjustment } from "./logic.js";

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function adjustmentsApi(request, env, url) {
  const route = /^\/api\/ajustes(?:\/([1-9][0-9]*))?$/.exec(url.pathname);
  if (!route) return null;
  const id = route[1] ? Number(route[1]) : null;
  if (id !== null && !Number.isSafeInteger(id)) return json({ error: "ID inválido." }, 400);

  if (request.method === "GET" && id === null) {
    const rows = await env.DB.prepare(
      "SELECT id, data, minutos, motivo, criado_em FROM ajustes_banco ORDER BY data DESC, id DESC LIMIT 100"
    ).all();
    return json({ ajustes: rows.results || [] });
  }
  if (request.method === "DELETE" && id !== null) {
    const result = await env.DB.prepare("DELETE FROM ajustes_banco WHERE id = ?").bind(id).run();
    return result.meta.changes ? json({ ok: true }) : json({ error: "Ajuste não encontrado." }, 404);
  }
  if ((request.method === "POST" && id === null) || (request.method === "PUT" && id !== null)) {
    if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json"))
      return json({ error: "Envie JSON." }, 415);
    if (Number(request.headers.get("Content-Length") || 0) > 4096)
      return json({ error: "Dados muito longos." }, 413);
    let body;
    try { body = await request.json(); } catch { return json({ error: "JSON inválido." }, 400); }
    const adjustment = parseAdjustment(body, brazilNow().date);
    if (!adjustment) return json({ error: "Informe data, operação, duração HH:MM e motivo válidos." }, 400);
    if (id === null) {
      const result = await env.DB.prepare(
        "INSERT INTO ajustes_banco (data, minutos, motivo) VALUES (?, ?, ?)"
      ).bind(adjustment.data, adjustment.minutos, adjustment.motivo).run();
      return json({ ok: true, id: result.meta.last_row_id }, 201);
    }
    const result = await env.DB.prepare(
      "UPDATE ajustes_banco SET data = ?, minutos = ?, motivo = ? WHERE id = ?"
    ).bind(adjustment.data, adjustment.minutos, adjustment.motivo, id).run();
    return result.meta.changes ? json({ ok: true, id }) : json({ error: "Ajuste não encontrado." }, 404);
  }
  return json({ error: "Método não permitido." }, 405);
}
