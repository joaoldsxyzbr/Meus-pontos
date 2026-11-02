# Design: MigraÃ§Ã£o do Meus-pontos para React + Vite + TypeScript

Data: 2026-11-02. Estado: aprovado.

## IntenÃ§Ã£o

Unificar todo o projeto em uma Ãºnica stack: React 19 + Vite 8 + TypeScript, cobrindo frontend, backend (Worker), testes e scripts de build. Hoje o repositÃ³rio mistura Svelte 5 no frontend, JavaScript puro no backend, testes em node --test/.mjs/Python e scripts .mjs. Depois da migraÃ§Ã£o, nÃ£o deve restar nenhum arquivo Svelte, .js de aplicaÃ§Ã£o, .mjs de script ou teste Python.

## Por quÃª

- Uma stack sÃ³ reduz custo de manutenÃ§Ã£o e ferramentas duplicadas (svelte-check + tsc, dois formatos de teste).
- TypeScript ponta a ponta dÃ¡ contratos tipados entre frontend e API.
- O usuÃ¡rio decidiu explicitamente: tudo em React + Vite + TS, incluindo backend, testes e scripts.

## Objetivos

1. Frontend React 19 + TypeScript, construÃ­do pelo Vite jÃ¡ existente, substituindo os 6 componentes Svelte (App, Ponto, Historico, Correcoes, Ajustes, Banco).
2. Backend Worker Hono em TypeScript, com o mesmo contrato de API: mesmas rotas, status, cabeÃ§alhos, cookies e validaÃ§Ãµes.
3. Todos os testes em TypeScript, rodando com os runners atuais (node --test com carregador TS e Vitest).
4. Scripts de build/staging/release em TypeScript.
5. CI verde na branch do PR antes de qualquer merge.

## NÃ£o objetivos

- Nenhuma mudanÃ§a de schema ou migraÃ§Ã£o no D1 `meus-pontos`.
- Nenhuma mudanÃ§a nas regras de negÃ³cio: sequÃªncia de batidas, escala, correÃ§Ãµes, auditoria e saldo permanecem com a mesma semÃ¢ntica.
- Nenhuma mudanÃ§a em autenticaÃ§Ã£o (PBKDF2, cookie `__Host-mp_session`, rate limit) nem nos cabeÃ§alhos de seguranÃ§a/CSP.
- Nenhuma mudanÃ§a de secrets, credenciais ou infraestrutura Cloudflare (Worker, D1, Workers Builds).

## Antigoals (o que seria fracasso mesmo funcionando)

- Deploy em produÃ§Ã£o com CI vermelho ou sem PR.
- API com contrato diferente do atual (quebraria abas abertas e cache antigo).
- Qualquer operaÃ§Ã£o de escrita no D1 de produÃ§Ã£o durante o desenvolvimento.

## DecisÃµes tomadas com o JoÃ£o

- Escopo: tudo (frontend, backend, testes e scripts).
- Entrega: branch + PR; merge apenas com CI verde. A main continua com deploy automÃ¡tico via Workers Builds.
- Interface: pode melhorar visual e usabilidade, mantendo os mesmos fluxos e funcionalidades.

## Escolhas tÃ©cnicas (minhas, revisÃ¡veis)

1. VersÃµes: React 19, Vite 8 (jÃ¡ no projeto), TypeScript 6 (jÃ¡ no projeto, strict). Hono e Zod permanecem no backend.
2. Estrutura React espelha a atual: `frontend/src/App.tsx` + componentes `Ponto.tsx`, `Historico.tsx`, `Correcoes.tsx`, `Ajustes.tsx`, `Banco.tsx`; `lib/api.ts` e `lib/time.ts` migrados com tipos de resposta da API derivados dos contratos de `src/shared/contracts.ts`.
3. Estilos: os CSS atuais (`styles.css`, `ajustes.css`, `correcoes.css`) sÃ£o adaptados, nÃ£o reescritos. Melhorias de usabilidade ficam modestas: estados de carregamento e erro consistentes, feedback de confirmaÃ§Ã£o nas aÃ§Ãµes e ajustes de espaÃ§amento/contraste. Sem framework CSS novo.
4. Backend: mesmos mÃ³dulos atuais viram TS 1:1 (`worker.ts`, `auth.ts`, `logic.ts`, `schedule.ts`, `corrections.ts`, `adjustments.ts`, `shared/schemas.ts`, `release-worker.ts`, `staging-worker.ts`), com um `src/env.d.ts` tipando os bindings (DB, ASSETS, LOGIN_LIMITER, secrets). Wrangler empacota TS nativamente; `wrangler.jsonc` passa a apontar `src/release-worker.ts`.
5. Testes: os testes unitÃ¡rios e de pipeline migram de extensÃ£o mantendo o runner node --test com carregador TS (`tsx`); os de integraÃ§Ã£o seguem no Vitest/workerd. O teste SQL Python (`tests/test_integridade_sql.py`) migra para TS usando o pool workerd/D1 jÃ¡ configurado no `vitest.config.ts` â Python sai do CI.
6. Smoke de navegador: `browser-svelte-smoke.mjs` vira `browser-react-smoke.ts`, mesmas validaÃ§Ãµes de fluxo em Chrome headless (desktop e mobile).
7. ExecuÃ§Ã£o de scripts TS no build: dependÃªncia `tsx` para `build:staging`, `build:release`, `criar-login`, smoke e testes node --test. Alternativa avaliada (Node com `--experimental-strip-types`) foi descartada porque depende da versÃ£o do Node da imagem do Workers Builds.
8. `package.json`: removidos `svelte`, `@sveltejs/vite-plugin-svelte`, `svelte-check`; adicionados `react`, `react-dom`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`, `tsx`. `typecheck` passa a cobrir frontend, backend e scripts com um Ãºnico `tsc --noEmit`.
9. CI (`ci.yml`): etapas de Svelte saem; entra `tsc -p frontend/tsconfig.json`; os `node --check` de sintaxe saem (tsc cobre); Python sai; nomes e comandos seguem os novos scripts. `deploy.yml` de emergenÃªncia Ã© atualizado apenas se referenciar caminhos renomeados.


## Entrega e rollback

- Branch `feat/react-vite-ts` a partir da main atual (2803fa7).
- PR para a main com o CI completo verde (testes, workers+D1 local, staging HTTP, smoke Chrome, `wrangler deploy --dry-run`).
- Merge sÃ³ f Ã¦s CI verde; o merge publica em produÃ§Ã£o automÃ¡ticamente (comportamento atual do Workers Builds).
- Rollback: `git revert` do merge; o histÃ³rico Git preserva o Svelte removido.

## Risscos e mitigaÃ§Ãµes

- Contrato de API mudar sem querer â migraÃ§Ã£o 1:1 dos mÃ³dulos e testes de integraÃ§Ã£o HTTP existentes rodam contra a API migrada no workerd.
- Smoke test quebrado por seletores de DOM do Svelte â reescrita dos seletores para o DOM React, com as mesmas verificaÃ§Ãµes de fluxo.
- Imagem do Workers Builds sem `tsx`/Node adequado â `npm ci` instala o `tsx` antes do `build.command`; o `wrangler deploy --dry-run` no CI valida o pacote final sem deploy.
- RegressÃ£o de usabilidade no dia a dia â os fluxos de ponto, histÃ³rico, correÃ§Ãµes e banco de horas mantÃªm as mesmas aÃ§Ãµes e atalhos atuais.

## O que fica para o executor

- Detalhes de leitura dos arquivos restantes (App.svelte, componentes, scripts de build) durante a implementaÃ§Ã£o.
- Ajuste fino de seletores do smoke test e de pequenas diferenÃ§as de DOM React vs Svelte.
- AtualizaÃ§Ã£o de README e docs de release que mencionam Svelte.
