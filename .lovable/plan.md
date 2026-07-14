# Auditoria de Performance — Portal 2P

Auditoria feita com base em `package.json`, `src/routes/**`, `src/components/**`, `src/lib/**` e configuração TanStack Start/Router/Query.

## Diagnóstico (o que é real e o que já está bom)

**Já bem-feito** (não vou mexer):
- TanStack Router com code-splitting automático por rota (`autoCodeSplitting`).
- Todas as `useQuery` do dashboard e da TV usam `staleTime` (60s–5min) e `refetchOnWindowFocus:false`.
- Consultas Supabase usam colunas explícitas — não encontrei `select("*")` além de 1 caso legítimo (perfil por id) em `use-auth.ts`.
- SOQL do Salesforce usa listas de colunas nomeadas + `LIMIT`.
- Fontes web via `@fontsource` com preload dos .woff2 em `__root.tsx`.
- Auth com store externo (`useSyncExternalStore`) — sem waterfalls.

## Gargalos encontrados

| # | Gargalo | Arquivo | Gravidade | Alteração | Risco | Ganho esperado |
|---|---|---|---|---|---|---|
| 1 | `recharts` (~90 KB gz) importado estaticamente no dashboard principal, entra no bundle inicial da rota `/` | `src/routes/_authenticated/index.tsx` (linha 7) | **Crítica** | Trocar por `React.lazy` + `Suspense` nos blocos de AreaChart; skeleton do tamanho do gráfico | Baixo — mesma API, mesmo visual | −70/90 KB gz na home; melhora LCP/TBT |
| 2 | `framer-motion` (~40 KB gz) importado nos splash/auth (páginas raramente vistas quando logado, mas carregadas na 1ª visita) | `src/routes/auth.tsx`, `src/components/login-splash.tsx` | Alta | Manter em auth (é first paint dessa rota) mas garantir que não entra em rotas autenticadas — verificar árvore de imports; se limpar, nada a fazer | Baixo | Confirmar isolamento |
| 3 | `getSalesforceSalespeople` refeito com `staleTime: 5min` mas key sem `ownerParam` — ok; porém `mock-data` importado no dashboard traz dados não usados em runtime real | `src/routes/_authenticated/index.tsx:6` | Média | Remover imports não utilizados de `mock-data` da home (se não usados após render real) | Baixo | −alguns KB, menos parse |
| 4 | `admin.tabelas.tsx` com 2053 linhas e `usuarios.tsx` com 1022 linhas — rotas admin pesadas ficam no chunk da rota (ok pelo split), mas dentro delas há listas sem virtualização | `admin.tabelas.tsx`, `usuarios.tsx` | Alta | Paginação client-side já existe? Se não, adicionar limit + paginação visual (mantendo UI). Virtualização só se >200 linhas simultâneas | Médio (mudança comportamental sutil) | Menos DOM, INP menor |
| 5 | `useAuth` faz `getUser()` + 2 queries antes de qualquer render autenticado; `onAuthStateChange` também dispara `loadFor` em cada `USER_UPDATED` | `src/hooks/use-auth.ts` | Média | Usar `getSession()` (síncrono do storage) em vez de `getUser()` (round-trip) para hidratar mais rápido; deduplicar `loadFor` concorrentes | Baixo | TTFB perceptivo do gate `_authenticated` cai |
| 6 | `queryClient.clear()` em cada `SIGNED_IN`/`USER_UPDATED` no `__root.tsx` — inclui hidratações normais, invalidando cache válido | `src/routes/__root.tsx` (RootComponent) | Média | Só limpar em `SIGNED_OUT`; em `SIGNED_IN` só se `user.id` mudou | Baixo | Menos refetches após navegação/refresh |
| 7 | Ícones `lucide-react` importados individualmente ✓; nenhum `import * as`. Nada a fazer. | — | — | — | — | — |
| 8 | `recharts` também usado em `atlas-panel`, `goals-panel`, `dashboards.tsx`, várias `marketing.*` — cada uma paga o chunk. Como já split por rota, aceitável. Só otimizar a home (crítica). | — | Baixa | Nenhuma ação | — | — |
| 9 | Imagens: verificar `<img>` sem `width/height` e sem `loading="lazy"` abaixo da dobra (avatares em listas de usuários / notificações) | `notifications-dropdown.tsx`, `usuarios.tsx`, `app-layout.tsx` | Média | Adicionar `width`, `height`, `loading="lazy"`, `decoding="async"` nas `<img>` abaixo da dobra | Nenhum | Menos CLS, menos trabalho de decode |
| 10 | Prefetch agressivo: `defaultPreload:"intent"` com `defaultPreloadDelay:40ms` — bom, mantém |  `src/router.tsx` | — | Manter | — | — |
| 11 | `useIdleSignout` roda no root — verificar se listeners são passivos | `src/hooks/use-idle-signout.ts` | Baixa | Confirmar `{ passive: true }` nos listeners de scroll/mouse | Baixo | INP marginal |

## O que NÃO vou fazer (fora de escopo ou sem evidência)

- Não vou reescrever componentes que funcionam.
- Não vou trocar bibliotecas (recharts, framer-motion) — apenas atrasar seu carregamento.
- Não vou tocar em autenticação, RLS, permissões, integrações Salesforce, edge functions.
- Não vou mudar layout, cores, fontes, animações visíveis, ou comportamento de filtros.
- Não vou adicionar virtualização em listas < 200 linhas (custo/benefício ruim, muda semântica de rolagem).

## Ordem de implementação (críticas → altas → médias)

1. **Lazy load do `recharts` na home** (`_authenticated/index.tsx`) — maior ganho, isolado.
2. **Ajuste no `queryClient.clear()`** — só em SIGNED_OUT ou mudança real de usuário.
3. **`useAuth` usar `getSession()` primeiro** para hidratar sem round-trip; manter `getUser()` como validação em background.
4. **Remover imports de `mock-data` não usados** na home (se realmente órfãos após inspeção).
5. **Atributos de imagem** (`width/height/loading/decoding`) em `<img>` de avatar em listas.
6. **Confirmar listeners passivos** em `use-idle-signout`.

## Validação após cada alteração

- Rota `/auth`: fluxo de login (Google + email/senha) inalterado.
- `_authenticated/index`: dashboard carrega com gráficos, filtros de vendedor, metas, tarefas.
- `_authenticated/usuarios` e `admin.*`: CRUD e permissões intactos.
- Integrações Salesforce: consultas Home, Marketing, Pedidos, Clientes retornam dados.
- TV: `/tv-geral` continua centralizado (não vou tocar).
- Build/typecheck limpos.

## Notas técnicas

- Lazy do recharts será feito por um único `React.lazy(() => import('recharts'))` empacotando `AreaChart`, `Area`, `CartesianGrid`, `ResponsiveContainer`, `Tooltip`, `XAxis`, `YAxis` num sub-componente `<HomeAreaChart />`, envolvido por `<Suspense fallback={<div className="h-[...]" />}>` com skeleton do tamanho exato para evitar CLS.
- `queryClient.clear()` será substituído por `removeQueries`/`clear` só quando `event === "SIGNED_OUT"` **ou** `session?.user?.id !== prevUserId`.
- Nenhuma dependência nova; sem mudança de schema, RLS, ou variáveis de ambiente.
