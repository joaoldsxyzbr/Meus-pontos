# Mini IA local do Meus Pontos (experimental)

Modelo neural MLP de uma camada oculta (7 entradas, 10 neurônios ocultos, 1 saída), implementado em JavaScript nativo. Treina temporariamente no navegador, somente depois do login, usando jornadas completas do mês atual e anterior consultadas nas APIs existentes. Não usa rede externa nem armazena dados de treinamento.

**Faz:** aprender padrões de horário de batidas completas; estimar a próxima batida com erro médio de validação em até 45 minutos; detectar inconsistências na sequência do dia e agrupar avisos de pendências; produzir relatório estruturado para revisão manual com informações agregadas.

**Não faz:** escolher a próxima categoria oficial, alterar relógio, registrar batidas, corrigir faltas/saldo, gravar no D1, decidir jornada, enviar informações a terceiros ou se reprogramar. Os dados e as regras oficiais permanecem no Worker/D1.

A previsão só aparece com pelo menos 10 dias válidos e amostras suficientes do mesmo evento em treino e validação (separação cronológica 80/20). Sem confiança, informa que não é possível prever. O histórico individual não é usado como prova do horário que deve ser registrado: a sugestão é apenas indicativa.

O botão **Copiar diagnóstico** produz um JSON com versão, contagens, erro de validação, previsão e códigos explicados. Não inclui nome do usuário, batidas originais, motivos, credenciais nem cookies. Compartilhamento é exclusivamente manual. A IA não cria observabilidade externa ou logs persistentes.

## Próximas melhorias possíveis

- Avaliar qualidade em dados simulados que cubram escalas diferentes, feriados, jornada de sábado intercalado e faltas justificadas.
- Comparar previsão neural com baseline estatístico antes de ampliar sua autonomia.
- Exibir histórico de diagnósticos somente se houver consentimento e política explícita de retenção.
- Manter revisão humana de qualquer sugestão que afete dados oficiais.
