# Publicação Svelte 5 via GitHub e Cloudflare Workers Builds

## Configuração confirmada em 30/10/2026
O Worker **meus-pontos** já está ligado ao repositório GitHub
`joaoldsxyzbr/Meus-pontos`. O Workers Builds acompanha a branch **main**
e executa `npx wrangler deploy` automaticamente a cada push nessa branch,
sem build step separado. O deploy anterior bem-sucedido na main era
`f406de09947c4af67232ec437b3e70ccc0da1343`, com o Worker na versão
`6554765e-b1be-4fc7-996d-96a973d25194` (100% do tráfego). Essas
informações foram lidas da API Cloudflare **antes da ativação do Svelte**.

## Como a atualização é publicada
O `wrangler.jsonc` principal foi atualizado para:
- manter o nome `meus-pontos`, D1 existente `meus-pontos` com ID
  `150895af-1ec9-4c6c-af03-a43189a9bb71` e rate limiter;
- executar `build.command: npm run build:release` **dentro do próprio
  `wrangler deploy`**, pois o Workers Builds ainda usa o deploy padrão;
- publicar `src/release-worker.js` + `dist/release` (Svelte 5).

Não é necessária uma ação manual na Cloudflare nem um GitHub Actions
`workflow_dispatch` para atualizar a interface. **O merge na main é
uma publicação real de produção**.

## Proteção de dados e compatibilidade
- O Worker original `src/worker.js` e os endpoints `/api/*` não mudam.
- **Nenhuma migração SQL ou alteração de registros D1** ocorre no build.
- O novo service worker deixa `/api/*` fora de todo cache; HTML/SW são
  `no-store` e JS/CSS usam nomes com hash.
- Os scripts e CSS antigos ficam publicados no primeiro release para abas
  abertas antes da troca. Seu cache legado será limpo pelo SW novo.
- CI valida tipos, integração HTTP em workerd com D1 local temporário,
  regras SQLite, browser Chrome e `wrangler deploy --dry-run` da
  configuração principal. O teste HTTP usa dados falsos e remove
  credenciais Cloudflare de seu processo.

## Reversão de código
Se a interface falhar, reverter **somente o commit de publicação** no GitHub,
abrir PR, passar no CI e fazer merge na `main`. O Workers Builds
reimplantará automaticamente a versão anterior a partir de
`wrangler.jsonc` e `public/`. Outra opção é o painel Cloudflare
Workers & Pages → `meus-pontos` → Deployments → Rollback para a versão
anterior identificada no painel. O rollback não deve alterar D1.

O pacote antigo `public/` e o antigo `src/worker.js` permanecem
versionados no mesmo repositório, para recuperação.

## Backup e limites
O banco privado `meus-pontos-backup-20261030` já existia antes desta
etapa, mas **não foi demonstrada uma exportação/restauração atualizada**.
A conexão atual do assistente é de **leitura somente**; a API de exportação
D1 retornou erro de autorização. Portanto, não afirmar que um novo backup
foi feito, nem que a restauração recente foi testada. A publicação troca
**apenas a interface** sem writes de migração no D1, mas risco operacional
residual permanece. Dados de produção não devem constar de commits,
Actions, logs ou anexos.

**Sem homologação pública:** por decisão do projeto, não habilitar
Cloudflare Access nem criar URL de staging. Os testes de integração são
locais e sintéticos.

Documentação oficial:
- https://developers.cloudflare.com/workers/ci-cd/builds/
- https://developers.cloudflare.com/workers/wrangler/configuration/#custom-builds
- https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/
