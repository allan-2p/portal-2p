# Dashboards — Metas por vendedor

Adicionar um painel de **Metas** na página `/dashboards` com 3 indicadores por vendedor: **Faturamento**, **Retenção** e **Novos A+B**. Cada card mostra realizado × meta, % de atingimento e barra de progresso, respeitando o filtro de vendedor já existente no topo da página.

## Escopo do painel

Período: **trimestre atual** (mesma base já usada em Retenção da Home). Cada card tem 3 linhas: valor realizado, meta e % atingido.

1. **Faturamento** — soma das vendas do trimestre atual do vendedor (Opportunities com `StageName = 'Pedido Concluído'`, excluindo Bonificação), comparado à soma das metas mensais dos 3 meses do trimestre (fonte: `listSalespersonGoals`, mesma tabela usada em `/admin/metas`).
2. **Retenção** — contas A/B do vendedor no trimestre anterior (>= R$ 15k) que voltaram a comprar >= R$ 15k no trimestre atual. Meta = **90% da base A/B do tri anterior** (mesma regra da Home).
3. **Novos A+B** — contas do vendedor que **não** eram A/B no trimestre anterior (< R$ 15k) e que compraram >= R$ 15k no trimestre atual. Meta = valor configurável por vendedor por trimestre (persistido no banco).

Se o filtro estiver em **Todos**, os cards agregam todos os vendedores da carteira (soma para Faturamento, soma para Retenção/Novos A+B). Se um vendedor específico for selecionado, os números são só dele.

## Meta de "Novos A+B" (novo campo)

Criar tabela `salesperson_new_ab_goals` para armazenar a meta trimestral por vendedor:

```text
salesperson_new_ab_goals
  sf_user_id   text
  year         int
  quarter      int   (1..4)
  goal         int   (quantidade)
  PK (sf_user_id, year, quarter)
```

Com RLS: admin escreve/lê; demais autenticados só leem. GRANT SELECT para authenticated; ALL para service_role.

Server functions em `src/lib/admin.functions.ts`:
- `listNewAbGoals({ year, quarter })` → `{ records: { sf_user_id, goal }[] }`
- `setNewAbGoal({ sf_user_id, year, quarter, goal })` (admin-only via `has_role`)

Página `/admin/metas` ganha uma segunda aba/seção simples com input de meta trimestral de "Novos A+B" por vendedor (mesmo padrão visual do painel de Faturamento). Sem meta configurada = meta 0 e a página de Dashboards mostra "—" no denominador.

## Componente novo

`src/components/goals-panel.tsx` — recebe o `ownerId` selecionado e renderiza os 3 cards com barras de progresso. Cores: verde >= 100%, âmbar 70–99%, vermelho < 70% (usar tokens `success`/`warning`/`destructive` já existentes).

`src/routes/_authenticated/dashboards.tsx` — substitui os 4 cards placeholder ("Meta acumulada", "Comissão prevista", etc.) pelo `<GoalsPanel ownerId={ownerId} />`. O bloco "Dashboards detalhados em construção" fica abaixo, inalterado.

## Detalhes técnicos

- Reutiliza `getSalesforceSalesByAccount` (para trimestre anterior e atual) e `getSalesforceVendas` para o total de faturamento por owner.
- Range de trimestre: helpers já existentes na Home (`quarterRange` / `previousQuarterRange`) — extrair para `src/lib/business-days.ts` (ou novo `src/lib/quarters.ts`) para reuso pela Home, Segmentação e Dashboards.
- Filtro de vendedor: usa `SEG_OWNER_IDS` (Matheus, Gustavo, Bruno, Raphael) — mover essa constante para `src/lib/salespeople.ts` e importar em Segmentação e Dashboards, para manter a mesma carteira nos dois lugares.
- Migração SQL segue o padrão: `CREATE TABLE` → `GRANT` → `ENABLE RLS` → `CREATE POLICY` (leitura para authenticated, escrita apenas via `has_role(auth.uid(), 'admin')`).

## Fora de escopo

- Comissão prevista, ranking da equipe e bônus do trimestre (permanecem como placeholder ou removidos, a decidir).
- Gráficos de evolução histórica das metas.
- Metas mensais de Retenção / Novos A+B (mantemos trimestral apenas).
