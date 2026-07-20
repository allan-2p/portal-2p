## Escopo

Reforma da Instância Marketing em 4 páginas + novo painel admin de metas.

### 1) Base — nova tabela e time expandido

- Adicionar **Gabriel Sargiani** aos owners de Marketing em `src/lib/salesforce.functions.ts` (mantendo Erika). Time base passa a 6 pessoas: Fernando Lira, Gabriel Kendi, Gabriel Sargiani, Erika Aiello, Ygor Andreis, Marketing 2P.
- Nova migration `marketing_goals` (KV: `key text pk, label text, unit text, period text, goal numeric, updated_at`) com RLS: SELECT authenticated / UPDATE só admin (via `is_admin`). GRANT completo. Seed com as chaves:
  - `leads_qualificados_mes` (150 / mês, orgânico)
  - `mql_pago_mes` (250 / mês)
  - `novos_pago_mes` (30 / mês)
  - `ig_solar_tri` (30000 / tri)
  - `ig_carregadores_tri` (10000 / tri)
  - `ig_station_tri` (3000 / tri)
- Novo `src/lib/marketing-goals.functions.ts` com `listMarketingGoals` e `setMarketingGoal`.

### 2) Novo admin — `Marketing → Metas`

- Nova rota `src/routes/_authenticated/marketing.metas.tsx` (admin-only, mesmo padrão do `admin.metas.tsx` da Solar): lista as 6 metas em cards editáveis (label + valor + unidade), com salvamento inline via `setMarketingGoal`.
- Entrada no menu quando `instance === "marketing"` (verificar `src/lib/instances.ts` e `app-layout` — só adicionar link).

### 3) Página **Social Media** (`marketing.social.tsx`)

- Trocar mocks pelos valores das metas (via `listMarketingGoals`):
  - Topo com 2 cards de destaque grandes:
    - **Leads qualificados (Orgânico)** — real vs `leads_qualificados_mes` (real ainda manual/mock por enquanto).
    - **Seguidores Instagram (Tri)** — grid de 3 (Solar / Carregadores / Station) contra as metas do tri.
- Remover LinkedIn dos detalhes; manter YouTube e TikTok como cards secundários abaixo.
- Instância única (não depende mais do sub-switch marketing solar/carregadores — o card de IG já mostra os 3).

### 4) Página **Tráfego Pago** (`marketing.trafego.tsx`)

- Substituir mocks pelos valores das metas:
  - Header com 2 metas fixas: **MQL 250** e **Novos 30** (mês). Reais preenchidos manualmente por hora (mock 0).
- Mantém tabela de campanhas mock existente abaixo.

### 5) Página **CAC** (`marketing.cac.tsx`)

- Adicionar dois campos editáveis por mês (persist localStorage já usado): `faturamento` e `margem_liquida_valor`.
- Novo card comparativo destacado: **Valor investido × Margem líquida** com badge verde/vermelho conforme margem cobre o investimento e ROI simples.

### 6) Página **Pré-Vendas** (`marketing.pre-vendas.tsx`)

- Renomear título "Home | Gerente de Pré-Vendas" → "Pré-Vendas".
- Trocar os KPIs e o funil por dados reais do Salesforce (novo server fn `getPreVendasFunilData`):
  - Reutilizar owners de Marketing (6 pessoas).
  - Contadores: leads novos (Status=Novo), amadurecimento, não convertidos, convertidos.
  - Motivos de perda de Oportunidades (`Motivo_Perda__c` — tentativa com fallback silencioso se não existir) e Motivos de não-conversão de Leads (`Motivo_Nao_Convertido__c` idem). Se o campo não existir na org, mostrar mensagem "campo não configurado".
- Mantém alertas mock (não foi pedido pra trocar).

### 7) Página **Home Marketing** (`marketing.index.tsx`)

- Adicionar filtro de comparativo **Mês atual vs Mês anterior** (2 presets no topo).
- Novo bloco de KPIs comparativos: Leads, MQL (Status = Qualificado/Convertido/Amadurecimento — ICP), Convertidos, Novos Orçamentos (Opp criadas no período pelos 6 owners), Novos Clientes (contas convertidas no período).
- Adicionar breakdown de faturamento por origem/sub-origem — já temos porOrigem/porSubOrigem para leads; nova query para faturamento agregado por Opp.Lead_Source__c (com fallback).

### 8) Fora de escopo (por decisão)

- Integração real com Instagram/Meta Ads API (mocks + entrada manual conforme aprovado).
- ID do Gabriel Sargiani ainda desconhecido — se você tiver, me passa que eu troco o placeholder na migration/lista.

## Ordem de execução

1. Migration `marketing_goals` + grants + seed.
2. `marketing-goals.functions.ts`.
3. Nova rota admin `marketing.metas.tsx` + link no menu.
4. Refactor `marketing.social.tsx`.
5. Refactor `marketing.trafego.tsx`.
6. Adição no `marketing.cac.tsx`.
7. Owners atualizados + `getPreVendasFunilData` + refactor `marketing.pre-vendas.tsx`.
8. `marketing.index.tsx` com comparativo mês.

## Detalhes técnicos

- Todas as reads via `useSuspenseQuery` + `ensureQueryData` (padrão do projeto).
- Server fns novos usam `requireSupabaseAuth` e `sfFetch`.
- Metas persistidas no Supabase; reais que ainda dependem de fontes externas seguem manuais/mock por hora — reservei "TODO integração" nos pontos exatos.
- Sem alteração no `src/integrations/supabase/*` (arquivos auto-gerados).

Confirma o plano que eu executo tudo em sequência? Se quiser cortar algum item (ex.: adiar comparativo mês/anterior), me avisa.
