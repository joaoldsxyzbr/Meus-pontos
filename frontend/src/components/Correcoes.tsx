import { useRef, useState } from "react";
import type { FormEvent } from "react";
import type { StoredPoint, CorrectionRequest } from "../../../src/shared/contracts";
import { api } from "../lib/api";
import { brazilDate, kinds } from "../lib/time";

type Props = {
  changed: () => void;
  notify: (message: string) => void;
  onError: (error: unknown) => string;
};

export default function Correcoes({ changed, notify, onError }: Props) {
  const [selectedDate, setSelectedDate] = useState(brazilDate);
  const [consulted, setConsulted] = useState<StoredPoint[]>([]);
  const [selected, setSelected] = useState<StoredPoint | null>(null);
  const [correctedTime, setCorrectedTime] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [searched, setSearched] = useState(false);
  const sequence = useRef(0);

  async function consult() {
    if (!selectedDate) {
      setMessage("Escolha uma data.");
      return;
    }
    const current = ++sequence.current;
    setSearched(true);
    setSelected(null);
    setLoading(true);
    setMessage("");
    try {
      const response = await api<{ data: string; pontos: StoredPoint[] }>(
        `/api/pontos/consultar?data=${encodeURIComponent(selectedDate)}`
      );
      if (current === sequence.current) setConsulted(response.pontos);
    } catch (error) {
      if (current === sequence.current) {
        setConsulted([]);
        setMessage(onError(error));
      }
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }

  function selectPoint(point: StoredPoint) {
    setSelected(point);
    setCorrectedTime(point.horario);
    setReason("");
  }

  async function mutate(action: "editar" | "excluir") {
    if (!selected || busy || loading) return;
    const text = reason.trim();
    if (text.length < 3 || text.length > 200) {
      setMessage("Informe um motivo entre 3 e 200 caracteres.");
      return;
    }
    if (action === "excluir" && consulted.at(-1)?.id !== selected.id) {
      setMessage("Somente a última batida pode ser excluída.");
      return;
    }
    if (!window.confirm(action === "excluir"
      ? "Excluir a última batida? O motivo ficará registrado na auditoria."
      : "Confirmar a alteração do horário desta batida?")) return;
    const payload: CorrectionRequest = action === "editar"
      ? { id: selected.id, data: selected.data, acao: "editar",
          horario_anterior: selected.horario, horario: correctedTime, motivo: text }
      : { id: selected.id, data: selected.data, acao: "excluir",
          horario_anterior: selected.horario, motivo: text };

    setBusy(true);
    try {
      await api<{ ok: true }>("/api/pontos/corrigir", { method: "POST", body: payload });
      setMessage("Correção registrada e auditada.");
      notify("Correção salva.");
      changed();
      await consult();
      setMessage("Correção salva. Registros atualizados.");
    } catch (error) {
      setMessage(onError(error));
    } finally {
      setBusy(false);
    }
  }

  return <section className="card correction-card" aria-labelledby="correction-heading">
    <h2 id="correction-heading">Corrigir batida</h2>
    <p className="muted">Altere um horário ou exclua a última batida. É obrigatório informar o motivo; as operações ficam auditadas.</p>
    <label htmlFor="correction-date">Data dos registros</label>
    <div className="correction-row">
      <input id="correction-date" type="date" min="2000-01-01" max={brazilDate()}
        value={selectedDate}
        onChange={event => {
          setSelectedDate(event.target.value);
          setConsulted([]);
          setSelected(null);
          setSearched(false);
          setLoading(false);
          setMessage("");
          sequence.current++;
        }}/>
      <button type="button" className="ledger-outline" onClick={() => void consult()} disabled={loading || busy}>
        {loading ? "Consultando…" : "Consultar"}
      </button>
    </div>

    <div id="correction-list" aria-live="polite">
      {loading
        ? <p className="muted">Consultando registros…</p>
        : searched && consulted.length === 0
          ? <p className="muted">Sem batidas nesta data.</p>
          : consulted.map(point =>
            <button key={point.id} type="button" className="ledger-outline"
              onClick={() => selectPoint(point)} disabled={busy}>
              {kinds[point.tipo]} · {point.horario}
            </button>)}
    </div>
    {selected
      ? <form id="correction-form" onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          void mutate("editar");
        }}>
        <strong>{kinds[selected.tipo]} · {selected.horario}</strong>
        <label htmlFor="correction-time">Horário correto</label>
        <input id="correction-time" type="time" required value={correctedTime}
          onChange={event => setCorrectedTime(event.target.value)} disabled={busy}/>
        <label htmlFor="correction-reason">Motivo obrigatório</label>
        <input id="correction-reason" minLength={3} maxLength={200} required
          placeholder="Por que precisa corrigir?" value={reason}
          onChange={event => setReason(event.target.value)} disabled={busy}/>
        <div className="correction-row">
          <button className="primary" type="submit" disabled={busy}>Salvar correção</button>
          <button className="ledger-outline" type="button" onClick={() => setSelected(null)} disabled={busy}>Cancelar</button>
        </div>
        {consulted.at(-1)?.id === selected.id
          ? <button type="button" className="ledger-link ledger-danger"
              onClick={() => void mutate("excluir")}
              disabled={busy || reason.trim().length < 3}>Excluir última batida</button>
          : null}
      </form>
      : null}
    <p role="status" aria-live="polite">{message}</p>
  </section>;
}
