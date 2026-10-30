# Correções e ajustes migrados para Svelte 5

Segunda entrega incremental do piloto Svelte do roadmap #5.

- `Correcoes.svelte` permite consultar batidas por data, editar horário e
  excluir somente a última batida, informando motivo obrigatório. Mantém
  `/api/pontos/consultar` e `/api/pontos/corrigir`, auditoria de D1, erros
  do backend e confirmação antes da escrita.
- `Ajustes.svelte` permite criar/editar/remover ajustes manuais com duração
  HH:MM, crédito/débito, data, motivo, paginação e recálculo de saldo.
- Os dois componentes usam a API compartilhada com `cache:no-store`, nunca
  armazenando dados pessoais no navegador.
- Após uma escrita, a tela e os totais são recarregados da API.
- As verificações de navegador usam dados totalmente sintéticos.

**A integração ainda é um piloto:** não publica na Cloudflare, não substitui
`public/` e não instala service worker. Uma liberação real exige staging
privado com banco separado, validação de API e testes PWA/dispositivo físico.
