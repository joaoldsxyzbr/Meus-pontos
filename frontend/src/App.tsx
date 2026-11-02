import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type {
  TodayResponse, RegisterPointRequest, RegisterPointResponse, HistoryResponse, BalanceResponse
} from "../../src/shared/contracts";
import { HttpError, api } from "./lib/api";
import { brazilDate } from "./lib/time";
import Ponto from "./components/Ponto";
import Historico from "./components/Historico";
import Banco from "./components/Banco";

type Tab = "ponto" | "historico" | "saldo";

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("ponto");
  const [day, setDay] = useState<TodayResponse | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const [month, setMonth] = useState(() => brazilDate().slice(0, 7));
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [notice, setNotice] = useState("");
  const noticeTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sequence = useRef(0);
  /**
   * Espelho do estado para leitura imediata dentro de fluxos assíncronos
   * (login, intervalos e listeners), no lugar da reatividade do Svelte.
   */
  const current = useRef({ authenticated, tab, month, day, loading });
  current.current = { authenticated, tab, month, day, loading };

  function notify(message: string) {
    setNotice(message);
    if (noticeTimeout.current) clearTimeout(noticeTimeout.current);
    noticeTimeout.current = setTimeout(() => setNotice(""), 4200);
  }

  function resetSession() {
    setAuthenticated(false);
    setDay(null);
    setHistory(null);
    setBalance(null);
    setPassword("");
    sequence.current++;
  }

  function errorMessage(error: unknown): string {
    if (error instanceof HttpError && error.status === 401) resetSession();
    return error instanceof Error ? error.message : "Não foi possível consultar o servidor.";
  }

  async function loadTab() {
    if (!current.current.authenticated) return;
    const now = ++sequence.current;
    setLoading(true);
    try {
      if (current.current.tab === "ponto") {
        const result = await api<TodayResponse>("/api/hoje");
        if (now === sequence.current) setDay(result);
      } else if (current.current.tab === "historico") {
        const selectedMonth = current.current.month;
        const result = await api<HistoryResponse>(`/api/historico?mes=${encodeURIComponent(selectedMonth)}`);
        if (now === sequence.current && selectedMonth === current.current.month) setHistory(result);
      } else {
        const result = await api<BalanceResponse>("/api/saldo");
        if (now === sequence.current) setBalance(result);
      }
    } catch (error) {
      if (now === sequence.current) notify(errorMessage(error));
    } finally {
      if (now === sequence.current) setLoading(false);
    }
  }

  async function register(body: RegisterPointRequest) {
    const result = await api<RegisterPointResponse>("/api/pontos", { method: "POST", body });
    setDay(result);
    setHistory(null);
    setBalance(null);
    notify("Ponto registrado às " + body.horario + ".");
  }

  function chooseTab(value: Tab) {
    if (tab === value) return;
    setTab(value);
    sequence.current++;
    // A tela é recarregada diretamente da API (nunca do cache).
    void loadTab();
  }

  function afterCorrections() {
    setHistory(null);
    setDay(null);
    setBalance(null);
    void loadTab();
  }

  function afterAdjustments() {
    setBalance(null);
    void loadTab();
  }

  function changeMonth(value: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return;
    setMonth(value);
    setHistory(null);
    sequence.current++;
    void loadTab();
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loggingIn || !username.trim() || !password) return;
    setLoggingIn(true);
    setLoginError("");
    try {
      await api<{ ok: true }>("/api/login", {
        method: "POST", body: { usuario: username.trim(), senha: password }
      });
      setPassword("");
      setAuthenticated(true);
      current.current = { ...current.current, authenticated: true };
      await loadTab();
    } catch (error) {
      setLoginError(errorMessage(error));
    } finally {
      setLoggingIn(false);
    }
  }

  async function logout() {
    try {
      await api<{ ok: true }>("/api/sair", { method: "POST" });
      resetSession();
    } catch (error) {
      notify(errorMessage(error));
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        await api<{ autenticado: true }>("/api/sessao");
        setAuthenticated(true);
        current.current = { ...current.current, authenticated: true };
        await loadTab();
      } catch (error) {
        // Sem credenciais, mostramos o login. Erros de rede não viram sessão válida.
        if (!(error instanceof HttpError && error.status === 401))
          setLoginError(errorMessage(error));
      } finally {
        setChecking(false);
      }
    })();
    const periodic = setInterval(() => {
      const state = current.current;
      if (state.authenticated && state.tab === "ponto" &&
          document.visibilityState === "visible" &&
          (state.day?.date !== brazilDate() || !state.loading)) {
        void loadTab();
      }
    }, 60000);
    const visible = () => {
      if (document.visibilityState === "visible" && current.current.authenticated) void loadTab();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(periodic);
      document.removeEventListener("visibilitychange", visible);
      if (noticeTimeout.current) clearTimeout(noticeTimeout.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>
    <header className="header">
      <div className="header-inner">
        <div className="brand-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
          </svg>
        </div>
        <div className="brand"><strong>Meus Pontos</strong><span>Controle de jornada</span></div>
        <button className="icon-btn logout" type="button" title="Sair" aria-label="Sair"
          hidden={!authenticated} onClick={() => void logout()}>
          <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round">
            <path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/>
            <path d="m16 16 4-4-4-4M20 12H9"/>
          </svg>
        </button>
        <button className="icon-btn refresh" type="button" title="Atualizar dados" aria-label="Atualizar dados"
          onClick={() => void loadTab()} disabled={!authenticated || loading}>
          <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round">
            <path d="M20 11a8 8 0 1 0-2 6M20 4v7h-7"/>
          </svg>
        </button>
      </div>
    </header>

    <main className="container">
      {tab === "ponto"
        ? <Ponto key={day?.date ?? "carregando"} day={day} loading={loading}
            register={register} refresh={loadTab} notify={notify}/>
        : tab === "historico"
          ? <Historico month={month} data={history} loading={loading} changeMonth={changeMonth}
              changed={afterCorrections} notify={notify} onError={errorMessage}/>
          : <Banco data={balance} loading={loading} changed={afterAdjustments}
              notify={notify} onError={errorMessage}/>}
    </main>

    <nav className="tabbar" aria-label="Navegação principal">
      <div className="tabbar-inner">
        <button className={"tab" + (tab === "ponto" ? " active" : "")} type="button" data-tab="ponto"
          aria-current={tab === "ponto" ? "page" : undefined} onClick={() => chooseTab("ponto")}>
          <span aria-hidden="true">◷</span><span>Ponto</span>
        </button>
        <button className={"tab" + (tab === "historico" ? " active" : "")} type="button" data-tab="historico"
          aria-current={tab === "historico" ? "page" : undefined} onClick={() => chooseTab("historico")}>
          <span aria-hidden="true">▦</span><span>Histórico</span>
        </button>
        <button className={"tab" + (tab === "saldo" ? " active" : "")} type="button" data-tab="saldo"
          aria-current={tab === "saldo" ? "page" : undefined} onClick={() => chooseTab("saldo")}>
          <span aria-hidden="true">▥</span><span>Banco de horas</span>
        </button>
      </div>
    </nav>

    <div className="gate" id="gate" hidden={authenticated}>
      <form className="gate-card" onSubmit={login}>
        <div className="gate-logo" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="34" height="34" fill="none"
            stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
          </svg>
        </div>
        <h2>Acessar Meus Pontos</h2>
        <p>{checking ? "Verificando sessão…" : "Entre com seu usuário e senha para acessar seu controle de ponto."}</p>
        <label htmlFor="login-user">Usuário</label>
        <input id="login-user" name="username" type="text" required autoComplete="username"
          autoCapitalize="none" spellCheck={false} maxLength={40} placeholder="Seu usuário"
          value={username} onChange={event => setUsername(event.target.value)} disabled={checking || loggingIn}/>
        <label htmlFor="login-password">Senha</label>
        <input id="login-password" name="password" type="password" required
          autoComplete="current-password" placeholder="Sua senha"
          value={password} onChange={event => setPassword(event.target.value)} disabled={checking || loggingIn}/>
        <button className="primary" type="submit" disabled={checking || loggingIn}>
          {loggingIn ? "Entrando…" : "Entrar"}
        </button>
        <span role="alert">{loginError}</span>
      </form>
    </div>
    <div id="toast" className="toast" role="status" aria-live="polite" hidden={!notice}>{notice}</div>
  </>;
}
