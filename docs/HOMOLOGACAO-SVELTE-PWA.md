# Homologação isolada — Svelte 5 e PWA

## Situação e limitações
- O banco D1 **meus-pontos-homologacao-20261030** foi criado vazio,
  exclusivamente para esta aplicação: `bdaf9799-efc1-4f69-b497-c69f3ee39b0b`.
- O Worker de homologação é `meus-pontos-homologacao`, diferente de
  `meus-pontos`. A configuração fica em `wrangler.staging.jsonc`,
  não em `wrangler.jsonc`.
- `workers_dev: false` **e** `preview_urls: false`. Sem rotas públicas.
- Este PR **não implanta o Worker** nem modifica o banco de produção.
  O banco remoto de homologação começa vazio: **não é funcional antes
  da criação de schema, migração e carga sintética**.
- Ainda não existe integração externa protegida por Access. **Não habilitar
  workers.dev ou URLs de prévia sem política Access restritiva pronta.**

## Geração do pacote
```sh
npm ci
npm run check:frontend
npm run build:staging
npm run test:staging
PILOT_ROOT=dist/staging node --test scripts/browser-svelte-smoke.mjs
```

`dist/staging` recebe a SPA compilada, manifest, ícone e um
`sw.js` **gerado com SHA-256 dos assets**. O build Svelte é compilado
com `VITE_STAGING_PWA=1`. O build normal `npm run build:frontend`
**não** registra service worker.

## Política de cache e atualização
1. Durante a instalação, o novo SW armazena somente HTML, JS/CSS
   versionados, manifest e ícone.
2. Para `/` e `/index.html`, **rede primeiro**, cache apenas como
   fallback offline. Uma nova versão pode ser descoberta online.
3. JS/CSS versionados são cacheados por hash, sem risco de servir
   combinação de versões incompatíveis.
4. **Nunca interceptar `/api/*`**, cookies, respostas de saldo, batidas,
   ajustes, histórico ou login. Offline não é um registro realizado.
5. Na ativação, remover caches legados `meus-pontos-shell-*` e
   `meus-pontos-svelte-*` anteriores. Não forçar reload durante a
   batida; atualização de código entra no próximo carregamento.
6. O Worker de homologação usa `Cache-Control: no-store` para
   HTML, SW e manifest; assets com hash têm cache imutável.
7. Offline **não substitui** homologação online de API. Uma
   PWA instalada requer teste de atualização real no celular.

## Preparação remota segura (não executada aqui)
1. Configurar Cloudflare Access **por Worker**, permitindo somente
   a identidade de homologação e MFA. Proteger também previews se ativá-los.
2. Preparar os segredos exclusivos de homologação:
   `PONTO_USERNAME`, `PONTO_PASSWORD_RECORD`, `PONTO_SESSION_SECRET`.
   Não reutilizar os de produção. Validar o rate limiter separado.
3. Em **staging somente**, criar as tabelas mínimas do esquema conforme
   `tests/fixtures/d1-base.sql`, aplicar a migração 0001 e popular
   `jornada_padrao` com 7 linhas e `config.inicio_contagem`
   com data sintética. **Não executar esses comandos no banco real**.
   No estágio, conciliar a tabela `d1_migrations` antes de automatizar
   as próximas versões.
4. Fazer `wrangler deploy --config wrangler.staging.jsonc` apenas após
   as validações, com `workers_dev=false`, `preview_urls=false`.
5. Habilitar URL específica apenas quando Access bloqueando visitantes
   não autorizados estiver confirmado por teste real de HTTP.
6. Validar login, batidas, edição/exclusão, auditoria, ajustes e
   instalação/atualização da PWA no Android/iOS usando **somente dados fictícios**.
7. Registrar resultados e rollback. Para produção, será preciso tratar
   migração de caches da PWA legada e comparar saldo antes/depois.

## Rollback
- Como staging é Worker e D1 independentes, não há rollback de produção.
- Para staging, reimplantar a versão anterior do Worker, mantendo o D1
  dedicado. Se uma migração de dados for necessária, gerar backup e
  ensaiar a restauração primeiro.
- O workflow normal de publicação `.github/workflows/deploy.yml`
  **continua apontando para a interface antiga**.

Referências Cloudflare:
- https://developers.cloudflare.com/workers/wrangler/configuration/
- https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/
- https://developers.cloudflare.com/workers/configuration/cloudflare-access/
