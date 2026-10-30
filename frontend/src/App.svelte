<script lang="ts">
  import { onMount } from "svelte";
  import type {
    TodayResponse, RegisterPointRequest, RegisterPointResponse, HistoryResponse, BalanceResponse
  } from "../../src/shared/contracts";
  import { HttpError, api } from "./lib/api";
  import { brazilDate } from "./lib/time";
  import Ponto from "./components/Ponto.svelte";
  import Historico from "./components/Historico.svelte";
  import Banco from "./components/Banco.svelte";

  type Tab = "ponto" | "historico" | "saldo";
  let authenticated = $state(false);
  let checking = $state(true);
  let loggingIn = $state(false);
  let loading = $state(false);
  let tab = $state<Tab>("ponto");
  let day = $state<TodayResponse | null>(null);
  let history = $state<HistoryResponse | null>(null);
  let balance = $state<BalanceResponse | null>(null);
  let month = $state(brazilDate().slice(0, 7));
  let username = $state("");
  let password = $state("");
  let loginError = $state("");
  let notice = $state("");
  let noticeTimeout: ReturnType<typeof setTimeout> | undefined;
  let requestSequence = 0;

  function notify(message: string) {
    notice = message;
    if (noticeTimeout) clearTimeout(noticeTimeout);
    noticeTimeout = setTimeout(() => notice = "", 4200);
  }

  function resetSession() {
    authenticated = false;
    day = null;
    history = null;
    balance = null;
    password = "";
    requestSequence++;
  }

  function errorMessage(error: unknown): string {
    if (error instanceof HttpError && error.status === 401) resetSession();
    return error instanceof Error ? error.message : "Não foi possível consultar o servidor.";
  }

  async function loadTab() {
    if (!authenticated) return;
    const sequence = ++requestSequence;
    loading = true;
    try {
      if (tab === "ponto") {
        const result = await api<TodayResponse>("/api/hoje");
        if (sequence === requestSequence) day = result;
      } else if (tab === "historico") {
        const selectedMonth = month;
        const result = await api<HistoryResponse>(`/api/historico?mes=${encodeURIComponent(selectedMonth)}`);
        if (sequence === requestSequence && selectedMonth === month) history = result;
      } else {
        const result = await api<BalanceResponse>("/api/saldo");
        if (sequence === requestSequence) balance = result;
      }
    } catch (error) {
      if (sequence === requestSequence) notify(errorMessage(error));
    } finally {
      if (sequence === requestSequence) loading = false;
    }
  }

  async function register(body: RegisterPointRequest) {
    const result = await api<RegisterPointResponse>("/api/pontos", { method: "POST", body });
    day = result;
    history = null;
    balance = null;
    notify("Ponto registrado às " + body.horario + ".");
  }

  function chooseTab(value: Tab) {
    if (tab === value) return;
    tab = value;
    requestSequence++;
    // A tela é recarregada diretamente da API (nunca do cache).
    void loadTab();
  }

  function afterCorrections() {
    history = null;
    day = null;
    balance = null;
    void loadTab();
  }

  function afterAdjustments() {
    balance = null;
    void loadTab();
  }

  function changeMonth(value: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return;
    month = value;
    history = null;
    requestSequence++;
    void loadTab();
  }

  async function login(event: SubmitEvent) {
    event.preventDefault();
    if (loggingIn || !username.trim() || !password) return;
    loggingIn = true;
    loginError = "";
    try {
      await api<{ ok: true }>("/api/login", {
        method: "POST", body: { usuario: username.trim(), senha: password }
      });
      password = "";
      authenticated = true;
      await loadTab();
    } catch (error) {
      loginError = errorMessage(error);
    } finally {
      loggingIn = false;
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

  onMount(() => {
    void (async () => {
      try {
        await api<{ autenticado: true }>("/api/sessao");
        authenticated = true;
        await loadTab();
      } catch (error) {
        // Sem credenciais, mostramos o login. Erros de rede não viram sessão válida.
        if (!(error instanceof HttpError && error.status === 401))
          loginError = errorMessage(error);
      } finally {
        checking = false;
      }
    })();
    const periodic = setInterval(() => {
      if (authenticated && tab === "ponto" && document.visibilityState === "visible" &&
          (day?.date !== brazilDate() || !loading)) {
        void loadTab();
      }
    }, 60000);
    const visible = () => {
      if (document.visibilityState === "visible" && authenticated) void loadTab();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(periodic);
      document.removeEventListener("visibilitychange", visible);
      if (noticeTimeout) clearTimeout(noticeTimeout);
    };
  });
</script>

<header class="header">
  <div class="header-inner">
    <div class="brand-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
      </svg>
    </div>
    <div class="brand"><strong>Meus Pontos</strong><span>Controle de jornada</span></div>
    <button class="icon-btn logout" type="button" title="Sair" aria-label="Sair"
      hidden={!authenticated} onclick={logout}>
      <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round">
        <path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/>
        <path d="m16 16 4-4-4-4M20 12H9"/>
      </svg>
    </button>
    <button class="icon-btn refresh" type="button" title="Atualizar dados" aria-label="Atualizar dados"
      onclick={() => void loadTab()} disabled={!authenticated || loading}>
      <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round">
        <path d="M20 11a8 8 0 1 0-2 6M20 4v7h-7"/>
      </svg>
    </button>
  </div>
</header>

<main class="container">
  {#if tab === "ponto"}
    {#key day?.date}
      <Ponto {day} {loading} {register} refresh={loadTab} {notify}/>
    {/key}
  {:else if tab === "historico"}
    <Historico {month} data={history} {loading} {changeMonth}
      changed={afterCorrections} {notify} onError={errorMessage}/>
  {:else}
    <Banco data={balance} {loading} changed={afterAdjustments} {notify} onError={errorMessage}/>
  {/if}
</main>

<nav class="tabbar" aria-label="Navegação principal">
  <div class="tabbar-inner">
    <button class="tab" class:active={tab === "ponto"} type="button" data-tab="ponto"
      aria-current={tab === "ponto" ? "page" : undefined} onclick={() => chooseTab("ponto")}>
      <span aria-hidden="true">◷</span><span>Ponto</span>
    </button>
    <button class="tab" class:active={tab === "historico"} type="button" data-tab="historico"
      aria-current={tab === "historico" ? "page" : undefined} onclick={() => chooseTab("historico")}>
      <span aria-hidden="true">▦</span><span>Histórico</span>
    </button>
    <button class="tab" class:active={tab === "saldo"} type="button" data-tab="saldo"
      aria-current={tab === "saldo" ? "page" : undefined} onclick={() => chooseTab("saldo")}>
      <span aria-hidden="true">▥</span><span>Banco de horas</span>
    </button>
  </div>
</nav>

<div class="gate" id="gate" hidden={authenticated}>
  <form class="gate-card" onsubmit={login}>
    <div class="gate-logo" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="34" height="34" fill="none"
        stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
      </svg>
    </div>
    <h2>Acessar Meus Pontos</h2>
    <p>{checking ? "Verificando sessão…" : "Entre com seu usuário e senha para acessar seu controle de ponto."}</p>
    <label for="login-user">Usuário</label>
    <input id="login-user" name="username" type="text" required autocomplete="username"
      autocapitalize="none" spellcheck="false" maxlength="40" placeholder="Seu usuário"
      bind:value={username} disabled={checking || loggingIn}/>
    <label for="login-password">Senha</label>
    <input id="login-password" name="password" type="password" required
      autocomplete="current-password" placeholder="Sua senha"
      bind:value={password} disabled={checking || loggingIn}/>
    <button class="primary" type="submit" disabled={checking || loggingIn}>
      {loggingIn ? "Entrando…" : "Entrar"}
    </button>
    <span role="alert">{loginError}</span>
  </form>
</div>
<div id="toast" class="toast" role="status" aria-live="polite" hidden={!notice}>{notice}</div>
