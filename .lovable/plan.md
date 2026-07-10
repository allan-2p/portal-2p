Vou dividir em 3 frentes independentes. Tudo é frontend + uma migração pequena para as novas metas trimestrais.

## 1. Atlas "em breve" (portal inteiro)

- `src/routes/_authenticated/atlas.tsx`: sobrepor o conteúdo atual com um wrapper `blur-sm pointer-events-none select-none` + um card central "Em breve — estamos configurando".
- `src/components/atlas-panel.tsx` (o botão flutuante do Atlas na barra): também exibir estado "em breve" — clique abre um popover simples "Em breve" em vez do painel de chat. Mantém o ícone visível.
- Sem remover código — só gate visual, para reativar rápido depois.

## 2. Metas trimestrais — Retenção e Novos A+B (instância Solar)

Já existe `salesperson_new_ab_goals` (Novos A+B). Falta **Retenção**.

Migração nova:
- `salesperson_retention_goals (sf_user_id, year, quarter, goal numeric, updated_at)` com PK composta, RLS igual à de `salesperson_new_ab_goals` (leitura para admin/gerente/diretor/próprio vendedor; escrita só admin), `GRANT` para `authenticated` e `service_role`.

Server functions em `src/lib/goals.functions.ts`:
- `listRetentionGoals` (mesmo shape de `listNewAbGoals`).
- `setRetentionGoal` (mesmo shape de `setNewAbGoal`).

UI:
- `src/components/goals-panel.tsx`: acrescentar bloco "Retenção" ao lado de "Novos A+B", com mesmo padrão (input + progresso). Não mexo em lógica de faturamento.
- `src/routes/_authenticated/admin.metas.tsx`: adicionar coluna/tab "Retenção" para admin editar por vendedor/trimestre.

Nesta iteração as duas metas ficam **apenas cadastráveis + exibidas** (progresso = "—" até você me dizer a fórmula de realizado). É o "só acrescentar e depois explico melhor" que você pediu.

## 3. Instância Marketing — reescrita completa

### 3a. Sub-switch Solar ↔ Carregadores (escopo apenas Marketing)

- `src/components/instance-provider.tsx`: adicionar `marketingUnit: "solar" | "carregadores"` + setter, persistido em `localStorage` (`portal2p.marketingUnit`). Não afeta a `instance` global.
- Novo componente `src/components/marketing-unit-switch.tsx` (pill toggle) exibido no header **só** quando `instance === "marketing"`.
- Integrar no `src/components/app-layout.tsx` header ao lado do `InstanceSwitcher`.

### 3b. Novas rotas + navegação (dentro do layout `_authenticated/marketing.tsx`)

Substituir o menu de Marketing por:

```
Home           → /marketing              (marketing.index.tsx — reescrita)
Social Media   → /marketing/social       (novo)
Tráfego Pago   → /marketing/trafego      (novo, substitui campanhas)
Cohort         → /marketing/cohort       (novo)
CAC            → /marketing/cac          (novo)
```

Remover do menu: `/marketing/funil` e `/marketing/campanhas` (arquivos ficam mas fora do menu — ou apago). Atualizar `src/lib/instances.ts` (features) e o menu em `app-layout.tsx`.

Todas as páginas respeitam o sub-switch: header mostra "2P Solar" ou "2P Carregadores" e os KPIs são placeholders escopados por unidade (mock hoje; wiring de dados depois).

### 3c. Conteúdo de cada aba (visual estruturado, dados mock)

**Home** — 3 cards de metas (Novos / MQL / Seguidores) com barra de progresso, funil horizontal Visitas→Lead→MQL→SQL→Novo com taxas de conversão, seção "Origem dos Novos" + "Origem dos Leads" (bar chart), "Faturamento dos novos" (valor + tabela top 5), "Top criativos" (Google + Facebook, com CTR/CPA/vendas), bloco "Site" (visitas, top páginas de entrada, vendas do site), bloco "Orgânico" (leads por rede + melhores posts). Layout de dashboard semanal.

**Social Media** — meta de seguidores por rede + meta de MQL, evolução (linha), tabela de posts recentes, breakdown por plataforma.

**Tráfego Pago** — tabela de campanhas ativas (Google/Meta) com CPM/CPC/CTR/CPA/ROAS, filtro por plataforma, mesma visão para site (analytics).

**Cohort** — tabela cohort por mês de entrada do lead × meses até compra, com contagem de "ainda não compraram" e conversão por safra.

**CAC** — grid dos 12 meses de 2026: cada mês já preenchido mostra CAC calculado; meses pendentes (ex.: junho) mostram botão "Preencher". Modal/form com custos (tráfego, mídia, agência, funcionários, outros) → salva localmente por enquanto (`marketing_cac` a criar depois). Nesta iteração: form + storage local (`localStorage`) para não bloquear; migração de tabela real numa próxima passada.

Insights do Atlas: cada página tem card "Insights (em breve)" com o mesmo blur do item 1, para consistência.

## Ordem de execução

1. Atlas blur + gate.
2. Migração retention + server fns + UI (goals-panel, admin.metas).
3. instance-provider + sub-switch + rotas marketing novas + rewrite de conteúdo.
4. Ajustar `instances.ts`/menu.

## Fora de escopo agora (para próxima rodada quando você explicar)

- Fórmulas reais de "realizado" para Retenção e Novos A+B.
- Integração real com Google Ads / Meta / GA4 / redes sociais.
- Tabela persistente de CAC no banco (hoje: form + localStorage).
- Ligação Atlas real.
