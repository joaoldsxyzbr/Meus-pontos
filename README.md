# Meus Pontos

PWA pessoal de controle de jornada, desenvolvido em **JavaScript puro, HTML e CSS**, sem React, Vite ou bibliotecas de terceiros.

## Telas

1. **Ponto:** relógio de Brasília, ajuste de 1 minuto, batidas do dia e registro automático da próxima batida.
2. **Histórico:** dias do mês, horários, faltas, pendências e saldo diário.
3. **Banco de horas:** saldo consolidado, ajustes, faltas e pendências.

O aplicativo utiliza o **D1 existente `meus-pontos`**. Não recria o banco, não migra tabelas e não altera registros existentes na implantação. As batidas novas só são gravadas ao clicar em **Registrar**.

## Estrutura

- `public/` — interface, manifesto, ícone e service worker.
- `src/worker.js` — API HTTP e acesso seguro ao D1.
- `src/logic.js` — validação da jornada e fuso de Brasília.
- `tests/` — testes com `node:test` nativo.
- `wrangler.jsonc` — configuração do Cloudflare Worker e vínculo com D1.

## Segurança

O backend exige a variável secreta `PONTO_API_KEY` com **pelo menos 32 caracteres**. Sem ela, a API fica bloqueada (HTTP 503). A chave é solicitada na interface e guardada apenas durante a sessão do navegador, não no banco, código, manifesto, cache PWA ou repositório.

Use uma chave aleatória forte, não uma senha curta. Exemplo com o próprio Node.js:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Guarde a chave em lugar seguro e configure-a no Cloudflare como **secret** — nunca em `vars` públicas ou no GitHub.

## Publicação

É necessário ter acesso à conta Cloudflare que possui o D1 `meus-pontos`.

1. Instale/use o Wrangler, CLI **oficial da Cloudflare**: `npx wrangler@latest login`
2. Configure a chave: `npx wrangler@latest secret put PONTO_API_KEY` (cole a chave forte no prompt).
3. Publique: `npx wrangler@latest deploy`
4. Abra o endereço HTTPS do Worker e informe a mesma chave na tela de acesso.
5. Use o menu do navegador para **Instalar app** ou **Adicionar à tela inicial**.

As rotas `/api/*` são tratadas pelo Worker e os arquivos estáticos são servidos por Workers Assets. O D1 é acessado somente pelo binding `DB`.

### Atenção

- **A publicação ainda não foi realizada por este repositório.** O deploy exige a configuração do secret e a autorização da conta.
- Os recursos visuais básicos podem abrir offline, mas **consultas e registros exigem conexão**. O service worker não salva respostas privadas ou pontos offline.
- Um registro só vale para o dia corrente no fuso `America/Sao_Paulo`; horários futuros e batidas fora da sequência são recusados.
- O histórico e saldo seguem as views `resumo_diario` e `saldo_total` do D1. A contagem começa na chave `inicio_contagem` de `config`.
- A programação de sábado é obtida de `jornada_padrao`, sem regras fixas de carga horária no backend.
- Após publicar, teste o fluxo em um dispositivo e configure proteção adicional contra tentativas repetidas na Cloudflare se expor o app publicamente.

## Testes

```sh
npm test
```

O teste usa apenas recursos nativos do Node.js, sem instalar dependências.
