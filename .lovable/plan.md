# Versões de tela por Papel + Cargo

## Ideia central

Cada tela vira um **layout base com "slots"**. Cada slot pode ter várias variantes, e o sistema escolhe automaticamente qual variante mostrar com base em **(Papel, Cargo)** do usuário logado — mais a instância ativa, que já existe. Se o usuário se encaixa em mais de uma persona, aparece um **toggle "Ver como…"** no header para ele alternar.

Nada de duplicar telas inteiras. Nada de `if role === 'vendedor'` espalhado. Um único lugar declara "quem vê o quê".

---

## Como o usuário vai perceber

1. **Home (e todas as telas):** carrega automaticamente a versão adequada ao seu Papel + Cargo.
   - Ex.: `Vendedor + Closer` vê KPIs de fechamento, pipeline curto, metas de conversão.
   - `Vendedor + Farmer` vê carteira ativa, recompra, NPS.
   - `Diretor` vê consolidado, ranking de equipes, forecast.
   - `Gerente` vê time direto + drill-down.
   - `Marketing` vê funil, campanhas, CAC.
2. **Toggle "Ver como" no header** (ao lado do InstanceSwitcher): lista as personas que o usuário pode assumir. Admin vê todas. Um `Gerente` que também é `Vendedor Closer` pode alternar entre as duas visões.
3. **Admin ganha uma tela nova** para configurar quais variantes existem para cada tela e quem pode ver o quê (sem precisar mexer em código para casos simples de "esconder bloco X do cargo Y").

---

## Estrutura (não-técnica)

- **Papel** já existe: Administrador, Vendedor, Gerente, Diretor, Marketing.
- **Cargo** vira um novo campo no perfil, com valores livres por Papel:
  - Vendedor: `Closer`, `Farmer`, `SDR`, `Hunter`…
  - Gerente: `Regional`, `Nacional`…
  - Diretor: `Comercial`, `Executivo`…
  - Marketing: `Performance`, `Branded`, `Growth`…
  - Administrador: sem cargo (ou "Geral").
- Cada tela declara suas **variantes** (`home.vendedor.closer`, `home.vendedor.farmer`, `home.diretor`, `home.default`) e o resolvedor escolhe a melhor combinação, caindo em `default` quando não houver match.

---

## Escopo desta entrega

1. **Banco**
   - Adicionar coluna `cargo_tipo` em `profiles` (texto livre, opcional — o `cargo` atual já é livre; renomear seria arriscado, então crio um campo dedicado normalizado).
   - Tabela `view_variants`: registro de cada variante disponível (tela + papel + cargo + label).
   - Tabela `user_view_preferences`: guarda a última visão escolhida pelo usuário no toggle.

2. **Camada de resolução (`src/lib/view-resolver.ts`)**
   - Função `resolveVariant(screen, { role, cargo, instance })` que retorna a chave da variante a renderizar, com fallback determinístico:
     `role+cargo+instance` → `role+cargo` → `role` → `default`.
   - Hook `useViewVariant(screen)` que já considera o override do toggle.

3. **Slots reutilizáveis (`src/components/view-slot.tsx`)**
   - `<ViewSlot screen="home" name="hero" variants={{ ... }} />` — recebe um mapa de variantes e renderiza a certa.
   - Layout base da Home fica um só; cada bloco (Hero, KPIs, Ranking, Ações rápidas) é um Slot com N variantes.

4. **Toggle "Ver como" no header**
   - Dropdown ao lado do InstanceSwitcher. Lista as personas permitidas ao usuário (baseado em Papel + acesso admin). Persistido em `user_view_preferences` e refletido em toda a navegação até o usuário voltar para "Automático".

5. **Home refatorada como exemplo completo**
   - Slots: `hero`, `kpis`, `pipeline`, `metas`, `atividades`.
   - Variantes iniciais: `default`, `vendedor.closer`, `vendedor.farmer`, `gerente`, `diretor`, `marketing`.
   - Cada variante é um componente pequeno em `src/components/home/variants/`.

6. **Página Admin: `/admin/visualizacoes`**
   - Lista todas as telas registradas.
   - Para cada tela, mostra as variantes existentes e permite:
     - Ativar/desativar variante.
     - Definir qual variante um Papel+Cargo específico deve ver (override do resolvedor).
   - Não cria variantes novas via UI (isso continua sendo código); só configura o roteamento entre elas.

7. **Documentação curta em `.lovable/plan.md`** explicando como adicionar uma variante nova em 3 passos (criar componente → registrar no mapa do Slot → opcional: cadastrar em `view_variants` para aparecer no admin).

---

## Fora do escopo (fica para depois)

- Migrar todas as telas de uma vez. Faço a Home como referência; as demais migram sob demanda seguindo o padrão.
- Editor visual de variantes (arrastar blocos). O admin só configura roteamento entre variantes já codificadas.
- Versionamento histórico (voltar para "versão de ontem"). É controle de variantes, não de versões no tempo.

---

## Detalhes técnicos

- **Migration:**
  - `ALTER TABLE profiles ADD COLUMN cargo_tipo text;`
  - `CREATE TABLE view_variants (id, screen text, role app_role, cargo text, variant_key text, label text, enabled bool, ...)` + GRANTs + RLS (SELECT para authenticated; INSERT/UPDATE/DELETE só admin via `has_role`).
  - `CREATE TABLE user_view_preferences (user_id, screen, variant_key, ...)` + GRANTs + RLS (usuário mexe só nos próprios).
- **Server fns em `src/lib/views.functions.ts`:**
  - `listVariants()`, `upsertVariantRouting(...)` (admin), `getUserPreference(screen)`, `setUserPreference(screen, key)`.
- **Resolver:** puro TS, sem I/O — recebe contexto e mapa e devolve chave. Testável isolado.
- **Hook `useViewVariant`:** combina `useAuth` (role, cargo_tipo), `useInstance`, `useQuery(getUserPreference)`.
- **`<ViewSlot />`:** props `screen`, `slot`, `variants: Record<string, ReactNode>`, `fallback?: ReactNode`. Sem lógica de negócio.
- **Toggle no header:** componente `ViewAsSwitcher` em `src/components/view-as-switcher.tsx`, ao lado de `InstanceSwitcher` em `app-layout.tsx`.
- **Home:** `src/routes/_authenticated/index.tsx` (ou onde estiver hoje) vira composição de `<ViewSlot />`s. Variantes ficam em `src/components/home/variants/{hero,kpis,pipeline,metas,atividades}/{default,vendedor-closer,...}.tsx`.
- **Admin:** `src/routes/_authenticated/admin.visualizacoes.tsx` com matriz Tela × Papel/Cargo → Variante.

---

## Ordem de execução

1. Migration (cargo_tipo, view_variants, user_view_preferences).
2. Resolver + hook + `<ViewSlot />` + server fns.
3. Refactor da Home em Slots com variantes iniciais.
4. `ViewAsSwitcher` no header.
5. Página admin `/admin/visualizacoes`.
6. Nota curta no plano explicando como replicar em Dashboards/Clientes/etc.