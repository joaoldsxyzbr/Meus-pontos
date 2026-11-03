# Meus Pontos

PWA pessoal de registro de ponto com **React 19, TypeScript e Vite**. API em Cloudflare
Workers/Hono e banco D1.

## Funcionalidades

- **Ponto:** horário de Brasília, ajuste de 1 minuto, confirmação de batidas futuras,
  verificação de data e tipo no servidor e atualização na virada do dia.
- **Histórico:** jornadas por mês, horários, faltas e pendências; correção manual de horário
  ou exclusão da última batida, sempre com motivo auditado.
- **Banco de horas:** saldo consolidado, ajustes, faltas e pendências; ajustes paginados.
- **Login:** apenas usuário e senha; botão de sair. Sessão em cookie seguro por até sete dias,
  sem guardar senha ou token em localStorage.

O aplicativo usa o D1 `meus-pontos` existente. A migração `migrations/0001_integridade_e_auditoria.sql`
já foi aplicada em produção. **Nenhuma alteração de interface executa migrações.**
Consulte [docs/ARQUITETURA.md](docs/ARQUITETURA.md) e [docs/HISTORICO.md](docs/HISTORICO.md).

## Estrutura

- `frontend/` — interface React e componentes.
- `public/` — ícone e manifest da PWA.
- `src/worker.ts` — API e acesso ao D1.
- `src/auth.ts` — autenticação nativa PBKDF2 + HMAC.
- `src/logic.ts` — sequência das batidas, validações e horário de Brasília.
- `src/schedule.ts` — escala e carga prevista.
- `src/corrections.ts` — retificação de batidas e trilha de auditoria transacional.
- `src/adjustments.ts` — ajustes manuais do banco de horas.
- `src/env.d.ts` — bindings do Worker tipados.
- `scripts/criar-login.mjs` — gera credenciais fortes e valores dos secrets.
- `scripts/build-release.mjs` — prepara a PWA de publicação.
- `tests/` — testes Node, Vitest/workerd e SQLite/Python.
- `wrangler.jsonc` — Worker, D1, rate limit e build de produção.

## Configurar o primeiro usuário

```sh
node scripts/criar-login.mjs seu-usuario
```

O comando imprime uma **senha aleatória forte** e os três valores abaixo. Cada um deve ser
configurado como **Secret** no Worker `meus-pontos`, sem colocá-los em arquivos versionados
ou em conversas:

- `PONTO_USERNAME` — nome do usuário.
- `PONTO_PASSWORD_RECORD` — hash PBKDF2-SHA256 (salt individual, 100.000 iterações).
- `PONTO_SESSION_SECRET` — segredo aleatório de 256 bits que assina sessões.

Publique o Worker antes de configurar os secrets: ele fica em modo seguro (HTTP 503) e não
expõe registros.

```sh
npx wrangler@latest login
npx wrangler@latest deploy
```

Depois, configure os três secrets no painel da Cloudflare ou via Wrangler:

```sh
npx wrangler@latest secret put PONTO_USERNAME
npx wrangler@latest secret put PONTO_PASSWORD_RECORD
npx wrangler@latest secret put PONTO_SESSION_SECRET
```

Não informe a senha inicial em `PONTO_PASSWORD_RECORD`: use o registro de hash gerado.

## Publicação

O Worker `meus-pontos` está ligado ao GitHub e publica automaticamente os commits da
branch `main`. O `wrangler.jsonc` executa o build antes do deploy, então
**um merge na `main` é uma alteração de produção**.

O workflow manual `.github/workflows/deploy.yml` é a alternativa de emergência e exige
`CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` nos Secrets do GitHub.

Para trocar a senha, gere novas credenciais e atualize **os três secrets**. Rotacionar
`PONTO_SESSION_SECRET` invalida as sessões antigas.

## Segurança e privacidade

- Senha verificada por PBKDF2-SHA256 (100.000 iterações) via Web Crypto, sem bibliotecas.
- Cookie `__Host-mp_session` assinado com HMAC-SHA256, `HttpOnly`, `Secure`, `SameSite=Strict`.
- API exige sessão válida; toda gravação exige origem legítima.
- Rate limiting oficial Cloudflare: oito tentativas de login por minuto por IP.
- O service worker armazena **apenas recursos estáticos**; `/api/*` nunca é interceptado.
- O aplicativo abre offline, mas consulta e registro precisam de conexão.

## Testes

```sh
npm ci
npm run typecheck        # backend, frontend e contratos
npm test                 # lógica, API, correções, ajustes, escala, schemas
npm run test:workers     # Worker real em workerd + D1 local
npm run build:release && npm run test:release
```

Os testes Chrome headless e o worker em `wrangler dev --local` exigem Chrome instalado.

## Regras para correções e publicação

- O formulário de correções aceita editar **somente o horário** preservando a ordem, ou
  excluir **a última** batida da data. Alterações exigem motivo e vão para `auditoria_pontos`.
- O navegador envia `data`, `tipo` e `horario`; o Worker rejeita estado obsoleto com HTTP 409.
- O D1 e as views são a fonte oficial do saldo.
- Não execute `wrangler d1 migrations apply --remote`: a tabela `d1_migrations` ainda não
  foi reconciliada com a aplicação manual da migração `0001`.
- Em dia de folga ou feriado, o trabalho pode ser registrado mediante confirmação explícita,
  com carga prevista zero.
