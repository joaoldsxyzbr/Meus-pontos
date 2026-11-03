# Histórico do projeto

Registro das decisões e validações relevantes. Para o estado atual, consulte
[ARQUITETURA.md](ARQUITETURA.md).

## 30/10/2026 — Estabilização e migração do D1

- Migração `0001_integridade_e_auditoria.sql` aplicada em produção após backup.
- Backup persistente em outro D1 da mesma conta (`meus-pontos-backup-20261030`);
  **não** é exportação externa à Cloudflare.
- Base de ensaio `meus-pontos-auditoria-20261030` usada para comparar antes/depois:
  35 pontos e 11 dias sem divergência de saldo, carga, pendência ou classificação.
- PR #4 mesclado na `main` (commit `8387310`).
- Worker publicado via Wrangler (versão 17). Os assets e o login real em
  dispositivo físico **não** foram verificados nessa ocasião.
- A API de exportação D1 gerou um arquivo com status `complete`, mas o download
  retornou HTTP 403: **não existe exportação SQL externa verificada**.
- Cloudflare Access retornou `access.api.error.not_enabled`. Homologação pública
  foi retirada do escopo; `workers_dev` e `preview_urls` permanecem desativados.

## Interface Svelte 5 (removida)

A interface vanilla foi substituída por Svelte 5 em etapas (piloto, correções/ajustes,
PWA de homologação) e depois removida do repositório. Os documentos de cada etapa
(`FRONTEND-SVELTE-*.md`, `HOMOLOGACAO-SVELTE-PWA.md`, `RELEASE-SVELTE-CONTROLADA.md`)
foram consolidados aqui.

O pacote `public/` deixou de conter a interface antiga; restaram apenas `icon.svg`
e `manifest.webmanifest`.

## 02/11/2026 — TypeScript no backend e React no frontend

- Backend migrado de JavaScript para TypeScript (`src/*.ts`), com `Env` tipado
  (`D1Database`, `Fetcher`, `RateLimit`) e consultas D1 usando `first<T>()`.
  Mudança de coluna nas views agora falha no `tsc`, não em produção.
- Frontend reescrito de Svelte 5 para React 19. CSS, ids e fluxos preservados.
- `svelte-check` substituído por `tsc --noEmit`; uma única ferramenta de tipos.
- Regra de sequência de batidas unificada em `isValidSequence` (antes duplicada
  entre `logic` e `corrections`).
- Validação Zod das respostas da API no navegador (`frontend/src/lib/schemas.ts`).
- Smoke test corrigido para Windows: comparação de caminho por `basename` e
  descoberta de Chrome em `Program Files`/`where`.
- Cache do service worker renomeado para `meus-pontos-app-*`; o `activate` continua
  removendo `meus-pontos-svelte-*` e `meus-pontos-shell-*` para atualizar aparelhos
  com a versão anterior instalada.

## Pendências conhecidas

- Reconciliação da tabela `d1_migrations` antes de qualquer migração remota.
- Exportação SQL externa à Cloudflare (independência de conta) nunca foi verificada.
- Sessão assinada sem estado: logout apaga o cookie, mas tokens antigos seguem
  válidos até expirarem (7 dias). Aceitável para uso pessoal; revisar se mudar.
- Teste de instalação/atualização da PWA em aparelho físico real.
