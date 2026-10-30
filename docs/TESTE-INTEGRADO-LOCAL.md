# Teste integrado local da PWA Svelte e API Worker

`node --test scripts/staging-http.test.mjs` executa o **Worker verdadeiro**
em `workerd` via `wrangler dev --local`, servindo `dist/staging` e
usando o D1 local **efêmero**.

1. Confere o nome, UUID e isolamento do `wrangler.staging.jsonc`.
2. Cria um diretório temporário e aplica `tests/fixtures/d1-base.sql`,
   a migração SQL original e jornada totalmente fictícia com
   `wrangler d1 execute --local --persist-to`.
3. Gera senha de testes em PBKDF2, secret aleatório e inicia Worker
   com `--var` e `--persist-to`. Remove tokens e IDs de conta do
   ambiente do processo; nunca usa `--remote`.
4. Usa HTTP real localhost para verificar HTML/JS/SW, headers,
   login, sessão, rejeição de CSRF, jornada com quatro batidas,
   duplicidade 409, correção auditada, CRUD de ajustes e saldo.
5. Termina o workerd e apaga todos os dados locais.

A suíte **não se conecta** aos D1 de produção ou homologação remotos.
O teste HTTP não substitui Playwright em staging protegido nem
verificação de instalação/atualização de PWA nos aparelhos.

## Bloqueio atual de publicação

Em 30/10/2026, a API de Cloudflare Access retornou
`access.api.error.not_enabled`. Isso significa que **Access não
está habilitado na conta**. Manter `workers_dev:false` e
`preview_urls:false`. Não liberar hostname de homologação sem
Access ativado e política validada.

Documentação oficial:
- https://developers.cloudflare.com/workers/wrangler/commands/workers/
- https://developers.cloudflare.com/d1/wrangler-commands/
- https://developers.cloudflare.com/workers/configuration/cloudflare-access/
