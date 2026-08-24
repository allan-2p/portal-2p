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

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run build:dev` | Build em modo development (usado na validação do preview) |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm test` | Todos os testes |
| `npm run test:rls` | Somente a suíte de políticas RLS |

---

## Variáveis de ambiente

A lista completa e comentada está em [`.env.example`](./.env.example), agrupada por
integração: Supabase, cron/hooks, SAP, Itaú (Pix, Boleto e proxy mTLS), Salesforce,
Fretefy, SharePoint/Graph, consulta CNPJ/CPF e notificações/IA.

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

| Gatilho | Função |
| --- | --- |
| `cron.estoque` | Sincroniza estoque e produtos do SAP |
| `cron.sap-nfs` | Consulta OVs e avança Processando → Separação → Faturado → Coletado |
| `cron.pix-reconsulta` | Reconsulta cobranças Pix pendentes no Itaú |
| `cron.boleto-avisos` | Avisa consultor e cliente sobre boletos |
| `cron.boletos-sharepoint` | Busca os PDFs de boletos a prazo no SharePoint pela NF |
| `sap.sync-produtos` | Varre o preço (VK12, listas 01/02) e ativa/desativa o catálogo: sem preço no SAP não é vendável. Override manual na Gestão de Produtos vence a varredura |
| `sap.ov-criar` | Cria a ordem de venda no SAP (idempotente por proposta, claim atômico) |
| `salesforce.pedido` | Cria/atualiza a Opportunity do pedido |
| `fretefy.oferta-carga` | Cria a oferta de carga ou atualiza a NF da carga |
| `webhook.pix-itau` | Aplica o evento Pix no pedido (pago / expirado / cancelado) |
| `webhook.fretefy` | Aplica o rastreio da entrega (concluída → Entregue) |

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

Sempre que entrar uma nova integração, gatilho, área do portal ou variável de ambiente,
atualize as seções correspondentes (**O que o portal faz**, **Jobs, webhooks e integrações**
e `.env.example`) no mesmo commit da mudança.
