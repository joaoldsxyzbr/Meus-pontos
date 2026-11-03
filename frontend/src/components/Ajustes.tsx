import { useCallback, useEffect, useRef, useState } from "react";
import type { Adjustment, AdjustmentsPage } from "../../../src/shared/contracts.ts";
import { api } from "../lib/api.ts";
import { adjustmentsPageSchema, okSchema } from "../lib/schemas.ts";
import { brazilDate, displayDate, minutesText } from "../lib/time.ts";

interface Props {
  changed: () => void;
  notify: (message: string) => void;
  onError: (error: unknown) => string;
}

export default function Ajustes({ changed, notify, onError }: Props) {
  const [items, setItems] = useState<Adjustment[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [action, setAction] = useState<"credito" | "debito">("credito");
  const [duration, setDuration] = useState("");
  const [date, setDate] = useState(() => brazilDate());
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const sequence = useRef(0);

  function closeForm() {
    setOpened(false);
    setEditId(null);
    setAction("credito");
    setDuration("");
    setDate(brazilDate());
    setReason("");
  }

  function openForm(item: Adjustment | null = null) {
    setEditId(item?.id ?? null);
    setAction(item && item.minutos < 0 ? "debito" : "credito");
    const abs = Math.abs(item?.minutos ?? 0);
    setDuration(
      item
        ? `${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`
        : ""
    );
    setDate(item?.data ?? brazilDate());
    setReason(item?.motivo ?? "");
    setOpened(true);
  }

  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true);
    setMessage("");
    try {
      const result = await api<AdjustmentsPage>("/api/ajustes?offset=0", { schema: adjustmentsPageSchema });
      if (current === sequence.current) {
        setItems(result.ajustes);
        setNextOffset(result.proximo_offset);
      }
    } catch (error) {
      if (current === sequence.current) setMessage(onError(error));
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore() {
    if (nextOffset == null || moreBusy || loading) return;
    const offset = nextOffset;
    setMoreBusy(true);
    try {
      const page = await api<AdjustmentsPage>(`/api/ajustes?offset=${offset}`, { schema: adjustmentsPageSchema });
      const ids = new Set(items.map((item) => item.id));
      setItems([...items, ...page.ajustes.filter((item) => !ids.has(item.id))]);
      setNextOffset(page.proximo_offset);
    } catch (error) {
      setMessage(onError(error));
    } finally {
      setMoreBusy(false);
    }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const id = editId;
    try {
      await api<{ ok: true }>(id === null ? "/api/ajustes" : `/api/ajustes/${id}`, {
        method: id === null ? "POST" : "PUT",
        body: { tipo: action, duracao: duration.trim(), data: date, motivo: reason.trim() },
        schema: okSchema
      });
      closeForm();
      notify(id === null ? "Ajuste salvo." : "Ajuste atualizado.");
      changed();
      await load();
    } catch (error) {
      setMessage(onError(error));
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: Adjustment) {
    if (busy || !window.confirm(`Excluir ${minutesText(item.minutos, true)} (${item.motivo})? O saldo será recalculado.`))
      return;
    setBusy(true);
    try {
      await api<{ ok: true }>(`/api/ajustes/${item.id}`, { method: "DELETE", schema: okSchema });
      if (editId === item.id) closeForm();
      notify("Ajuste excluído.");
      changed();
      await load();
    } catch (error) {
      setMessage(onError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card ledger-card" aria-labelledby="ledger-title">
      <div className="card-title ledger-heading">
        <div>
          <h2 id="ledger-title">Acertos manuais</h2>
          <p className="muted">Créditos e descontos sem mexer nas batidas.</p>
        </div>
        <button type="button" className="ledger-outline" hidden={opened} onClick={() => openForm()} disabled={busy}>
          Novo ajuste
        </button>
      </div>
      {opened ? (
        <form id="ledger-form" className="ledger-form" onSubmit={save}>
          <h3>{editId === null ? "Novo ajuste" : "Editar ajuste"}</h3>
          <div className="ledger-grid">
            <label>
              Operação
              <select
                required
                value={action}
                onChange={(event) => setAction(event.currentTarget.value as "credito" | "debito")}
                disabled={busy}
              >
                <option value="credito">Creditar (+)</option>
                <option value="debito">Descontar (−)</option>
              </select>
            </label>
            <label>
              Duração (HH:MM)
              <input
                required
                maxLength={6}
                placeholder="01:30"
                pattern="[0-9]{1,3}:[0-5][0-9]"
                value={duration}
                onChange={(event) => setDuration(event.currentTarget.value)}
                disabled={busy}
              />
            </label>
            <label className="ledger-wide">
              Data
              <input
                type="date"
                min="2000-01-01"
                max={brazilDate()}
                required
                value={date}
                onChange={(event) => setDate(event.currentTarget.value)}
                disabled={busy}
              />
            </label>
            <label className="ledger-wide">
              Motivo
              <input
                minLength={3}
                maxLength={200}
                required
                placeholder="Ex.: compensação autorizada"
                value={reason}
                onChange={(event) => setReason(event.currentTarget.value)}
                disabled={busy}
              />
            </label>
          </div>
          <div className="ledger-form-actions">
            <button type="submit" className="primary" disabled={busy}>
              {busy ? "Salvando…" : editId === null ? "Salvar ajuste" : "Salvar alterações"}
            </button>
            <button type="button" className="ledger-outline" onClick={closeForm} disabled={busy}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}
      <div className="ledger-list" id="ledger-list" aria-live="polite">
        {loading ? (
          <p className="muted">Carregando ajustes…</p>
        ) : !items.length ? (
          <p className="muted">Nenhum ajuste manual registrado.</p>
        ) : (
          items.map((item) => (
            <article className="ledger-item" key={item.id}>
              <div className="ledger-info">
                <small>{displayDate(item.data)}</small>
                <strong>{item.motivo}</strong>
              </div>
              <div className="ledger-side">
                <strong className={item.minutos > 0 ? "positive" : item.minutos < 0 ? "negative" : ""}>
                  {minutesText(item.minutos, true)}
                </strong>
                <div className="ledger-actions">
                  <button type="button" className="ledger-link" onClick={() => openForm(item)} disabled={busy}>
                    Editar
                  </button>
                  <button
                    type="button"
                    className="ledger-link ledger-danger"
                    onClick={() => void remove(item)}
                    disabled={busy}
                  >
                    Excluir
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
      {nextOffset !== null && !loading ? (
        <button type="button" className="ledger-outline" onClick={loadMore} disabled={moreBusy || busy}>
          {moreBusy ? "Carregando…" : "Carregar mais ajustes"}
        </button>
      ) : null}
      <p role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
