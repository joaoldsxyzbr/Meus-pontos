# Integração de testes — Worker + D1 local

Esta etapa da [issue #5](https://github.com/joaoldsxyzbr/Meus-pontos/issues/5) usa a integração atual da Cloudflare com Vitest e Miniflare/workerd.

## Isolamento obrigatório

- `vitest.config.ts` define `d1Databases: ["DB"]` em Miniflare e **não importa** `wrangler.jsonc`, que referencia o ID do banco de produção.
- O esquema de teste `tests/fixtures/d1-base.sql` é **sintético**, criado por comandos DDL preparados em `db.prepare().run()`; os testes usam `readD1Migrations` e `applyD1Migrations` para executar a migração real `migrations/0001_integridade_e_auditoria.sql` nesse banco local.
- Não existem credenciais, dados pessoais ou comandos remotos nas fixtures.
- `npm run test:workers` valida cálculos do D1, jornadas incompletas e auditoria transacional. O arquivo `d1_migrations` é criado **somente nesse D1 local**.
- Os testes existentes Node, SQLite/Python e Chrome headless continuam em execução no CI. O workflow manual de publicação também executará essas verificações antes do Wrangler.

## Diferenciar testes de produção

Esses testes **não** comprovam por si só o acesso real via navegador/login, o deploy de assets ou a restauração do backup. Nunca iniciar testes contra um banco remoto para contornar falhas locais.

Referência: https://developers.cloudflare.com/workers/testing/vitest-integration/

## Passos após esta entrega

- Cobrir autenticação/API real via HTTP no runtime Workers, simulando secrets e rate limit.
- Adicionar teste explícito de concorrência/idempotência de batidas.
- Conectar Playwright a backend/D1 isolados em staging antes de migrar componentes Svelte.
