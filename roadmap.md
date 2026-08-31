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

- [x] Variações na listagem: ocultar a favorita no toggle, remover status individual e mostrar data de criação
- [x] Marcar propostas de carregadores (Caroline/Ghustavo/Bruno) como 2P Carregadores no portal e no Salesforce
- [x] TV: vendas de carregadores dos consultores da unidade

## Pendências (31/08 fim de tarde)
- [ ] Salesforce: proprietário das oportunidades = consultor da proposta (corrigir as 60 do Limpador Intersolar que ficaram como Portal 2P)
- [ ] TV: revisão de UI/UX (números quebrando, alinhamento e quebras de linha estranhas) sem alterar os dados atuais
- [x] Limpadores de hoje com "Marketing 2P": redistribuir clientes e propostas igualmente entre Fernando Lira, Gabriel Kendi e Gabriel Sargiani (portal + Salesforce)
- [x] Transferir proposta 60055 (Roger Rodrigues) para Fernando Lira e 60054 (Ecio Mendes) para Gabriel Sargiani (portal + Salesforce: opp, conta e cliente)
- [x] Cupom de desconto aparece no pedido mas não aplica o desconto (erro "Cupom de uso único já utilizado"); afeta vários pedidos de limpador — verificar se impacta outras propostas

## Checkout — pagamento e observações (31/08 tarde)
- [ ] Forma de pagamento trava a condição: cartão → 2PCC (CARTAO), boleto à vista → 2P00 (A VISTA), Pix → 2PPX (PIX), financiamento → 2P00. Só boleto a prazo deixa o consultor escolher.
- [ ] Renomear "Observações" para "Observações da Nota Fiscal" (vai para o SAP) e criar "Observações do Pedido" (campo interno, não vai para NF/SAP) exibido acima.
- [ ] Observações da NF: pré-preencher com contato do cliente e endereço de entrega quando diferente do faturamento; manter os avisos de impostos dos Carregadores (DIFAL/IPI/uso e consumo).
- [ ] Banco Grupo 2P: criar coluna `observacoes_internas` em `propostas` (DDL pendente — conexão psql falhou nesta rodada).
