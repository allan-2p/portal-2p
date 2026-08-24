# Etapa 1 — Central de Reprocessamento de Integrações

Você escolheu as quatro frentes, mas com plano enxuto. Então esta etapa entrega **uma** frente completa: a que hoje mais gera trabalho manual e risco de pedido "perdido no meio do caminho". As outras três ficam listadas no fim como próximas etapas, sem implementação agora.

## Por que esta primeiro

O que já existe hoje no portal:

- `job_runs` registra cada execução (sucesso/erro) dos jobs e webhooks.
- Cada integração já tem retentativa **dentro da mesma chamada**: Itaú (3x), Salesforce (3x com backoff), SAP (auto-recuperação por documento).
- Já há painel de status e alertas de integração parada (`integration-status`, `integration-alerts`).

O que falta: quando as 3 tentativas do momento falham, **nada tenta de novo**. A falha fica só no log e depende de alguém abrir a proposta e clicar em reenviar. É exatamente o que aconteceu nas falhas de OV e de cobrança que já investigamos.

## O que vai ser entregue

1. **Fila de reprocessamento persistente**
   Toda falha definitiva de integração (OV no SAP, cobrança Itaú, envio Salesforce, oferta Fretefy, boleto SharePoint) passa a gravar um item pendente com: integração, proposta/pedido, motivo do erro, nº de tentativas e próximo horário de tentativa.

2. **Reprocessamento automático com backoff**
   Um job cron novo processa a fila a cada poucos minutos, com espera crescente entre tentativas (ex.: 5 min, 15 min, 1 h, 4 h, 12 h) e limite de tentativas. Depois do limite o item vira "requer atenção" e para de tentar, sem travar a fila.

3. **Tela "Central de Integrações"** (dentro de Integrações e auditoria)
   Lista única de pendências e falhas, com: integração, proposta, erro real (não a mensagem genérica), tentativas, próxima tentativa. Ações por linha: **Tentar agora**, **Ignorar/Resolver manualmente**, **Ver log completo**. Contadores no topo por integração.

4. **Aviso ativo de falha crítica**
   Quando um item esgota as tentativas, gera notificação no portal (e e-mail, se você quiser) para o time responsável — hoje isso só apareceria se alguém procurasse no log.

5. **Idempotência garantida**
   Antes de retentar, cada integração confere se a operação já foi concluída do outro lado (OV já criada, cobrança já emitida, Opportunity já existente) para nunca duplicar pedido ou cobrança.

## Detalhes técnicos

- Nova tabela `integration_retry_queue` no Supabase (grupo-2p), com RLS + GRANTs, índice por `(status, next_attempt_at)` e unicidade por `(integracao, referencia_id, operacao)` para não empilhar duplicatas.
- Novo módulo `src/lib/integration-retry.server.ts`: `enfileirar()`, `processarFila()`, `marcarResolvido()`, com o mapa de handlers reaproveitando as funções que já existem (`sap-ov.server.ts`, `pagamentos-cobranca.server.ts`, `salesforce-pedidos.server.ts`, `fretefy-oferta.server.ts`, `boletos-sharepoint.server.ts`) — nenhuma lógica de negócio reescrita.
- Novo job `integracao.reprocessar` no registry + `cron.schedule` chamando `portal_cron_post`, no mesmo padrão dos jobs atuais, protegido por `x-cron-secret`.
- Novo painel `src/components/integracao-fila-panel.tsx` e aba na página de Integrações; ações via `createServerFn` com `requireSupabaseAuth` e checagem de papel.
- Testes: enfileiramento em falha, respeito ao backoff, não-duplicação por idempotência, esgotamento de tentativas.
- `CHANGELOG.md` e `npm run readme:sync` atualizados no mesmo turno.

## Não entra nesta etapa

Sem mudança em preços, cálculo de frete, PDF, layout de checkout ou payload das integrações. O comportamento atual continua igual — só passa a ter uma segunda chance automática e visibilidade.

## Próximas etapas (para aprovar depois, uma por vez)

- **Etapa 2 — Velocidade do vendedor:** duplicar proposta/template, rascunho automático, busca global Cmd+K.
- **Etapa 3 — Link público de proposta + portal do cliente:** proposta compartilhável com aceite digital e acompanhamento de pedido, NF, boleto/Pix e rastreio.
- **Etapa 4 — Gestão e dados:** funil e conversão por consultor, margem por proposta com alerta de desconto, exportações padronizadas.
