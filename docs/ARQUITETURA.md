# Arquitetura — Meus Pontos

PWA pessoal de registro de ponto. Um único usuário, autenticado por secrets do Worker.

## Camadas

| Camada | Tecnologia | Onde |
|---|---|---|
| Frontend | React 19 + TypeScript + Vite | `frontend/src` |
| API | Cloudflare Workers + Hono + Zod | `src/worker.ts` |
| Banco | Cloudflare D1 (SQLite) com views | `migrations/`, D1 `meus-pontos` |
| Auth | PBKDF2-SHA256 (100k) + cookie HMAC | `src/auth.ts` |
| PWA | Service worker gerado no build (só shell) | `scripts/build-staging.mjs` |
| Deploy | Workers Builds na `main` | `wrangler.jsonc` |

Todo o código de aplicação é **TypeScript**; o `tsc` cobre backend, frontend e contratos.

## Fluxo de build

```
build:frontend  → dist/app        (piloto de desenvolvimento)
build:staging   → dist/staging    (PWA + sw.js com hash dos assets)
build:release   → dist/release    (copia staging; é o que o Wrangler publica)
```

`wrangler.jsonc` publica `src/release-worker.ts` + `dist/release`. O `build.command` roda
`npm run build:release` dentro do próprio `wrangler deploy`.

## API

| Verbo | Rota | Efeito |
|---|---|---|
| POST | `/api/login` | autentica, define cookie HttpOnly; 401/429 |
| GET | `/api/sessao` | `autenticado`, `usuario`; 401 |
| POST | `/api/sair` | expira o cookie |
| GET | `/api/hoje` | dia de Brasília, próximos tipos, carga e saldo |
| POST | `/api/pontos` | insere batida validada; 409 se data/tipo divergirem |
| GET | `/api/historico?mes=AAAA-MM` | dias do mês |
| GET | `/api/saldo` | banco consolidado, faltas, pendências |
| GET | `/api/pontos/consultar?data=AAAA-MM-DD` | batidas editáveis do dia |
| POST | `/api/pontos/corrigir` | edita horário ou exclui a última batida, com auditoria |
| GET | `/api/ajustes?offset=N` | até 100 ajustes + próximo cursor |
| POST/PUT/DELETE | `/api/ajustes[/:id]` | CRUD de ajustes manuais |

Contratos em `src/shared/contracts.ts`. O frontend valida as respostas com Zod
(`frontend/src/lib/schemas.ts`): um campo renomeado na API falha com mensagem clara
em vez de virar `undefined` na tela.

## Regras de domínio

- **Sequência de batidas** é definida uma única vez em `src/logic.ts`
  (`SEQUENCES`, `expectedTypes`, `isValidSequence`). Registro e correção usam a mesma regra.
- **O D1 é a fonte oficial do saldo.** As views `resumo_diario` e `saldo_total` calculam
  tudo, inclusive o "dia em andamento" via `date('now','-3 hours')`.
- **Carga prevista** vem de `jornada_padrao` por dia da semana. Justificativas zeram a carga.
  Sábado alternado só vale a partir de `config.sabado_trabalhado_inicio` (hoje **não ativado**).
- **Consistência otimista**: o cliente envia `data` e `tipo`; se a data virou ou a sequência
  mudou, o Worker responde **409** e pede atualização.
- **Correções são auditadas** em `auditoria_pontos` dentro de `DB.batch` transacional.

## Segurança

- Senha por PBKDF2-SHA256 (100.000 iterações) via Web Crypto.
- Cookie `__Host-mp_session`: HMAC-SHA256, `HttpOnly`, `Secure`, `SameSite=Strict`, 7 dias.
- Rate limit nativo Cloudflare: 8 tentativas de login por minuto por IP.
- Service worker **nunca** intercepta `/api/*`. HTML e SW são `no-store`.
- CSP restritiva e `X-Frame-Options: DENY` nos assets.

## Testes

| Comando | Cobre |
|---|---|
| `npm run typecheck` | backend, frontend e contratos |
| `npm test` | lógica, API, correções, ajustes, escala, schemas |
| `npm run test:workers` | Worker real em workerd + D1 local (Miniflare) |
| `npm run test:staging` / `test:release` | pacote PWA, SW e headers |
| `node --test scripts/browser-smoke.mjs` | Chrome headless desktop/mobile com API simulada |
| `node --test scripts/staging-http.test.mjs` | Worker real em `wrangler dev --local` + D1 efêmero |
| `python3 -m unittest discover -s tests -p 'test_*.py'` | paridade SQL antes/depois da migração |

Nenhum teste usa dados reais, credenciais ou D1 remoto.

## Armadilhas conhecidas

- **`wrangler d1 migrations apply --remote` é proibido.** A migração `0001` foi aplicada
  manualmente em produção e a tabela `d1_migrations` não foi reconciliada.
- **Merge na `main` é deploy de produção.** O Workers Builds publica automaticamente.
- **Caches legados**: o `activate` do SW remove `meus-pontos-app-*`, `meus-pontos-svelte-*`
  e `meus-pontos-shell-*`. Não remova as duas últimas sem confirmar que nenhum aparelho
  ainda roda a versão antiga.
- **React e `input` em testes**: atribuir `el.value` direto e disparar `input` é ignorado
  pelo React (value tracker). Use o setter nativo — ver `setValue` em `scripts/browser-smoke.mjs`.
