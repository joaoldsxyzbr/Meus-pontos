# Design: Migração do Meus-pontos para React + Vite + TypeScript

Data: 2026-11-02. Estado: aprovado.

## Intenção

Unificar todo o projeto em uma única stack: React 19 + Vite 8 + TypeScript, cobrindo frontend, backend (Worker), testes e scripts de build. Hoje o repositório mistura Svelte 5 no frontend, JavaScript puro no backend, testes em node --test/.mjs/Python e scripts .mjs. Depois da migração, não deve restar nenhum arquivo Svelte, .js de aplicação, .mjs de script ou teste Python.

## Por quê

- Uma stack só reduz custo de manutenção e ferramentas duplicadas (svelte-check + tsc, dois formatos de teste).
- TypeScript ponta a ponta dá contratos tipados entre frontend e API.
- O usuário decidiu explicitamente: tudo em React + Vite + TS, incluindo backend, testes e scripts.

## Objetivos

1. Frontend React 19 + TypeScript, construído pelo Vite já existente, substituindo os 6 componentes Svelte (App, Ponto, Historico, Correcoes, Ajustes, Banco).
2. Backend Worker Hono em TypeScript, com o mesmo contrato de API: mesmas rotas, status, cabeçalhos, cookies e validações.
3. Todos os testes em TypeScript, rodando com os runners atuais (node --test com carregador TS e Vitest).
4. Scripts de build/staging/release em TypeScript.
5. CI verde na branch do PR antes de qualquer merge.

## Não objetivos

- Nenhuma mudança de schema ou migração no D1 `meus-pontos`.
- Nenhuma mudança nas regras de negócio: sequência de batidas, escala, correções, auditoria e saldo permanecem com a mesma semântica.
- Nenhuma mudança em autenticação (PBKDF2, cookie `__Host-mp_session`, rate limit) nem nos cabeçalhos de segurança/CSP.
- Nenhuma mudança de secrets, credenciais ou infraestrutura Cloudflare (Worker, D1, Workers Builds).

## Antigoals (o que seria fracasso mesmo funcionando)

- Deploy em produção com CI vermelho ou sem PR.
- API com contrato diferente do atual (quebraria abas abertas e cache antigo).
- Qualquer operação de escrita no D1 de produção durante o desenvolvimento.

## Decisões tomadas com o João

- Escopo: tudo (frontend, backend, testes e scripts).
- Entrega: branch + PR; merge apenas com CI verde. A main continua com deploy automático via Workers Builds.
- Interface: pode melhorar visual e usabilidade, mantendo os mesmos fluxos e funcionalidades.

## Escolhas técnicas (minhas, revisáveis)

1. Versões: React 19, Vite 8 (já no projeto), TypeScript 6 (já no projeto, strict). Hono e Zod permanecem no backend.
2. Estrutura React espelha a atual: `frontend/src/App.tsx` + componentes `Ponto.tsx`, `Historico.tsx`, `Correcoes.tsx`, `Ajustes.tsx`, `Banco.tsx`; `lib/api.ts` e `lib/time.ts` migrados com tipos de resposta da API derivados dos contratos de `src/shared/contracts.ts`.
3. Estilos: os CSS atuais (`styles.css`, `ajustes.css`, `correcoes.css`) são adaptados, não reescritos. Melhorias de usabilidade ficam modestas: estados de carregamento e erro consistentes, feedback de confirmação nas ações e ajustes de espaçamento/contraste. Sem framework CSS novo.
4. Backend: mesmos módulos atuais viram TS 1:1 (`worker.ts`, `auth.ts`, `logic.ts`, `schedule.ts`, `corrections.ts`, `adjustments.ts`, `shared/schemas.ts`, `release-worker.ts`, `staging-worker.ts`), com um `src/env.d.ts` tipando os bindings (DB, ASSETS, LOGIN_LIMITER, secrets). Wrangler empacota TS nativamente; `wrangler.jsonc` passa a apontar `src/release-worker.ts`.
5. Testes: os testes unitários e de pipeline migram de extensão mantendo o runner node --test com carregador TS (`tsx`); os de integração seguem no Vitest/workerd. O teste SQL Python (`tests/test_integridade_sql.py`) migra para TS usando o pool workerd/D1 já configurado no `vitest.config.ts` — Python sai do CI.
6. Smoke de navegador: `browser-svelte-smoke.mjs` vira `browser-react-smoke.ts`, mesmas validações de fluxo em Chrome headless (desktop e mobile).
7. Execução de scripts TS no build: dependência `tsx` para `build:staging`, `build:release`, `criar-login`, smoke e testes node --test. Alternativa avaliada (Node com `--experimental-strip-types`) foi descartada porque depende da versão do Node da imagem do Workers Builds.
8. `package.json`: removidos `svelte`, `@sveltejs/vite-plugin-svelte`, `svelte-check`; adicionados `react`, `react-dom`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`, `tsx`. `typecheck` passa a cobrir frontend, backend e scripts com um único `tsc --noEmit`.
9. CI (`ci.yml`): etapas de Svelte saem; entra `tsc -p frontend/tsconfig.json`; os `node --check` de sintaxe saem (tsc cobre); Python sai; nomes e comandos seguem os novos scripts. `deploy.yml` de emergência é atualizado apenas se referenciar caminhos renomeados.
10. Outputs de build não mudam: `dist/staging` e `dist/release` com os mesmos arquivos de PWA, manifest e política de cache; o comando `build.command` do Workers Builds permanece `npm run build:release`.

## Entrega e rollback

- Branch `feat/react-vite-ts` a partir da main atual (2803fa7).
- PR para a main com o CI completo verde (testes, workers+D1 local, staging HTTP, smoke Chrome, `wrangler deploy --dry-run`).
- Merge só após CI verde; o merge publica em produção automaticamente (comportamento atual do Workers Builds).
- Rollback: `git revert` do merge; o histórico Git preserva o Svelte removido.

## Riscos e mitigações

- Contrato de API mudar sem querer → migração 1:1 dos módulos e testes de integração HTTP existentes rodam contra a API migrada no workerd.
- Smoke test quebrado por seletores de DOM do Svelte → reescrita dos seletores para o DOM React, com as mesmas verificações de fluxo.
- Imagem do Workers Builds sem `tsx`/Node adequado → `npm ci` instala o `tsx` antes do `build.command`; o `wrangler deploy --dry-run` no CI valida o pacote final sem deploy.
- Regressão de usabilidade no dia a dia → os fluxos de ponto, histórico, correções e banco de horas mantêm as mesmas ações e atalhos atuais.

## O que fica para o executor

- Detalhes de leitura dos arquivos restantes (App.svelte, componentes, scripts de build) durante a implementação.
- Ajuste fino de seletores do smoke test e de pequenas diferenças de DOM React vs Svelte.
- Atualização de README e docs de release que mencionam Svelte.
