# Refatoração gradual da API com Hono e Zod

O Worker continua no mesmo endereço Cloudflare e mantém o binding `ASSETS`
e o banco D1 existentes. A API adota **Hono** para rotas e middlewares
comuns. **Zod** valida login, horários, tipos e mês nos limites HTTP.

## Compatibilidade e segurança

- Rotas, verbos e formatos de resposta existentes continuam iguais.
- Erros de `401`, `403`, `405`, `409`, `429` e `503` devem permanecer compatíveis.
- Autenticação por cookie seguro, proteção de origem, rate limiter e fallback de
  erro `500` continuam no Worker.
- As funções SQL e os cálculos de jornada **não** são reescritos.
- Assets estáticos continuam servidos pelo binding do Worker com os mesmos
  headers de segurança e CSP.
- Os módulos de correções e ajustes mantêm validação própria nesta fase;
  migrá-los para Zod requer testes adicionais de paridade de erros e limites.

## Testes

`npm run test:workers` exercita o Worker HTTP verdadeiro com D1 local,
incluindo concorrência, autenticação, histórico, ajustes e auditoria.
`npm test` e os testes Python/Chrome também devem permanecer verdes.

**Não executar deploy automático** por causa desta refatoração; o workflow
manual requer revisão do novo código e teste do PWA em staging.
