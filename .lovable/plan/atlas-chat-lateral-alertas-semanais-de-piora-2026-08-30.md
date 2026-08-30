# Atlas: chat lateral + alertas semanais de piora

Duas entregas conectadas: um chat do Atlas sempre à mão no portal, e uma varredura semanal que detecta clientes piorando e gera plano de ação.

## 1. Chat lateral do Atlas

- Botão flutuante no canto inferior direito, presente em todas as telas internas do portal (dentro do layout autenticado).
- Abre um painel lateral (drawer) com o chat, sem sair da página atual.
- Conversas por tópico: lista de conversas anteriores, botão "Nova conversa", cada conversa com URL própria (`/atlas/:threadId`) para poder abrir em tela cheia e compartilhar o link.
- Histórico salvo no banco (Supabase), por usuário, acessível de qualquer dispositivo.
- Respostas em streaming com o "pensamento" do Atlas visível enquanto ele trabalha, e formatação rica (listas, tabelas, negrito).
- Contexto automático: se você estiver no perfil de um cliente ou em um pedido, o chat já entra com esse cliente selecionado.
- Seletor de período (mês, trimestre, ano ou intervalo personalizado) que o Atlas usa nas análises.

### O que o Atlas pode consultar

Ferramentas que ele chama sozinho, sempre respeitando a carteira do usuário logado (o mesmo escopo de consultor já usado nas listagens):

- Clientes: carteira, segmento ABCD, consultor responsável, contatos, endereços.
- Propostas e pedidos por período: valores, status, datas, NF, frete, descontos.
- Metas e histórico de compras: meta do vendedor, realizado, comparativo trimestre a trimestre.
- Tarefas e visitas do Salesforce vinculadas ao cliente.

O Atlas nunca vê dados fora da carteira do usuário; um vendedor só recebe insights dos clientes dele, diretor/admin veem tudo.

## 2. Alertas automáticos de piora

Varredura semanal (segunda de manhã) sobre a carteira, com quatro sinais por cliente:

| Sinal | Como é medido |
| --- | --- |
| Geração | Queda no volume de propostas/pedidos criados vs. período anterior |
| Visitas | Ausência de visitas/atividades registradas no Salesforce no período |
| Tarefas | Tarefas vencidas ou sem próxima ação agendada |
| Projeção vs. realizado | Realizado abaixo da projeção/meta do cliente no trimestre |

Cada cliente recebe uma severidade (atenção / crítico) e o Atlas escreve uma recomendação de ação específica ("ligar em X dias, oferecer Y, motivo provável Z").

### Onde os alertas aparecem

- **Sino de notificações** do portal, como já funciona hoje.
- **Perfil do cliente**: bloco "Atlas — sinais de risco" com os sinais detectados e a ação recomendada.
- **Atlas Radar**: nova tela com a lista de todos os clientes em piora da sua carteira, ordenada por severidade, com filtros por sinal e período. Cada linha abre o chat do Atlas já contextualizado naquele cliente.
- **E-mail semanal** para cada consultor com o resumo dos clientes em piora (e um resumo consolidado para gestores/diretoria).

Cada alerta pode ser marcado como "tratado" ou "ignorar por 30 dias", para não repetir na semana seguinte.

## Detalhes técnicos

- Banco: novas tabelas `atlas_threads`, `atlas_mensagens` (histórico do chat, RLS por `auth.uid()`), `atlas_alertas` (cliente, sinais, severidade, recomendação, status tratado/silenciado) e `atlas_alerta_runs` (auditoria de cada varredura). Grants explícitos para `authenticated` e `service_role`.
- Chat: rota de streaming `src/routes/api/atlas-chat.ts` usando o gateway de IA da Lovable com `google/gemini-3.7-flash` e tool calling; UI montada com os componentes AI Elements (conversa, mensagens, composer, cartões de ferramenta), não primitivos próprios.
- Ferramentas do modelo reutilizam funções de servidor já existentes (`clientes`, `propostas`, `goals`, `cliente-dossie`, `salesforce`) com o filtro de `escopoDoConsultor` aplicado no servidor.
- Varredura: rota `src/routes/api/public/hooks/atlas-radar.ts` protegida por `CRON_HOOK_SECRET`, agendada via `portal_cron_post` no `pg_cron` (segunda de manhã), com botão "Rodar agora" para administradores.
- E-mail semanal pelo caminho central `src/lib/email.server.ts` (fila + log de envio já existentes).
- Permissões: nova capability `atlas.chat` e `atlas.radar` no sistema de perfis, para você liberar por perfil.

## Dependências e ressalvas

- **Visitas e tarefas vêm do Salesforce** (objeto `Task`). Clientes sem vínculo com conta do Salesforce não terão esses dois sinais — só Geração e Projeção vs. realizado. A tabela local `carregadores_tarefas` está vazia hoje, então não serve de fonte.
- **Projeção vs. realizado por cliente**: hoje o portal tem metas por vendedor e projeção trimestral vinda do Salesforce. Vou usar essa projeção por cliente; se ela estiver em branco para parte da carteira, esses clientes ficam sem esse sinal (sinalizado na tela, sem inventar número).
- **Custo de IA**: o chat e a redação das recomendações consomem créditos de IA. A varredura semanal escreve recomendações em lote — para carteiras grandes, gero as regras primeiro e só chamo o modelo para os clientes que dispararam algum sinal.
- Os alertas por e-mail dependem do domínio de envio já verificado (está OK hoje).
