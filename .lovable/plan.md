
# Portal em Instâncias — Solar / Carregadores / Marketing

## Visão geral

Transformar o Portal 2P num sistema **multi-instância**. O usuário troca de instância pelo canto superior direito e o app inteiro muda de identidade visual, menu, dados e permissões.

- **Solar** (atual) — laranja 2P, tudo como está hoje.
- **Carregadores** — tema **azul**, logo enviado (`Logo.png` 2P azul).
- **Marketing** — tema **cinza + amarelo fosco**, página nova quase do zero agregando dados das duas instâncias anteriores.

Administradores ganham dois controles novos no menu superior esquerdo (perto do avatar):
1. **Instâncias liberadas** por usuário.
2. **Permissões finas** (quais abas / tabelas / funções cada usuário vê) dentro de cada instância.

---

## Arquitetura

### 1. Modelo de instância
Novo arquivo `src/lib/instances.ts` central:
- `type InstanceId = "solar" | "carregadores" | "marketing"`
- Metadata: label, cor primária (tokens CSS), logo, rotas habilitadas, ícone.
- `INSTANCE_ROUTES`: mapa `InstanceId → string[]` com as rotas visíveis daquela instância (sidebar e roteamento).
- `INSTANCE_FEATURES`: chaves finas usadas por permissões (`clientes.segmentacao`, `dashboards.metas`, `pedidos`, `atlas`, `admin.metas`, `admin.tabelas`, `admin.vendedores`, `usuarios`, `integracoes`, `tarefas`, `perfil`, `marketing.overview` etc.).

### 2. Contexto React `InstanceProvider`
`src/components/instance-provider.tsx`:
- Guarda `currentInstance`, persiste em `localStorage` (`portal.instance`).
- Ao trocar, aplica classe no `<html>`: `data-instance="solar|carregadores|marketing"` — o `src/styles.css` reage e sobrescreve tokens (`--primary`, `--accent`, `--ring`, `--atlas`) por instância. Solar mantém laranja atual; carregadores azul; marketing cinza+amarelo fosco.
- Expõe `useInstance()` com: `instance`, `setInstance`, `allowedInstances`, `hasFeature(key)`.
- Filtra automaticamente para as instâncias que o usuário tem acesso (via query nas tabelas novas).

### 3. Trocador de instância (superior direito)
Novo `src/components/instance-switcher.tsx` — dropdown com as instâncias liberadas ao usuário, logo/label/cor de cada uma, indicador da ativa. Inserir no `app-layout.tsx` ao lado do `NotificationsDropdown`/`ThemeToggle`.

### 4. Admin (superior esquerdo, perto da foto)
No `app-layout.tsx`, se `hasRole('admin')`, exibir um botão de engrenagem que abre menu com:
- **Acessos por Instância** → `/admin/acessos-instancias`
- **Permissões de Usuários** → `/admin/permissoes`

Ambas as rotas ficam dentro de `_authenticated/` e são gateadas por `has_role('admin')`.

### 5. Filtragem de menu e roteamento
`app-layout.tsx` (sidebar) filtra os itens do menu por:
`INSTANCE_ROUTES[currentInstance]` ∩ `permissões do usuário`.
Rota acessada diretamente sem permissão → redirect para `/` com toast.

---

## Backend (migração SQL)

Uma migração cria:

- `public.instances` (seed com 3 linhas: solar, carregadores, marketing) — usada só como enum de referência.
- `public.user_instance_access` — `(user_id uuid, instance_id text, granted_at)`, PK composta.
  - RLS: usuário lê o próprio, admin lê/escreve tudo.
- `public.user_feature_permissions` — `(user_id uuid, instance_id text, feature_key text, allowed boolean)`, PK composta.
  - RLS: usuário lê o próprio, admin lê/escreve tudo.
- GRANTs completos para `authenticated` e `service_role`.
- Trigger opcional: ao criar user, dar acesso default a `solar` (mantém retro-compat).

Backfill: dar acesso a `solar` para todos os `auth.users` existentes; dar acesso a `carregadores` e `marketing` só a admins por padrão.

Server functions em `src/lib/access.functions.ts`:
- `listUserAccess()` — instâncias e features do usuário logado.
- `adminListUsersAccess()` — matriz completa (admin).
- `adminSetInstanceAccess({ user_id, instance_id, allowed })`.
- `adminSetFeaturePermission({ user_id, instance_id, feature_key, allowed })`.

Todas com `requireSupabaseAuth` e verificação `has_role('admin')` para as `admin*`.

---

## Frontend por instância

### Solar
Zero mudança funcional. Só passa a existir como instância explícita e usa as mesmas rotas atuais.

### Carregadores
- Tema azul via `data-instance="carregadores"` em `styles.css` (novos valores para `--primary`, `--accent`, `--ring`).
- Logo: fazer upload do `Logo.png` como Lovable Asset → `src/assets/2p-carregadores-logo.png.asset.json`. `app-layout.tsx` troca o logo conforme instância.
- Rotas iniciais reutilizadas: `dashboards`, `clientes.segmentacao`, `clientes.cadastros`, `pedidos`, `tarefas`, `perfil`. Dados vindos do Salesforce podem, num próximo passo, ser filtrados por linha de produto — nesta entrega ficam iguais aos de Solar (marcado como TODO no código).

### Marketing (nova)
- Tema cinza + amarelo fosco (`--primary` oklch amarelo desaturado, `--surface` cinzas frios).
- Rotas novas em `src/routes/_authenticated/marketing.*`:
  - `marketing.index.tsx` — overview com KPIs agregados (leads, MQL, SQL, conversão, ticket médio) unificando Solar + Carregadores.
  - `marketing.campanhas.tsx` — placeholder com estrutura para campanhas.
  - `marketing.funil.tsx` — placeholder funil consolidado.
- Layout específico com header cinza/amarelo.
- Fontes de dados: reaproveita `getSalesforceVendas` / `getSalesforceSalesByAccount` já existentes, agrupando por período. Onde não houver dado real ainda, mostrar estado vazio elegante (não mock).

---

## UX / Detalhes

- Ao logar, escolhe automaticamente a última instância usada; se não tiver acesso, cai na primeira liberada.
- Trocar de instância dá fade de 150ms e invalida queries relacionadas.
- Página `/admin/permissoes`: tabela com usuários nas linhas, tabs no topo por instância, colunas = features. Toggle por célula. Bulk actions (marcar tudo / desmarcar).
- Página `/admin/acessos-instancias`: lista de usuários com 3 switches (Solar / Carregadores / Marketing).

---

## Detalhes técnicos (para revisão)

**Ordem de implementação:**
1. Migração SQL (`instances`, `user_instance_access`, `user_feature_permissions` + RLS + GRANT + backfill).
2. `src/lib/instances.ts` (metadata + features), `src/lib/access.functions.ts` (server fns).
3. `InstanceProvider` + `useInstance` hook + tokens CSS por `data-instance`.
4. `InstanceSwitcher` (top-right) + admin menu (top-left).
5. Filtragem no `app-layout.tsx` (sidebar + guards).
6. Rotas admin: `/admin/acessos-instancias` e `/admin/permissoes`.
7. Upload do logo azul + tema Carregadores.
8. Rotas `marketing.*` novas + tema.
9. QA: trocar instância, testar sem permissão, admin adicionando/removendo acessos.

**Compatibilidade:**
- Rotas atuais continuam funcionando.
- Usuários existentes recebem acesso automático a Solar.
- Nada quebra para não-admins que não têm as novas rotas.

**Não incluído nesta entrega:**
- Filtragem por linha de produto no Salesforce (Carregadores usa mesmos dados de Solar por enquanto, com TODO).
- Dashboards profundos de Marketing (entra com esqueleto + agregados básicos).

Confirma que sigo por esse caminho? Se quiser, ajusto qualquer parte (ex: features específicas, mais rotas em Marketing, cores exatas dos temas) antes de implementar.
