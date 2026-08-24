# Portal 2P

Portal comercial do **Grupo 2P** (2P Energia Solar e 2P Carregadores): plataforma web
única para consultores e back-office cotarem, fecharem e acompanharem pedidos, com
integração ponta a ponta ao SAP, Salesforce, Itaú (Pix/Boleto), Fretefy e SharePoint.

- **App publicado:** https://portal-2p.lovable.app
- **Domínio próprio:** https://portal.2pgroup.app

---

## O que o portal faz

| Área | Recursos |
| --- | --- |
| **Solar** | Calculadora de proposta (módulos, microinversores, trilhos, suportes, kit parafuso), quantificador, precificação por tabela, prévia e PDF da proposta, checkout completo |
| **Carregadores** | Catálogo de produtos, propostas, metas, comissões, auditoria de recálculo, tarefas |
| **Clientes** | Cadastro com enriquecimento por CNPJ/CPF, consultor obrigatório, finalidade de uso, cadastro automático no SAP (`ZHDIT_CLIENTES_CADASTRO`) |
| **Pedidos** | Ordem de venda no SAP (simular/criar/consultar), evolução de status, NF, DANFE, XML e boleto sob demanda |
| **Pagamentos** | Pix e Boleto Itaú (mesma API de cobrança, via proxy mTLS), QR Code + copia e cola, reenvio manual, PDF do boleto, financiamento |
| **Logística** | Cotação de frete por peso SAP, regras de frete (inclusive área rural / frete grátis), oferta de carga e rastreio Fretefy |
| **Salesforce** | Sincronização de Account e Opportunity com mapeamento de campos configurável e máquina de estágios |
| **Admin** | Perfis e permissões, produtos e tabelas, metas, estoque, moderação, logs (SAP, integrações, gatilhos, retenção), painéis de integração e diagnóstico |
| **Atlas** | Assistente de IA do consultor: insights de carteira, projeção vs. realizado, planos de ação |

---

## Stack

- **Framework:** TanStack Start v1 (React 19 + Vite 7), SSR em runtime edge
- **Rotas:** TanStack Router com file routes em `src/routes`
- **Dados:** TanStack Query + server functions (`createServerFn`)
- **Backend:** Supabase (`grupo-2p`) — Postgres, Auth, Storage, RLS, `pg_cron`, `pg_net`, Vault
- **UI:** Tailwind CSS v4 + shadcn/ui (Radix) + Recharts + Sonner
- **Testes:** Vitest (`tests/`, incluindo suíte de RLS)

---

## Estrutura

```text
src/
  routes/
    _authenticated/       páginas autenticadas (solar.*, carregadores.*, admin.*, financeiro.*, marketing.*)
    api/public/hooks/     webhooks e endpoints de cron (sem auth de site, autenticados por segredo)
    __root.tsx            layout raiz, head e providers
  lib/
    *.functions.ts        server functions chamadas pelo cliente
    *.server.ts           código exclusivo de servidor (SAP, Itaú, Salesforce, Fretefy, SharePoint)
    *.ts                  regras puras e helpers compartilhados (calculadora, PDFs, mapeamentos)
  components/             componentes de UI e painéis de negócio
  integrations/supabase/  clientes gerados (não editar)
supabase/migrations/      histórico de migrações do banco
docs/sap/                 envelopes SOAP de referência (SIMULAR, CRIAR, CONSULTAR)
docs/migracao/            SQL de setup do projeto Supabase (extensões, Vault, cron, buckets)
tests/                    testes unitários e de RLS
```

### Rotas do app

<!-- readme:rotas -->
73 páginas autenticadas em `src/routes/_authenticated` (file routes do TanStack Router).

| Área | Páginas | Rotas |
| --- | --- | --- |
| **admin** | 28 | `/admin/atividade`, `/admin/auditoria`, `/admin/comissoes`, `/admin/configuracoes`, `/admin/estoque`, `/admin/frete-regras`, `/admin`, `/admin/integracoes`, `/admin/integracoes/$slug`, `/admin/logs/gatilhos`, `/admin/logs`, `/admin/logs/integracoes`, `/admin/logs/moderacao`, `/admin/logs/retencao`, `/admin/logs/sap`, `/admin/metas`, `/admin/microinversores-solar`, `/admin/moderacao`, `/admin/modulos-solar`, `/admin/perfis`, `/admin/produtos`, `/admin/produtos-solar`, `/admin/regras`, `/admin/suportes-solar`, `/admin/tabelas`, `/admin/trilhos-solar`, `/admin/usuarios`, `/admin/vinculos` |
| **carregadores** | 16 | `/carregadores/clientes`, `/carregadores/clientes/cadastros`, `/carregadores/clientes`, `/carregadores/comissoes`, `/carregadores/frete-regras`, `/carregadores`, `/carregadores/metas`, `/carregadores/pedidos`, `/carregadores/produtos`, `/carregadores/propostas`, `/carregadores/propostas/auditoria`, `/carregadores/propostas`, `/carregadores/propostas/nova`, `/carregadores/propostas/visualizar`, `/carregadores/regras`, `/carregadores/tarefas` |
| **raiz** | 4 | `/financeiro`, `/index`, `/marketing`, `/perfil` |
| **financeiro** | 3 | `/financeiro/condicoes`, `/financeiro/credito`, `/financeiro` |
| **marketing** | 8 | `/marketing/cac`, `/marketing/cohort`, `/marketing/gargalo`, `/marketing`, `/marketing/metas`, `/marketing/pre-vendas`, `/marketing/social`, `/marketing/trafego` |
| **solar** | 14 | `/solar/atlas`, `/solar/clientes`, `/solar/clientes/cadastros`, `/solar/clientes/perfil`, `/solar/clientes/ranking`, `/solar/clientes/segmentacao`, `/solar/clientes/sugestoes`, `/solar/cupons`, `/solar/dashboards`, `/solar/dashboards/metas`, `/solar/pedidos`, `/solar/propostas`, `/solar/propostas/nova`, `/solar/tarefas` |
<!-- /readme:rotas -->

### Convenções importantes

- Server functions ficam em arquivos **finos**: só imports, tipos e a declaração exportada.
  Qualquer helper de runtime vai para um módulo importado.
- Módulos `*.server.ts` nunca são importados por componentes; o acesso é sempre via `*.functions.ts`.
- Cores, sombras e gradientes vêm de tokens semânticos em `src/styles.css` — nunca cores fixas nos componentes.
- Nunca editar `src/routeTree.gen.ts` nem os arquivos gerados em `src/integrations/supabase/`.

---

## Rodando localmente

Requisitos: Node.js 20+ (ou Bun) e acesso às variáveis de ambiente.

```sh
git clone <repo-url>
cd portal-2p
npm install
cp .env.example .env    # preencha os valores
npm run dev             # http://localhost:8080
```

Scripts:

<!-- readme:scripts -->
| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento (http://localhost:8080) |
| `npm run build` | Build de produção |
| `npm run build:dev` | Build em modo development (validação do preview) |
| `npm run preview` | Serve o build localmente |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm run test:rls` | Somente a suíte de políticas RLS |
| `npm run test` | Todos os testes (Vitest) |
| `npm run readme:sync` | Regenera as seções automáticas deste README |
| `npm run readme:check` | Falha se o README estiver desatualizado em relação ao código |
<!-- /readme:scripts -->

---

## Variáveis de ambiente

<!-- readme:env -->
Fonte da verdade: [`.env.example`](./.env.example) — 70 variáveis, sendo 2 pública(s) no client (`VITE_*`).

| Grupo | Variáveis |
| --- | --- |
| **Supabase (grupo-2p)** | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GRUPO2P_SUPABASE_URL`, `GRUPO2P_SUPABASE_KEY`, `GRUPO2P_SUPABASE_SERVICE_ROLE_KEY`, `ACCOUNTS_SOLAR_SUPABASE_URL`, `ACCOUNTS_SOLAR_SUPABASE_KEY`, `ACCOUNTS_CARREGADORES_SUPABASE_KEY` |
| **Cron / hooks públicos** | `CRON_HOOK_SECRET`, `CRON_HOOK_SECRET_V2` |
| **SAP** | `SAP_BRIDGE_URL`, `SAP_BRIDGE_USER`, `SAP_BRIDGE_PASSWORD`, `SAP_BRIDGE_AUTH`, `SAP_RFC_URL`, `SAP_RFC_TOKEN`, `SAP_SIMULAR_URL`, `SAP_OV_CRIAR_URL`, `SAP_OV_AUTH`, `SAP_OV_FILIAL`, `SAP_OV_TESTRUN`, `SAP_VALOR_PROD_CARREGADORES`, `SAP_OV_ZTERM_VISTA`, `SAP_OV_ZTERM_PIX`, `SAP_OV_ZTERM_CARTAO`, `SAP_CLIENTES_URL`, `SAP_CLIENTES_AUTH`, `SAP_NFS_URL`, `SAP_NFS_AUTH`, `SAP_ZMMR059_URL`, `SAP_ZMMR059_AUTH`, `SAP_FILIAIS` |
| **Itaú (Pix + Boleto, via proxy mTLS)** | `ITAU_API_BASE`, `ITAU_TOKEN_URL`, `ITAU_PIX_API_BASE`, `ITAU_PIX_CLIENT_ID`, `ITAU_PIX_CLIENT_SECRET`, `ITAU_PIX_CHAVE`, `ITAU_PIX_EXPIRACAO_SEG`, `ITAU_PIX_WEBHOOK_SECRET`, `ITAU_PIX_WEBHOOK_HMAC_SECRET`, `ITAU_BOLETO_CLIENT_ID`, `ITAU_BOLETO_CLIENT_SECRET`, `ITAU_BOLETO_AGENCIA`, `ITAU_BOLETO_CONTA`, `ITAU_BOLETO_CARTEIRA`, `ITAU_BOLETO_BENEFICIARIO`, `ITAU_BOLETO_DIAS_EXPIRACAO`, `ITAU_PROXY_URL`, `ITAU_PROXY_SECRET`, `ITAU_MTLS_CERT_PEM`, `ITAU_MTLS_KEY_PEM`, `ITAU_MTLS_KEY_PASSPHRASE` |
| **Salesforce** | `SALESFORCE_API_KEY` |
| **Fretefy** | `FRETEFY_TOKEN` |
| **SharePoint / Microsoft Graph (boletos a prazo)** | `SHAREPOINT_TENANT_ID`, `SHAREPOINT_CLIENT_ID`, `SHAREPOINT_CLIENT_SECRET`, `SHAREPOINT_SITE_HOSTNAME`, `SHAREPOINT_SITE_PATH`, `SHAREPOINT_BOLETOS_PASTA` |
| **Consulta de CNPJ / CPF** | `CNPJA_API_KEY`, `SERPRO_CONSUMER_KEY`, `SERPRO_CONSUMER_SECRET` |
| **Notificações / IA** | `KIT_NOTIFICACAO_EMAIL`, `LOVABLE_API_KEY`, `LOVABLE_SEND_URL` |
<!-- /readme:env -->

Regras:

- `VITE_*` é público (client). Todo o resto é **server-only** e deve ser lido dentro do
  `.handler()` da server function, nunca no escopo do módulo.
- `CRON_HOOK_SECRET` precisa ter o **mesmo valor** do segredo `cron_hook_secret` no Vault do Supabase.
- Nenhum valor real vai para o Git — `.env` e `.env.*` estão no `.gitignore`.

---

## Jobs, webhooks e integrações

Endpoints públicos ficam em `src/routes/api/public/hooks/` e exigem o header
`x-cron-secret` (webhooks de terceiros validam assinatura própria). Cada disparo é
registrado em `job_runs` e pode ser reprocessado na tela de monitoramento — o
reprocessamento usa exatamente o mesmo executor do disparo original
(`src/lib/jobs-registry.server.ts`).

<!-- readme:jobs -->
| Gatilho | Nome | O que faz | Reprocessável |
| --- | --- | --- | --- |
| `checkout.finalizar` | Checkout • Finalizar pedido | Conclusão do pedido pelo vendedor (etapa 4). | não |
| `sap.ov-criar` | SAP • Criar ordem de venda | Envia o pedido concluído ao SAP (ZNFE_OV_CRIAR) e grava o nº da ordem. | sim |
| `salesforce.pedido` | Salesforce • Enviar pedido | Cria/atualiza a oportunidade do pedido no Salesforce. | sim |
| `cron.sap-nfs` | Cron • Notas fiscais (SAP) | Consulta o SAP e move Processando → Separação → Faturado. | sim |
| `cron.pagamento-link` | Cron • Pagamento (boleto Itaú) | Verifica a liquidação do boleto e libera o pedido. | sim |
| `cron.estoque` | Cron • Estoque (SAP) | Sincroniza estoque, containers e produtos com o SAP a cada 6h. | sim |
| `sap.sync-produtos` | SAP • Catálogo vendável (preço VK12) | Simula preço no SAP e ativa/desativa os materiais: sem preço não entra em proposta nem na calculadora. | sim |
| `cron.pix-reconsulta` | Cron • Reconsulta Pix (Itaú) | Consulta no Itaú as cobranças Pix pendentes (fallback do webhook). | sim |
| `cron.boletos-sharepoint` | Cron • Boletos a prazo (SharePoint) | Busca os PDFs dos boletos a prazo pela NF, guarda no portal e avisa o cliente. | sim |
| `cron.boleto-avisos` | Cron • Avisos de boleto | Avisa consultor e cliente sobre boletos vencendo ou vencidos. | sim |
| `webhook.pix-itau` | Webhook • Pix (Itaú) | Notificação do PSP: cobrança paga, expirada, removida ou devolvida. | sim |
| `webhook.fretefy` | Webhook • Fretefy (rastreio) | Retorno de coleta/entrega enviado pela Fretefy. | sim |
| `fretefy.oferta-carga` | Fretefy • Oferta de carga | Cria a oferta de carga após a OV (frete CIF/dedicado) e atualiza a NF no faturamento. | sim |
| `nf.documento` | NF • Download de documento | Abertura da DANFE, do XML da NF-e ou do boleto pelo usuário (auditoria de acesso). | não |

Endpoints públicos (exigem `x-cron-secret`, exceto webhooks com assinatura própria):

- `/api/public/app-version`
- `/api/public/hooks/boleto-avisos`
- `/api/public/hooks/boletos-sharepoint`
- `/api/public/hooks/estoque-sync`
- `/api/public/hooks/fretefy-tracking`
- `/api/public/hooks/itau-diagnostico`
- `/api/public/hooks/pagamento-link`
- `/api/public/hooks/pix-itau`
- `/api/public/hooks/pix-itau/*`
- `/api/public/hooks/pix-reconsulta`
- `/api/public/hooks/sap-catalogo-vendaveis`
- `/api/public/hooks/sap-nfs`
<!-- /readme:jobs -->

O agendamento (`pg_cron`) chama os hooks pela função `public.portal_cron_post(path, body)`,
que lê `site_url` e `cron_hook_secret` do Vault. O SQL de referência está em
`docs/migracao/setup-novo-projeto.sql`.

---

## Banco de dados e segurança

- Toda tabela em `public` tem RLS habilitada, políticas explícitas e `GRANT` para os papéis usados.
- Papéis/permissões ficam em tabela separada, consultada por função `security definer` — nunca no perfil do usuário.
- Segredos operacionais do banco ficam no **Vault** do Supabase, não em código.
- Alterações de schema sempre por migração em `supabase/migrations/`.

---

## Manutenção deste README

As seções **Scripts**, **Variáveis de ambiente**, **Rotas do app** e **Jobs, webhooks e
integrações** são geradas a partir do próprio código (`package.json`, `.env.example`,
`src/lib/job-runs.server.ts`, `src/routes`). Não edite o conteúdo entre os marcadores
`<!-- readme:* -->` — rode:

```sh
npm run readme:sync    # regenera as seções automáticas
npm run readme:check   # falha se o README estiver desatualizado
```

O `readme:check` roda junto com `npm test` (`tests/readme-sync.test.ts`), então qualquer
mudança em script, variável, gatilho ou rota quebra os testes até o README ser regenerado.
Para regenerar automaticamente antes de cada commit local:

```sh
node scripts/install-git-hooks.mjs
```

O texto fora dos marcadores (visão geral, stack, convenções, banco) continua manual:
atualize-o no mesmo commit quando entrar uma nova área ou integração.

---

## Histórico de versões

Mudanças relevantes do app e do banco ficam em [`CHANGELOG.md`](./CHANGELOG.md)
(Keep a Changelog + SemVer): registre a alteração em `[Não publicado]` no mesmo commit e,
ao publicar, promova o bloco para `[X.Y.Z] - AAAA-MM-DD` e atualize `version` no `package.json`.
