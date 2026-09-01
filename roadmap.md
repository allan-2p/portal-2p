# Roadmap

## Em andamento / perguntas
- [x] Reprocessar tarefas antigas do Salesforce criadas pelo portal (dono = usuário de integração) transferindo para o vendedor da conta.
- [ ] Qual permissão de perfil permite marcar pedido como entregue? (resposta: `modify_all = true` no objeto `propostas` da instância; ver `permission_profile_object_perms`)

## Concluído neste turno
- [x] Tipo de NF obrigatório em solar e carregadores (front + back)


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

- [ ] Bug: botão Editar em proposta Solar leva para o checkout de Carregadores (rota deve seguir a organizacao da proposta).

## Ajustes rápidos (31/08 noite)
- [ ] Cor do status "Aguardando Pagamento": tornar o laranja mais claro para não confundir com vermelho.
- [ ] Pedidos SAP 17636 e 17633: alterar transportadora para SCHREIBER LOGÍSTICA LTDA no banco e no Salesforce.

(sprint checkout pagamento/observacoes: concluído)

## Carregadores — Visão Geral (31/08 noite)
- [ ] Listar apenas pedidos com produtos do catálogo de carregadores (excluir kits/brindes/bonificação)
- [ ] Exibir data da compra nas listagens
- [ ] Filtro de período: mês, trimestre, ano e intervalo de datas

## Atlas + Perfil do cliente (01/09)
- [x] Atlas: tela cheia de chat em /solar/atlas (sai o aviso "em breve"), perguntas abertas
- [x] Atlas: indicador do que está consultando + o que ele sabe responder
- [x] Atlas Radar ativo na home (substituir card "em breve")
- [x] Perfil do cliente: remover "Pedidos em aberto" da aba Financeiro
- [x] Perfil do cliente: Visão geral — "Funil do cliente" lista oportunidades em aberto (valor + etapa); remover "sinais rápidos"
- [x] Perfil do cliente: renomear "Propostas e pedidos" para "Propostas"

## Escopo de clientes e OV manual (01/09)
- [ ] Cliente cadastrado não aparece na busca da proposta: escopo do vendedor ignora `consultor_nome` e a base tem `consultor_id` nulo (corrigir código + backfill para todos os vendedores)
- [ ] Campo de admin para vincular manualmente a OV do SAP à proposta (gravar + atualizar radar/status)

## Precificação Solar (01/09)
- [ ] Kit gerador: marcar/desmarcar deve reprecificar TODOS os itens (assinatura determinística)
- [ ] Faturar ao cliente final: simular com o cliente fake da UF (`clientes_fakes`) + CNPJ_CI da revenda
- [ ] Catálogo do portal: itens 200000590 e 200000142 enviados ao portal não aparecem; itens publicados devem permanecer no catálogo mesmo após novas sincronizações do SAP

- [x] Funil do cliente: visual mais legível (cards por etapa)
- [x] Catálogo do portal: itens enviados manualmente não podem ser removidos/desativados por novas sincronizações do SAP

## Perfis e atividades (01/09)
- [x] Admin: opção de clonar perfil de permissão (telas, instâncias, objetos)
- [x] Perfil do cliente: tarefa existente no Salesforce não aparece em "Atividades" (aparece no calendário de Tarefas)
- [x] Clientes Grupo 2P: consultor separado por unidade (Solar e Carregadores)
