# Roadmap

## Salesforce — envio completo do pedido
- [ ] Reenviar/atualizar a oportunidade a cada mudança de status (todos os motores, não só as ações manuais).
- [ ] Mapear por padrão os campos que faltavam: Nº SAP, frete, tipo de NF, desconto, total, margem, tabela de preço, previsão de fechamento, NF, datas de faturamento/coleta/entrega, transportadora, vendedor, quem criou/finalizou, feito através de, projeto vendido.
- [ ] Enviar os produtos linha a linha (OpportunityLineItem) e gravar `proposta_itens` no Grupo 2P em todo salvamento (hoje só o backfill grava).
- [ ] Reprocessar o pedido 60048 e a fila.

## Perfil do cliente (360)
- [x] Funil da visão geral: só propostas em aberto.
- [x] Aba Propostas & pedidos: só histórico, separando ganhos e perdidos.
- [x] Tempo médio de compra (e dias desde a última) no cabeçalho do perfil.

## Home
- [x] Funil de orçamentos: filtro "Hoje" (geração de hoje).

## Pendentes
- [x] Página de Tarefas: abrir tarefa, registrar interação, adiar, concluir, nova tarefa e visualização lista/calendário.
- [ ] Carregadores: exibir vendas de Caroline Gimenez, Ghustavo Novaes e Bruno Amaral com org "2P Carregadores" (aguardando confirmação da origem dos registros).

## Pendências (31/08 tarde)
- [ ] Perfil do cliente: tempo médio de compra e dias desde a última compra
- [ ] Perfil: segmentação correta (A/B/C/D)
- [ ] Perfil: propostas/pedidos com 5 últimos ganhos + 5 perdidos e "ver todos"
- [ ] Atlas do cliente: título apenas "Mapa Mental"
- [ ] Excluir a variação de teste 60121-B
- [ ] Org "2P Carregadores": oportunidades com "Carregador" no nome de Caroline Gimenez, Ghustavo Novaes e Bruno Amaral — atualizar Salesforce e portal; refletir na TV
