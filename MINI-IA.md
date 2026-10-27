# Mini IA local do Meus Pontos (experimental)

Modelo neural MLP de uma camada oculta (7 entradas, 10 neurônios ocultos, 1 saída), implementado em JavaScript nativo. Treina temporariamente no navegador, somente depois do login, usando jornadas completas do mês atual e anterior consultadas nas APIs existentes. Não usa rede externa nem armazena dados de treinamento.

**Faz:** aprender padrões de horário de batidas completas; estimar a próxima batida com erro médio de validação em até 45 minutos; detectar inconsistências na sequência do dia e agrupar avisos de pendências; produzir relatório estruturado para revisão manual com informações agregadas.

**Não faz:** escolher a próxima categoria oficial, alterar relógio, registrar batidas, corrigir faltas/saldo, gravar no D1, decidir jornada, enviar informações a terceiros ou se reprogramar. Os dados e as regras oficiais permanecem no Worker/D1.

A previsão usa **apenas jornadas anteriores ao dia analisado**, com a mesma modalidade de intervalo e o mesmo grupo de dia (semana, sábado ou domingo). Exige ao menos 10 jornadas da mesma categoria, 6 amostras de treino e 3 de validação para a batida, divididas cronologicamente em 80/20. Com histórico insuficiente, não prevê. A rede neural é comparada a uma referência estatística (mediana da própria categoria): se a rede tiver erro maior, a interface identifica claramente a estimativa alternativa como estatística, nunca como neural. Ambas exigem erro médio de validação até 45 minutos. Sem confiança, informa que não é possível prever. O histórico individual não é usado como prova do horário que deve ser registrado: a sugestão é apenas indicativa.

O botão **Copiar diagnóstico** produz um JSON com versão, contagens, erro de validação, previsão e códigos explicados. Não inclui nome do usuário, batidas originais, motivos, credenciais nem cookies. Compartilhamento é exclusivamente manual. A IA não cria observabilidade externa ou logs persistentes.

## Supervisor local — etapa 2

A análise de um mês histórico selecionado amplia a **fiscalização**, mas não altera os exemplos de **treinamento**: estes permanecem limitados aos dois meses recentes e à data anterior ao dia analisado. Se houver registros repetidos nas consultas, os resultados recentes do D1 prevalecem.

O supervisor também verifica, por regras **determinísticas**, registros em sequência, intervalos incompletos e a identidade `saldo total = saldo das batidas + saldo dos ajustes`. Ele acompanha consultas nas telas de **ponto**, **histórico** e **banco de horas**, apresentando alertas numa seção recolhida por padrão. Quando a consulta falha, indica expressamente a parte não verificada; não inventa um saldo ou histórico.

Erros de API geram somente indicadores em memória da página, limitados a 20 ocorrências, com área e código HTTP. Não são gravados no D1, localStorage, GitHub nem em serviços externos. O diagnóstico copiado exige clique e usa lista de campos permitidos: códigos, contagens, provável causa e ações recomendadas, sem os horários originais, datas de trabalho individuais, credenciais ou motivos particulares.

Treinamento é refeito de forma temporária durante análise; não é aprendizado incremental persistente e ainda não equivale a monitoramento em segundo plano com o aplicativo fechado.

## Próximas melhorias possíveis

- Avaliar qualidade em dados simulados que cubram escalas diferentes, feriados, jornada de sábado intercalado e faltas justificadas.
- Comparar previsão neural com baseline estatístico antes de ampliar sua autonomia.
- Exibir histórico de diagnósticos somente se houver consentimento e política explícita de retenção.
- Manter revisão humana de qualquer sugestão que afete dados oficiais.

## Testes de carregamento em Chrome

A mini IA emite um evento de prontidão após registrar seus listeners. Se a tela principal já tiver carregado a sessão e o dia, ela retransmite o estado atual, impedindo que a análise fique parada em 'Aguardando análise' quando o arquivo da mini IA demora a carregar.

O CI executa scripts/browser-smoke.mjs em Chrome headless, separado do npm test, com API simulada somente leitura. Isso verifica navegação real pelo navegador em larguras desktop/mobile, mas não substitui teste no aparelho físico nem autenticação de produção.
