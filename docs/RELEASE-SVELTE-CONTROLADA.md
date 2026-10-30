# Plano de troca controlada para Svelte 5 — sem homologação pública

## Estado do trabalho
Os arquivos em `public/` e a implantação corrente **não são alterados**
por este PR. O Worker e o D1 da produção permanecem exatamente os mesmos.
`npm run build:release` gera `dist/release` (novo shell Svelte) e copia
temporariamente os antigos arquivos CSS/JS que uma aba já aberta ainda pode
solicitar. Nenhum dado pessoal entra no bundle.

`wrangler.release.jsonc` referencia **o mesmo Worker, D1 e rate limiter**
do `wrangler.jsonc`; apenas troca `main` para um wrapper que conserva
as respostas de `/api/*` e aplica `no-store` ao HTML/SW/manifest,
além de assets JS/CSS versionados. Não usa Cloudflare Access nem URL
de homologação pública.

## Verificações automáticas
- `npm run build:release && npm run test:release`;
- TypeScript, Svelte, Node, Vitest/workerd, D1 local, SQLite e Chrome
  desktop/mobile com API sintética;
- Integração HTTP real em workerd e D1 local (sem token remoto);
- Testes da compatibilidade com SW anterior: caches legados
  `meus-pontos-shell-*` são limpos pelo SW novo; os arquivos legados
  seguem disponíveis no primeiro rollout mas não são pré-cacheados;
- API `/api/*` nunca é cacheada nem interceptada pela PWA.

## Antes de executar o workflow manual
1. Gerar backup **novo, privado e fora do repositório** do D1 de
   produção. Conferir restauração em banco isolado, sem expor registros
   em Issues, Actions, logs ou no código.
2. Comparar em ambiente seguro: número de registros, auditorias,
   saldos por dia e total, faltas e pendências. Nenhuma alteração
   de schema ou migração D1 está autorizada na troca.
3. Registrar a versão/deployment estável atual do Worker; garantir
   como reverter por `wrangler rollback <VERSION_ID>` ou pelo
   painel Workers & Pages > Deployments > Rollback.
4. Verificar que os segredos e bindings de produção continuam
   configurados; revisar permissões dos Actions. Configurar aprovação
   de ambiente `production` no GitHub quando disponível.
5. Usar **somente** `workflow_dispatch` do
   `.github/workflows/svelte-release.yml` na branch `main`,
   com as três confirmações exatas. Atenção: os textos são
   declarações do operador, **não comprovam automaticamente backup**.
6. Após publicar, verificar login, jornada e saldo por leitura; evitar
   uma nova batida de teste no D1 real. Confirmar instalação e atualização
   da PWA no aparelho, incluindo abrir uma aba da versão anterior.
7. Se ocorrer problema, reverter **a versão do Worker**. Rollback de
   código/asset não é rollback de dados D1, mas nenhum schema é alterado.

## Limites
Os testes Chrome e workerd locais não simulam todas as condições do
iOS/Android, múltiplas abas ou caches antigos instalados. Antes de
acionar o workflow, realizar ensaio de reversão e comparar métricas
de produção sem reproduzir dados pessoais.

## Sem homologação pública
A decisão registrada na issue #5 é **não abrir staging público nem
habilitar Cloudflare Access**. O D1 remoto de staging previamente criado
continua inativo. O workflow antigo de staging é descontinuado
na preparação da release; testes locais continuam disponíveis.

Referências:
- https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/
- https://developers.cloudflare.com/workers/wrangler/commands/workers/
- https://developers.cloudflare.com/d1/reference/time-travel/
