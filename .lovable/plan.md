# Integração completa de propostas com Salesforce

## Contexto
A integração atual envia apenas os campos básicos da oportunidade (Name, AccountId, StageName, CloseDate, Amount, Description, OwnerId, Status do pedido, Org da oportunidade, forma de pagamento, frete, documento, nota fiscal). Os campos financeiros e de rastreabilidade mostrados nas telas do Salesforce estão faltando, e a seção "Products" da oportunidade está vazia.

## Objetivo
1. Enviar todos os campos do Opportunity que já existem na org do Salesforce e estão mapeados no portal.
2. Criar, no banco do Grupo 2P, uma tabela `proposta_itens` que armazene cada produto linha a linha, vinculado à proposta.
3. Sincronizar os produtos da proposta como `OpportunityLineItem` no Salesforce.
4. Garantir que atualizações futuras reenviem os campos e produtos corretamente.

## Escopo técnico

### 1. Campos do Opportunity a adicionar no catálogo
Campos já confirmados na org do Salesforce (via describe):

| Campo no portal | API name no Salesforce | Tipo | Origem no portal |
|---|---|---|---|
| Feito através de | `Feito_atrav_s_de__c` | picklist | Origem da proposta: "Calculadora 2P" quando veio da calculadora solar, "Lista de Produtos" quando montada manualmente. |
| Projeto Vendido? | `Projeto_Vendido__c` | picklist | "Sim" para status de pedido concluído/entregue/faturado/coletado; "Estoque" para status Separação/Estoque; "Não" para negociação/salvo. |
| Quem criou? | `Oportunidade_criada_por__c` | picklist | "Vendedor" (sempre, pois a proposta nasce no portal pelo time comercial). |
| Quem finalizou? | `Oportunidade_finalizada_por__c` | picklist | "Vendedor" quando finalizado por usuário interno; "Cliente" quando o cliente conclui via link de pagamento/checkout externo. |
| Vendedor | `Vendedor__c` | picklist | Nome do consultor/vendedor responsável (`consultor_nome` ou `criado_por_nome`). |
| Tabela de Preço | `Tabela_de_Preco__c` | picklist | Código da tabela de preço usada na proposta (campo `tabela_preco` ou extraído da simulação SAP). |
| Previsão de Fechamento | `Previsao_de_Fechamento__c` | date | `previsao_fechamento` da proposta. |
| Margem Total | `Margem_Total__c` | percent | `totais.mbPct` (margem bruta percentual). |
| Frete | `Frete__c` | currency | `frete_valor`. |
| Desconto | `Desconto__c` | currency | `totais.desconto` ou cálculo a partir do valor original vs. final. |
| Total | `Total__c` | currency | `totais.valorTotal`. |

### 2. Nova tabela `proposta_itens` no banco do Grupo 2P
Tabela para análise e rastreabilidade, populada no momento da criação/alteração da proposta:

- `id` uuid PK
- `proposta_id` uuid NOT NULL → `propostas.id`
- `organizacao` text NOT NULL
- `numero` text (nº da proposta)
- `numero_sap` text (nº SAP da proposta)
- `sf_opp_id` text (ID da oportunidade no Salesforce)
- `produto_id` uuid (referência local ao produto, quando existir)
- `codigo` text (código SAP do produto)
- `nome` text
- `descricao` text
- `ncm` text
- `unidade` text
- `quantidade` numeric
- `valor_unitario` numeric
- `valor_total` numeric
- `custo_unitario` numeric (quando disponível)
- `margem_bruta` numeric
- `impostos` jsonb (detalhamento de IPI, ICMS, PIS/COFINS quando disponível)
- `ordem` integer
- `created_at` / `updated_at`

A tabela terá RLS + grants padrão, permitindo leitura/escrita apenas aos papéis autorizados (service_role para sync, authenticated para consulta dentro do escopo de propostas).

### 3. Sincronização de produtos no Salesforce
Para cada item da proposta:
- Localizar `PricebookEntryId` no Salesforce pelo `ProductCode` (código SAP) e pelo pricebook ativo padrão (`Standard Price Book`).
- Se encontrado, criar/atualizar `OpportunityLineItem` com:
  - `OpportunityId`: ID da oportunidade
  - `PricebookEntryId`: ID encontrado
  - `Quantity`: quantidade
  - `UnitPrice`: valor unitário (líquido para Carregadores, conforme regra vigente)
  - `Description`: nome/descrição do produto
- Se não encontrar o pricebook entry, registrar no `integration_logs` como aviso e continuar (não quebrar o envio da oportunidade).
- Antes de inserir novos itens, remover os `OpportunityLineItem` antigos da oportunidade para evitar duplicidade em atualizações.

### 4. Alterações nos arquivos
- `src/lib/salesforce-campos.ts`: adicionar os novos campos ao `CAMPOS_OPPORTUNITY`.
- `src/lib/salesforce-pedidos.server.ts`: após criar/atualizar a oportunidade, chamar função de sync de produtos.
- `src/lib/propostas-db.server.ts`: adicionar funções para inserir/atualizar/listar itens da proposta.
- Novo arquivo `src/lib/salesforce-itens.server.ts`: lógica de sync de `OpportunityLineItem`.
- Rotas de salvamento/conclusão de propostas: persistir itens na tabela `proposta_itens`.
- Backfill: rotina para popular `proposta_itens` a partir do JSON `itens` das propostas existentes.

### 5. Migração de banco
Criar migration com:
- `CREATE TABLE public.proposta_itens`
- `GRANT` para `authenticated` e `service_role`
- `ENABLE ROW LEVEL SECURITY`
- Políticas de escopo por proposta
- Trigger `touch_updated_at`

## Dependências / riscos
- A tabela `propostas` no Grupo 2P já tem as duas unidades (42.044 propostas `solar` e 124 `carregadores`), então a integração e o backfill de itens cobrem Solar e Carregadores desde o início. O volume do Solar exige que o backfill de `proposta_itens` rode em lotes, não de uma vez.
- Os produtos precisam ter `ProductCode` no Salesforce igual ao código SAP do portal. Se houver divergência, os itens não serão vinculados — e nesse caso o problema não pode ficar silencioso: cada item sem `PricebookEntry` correspondente é registrado como uma ocorrência ("produto sem cadastro no Salesforce", com nº da proposta, código SAP e data) e aparece num **Painel de Saúde do Portal** dentro de Configurações (permissão de administrador). Esse painel é o local único para acompanhar tudo que envolva o portal: quebras e erros de integração (Salesforce, SAP, Fretefy, e-mails, boletos, jobs de cron), correções pendentes, ajustes de cadastro necessários e possíveis problemas detectados, cada ocorrência com severidade (crítico / atenção / informativo), contagem, último acontecimento e ação de marcar como resolvida.
- O campo `tabela_preco` precisa estar presente/populado na proposta. Se não existir, será necessário derivá-lo da simulação SAP ou do catálogo de produtos.

## Validação
- Enviar uma proposta de teste e verificar no Salesforce:
  - Campos financeiros preenchidos (Amount, Margem Total, Frete, Desconto, Total).
  - Campos de rastreabilidade preenchidos (Feito através de, Projeto Vendido?, Quem criou?, Quem finalizou?, Vendedor, Tabela de Preço, Previsão de Fechamento).
  - Aba "Products" da oportunidade com os itens.
- Verificar na tabela `proposta_itens` que os itens foram gravados linha a linha.
