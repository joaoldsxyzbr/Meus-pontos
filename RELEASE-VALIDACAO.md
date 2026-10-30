# Liberação segura — estabilização da main

Esta branch deriva exclusivamente da main no commit 0fb5670. O PR #4 é rascunho; **produção não deve mudar automaticamente**.

## Impacto da alteração
- A API recusa batidas que não incluam `data` e `tipo` exibidos no navegador, evitando gravações divergentes após atualização por outro aparelho ou virada do dia.
- A view `resumo_diario` deixa de computar saldos definitivos para jornadas incompletas; o dia corrente sem batidas deixa de contar como falta.
- Feriados/justificativas zeram a carga prevista, inclusive quando houver trabalho registrado. Sábados alternados somente começam após referência confirmada; antes disso mantém-se a escala atual.
- A tabela `auditoria_pontos` registra alterações de horários e exclusão da última batida. Corrigir batidas antigas recalcula saldos.
- A view `banco_horas` é recriada a partir de `resumo_diario`. Verificar consultas externas e eventuais pontos anteriores à data `inicio_contagem`: eles podem não estar na nova view.

## Pré-requisitos obrigatórios (nenhum executado por este PR)
1. Confirmar com o responsável a data de sábado efetivamente trabalhado, feriados e justificativas. Nunca presumir datas.
2. Obter backup **persistente** do D1 original com ferramenta oficial da Cloudflare e verificar recuperação. Não versionar o backup nem expor registros pessoais em logs.
3. Criar uma **cópia isolada** do D1 em ambiente de teste sob controle do responsável.
4. Medir, na cópia ANTES da migração, `SELECT * FROM saldo_total`, o total de dias/pendências, o histórico mensal e as linhas da view legada `banco_horas`. Manter a comparação em ambiente privado.
5. Aplicar apenas na cópia a migração `migrations/0001_integridade_e_auditoria.sql`. Exemplo de comando somente após apontar Wrangler para a base de TESTE: `npx wrangler d1 execute NOME_DA_COPIA --remote --file=migrations/0001_integridade_e_auditoria.sql`. **Nunca use o nome do D1 original nesses ensaios.**
6. Comparar saldos por data e consolidado antes/depois. Documentar e aprovar cada diferença; revisar especialmente jornadas incompletas, início de contagem, dias atuais, feriados e trabalhos em dias justificados.
7. Se for adotar sábados alternados, inserir **somente na cópia** `config.sabado_trabalhado_inicio` com um sábado realmente trabalhado confirmado, testar ambos os ciclos e avaliar impactos.
8. Validar login verdadeiro, batidas, correção com motivo, trilha `auditoria_pontos`, histórico, banco, atualização de cache e modo offline apenas para shell em aparelhos Android/iOS.
9. Após backup, comparação aprovada, revisão humana e autorização específica, definir a janela de migração do D1 real. A migração do D1 **deve preceder** a publicação do Worker atualizado. Só depois considerar merge do PR, deploy e monitoramento.
10. Após deploy, reavaliar a soma de saldos, pendências, faltas, consistência de autenticação e retorno de HTTP 409 em telas desatualizadas.

## Verificações automáticas
- `npm test` — APIs, autenticação, validação de ponto, correções e escala.
- `python3 -m unittest discover -s tests -p 'test_*.py'` — SQL original comparado ao migrado em SQLite in-memory, sem dados pessoais.
- `node --test scripts/browser-smoke.mjs` — Chrome headless com API simulada e navegação desktop/mobile (CI).
- CI aprovado não substitui testes no D1 copiado, credenciais reais e dispositivo físico.

## Política de segurança
- Não alterar ou apagar registros no D1 original para testar.
- Não confiar na UI como garantia de integridade: Worker, D1 e regras determinísticas são a fonte oficial.
- A exclusão de pontos é restrita ao último registro daquele dia; não há edição de tipo sem auditoria própria.
- Não armazenar logs, credenciais, saldos pessoais, backups ou motivos no GitHub.
- Nenhum PR desta mudança autoriza automaticamente um deploy em produção.

## Evidências de 30/10/2026

Foi criada uma cópia persistente **no D1 da mesma conta Cloudflare** com o nome `meus-pontos-backup-20261030` e outra base para testes `meus-pontos-auditoria-20261030`.
A comparação por linhas confirmou 35 pontos e 8 objetos de esquema, e a migração executada somente na cópia de testes manteve os 11 dias históricos e o saldo total sem divergências.

Consulte [VALIDACAO-2026-10-30.md](VALIDACAO-2026-10-30.md). Esse procedimento **não exportou nem verificou um arquivo SQL fora da Cloudflare**. Se precisar de independência da conta ou de recuperação fora da Cloudflare, providencie uma exportação externa antes da mudança em produção.
