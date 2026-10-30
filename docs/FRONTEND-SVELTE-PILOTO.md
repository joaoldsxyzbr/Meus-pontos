# Piloto Svelte 5 — sem impacto na produção

Esta etapa da [issue #5](https://github.com/joaoldsxyzbr/Meus-pontos/issues/5)
introduz uma SPA Svelte 5 com TypeScript e Vite **paralela** à interface
vanilla JavaScript atualmente publicada em `public/`.

## Escopo concluído no piloto

- Login existente e restauração de sessão, com cookie HttpOnly mantido pela API.
- Tela **Ponto**: seleção do horário, confirmação de folga, horário futuro,
  validação da data de Brasília, registro, status e totais.
- **Histórico** mensal para consulta, sem correção ainda.
- **Banco de horas** com totais/faltas/pendências, sem CRUD de ajustes ainda.
- Reutiliza `public/styles.css` sem reescrever identidade visual.
- `fetch` com `credentials: same-origin` e `cache: no-store`. Nenhum cache
  de API ou persistência local de dados pessoais.
- Build separado `dist/svelte-pilot`; build não escreve em `public/`,
  não altera `wrangler.jsonc` nem o deploy manual.

## Como validar

```bash
npm ci
npm run check:frontend
npm run build:frontend
node --test scripts/browser-svelte-smoke.mjs
```

O `vite dev --config vite.frontend.config.ts` serve somente HTML/CSS/JS.
Não há proxy automático para produção: para testar com a API real, usar
**staging isolado** com autenticação e D1 de homologação. Não conectar o piloto
a recursos de produção sem aprovação e controles adequados.

## Não é liberação de produção

O piloto ainda não implementa correções auditadas nem ajustes manuais,
serviço offline/PWA, nem a matriz completa de acessibilidade e navegador.
A interface real permanece em `public/` até paridade e homologação. O
workflow de deploy continua publicando o frontend antigo, mesmo com o
código Svelte versionado.

Referências:
- https://svelte.dev/docs/svelte/typescript
- https://svelte.dev/docs/svelte/v5-migration-guide
- https://vite.dev/guide/build
