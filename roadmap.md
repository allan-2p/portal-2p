# Roadmap

## Em andamento / perguntas
- [x] Kit fotovoltaico: item-base passa de 100000350 para 200000691 (de-para SAP 200000691 → 100000278 mantido) + correção do e-mail de aviso.
- [x] Carregadores: tornar a margem mínima editável na Moderação, iniciar em 10% e bloquear orçamento/finalização abaixo do limite.
- [x] Salesforce: priorizar na fila pedidos já vinculados quando houver compra, nº SAP, mudança de status ou cancelamento; reconciliar o pedido 52671 e casos equivalentes.
- [x] Backfill Salesforce: 6.393 propostas sem `sf_status` enfileiradas (pendente) para o cron `salesforce-fila` drenar.
- [x] Home/dossiê: olhinho e "dar perda" apareciam só em parte das oportunidades (limite de 300 refs no vínculo) — corrigido com lotes e casamento por número.
- [x] Boleto a prazo não aparecia para RUD CORRENTES (condição 2P04 no cadastro): liberar quando o cliente já tem condição a prazo no SAP, sem exigir análise de crédito no portal.
- [x] Item 200000109 (2P-PSI300I Pris.madeira M10*300) ativo no SAP mas não aparece no portal nem nos itens avulsos — investigar.
- [x] Reprocessar tarefas antigas do Salesforce criadas pelo portal (dono = usuário de integração) transferindo para o vendedor da conta.
- [ ] Qual permissão de perfil permite marcar pedido como entregue? (resposta: `modify_all = true` no objeto `propostas` da instância; ver `permission_profile_object_perms`)
- [x] Reenviados os avisos de cancelamento dos pedidos 60134 e 60138.
- [x] Cópia de registro (allan@) unificada: um único e-mail de registro para allan@, sem cópias separadas.
- [ ] camila@2pgroup.com.br está bloqueada por hard bounce até 02/10 — verificar a caixa postal com a TI.
- [x] Reenviar e confirmar recebimento do cancelamento unificado (pedido 60134/60138) após publicação.

## Status de pedidos (SAP)
- [x] Log por pedido no cron `cron.sap-nfs` (`avancou`/`consulta-vazia`/`consulta-erro`) + contadores no job.
- [x] Painel de pedidos parados com OV há N dias (Admin › Logs › Monitor de Sync SAP).
- [x] Opção A: OV criada (cartão/boleto a prazo) → status "Processando" no ato.

## Entrega
- [x] CloseDate do Salesforce = data real de fechamento do pedido (`finalizado_em`), não a previsão/criação.
- [x] Baixa de entrega: validação de data por dia-calendário (não bloquear o dia de hoje).
- [x] Ampliação de atuação: revisão obrigatória do cadastro + escolha do consultor da nova unidade.
- [x] Data de entrega editável mesmo após o pedido marcado como Entregue (mesmo perfil que edita a estimativa).
- [x] Funil do cliente (perfil 360): tabela com filtro por etapa e datas em colunas.
- [x] Home: Atlas Radar removido; Orçamentos subiram para a seção de tarefas; Ranking de clientes (em configuração, com blur) no lugar.
- [x] Publicado em 01/09/2026: tabela de Segmentação preenchendo a largura e demais mudanças recentes.

## Concluído neste turno
- [x] Fase (StageName) exibida nas propostas + "dar perda" pela linha (motivo + descrição → Loss_Reason__c / Descri_o_do_Motivo_de_Perda__c).
- [x] Tipo de NF obrigatório em solar e carregadores (front + back)
- [x] Cancelamento: mensagem alterada para "E-mail de cancelamento enviado." e consultor incluído nos destinatários.




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
- Catálogo: inativar 200000015 e ativar 200000657 (parafuso M8*25) — feito
- Cupons: remover exclusão de cupom (só ativar/desativar) — feito

## Segmentação e funil (01/09)
- [x] Reverter ampliação de teste da DGA Energia (escopo voltou a somente Solar)
- [x] Segmentação: tabela deve preencher toda a largura do card (sem espaço em branco à direita)
- [ ] Funil do cliente (perfil 360): visual de tabela, datas melhor organizadas e filtro por etapa

## Datas e perda (02/09)
- [x] Estimativa de entrega exibida em formato americano (mês/dia) — formatação BR manual em `src/lib/data-br.ts` (Intl caía para en-US no runtime de servidor)
- [x] Colunas de perda aplicadas no banco grupo-2p (`motivo_perda`, `motivo_perda_obs`, `perdida_em`)
- [ ] Teste end-to-end de "dar perda" numa proposta Salvo real (aguardando indicação de uma proposta descartável)

## Propostas e cadastro (02/09)
- [x] Detalhe da proposta (olhinho): exibir peso total dos itens
- [x] Tipo de nota fiscal: padrão "Venda" em Solar e Carregadores (consultor pode alterar)
- [x] Ampliação de atuação liberada para qualquer consultor (sem exigir "Modify All Records")

- [x] Perfil de Cliente: acelerar carregamento da segmentação (paginação paralela + cache)
- [x] Dossiê 360: exibir número da proposta no funil

## Impostos Carregadores (03/09)
- [x] Definir base oficial do PIS/COFINS (Total NF + frete + desconto − IPI − ICMS × 9,25%) — fórmula fiscal virou caminho único; fator 0,870722 aposentado. Pendente: validar a próxima ordem criada no SAP

## Fretefy (04/09)
- [x] Tela de monitoramento dos webhooks Fretefy: logs, pendências de entrega, taxa de falha e reprocessamento por CargaId (`/admin/logs/fretefy`)
- [x] Cadastrar secrets FRETEFY_TOKEN (rotacionado), FRETEFY_WEBHOOK_USER e FRETEFY_WEBHOOK_PASSWORD
