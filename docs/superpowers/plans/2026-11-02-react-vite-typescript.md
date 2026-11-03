# Migração React + Vite + TypeScript — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar todo o Meus-pontos (frontend, backend Worker, testes e scripts) em React 19 + Vite 8 + TypeScript, sem mudar contrato de API, schema do D1 nem infraestrutura.

**Architecture:** Conversão 1:1 módulo a módulo: backend Hono vira TS tipado com os mesmos handlers; componentes Svelte viram componentes React equivalentes com os mesmos fluxos e props; testes continuam com o mesmo corpo, migrando o carregador para TS. Vitest/workerd continua dono dos testes de integração e do teste SQL (que sai do Python).

**Tech Stack:** React 19, Vite 8, TypeScript 6 (strict), Hono 4, Zod 4, Vitest 4 + @cloudflare/vitest-plugin, Wrangler 4, `tsx` para scripts TS, node:test com `--import tsx` para testes unitários e de pipeline.

**Spec:** `docs/superpowers/specs/2026-11-02-react-vite-typescript-design.md`

## Global Constraints

- Mesmo contrato de API: rotas, status, cabeçalhos, cookies (`__Host-mp_session`) e mensagens de erro não mudam.
- Nenhuma migração/schema no D1 `meus-pontos`; nenhum deploy e nenhuma escrita no banco de produção durante o desenvolvimento.
- Sem secrets, tokens ou credenciais em arquivos versionados.
- Branch `feat/react-vite-ts` a partir da main (2803fa79b0bbf0cb7a41194638c4df1b25dda5f8). Merge apenas com CI verde.
- Ao fim, nenhum arquivo `.svelte`, nenhum `.js`/`.mjs` de aplicação, script ou teste, e nenhum teste Python.
- Todos os commits intermediários deixam `npm run typecheck`, `npm test`, `npm run test:workers` e os builds verdes.
- Node 22 (CI) compatível: nenhuma API Node experimental sem flag.

## Review Focus

1. Contrato da API (rotas/status/cookies) — pinado pelos testes de integração `tests/integration/**` e `scripts/staging-http.test.ts` convertidos; qualquer divergência falha.
2. Cabeçalhos de cache do release (index no-store, assets imutáveis) — pinados por `scripts/release.test.ts` e `scripts/staging.test.ts`.
3. Regras de batida e folga (sequência, confirmação de trabalho em folga, 409 de estado obsoleto) — pinados por `tests/*.test.ts` unitários e staging-http.
4. Ajustes paginados sem corte na centésima operação — pinado por `tests/adjustments-api.test.ts` + `tests/adjustments.test.js` convertidos.
5. Integridade SQL das views/migração — pinado pelo teste Python migrado para `tests/integration` (mesmas asserções, runner workerd/D1).

---

### Task 0: Branch e documentação

**Files:**
- Create: `docs/superpowers/specs/2026-11-02-react-vite-typescript-design.md` (do design aprovado)
- Create: `docs/superpowers/plans/2026-11-02-react-vite-typescript.md` (este plano)

- [ ] **Step 1: Criar branch `feat/react-vite-ts` a partir da main atual**

- [ ] **Step 2: Commit dos dois documentos**

```bash
git add docs/superpowers/
git commit -m "docs: design e plano da migração React + Vite + TypeScript"
```

### Task 1: Backend em TypeScript

**Files:**
- Modify (renomear para .ts, conversão 1:1): `src/worker.js` → `src/worker.ts`, `src/auth.js` → `src/auth.ts`, `src/logic.js` → `src/logic.ts`, `src/schedule.js` → `src/schedule.ts`, `src/corrections.js` → `src/corrections.ts`, `src/adjustments.js` → `src/adjustments.ts`, `src/shared/schemas.js` → `src/shared/schemas.ts`, `src/release-worker.js` → `src/release-worker.ts`, `src/staging-worker.js` → `src/staging-worker.ts`
- Create: `src/env.d.ts` (bindings DB, ASSETS, LOGIN_LIMITER, secrets; `PONTO_USERNAME`, `PONTO_PASSWORD_RECORD`, `PONTO_SESSION_SECRET` opcionais)
- Modify: `src/shared/contracts.ts` se referenciar `./schemas.js` → `./schemas.ts`
- Modify: `tsconfig.json` include → `src/**/*.ts`, `scripts/**/*.ts`, `tests/**/*.ts`
- Modify: `vitest.config.ts` main → `./src/worker.ts`
- Modify: `wrangler.jsonc` main → `src/release-worker.ts`
- Modify: `package.json` script `test` → `node --import tsx --test tests/*.test.ts`; `tsx` entra em devDependencies
- Test: renomear `tests/*.test.js` → `tests/*.test.ts` (mesmo corpo; tipos de entrada ajustados)

**Interfaces:**
- Produces: mesmos módulos e exports atuais (`brazilNow`, `weekday`, `nextType`, `expectedTypes`, `effectiveSchedule`, `authConfigured`, `checkCredentials`, `createSession`, `verifySession`, `sessionCookie`, `clearSessionCookie`, `adjustmentsApi`, `correctionsApi`, `loginSchema`, `timeSchema`, `pointTypeSchema`, `monthSchema`), agora tipados; `Env` exportado de `src/env.d.ts`.

- [ ] **Step 1: Renomear os 9 módulos para .ts e adicionar tipos (`Env`, params, retornos) sem alterar lógica, strings ou respostas**
- [ ] **Step 2: Renomear os testes unitários para .ts e ajustar apenas imports/carregador**
- [ ] **Step 3: Atualizar `tsconfig.json`, `vitest.config.ts`, `wrangler.jsonc` e `package.json`**
- [ ] **Step 4: Verificar verde**

Run: `npm run typecheck && npm test && npm run test:workers`
Expected: PASS sem diffs de comportamento (mesmos números de teste).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor: backend e testes unitários em TypeScript"
```

### Task 2: Frontend React

**Files:**
- Delete: `frontend/src/App.svelte`, `frontend/src/components/*.svelte`
- Create: `frontend/src/App.tsx`, `frontend/src/components/Ponto.tsx`, `Historico.tsx`, `Correcoes.tsx`, `Ajustes.tsx`, `Banco.tsx`
- Modify: `frontend/src/main.ts` (mount React), `frontend/index.html` (título/descrição sem "Svelte"), `frontend/tsconfig.json` (types: `vite/client`; include `src/**/*.ts`, `src/**/*.tsx`), `vite.frontend.config.ts` (plugin React; outDir `../dist/frontend`)
- Modify: `package.json`: remove `svelte`, `@sveltejs/vite-plugin-svelte`, `svelte-check`; add `react`, `react-dom`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`; `check:frontend` → `tsc -p frontend/tsconfig.json`
- Modify: CSS atuais (`styles.css`, `ajustes.css`, `correcoes.css`) adaptados a classes emitidas pelo React
- Modify: `scripts/browser-svelte-smoke.mjs` → `scripts/browser-react-smoke.ts` (renomear, mesmos fluxos, seletores ajustados ao DOM React)
- Modify: `scripts/build-staging.mjs` e `scripts/build-release.mjs` apenas no caminho do bundle de origem (`dist/svelte-pilot` → `dist/frontend`) — conversão completa desses scripts é Task 3

**Interfaces:**
- Consumes: `src/shared/contracts.ts` (tipos já existentes), `lib/api.ts`, `lib/time.ts` (inalterados).
- Produces: `App` com os mesmos estados/fluxos atuais (login, abas hoje/histórico/banco, toast, sessão), componentes com props equivalentes às atuais (`day`, `loading`, `register`, `refresh`, `notify`, `changed`, `onError`, `data`, `month`, `changeMonth`).

- [ ] **Step 1: Portar App e os 5 componentes para TSX, preservando fluxos, textos e ações; melhorias de usabilidade apenas em estados de carregamento/erro e feedback (sem mudar funcionalidades)**
- [ ] **Step 2: Atualizar main.ts, index.html, tsconfig, vite config, package.json e CSS**
- [ ] **Step 3: Converter o smoke de navegador para React/TS**
- [ ] **Step 4: Verificar verde**

Run: `npm run check:frontend && npm run build:frontend && npm run typecheck && node --import tsx --test scripts/browser-react-smoke.ts`
Expected: PASS (smoke requer Chrome local; se indisponível, validar no CI do PR).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: frontend React 19 + Vite em TypeScript"
```

### Task 3: Scripts de build em TypeScript

**Files:**
- Modify: `scripts/build-staging.mjs` → `build-staging.ts`, `scripts/build-release.mjs` → `build-release.ts`, `scripts/criar-login.mjs` → `criar-login.ts`
- Modify: `scripts/staging.test.mjs` → `staging.test.ts`, `scripts/release.test.mjs` → `release.test.ts`
- Modify: `package.json`: `build:staging`/`build:release` → `tsx scripts/...`; `test:staging`/`test:release` → `node --import tsx --test scripts/...`

**Interfaces:**
- Consumes: bundle `dist/frontend` (Task 2).
- Produces: mesmos pacotes `dist/staging` e `dist/release` com os mesmos arquivos e políticas de cache; mesmas saídas do `criar-login`.

- [ ] **Step 1: Converter os 3 scripts para TS, mesma lógica**
- [ ] **Step 2: Converter os 2 testes de pacote para TS**
- [ ] **Step 3: Verificar verde**

Run: `npm run build:staging && npm run test:staging && npm run build:release && npm run test:release`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "refactor: scripts de build e testes de pacote em TypeScript"
```

### Task 4: Testes HTTP e SQL em TypeScript

**Files:**
- Modify: `scripts/staging-http.test.mjs` → `scripts/staging-http.test.ts` (mesmos cenários, carregador tsx)
- Delete: `tests/test_integridade_sql.py`
- Create: `tests/integration/integridade-sql.test.ts` (mesmas asserções do teste Python, executando as migrações via `readD1Migrations` no pool workerd do Vitest)
- Modify: `vitest.config.ts` se precisar incluir o novo arquivo (include já cobre `tests/integration/**/*.test.ts`)

**Interfaces:**
- Consumes: worker TS (Task 1), pacotes staging/release (Task 3), `migrations/` existentes.
- Produces: cobertura SQL sem Python.

- [ ] **Step 1: Converter staging-http.test para TS e rodar verde**

Run: `node --import tsx --test scripts/staging-http.test.ts`
Expected: PASS.

- [ ] **Step 2: Portar o teste de integridade SQL para tests/integration em TS**

Run: `npm run test:workers`
Expected: PASS incluindo o novo arquivo.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "test: testes HTTP e SQL de integridade em TypeScript"
```

### Task 5: CI, docs e limpeza

**Files:**
- Modify: `.github/workflows/ci.yml` — remove etapas Svelte (`check:frontend` vira tsc), remove `node --check`, remove etapa Python, renomeia etapas do smoke para `browser-react-smoke.ts`
- Modify: `.github/workflows/deploy.yml` — apenas se referenciar camados renomeados
- Modify: `README.md` e docs de release — referências Svelte → React
- Verify: grep sem resultados relevantes para `svelte`, `\.mjs`, `test_.*\.py`

- [ ] **Step 1: Atualizar CI e workflows**
- [ ] **Step 2: Atualizar README/docs**
- [ ] **Step 3: Varredura de restos e pipeline completo local**

Run: `npm run verify && npm run build:staging && npm run test:staging && npm run build:release && npm run test:release && npx --no-install wrangler deploy --config wrangler.jsonc --dry-run --outdir dist/wrangler-release-check && npx tsc -p frontend/tsconfig.json`
Expected: PASS tudo.

- [ ] **Step 4: Commit, push e PR para a main com o CI completo; merge apenas com CI verde**

```bash
git add -A && git commit -m "chore: CI e documentação para a stack React + TS"
git push -u origin feat/react-vite-ts
```
