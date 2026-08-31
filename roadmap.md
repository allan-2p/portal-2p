# Roadmap

## Salesforce — envio completo do pedido
- [ ] Reenviar/atualizar a oportunidade a cada mudança de status (todos os motores, não só as ações manuais).
- [ ] Mapear por padrão os campos que faltavam: Nº SAP, frete, tipo de NF, desconto, total, margem, tabela de preço, previsão de fechamento, NF, datas de faturamento/coleta/entrega, transportadora, vendedor, quem criou/finalizou, feito através de, projeto vendido.
- [ ] Enviar os produtos linha a linha (OpportunityLineItem) e gravar `proposta_itens` no Grupo 2P em todo salvamento (hoje só o backfill grava).
- [ ] Reprocessar o pedido 60048 e a fila.
