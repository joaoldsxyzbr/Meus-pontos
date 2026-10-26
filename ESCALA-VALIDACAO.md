# Escala de trabalho: implementação experimental e verificação

O Worker e a migração SQL estão preparados na branch de desenvolvimento. Nenhuma mudança no D1 de produção foi feita.

## Sábado alternado e justificativas

- A tabela existente de justificativas suporta atestado, feriado, dispensa, folga e férias. Feriados **não são cadastrados automaticamente**.
- A chave opcional "sabado_trabalhado_inicio" na tabela "config" deve ter a data YYYY-MM-DD de um sábado realmente trabalhado. No sábado seguinte ocorre folga, e assim por diante.
- Nenhuma data anterior à referência é alterada pela regra quinzenal. Sem chave válida, prevalece a jornada padrão existente.
- Em dia justificado, a obrigação de jornada fica zerada. Se houver batidas em dia justificado, a nova view poderá creditá-las como trabalho além da carga prevista; **exige revisão manual dos saldos anteriores**.

## Procedimento antes de publicar

1. Gerar backup do D1 usando ferramentas oficiais Cloudflare, sem compartilhar registros pessoais.
2. Criar uma cópia do banco e aplicar "migrations/0001_escala_justificativas.sql" apenas nessa cópia.
3. Comparar os resultados do resumo diário e do saldo total antes e depois, especialmente em datas com justificativa e batidas.
4. Confirmar um sábado de referência efetivamente trabalhado, sem adivinhar a data.
5. Somente na cópia de teste, usar o comando SQL a seguir, substituindo a data de exemplo por uma confirmada:
   INSERT INTO config(chave, valor) VALUES ('sabado_trabalhado_inicio', 'AAAA-MM-DD') ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor;
6. Conferir sábados trabalhados/de folga, feriados, faltas e banco de horas nos resultados reais da cópia.
7. Testar login, registro, histórico, banco de horas, PWA no celular, atualização do service worker e funcionamento sem conexão (somente shell, jamais APIs).
8. Apenas após validação, considerar migrar o banco real, mesclar a branch e publicar a versão do Worker. A migração deve preceder a publicação do Worker.

## Testes automatizados

- "npm test": testes nativos Node para regras, autenticação, rede neural, supervisor, PWA e APIs simuladas.
- "python3 -m unittest discover -s tests -p 'test_*.py'": testes reais SQLite in-memory para a migração e os saldos.
- GitHub Actions executa ambos. Nenhum deles substitui o teste visual real no Chrome/Android/iOS nem o teste com cópia do D1.

Nenhum formulário de justificativas ou configuração de ciclo foi incorporado à interface neste PR. Essas operações devem ser auditáveis antes de serem expostas no aplicativo.

Observação de compatibilidade: a migração também recria a visão legada banco_horas, presente no D1 real, preservando seus campos e pendências. Consultas externas dessa visão precisam ser validadas em cópia antes de publicar.
