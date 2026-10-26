# Meus Pontos — instruções de desenvolvimento

## Princípios

- O projeto mantém **sua própria mini IA**, modelo, testes e evolução. Não depende do antigo Neural Core nem de IA hospedada por terceiros.
- Preferir a mini IA para interpretar padrões, prever e diagnosticar; manter **regras determinísticas obrigatórias** para autenticação, autorização, consistência de registros, horários, cálculos oficiais e operações no D1.
- A IA não cria, apaga, corrige, confirma ou antecipa batidas e ajustes. Ela apenas sugere, observa e explica. O usuário decide qualquer operação que afete sua jornada.
- O D1 e as consultas do sistema são a fonte da verdade. Se estiverem indisponíveis, a IA informa a limitação; nunca fabrica ponto, saldo ou histórico.
- Treinar/inferir localmente no navegador com dados já consultados após autenticação; não enviar registros para APIs externas. Não persistir histórico pessoal nem pesos associados ao usuário sem decisão explícita.
- Diagnósticos copiados a pedido devem conter apenas métricas agregadas, códigos de falha e explicações, sem usuários, senhas, cookies, motivos pessoais nem horários brutos das batidas.
- A IA não altera o próprio código nem publica versões. Melhorias são propostas por relatórios para revisão humana.
- Usar JavaScript, APIs nativas e testes Node sem dependências externas; manter compatibilidade com Cloudflare Workers/PWA.

## Entrega

- Trabalhar em branch e abrir PR; não publicar/mesclar automaticamente.
- Acrescentar testes para inferência, degradação por falta de dados, limites de autonomia e vazamento de dados.
- Verificar `npm test`, CI, revisão de diferenças e comportamento no navegador antes de disponibilizar em produção.
