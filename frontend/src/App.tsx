import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BalanceResponse,
  HistoryResponse,
  RegisterPointRequest,
  RegisterPointResponse,
  TodayResponse
} from "../../src/shared/contracts.ts";
import { HttpError, api } from "./lib/api.ts";
import { balanceSchema, historySchema, okSchema, registerPointSchema, sessionSchema, todaySchema } from "./lib/schemas.ts";
import { brazilDate } from "./lib/time.ts";
import Ponto from "./components/Ponto.tsx";
import Historico from "./components/Historico.tsx";
import Banco from "./components/Banco.tsx";
import Visual from "./components/Visual.tsx";

type Tab = "ponto" | "historico" | "visual" | "saldo";

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
  const requestSequence = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  /** Espelha o estado para os callbacks de intervalo sem recriá-los. */
  const stateRef = useRef({ authenticated, tab, day, loading });
  stateRef.current = { authenticated, tab, day, loading };

  const notify = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimeout.current) clearTimeout(noticeTimeout.current);
    noticeTimeout.current = setTimeout(() => setNotice(""), 4200);
  }, []);

  const resetSession = useCallback(() => {
    setAuthenticated(false);
    setDay(null);
    setHistory(null);
    setBalance(null);
    setPassword("");
    requestSequence.current++;
    abortRef.current?.abort();
  }, []);

  const errorMessage = useCallback(
    (error: unknown): string => {
      if (error instanceof HttpError && error.status === 401) resetSession();
      return error instanceof Error ? error.message : "Não foi possível consultar o servidor.";
    },
    [resetSession]
  );

  const loadTab = useCallback(async () => {
    if (!stateRef.current.authenticated) return;
    const sequence = ++requestSequence.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const currentTab = stateRef.current.tab;
      if (currentTab === "ponto") {
        const result = await api<TodayResponse>("/api/hoje", { signal: controller.signal, schema: todaySchema });
        if (sequence === requestSequence.current) setDay(result);
      } else if (currentTab === "historico" || currentTab === "visual") {
        const selectedMonth = month;
        const result = await api<HistoryResponse>(
          `/api/historico?mes=${encodeURIComponent(selectedMonth)}`,
          { signal: controller.signal, schema: historySchema }
        );
        if (sequence === requestSequence.current && selectedMonth === month) setHistory(result);
      } else {
        const result = await api<BalanceResponse>("/api/saldo", { signal: controller.signal, schema: balanceSchema });
        if (sequence === requestSequence.current) setBalance(result);
      }
    } catch (error) {
      if (sequence === requestSequence.current && !controller.signal.aborted) notify(errorMessage(error));
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [month, notify, errorMessage]);

  const register = useCallback(
    async (body: RegisterPointRequest) => {
      const result = await api<RegisterPointResponse>("/api/pontos", { method: "POST", body, schema: registerPointSchema });
      setDay(result);
      setHistory(null);
      setBalance(null);
      notify("Ponto registrado às " + body.horario + ".");
    },
    [notify]
  );

  const chooseTab = useCallback(
    (value: Tab) => {
      if (stateRef.current.tab === value) return;
      stateRef.current = { ...stateRef.current, tab: value };
      setTab(value);
      requestSequence.current++;
      void loadTab();
    },
    [loadTab]
  );

  const afterCorrections = useCallback(() => {
    setHistory(null);
    setDay(null);
    setBalance(null);
    void loadTab();
  }, [loadTab]);

  const afterAdjustments = useCallback(() => {
    setBalance(null);
    void loadTab();
  }, [loadTab]);

  const changeMonth = useCallback(
    (value: string) => {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return;
      setMonth(value);
      setHistory(null);
      requestSequence.current++;
      void loadTab();
    },
    [loadTab]
  );

  const login = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (loggingIn || !username.trim() || !password) return;
      setLoggingIn(true);
      setLoginError("");
      try {
        await api<{ ok: true }>("/api/login", {
          method: "POST",
          body: { usuario: username.trim(), senha: password },
          schema: okSchema
        });
        setPassword("");
        setAuthenticated(true);
        stateRef.current = { ...stateRef.current, authenticated: true };
        await loadTab();
      } catch (error) {
        setLoginError(errorMessage(error));
      } finally {
        setLoggingIn(false);
      }
    },
    [loggingIn, username, password, loadTab, errorMessage]
  );

  const logout = useCallback(async () => {
    try {
      await api<{ ok: true }>("/api/sair", { method: "POST", schema: okSchema });
      resetSession();
    } catch (error) {
      notify(errorMessage(error));
    }
  }, [resetSession, notify, errorMessage]);

  useEffect(() => {
    void (async () => {
      try {
        await api<{ autenticado: true }>("/api/sessao", { schema: sessionSchema });
        setAuthenticated(true);
        stateRef.current = { ...stateRef.current, authenticated: true };
        await loadTab();
      } catch (error) {
        // Sem credenciais, mostramos o login. Erros de rede não viram sessão válida.
        if (!(error instanceof HttpError && error.status === 401)) setLoginError(errorMessage(error));
      } finally {
        setChecking(false);
      }
    })();
    // Executa apenas na montagem inicial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const periodic = setInterval(() => {
      const current = stateRef.current;
      if (
        current.authenticated &&
        current.tab === "ponto" &&
        document.visibilityState === "visible" &&
        (current.day?.date !== brazilDate() || !current.loading)
      ) {
        void loadTab();
      }
    }, 60000);
    const visible = () => {
      if (document.visibilityState === "visible" && stateRef.current.authenticated) void loadTab();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(periodic);
      document.removeEventListener("visibilitychange", visible);
      if (noticeTimeout.current) clearTimeout(noticeTimeout.current);
    };
  }, [loadTab]);

  return (
    <>
      <header className="header">
        <div className="header-inner">
          <div className="brand-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          </div>
          <div className="brand">
            <strong>Meus Pontos</strong>
            <span>Controle de jornada</span>
          </div>
          <button
            className="icon-btn logout"
            type="button"
            title="Sair"
            aria-label="Sair"
            hidden={!authenticated}
            onClick={logout}
          >
            <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
              <path d="m16 16 4-4-4-4M20 12H9" />
            </svg>
          </button>
          <button
            className="icon-btn refresh"
            type="button"
            title="Atualizar dados"
            aria-label="Atualizar dados"
            onClick={() => void loadTab()}
            disabled={!authenticated || loading}
          >
            <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M20 11a8 8 0 1 0-2 6M20 4v7h-7" />
            </svg>
          </button>
        </div>
      </header>

      <main className="container">
        {tab === "ponto" ? (
          <Ponto
            key={day?.date ?? "loading"}
            day={day}
            loading={loading}
            register={register}
            refresh={loadTab}
            notify={notify}
          />
        ) : tab === "historico" ? (
          <Historico
            month={month}
            data={history}
            loading={loading}
            changeMonth={changeMonth}
            changed={afterCorrections}
            notify={notify}
            onError={errorMessage}
          />
        ) : tab === "visual" ? (
          <Visual month={month} data={history} loading={loading} changeMonth={changeMonth} />
        ) : (
          <Banco data={balance} loading={loading} changed={afterAdjustments} notify={notify} onError={errorMessage} />
        )}
      </main>

      <nav className="tabbar" aria-label="Navegação principal">
        <div className="tabbar-inner">
          <button
            className={`tab${tab === "ponto" ? " active" : ""}`}
            type="button"
            data-tab="ponto"
            aria-current={tab === "ponto" ? "page" : undefined}
            onClick={() => chooseTab("ponto")}
          >
            <span aria-hidden="true">◷</span>
            <span>Ponto</span>
          </button>
          <button
            className={`tab${tab === "historico" ? " active" : ""}`}
            type="button"
            data-tab="historico"
            aria-current={tab === "historico" ? "page" : undefined}
            onClick={() => chooseTab("historico")}
          >
            <span aria-hidden="true">▦</span>
            <span>Histórico</span>
          </button>
          <button
            className={`tab${tab === "visual" ? " active" : ""}`}
            type="button"
            data-tab="visual"
            aria-current={tab === "visual" ? "page" : undefined}
            onClick={() => chooseTab("visual")}
          >
            <span aria-hidden="true">▤</span>
            <span>Visual</span>
          </button>
          <button
            className={`tab${tab === "saldo" ? " active" : ""}`}
            type="button"
            data-tab="saldo"
            aria-current={tab === "saldo" ? "page" : undefined}
            onClick={() => chooseTab("saldo")}
          >
            <span aria-hidden="true">▥</span>
            <span>Banco de horas</span>
          </button>
        </div>
      </nav>

      <div className="gate" id="gate" hidden={authenticated}>
        <form className="gate-card" onSubmit={login}>
          <div className="gate-logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          </div>
          <h2>Acessar Meus Pontos</h2>
          <p>
            {checking
              ? "Verificando sessão…"
              : "Entre com seu usuário e senha para acessar seu controle de ponto."}
          </p>
          <label htmlFor="login-user">Usuário</label>
          <input
            id="login-user"
            name="username"
            type="text"
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={40}
            placeholder="Seu usuário"
            value={username}
            onChange={(event) => setUsername(event.currentTarget.value)}
            disabled={checking || loggingIn}
          />
          <label htmlFor="login-password">Senha</label>
          <input
            id="login-password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="Sua senha"
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
            disabled={checking || loggingIn}
          />
          <button className="primary" type="submit" disabled={checking || loggingIn}>
            {loggingIn ? "Entrando…" : "Entrar"}
          </button>
          <span role="alert">{loginError}</span>
        </form>
      </div>
      <div id="toast" className="toast" role="status" aria-live="polite" hidden={!notice}>
        {notice}
      </div>
    </>
  );
}
