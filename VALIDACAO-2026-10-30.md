# Relatório de validação — 30 de outubro de 2026

Escopo: estabilização do PR #4, a partir da branch `main` no commit `0fb5670`.

## Bases Cloudflare D1 utilizadas

| Papel | Nome | Operação |
|---|---|---|
| Origem (produção) | `meus-pontos` | Migração `0001` aplicada após backup em 30/10/2026; pontos preservados |
| Backup persistente | `meus-pontos-backup-20261030` | Cópia do schema e linhas originais; preservada sem migração |
| Testes de migração | `meus-pontos-auditoria-20261030` | Cópia criada a partir do backup; migração aplicada apenas aqui |

**Atenção:** o backup acima é uma cópia em outro D1 da mesma conta; **não** é um arquivo SQL externo/offsite nem oferece independência da conta Cloudflare.

### Integridade do backup
- 5 tabelas copiadas e confrontadas linha a linha: `config`, `jornada_padrao`, `justificativas`, `pontos`, `ajustes_banco`.
- 3 views copiadas: `banco_horas`, `resumo_diario`, `saldo_total`.
- Contagens no momento da cópia: **35 pontos, 7 jornadas padrão, 1 configuração, 0 justificativas, 0 ajustes**.
- Todas as linhas copiadas foram comparadas e consideradas idênticas à origem no momento da consulta.
- `saldo_total` idêntico entre origem e backup no momento da validação.
- A restauração funcional do backup em um D1 isolado foi verificada.

### Migração testada
- Migração `migrations/0001_integridade_e_auditoria.sql`: 8 instruções executadas com sucesso no D1 de testes.
- As 5 tabelas originais mantiveram seus dados integralmente.
- Comparação de 11 datas anteriores/depois: **0 diferenças** de saldo, carga esperada, pendência e classificação.
- **0 minutos** de diferença no saldo total.
- Tabela `auditoria_pontos` criada corretamente.
- Testes reais de SQL com dados **fictícios** em cópia: edição do horário, exclusão da última batida e criação de duas entradas de auditoria concluídas com sucesso; os registros fictícios foram removidos, restando 35 pontos e 0 auditorias.

A comparação considera o conjunto de dados existente na data da execução. **Não garante** que novos registros feitos posteriormente no D1 original terão o mesmo resultado, nem substitui um novo backup e comparação imediatamente antes da liberação.

### Exportação SQL
- A API da Cloudflare gerou o arquivo SQL temporário do D1 com status `complete`, porém sua URL de download retornou HTTP 403 neste ambiente.
- Portanto, **não existe exportação SQL externa verificada e armazenada**; não confundir este resultado com o backup persistente em D1 descrito acima.

## Testes de software
- GitHub Actions no PR: `npm test` (Node), testes de migração em SQLite/Python, sintaxe JS e Chrome headless desktop/mobile com API simulada.
- Teste de autenticação real no celular físico ainda **não realizado**.
- Após a alteração que permite registrar trabalho em folgas, o CI do commit `49fbb47ae12330eedd039166f4a36d3bcbbbe542` foi **aprovado**: https://github.com/joaoldsxyzbr/Meus-pontos/actions/runs/41092172316.

## Pendências de publicação do aplicativo
- [x] Validar a implementação funcional do PR pelo CI completo (commit `49fbb47a`; conferir novamente no HEAD antes do merge).
- [ ] Verificar segurança do backup, idealmente também em arquivo externo armazenado com acesso privado.
- [ ] Confirmar se existe referência para sábado alternado e datas de justificativas; não configurar por presunção.
- [ ] Testar em aparelho físico com login real.
- [ ] Recomparar D1 antes da alteração caso tenham surgido novos registros.
- [x] Migração do D1 original autorizada e executada; PR #4 mesclado. [ ] Publicação do Worker e dos assets pendente via workflow manual.

**Atualização posterior:** migração do D1 de produção executada com 8 instruções bem-sucedidas. A conferência posterior confirmou 35 pontos preservados, 11 dias sem alterações históricas e 0 minutos de diferença no saldo total. A publicação do Worker continua pendente.

## Implantação posterior observada

Em 30/10/2026, a Cloudflare passou a indicar a versão 17 (`0e9ba29b-f236-4f69-a223-851684cf2167`) implantada com 100% do tráfego, origem `wrangler`. O conteúdo do source map foi comparado com os seis arquivos `src/` da `main`, todos idênticos. Há vínculo para arquivos estáticos e D1 e os secrets estão presentes como bindings (não foram lidos). A tentativa de acesso externo ao endereço de execução por este ambiente retornou erro de acesso; assim, **não foi possível validar o HTML/JS servido nem login real**. Ainda é necessário conferir o PWA no navegador físico, especialmente ponto, histórico, banco e correções.
