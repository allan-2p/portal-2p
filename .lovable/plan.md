## 1. Painel de Metas (Administrador → Metas)

**Backend**
- Nova tabela `public.salesperson_goals`:
  - `sf_user_id text primary key`
  - `monthly_goal numeric(14,2) not null default 0` (meta de faturamento em R$)
  - `updated_by uuid`, `updated_at timestamptz default now()`
- RLS: SELECT liberado para `authenticated`; INSERT/UPDATE/DELETE apenas admin (via `has_role`). GRANTs padrão.
- `src/lib/admin.functions.ts`:
  - `listSalespersonGoals` — lista vendedores do Salesforce (mesma query do painel de Vendedores) + meta atual (join com a tabela).
  - `setSalespersonGoal({ sf_user_id, monthly_goal })` — upsert, restrito a admin.

**UI**
- Nova rota `src/routes/_authenticated/admin.metas.tsx`:
  - Tabela: Vendedor · E-mail · Cargo · **Meta mensal (R$)** editável (input com máscara BRL, debounce ~600ms → salva automático) · última atualização.
  - Busca por nome/e-mail.
  - Card de total no topo (soma das metas).
- Sidebar: adicionar `SubLink` "Metas" (ícone `Target`) no grupo Administrador.

## 2. UX da seleção de segmentação

Hoje começa com todos selecionados e sem estado ativo visível, então clicar parece "não desmarcar". Trocar para modelo aditivo:

- Estado inicial: `selectedSegs` vazio ⇒ significa "mostrar todos" (botão **Todos** fica ativo).
- Clicar em A/B/C/D **adiciona** o segmento ao filtro; clicar de novo remove.
- Enquanto tiver 1+ selecionado, só esses segmentos aparecem; se remover o último, volta ao estado "Todos".
- Botão **Todos** limpa a seleção (não força todos como marcados).
- Filtro de linhas: `selectedSegs.size === 0 || selectedSegs.has(c.segment)`.

## 3. Notificações reais

Remover o demo feed (`useNotificationsDemoFeed`) e substituir por notificações vindas do Salesforce:

- Novo hook `useSalesforceNotifications`:
  - A cada 2 min chama `getSalesforceTasks({ start: hoje, end: hoje })` (tarefas abertas de hoje).
  - Também chama `getSalesforceForecasts()` filtrando oportunidades com `forecastDate` ≤ hoje+3 dias.
  - Mantém em `localStorage` um `Set<string>` de IDs já notificados (`portal2p-seen-notifs`) para não duplicar entre reloads.
  - Para IDs novos: `pushNotification({ kind: 'task', ... })` (tarefas) ou `kind: 'atlas'` (oportunidades com forecast próximo).
- Primeira execução: marca tudo como "visto" sem tocar sino se `localStorage` estiver vazio (evita disparar 30 toasts na primeira visita) — só notifica os que aparecerem daí em diante.
- `AppLayout` troca `useNotificationsDemoFeed()` por `useSalesforceNotifications()`.
- Texto no dropdown mantém "Tarefas do Salesforce e recomendações do Atlas".

## Detalhes técnicos

- Migração: `CREATE TABLE` + `GRANT SELECT ON ... TO authenticated`, `GRANT ALL ... TO service_role`, RLS + policies (SELECT authenticated, ALL admin).
- Input de meta: `<input inputMode="decimal">` que aceita "1234,56" ou "1234.56"; parse para número antes de salvar.
- Debounce no salvamento por linha para não bater no server a cada tecla.
- Server function usa `context.userId` para gravar `updated_by`.
- O hook de notificações só roda quando há sessão (usa `useAuth`) e cancela intervalos no unmount.
