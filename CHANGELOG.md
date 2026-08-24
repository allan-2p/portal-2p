# Changelog

Todas as mudanças relevantes do **Portal 2P** são registradas aqui.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e
versionamento em [Semantic Versioning](https://semver.org/lang/pt-BR/).

## Como versionar

| Parte | Quando incrementar |
| --- | --- |
| **MAJOR** (`2.0.0`) | Quebra de compatibilidade: troca de backend/integração, remoção de área ou rota, mudança de contrato de webhook/API pública, migração destrutiva de banco |
| **MINOR** (`1.1.0`) | Nova funcionalidade compatível: nova área/tela, nova integração, novo job/cron, novos campos e tabelas |
| **PATCH** (`1.0.1`) | Correção de bug, ajuste de cálculo/layout/PDF, ajuste de payload de integração, performance |

Seções permitidas em cada versão: `Adicionado`, `Alterado`, `Corrigido`, `Removido`,
`Banco de dados`, `Integrações`, `Segurança`.

## Como atualizar este arquivo

1. Toda mudança relevante entra em **`[Não publicado]`** no mesmo commit da alteração —
   uma linha por mudança, em linguagem de negócio (o que muda para quem usa), não em
   nomes de arquivo.
2. Mudança de banco entra em **`Banco de dados`** citando a migração
   (`supabase/migrations/<timestamp>_*.sql`), a tabela/coluna afetada e se exige
   backfill, novo `GRANT`/RLS ou passo manual (Vault, `cron.schedule`, bucket).
3. Mudança de variável de ambiente, script, rota ou gatilho: registre aqui **e** rode
   `npm run readme:sync` (o README tem essas seções geradas do código).
4. Ao publicar, renomeie `[Não publicado]` para `[X.Y.Z] - AAAA-MM-DD`, atualize
   `version` no `package.json` e abra um novo `[Não publicado]` vazio no topo.
5. Nada de segredo, token, certificado, URL interna com credencial ou dado de cliente
   neste arquivo.

---

## [Não publicado]

_Sem mudanças registradas._

---

## [1.0.0] - 2026-08-24

Primeira versão consolidada do portal em produção (`portal.2pgroup.app`).

### Adicionado

- **Solar:** calculadora de proposta (módulos, microinversores, trilhos, suportes, kit
  parafuso), quantificador, precificação por tabela, prévia em tempo real, PDF com
  cabeçalho premium e checkout completo com cadastro automático de cliente no SAP.
- **Carregadores:** catálogo, propostas, metas, comissões, auditoria de recálculo e tarefas.
- **Clientes:** cadastro com enriquecimento por CNPJ/CPF, consultor obrigatório,
  finalidade de uso e modal de visualização completa.
- **Pedidos:** ordem de venda no SAP (simular/criar/consultar) com claim atômico e
  auto-recuperação, evolução de status e abertura de NF (DANFE, XML e boleto sob demanda).
- **Pagamentos:** Pix e Boleto Itaú via proxy mTLS, QR Code e copia e cola na proposta,
  reenvio manual, PDF do boleto e opção de financiamento.
- **Logística:** cotação de frete por peso SAP, regras de frete (área rural, frete grátis),
  oferta de carga automática e rastreio Fretefy.
- **Salesforce:** sincronização de Account e Opportunity com mapeamento de campos
  configurável e máquina de estágios.
- **Admin:** perfis e permissões, produtos e tabelas, estoque, moderação, logs
  (SAP, integrações, gatilhos, retenção) e painéis de integração com diagnóstico.
- **Atlas:** assistente de IA do consultor (insights de carteira, projeção vs. realizado).
- **Automação:** jobs e webhooks registrados em `job_runs`, reprocessáveis pelo mesmo
  executor, agendados por `pg_cron` via `public.portal_cron_post`.
- **Documentação:** README com seções geradas do próprio código
  (`npm run readme:sync` / `readme:check`).

### Banco de dados

- 164 migrações em `supabase/migrations/` com RLS habilitada, políticas explícitas e
  `GRANT` por papel em todas as tabelas de `public`.
- Papéis e permissões em tabela separada, consultados por função `security definer`.
- Segredos operacionais no Vault (`cron_hook_secret`, `site_url`) e buckets de Storage
  criados pelo SQL de setup (`docs/migracao/setup-novo-projeto.sql`).

### Integrações

- SAP (ordem de venda, clientes, NFs, estoque, catálogo vendável por preço VK12),
  Itaú (Pix/Boleto), Salesforce, Fretefy, SharePoint/Graph, consulta CNPJ/CPF.
