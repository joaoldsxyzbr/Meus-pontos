# Integração HTTP de API com D1 isolado

Na suíte `tests/integration/api.integration.test.ts`, o **handler verdadeiro**
`src/worker.js` recebe objetos nativos `Request` e responde com `Response`,
executando em **workerd** pela integração oficial do Vitest.

São cobertos:
- login via PBKDF2, cookie assinado e autorização das rotas;
- bloqueio de origem cruzada e limite de tentativas de login;
- registro da sequência de quatro batidas e comparação do histórico e saldo com o D1;
- cinco requisições concorrentes e retry da mesma entrada;
- correção/exclusão com trilha de auditoria;
- CRUD de ajustes e atualização do banco de horas.

## Isolamento e limites

- O banco é criado pelo Miniflare **local** em cada arquivo de teste, usando
  esquema sintético e a migração SQL versionada real.
- Os segredos são fictícios e gerados durante o teste, nunca lidos da Cloudflare.
- Não utiliza `wrangler.jsonc` (que contém o ID real de produção).
- `worker.fetch(request, bindings)` exercita o **handler HTTP no runtime real**,
  mas **não** testa rede pública, TLS externo, deploy ou navegador físico.
- O contrato atual rejeita retry de batida já salva com **409**, sem duplicá-la.
  Idempotência com retorno repetido de **201** ainda requer desenho específico.
- Logout apaga o cookie do navegador; revogação imediata de tokens antigos não é
  garantida por uma sessão assinada sem estado. Avaliar ao mudar autenticação.
- Testes de integração não substituem testes end-to-end contra staging privado.

Execução: `npm ci && npm run test:workers`.

Referência: https://developers.cloudflare.com/workers/testing/vitest-integration/
