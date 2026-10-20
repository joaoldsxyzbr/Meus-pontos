# Meus Pontos

PWA simples de controle pessoal de ponto, em **JavaScript puro, HTML e CSS**, sem React, Vite ou bibliotecas externas.

## Funcionalidades

- **Ponto:** horário de Brasília, ajuste de 1 minuto, batidas do dia e registro da próxima batida.
- **Histórico:** jornadas por mês, horários, faltas e pendências.
- **Banco de horas:** saldo consolidado, ajustes, faltas e pendências.
- **Login:** apenas usuário e senha; botão de sair. A sessão autenticada é mantida por até sete dias em cookie seguro, sem guardar senha ou token em localStorage.

O aplicativo usa o D1 `meus-pontos` já existente. **Nenhuma migração é necessária**: as tabelas de ponto não são recriadas nem modificadas pela implantação.

## Estrutura

- `public/` — interface, manifesto e service worker.
- `src/worker.js` — API e acesso ao D1.
- `src/auth.js` — autenticação nativa PBKDF2 + HMAC.
- `src/logic.js` — jornada e horários de Brasília.
- `scripts/criar-login.mjs` — gera credenciais fortes e valores dos secrets.
- `tests/` — testes nativos com Node.
- `wrangler.jsonc` — Cloudflare Worker, D1 e rate limit de login.

## Configurar o primeiro usuário

Para preparar as credenciais, execute localmente (Node.js instalado):

```sh
node scripts/criar-login.mjs joaoldsxyzbr
```

O comando imprime uma **senha aleatória forte** para você guardar e os três valores abaixo. Cada valor deve ser configurado como **Secret** no Worker `meus-pontos` da Cloudflare, sem colocá-los em arquivos versionados ou neste chat:

- `PONTO_USERNAME` — nome do usuário.
- `PONTO_PASSWORD_RECORD` — hash PBKDF2-SHA256 da senha com salt individual e 100.000 iterações.
- `PONTO_SESSION_SECRET` — segredo aleatório de 256 bits que assina sessões.

**Primeiro publique o Worker** sem credenciais. Ele ficará em modo seguro: mostrará o login, mas a API responderá HTTP 503 até os secrets serem configurados.\n\n```sh\nnpx wrangler@latest login\nnpx wrangler@latest deploy\n```\n\nDepois, no painel da Cloudflare, configure os três secrets nas variáveis/segredos do Worker. Alternativamente, pelo Wrangler (CLI **oficial da Cloudflare**, exige autenticação na conta):

```sh
npx wrangler@latest secret put PONTO_USERNAME
npx wrangler@latest secret put PONTO_PASSWORD_RECORD
npx wrangler@latest secret put PONTO_SESSION_SECRET
```

Cole o respectivo valor no prompt de cada comando. Não informe a senha inicial quando solicitarem `PONTO_PASSWORD_RECORD`: informe o registro de hash gerado pelo script.

## Publicação\n\nUse a conta Cloudflare que hospeda o D1 `meus-pontos`. Depois de publicar e configurar os três secrets, abra o endereço HTTPS do Worker. Apenas o usuário e a senha gerados permitirão acesso.\n\nSem os secrets necessários, a API permanece indisponível (HTTP 503) e **não expõe os registros**.

Para trocar a senha, gere novas credenciais com o script e atualize **os três secrets**. A rotação de `PONTO_SESSION_SECRET` invalida as sessões antigas.

## Segurança e privacidade

- Senha verificada por PBKDF2-SHA256 (**100.000 iterações**) via Web Crypto nativa, sem bibliotecas de terceiros.
- Cookie `__Host-mp_session` assinado com HMAC-SHA256, `HttpOnly`, `Secure` e `SameSite=Strict`. A senha nunca é salva pelo JavaScript ou pelo D1.
- API de pontos, histórico e saldo exige sessão válida. Toda gravação exige origem legítima.
- Rate limiting oficial Cloudflare: até oito tentativas de login por minuto por endereço de origem; isso reduz mas não elimina ataques.
- O service worker armazena **apenas recursos estáticos**. Dados de ponto e respostas da API nunca entram no cache.
- O aplicativo pode abrir offline, mas consulta e registro precisam de conexão.

## Testes

```sh
npm test
```

Os testes usam somente recursos nativos do Node.js. O GitHub Actions valida testes e sintaxe.

## Observações

- O primeiro usuário **ainda precisa ser configurado e o Worker publicado** para o login funcionar em produção.
- As jornadas continuam usando `jornada_padrao`, `resumo_diario` e `saldo_total` do D1; a regra de sábado intercalado ainda não foi implementada no banco.