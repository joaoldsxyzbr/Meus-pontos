# Baseline de segurança e equivalência — modernização

Documento de preparação da [issue #5](https://github.com/joaoldsxyzbr/Meus-pontos/issues/5). Esta etapa adiciona **somente infraestrutura de tipagem e documentação**, sem alterar API, Worker, PWA, D1 ou deploy.

## Contrato atual a preservar

| Verbo | Rota | Resposta/efeito |
| --- | --- | --- |
| POST | `/api/login` | autenticação, cookie HttpOnly; erro 401/429 |
| GET | `/api/sessao` | `autenticado`, `usuario`; erro 401 |
| POST | `/api/sair` | expira cookie de sessão |
| GET | `/api/hoje` | dia de Brasília, próximos tipos, jornada e saldos |
| POST | `/api/pontos` | insere batida validada e retorna dia atualizado; conflito 409 |
| GET | `/api/historico?mes=AAAA-MM` | lista mensal de dias |
| GET | `/api/saldo` | banco consolidado, ajustes, faltas e pendências |
| GET | `/api/pontos/consultar?data=AAAA-MM-DD` | pontos editáveis de um dia |
| POST | `/api/pontos/corrigir` | edição de horário ou exclusão da última batida, com auditoria |
| GET | `/api/ajustes?offset=N` | até 100 ajustes e próximo cursor numérico |
| POST | `/api/ajustes` | cria ajuste de banco |
| PUT/DELETE | `/api/ajustes/:id` | modifica/remove ajuste |

Os contratos de dados ficam em `src/shared/contracts.ts` e são **declarativos** nesta primeira etapa. A API ainda é JavaScript e não usa os tipos; verificação dinâmica (Zod) e migração do código ocorrerão em PRs futuros. Datas/horários continuam sujeitos às validações do Worker.

## Dados e migrações

- A base atual deve ser considerada **imutável durante os testes**: não executar fixtures, resets ou migrações de desenvolvimento no D1 de produção.
- Antes de qualquer alteração posterior de schema, capturar backup privado atualizado, restaurar em base isolada e comparar o saldo por data e total, pendências, faltas, ajustes e auditoria.
- **Armadilha confirmada:** a migração SQL `0001_integridade_e_auditoria.sql` foi aplicada manualmente ao D1 de produção, sem tabela `d1_migrations`. Não executar `wrangler d1 migrations apply --remote` até reconciliar o histórico em cópia e definir um procedimento seguro.
- Não colocar horários, motivos, senhas, cookies ou dados reais em testes, snapshots públicos e logs.

## Regras inegociáveis de regressão

1. `America/Sao_Paulo` no cliente, Worker e D1; virada de data deve invalidar o registro antigo.
2. Batidas não podem ser duplicadas, invertidas ou atribuídas a um próximo tipo desatualizado.
3. Jornada incompleta deve permanecer pendente, sem saldo calculado como se completa.
4. Feriados/justificativas e trabalho voluntário em folga precisam preservar a carga prevista zero.
5. Sábado alternado permanece desabilitado sem referência real confirmada.
6. Histórico, banco, correções e ajustes devem preservar todos os minutos do baseline.
7. API autenticada permanece fora do cache; offline nunca efetiva batida.
8. Login atual só pode ser removido após paridade funcional e validação de nova identidade no PWA físico.

## Critérios desta primeira entrega

- `npm ci` reproduz o conjunto de ferramentas com `package-lock.json`;
- `npm run typecheck` aprova os tipos iniciais em modo `strict`;
- `npm test` e os testes SQLite/Chrome existentes continuam verdes;
- nenhuma alteração em `src/worker.js`, `public/`, `migrations/` ou `wrangler.jsonc`.
