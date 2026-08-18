/**
 * Catálogo das integrações do Portal 2P.
 *
 * Cada integração tem um slug (usado na URL /integracoes/<slug> e no health
 * check) e a lista de credenciais que precisa para funcionar. Valores de
 * credenciais secretas nunca são expostos — a página mostra apenas se estão
 * configuradas.
 */

export type IntegrationCredential = {
  /** Nome da variável de ambiente no backend. */
  env: string;
  label: string;
  required?: boolean;
  /** true = valor secreto (nunca exibido); false = valor público, pode aparecer. */
  secret?: boolean;
  help?: string;
};

export type IntegrationDef = {
  slug: string;
  name: string;
  category: string;
  description: string;
  docsUrl?: string;
  credentials: IntegrationCredential[];
  /** Observação exibida na página de configuração. */
  note?: string;
};

export const INTEGRATIONS: IntegrationDef[] = [
  {
    slug: "clientes-cadastro",
    name: "Cadastro de clientes (banco)",
    category: "Cadastros",
    description:
      "Gravação do cadastro na tabela clientes do Grupo 2P. Registra criação, atualização e qualquer erro de banco.",
    credentials: [],
    note: "Erros aqui indicam falha no banco (permissão, coluna ausente, duplicidade) antes do envio ao SAP/Salesforce.",
  },
  {
    slug: "sap-clientes",
    name: "SAP — Cadastro de clientes",
    category: "ERP",
    description: "Envio do cadastro ao SAP e retorno do código KUNNR, com payload e erro de cada tentativa.",
    credentials: [],
  },
  {
    slug: "salesforce-clientes",
    name: "Salesforce — Contas e contatos",
    category: "CRM",
    description: "Criação/atualização de Account e Contact a partir do cadastro de clientes.",
    credentials: [],
  },

  {
    slug: "salesforce",
    name: "Salesforce",
    category: "CRM",
    description: "Contas, oportunidades, tarefas e casos da org Salesforce do Grupo 2P.",
    docsUrl: "https://developer.salesforce.com/docs",
    credentials: [
      { env: "SALESFORCE_API_KEY", label: "Chave da conexão Salesforce", required: true, secret: true },
      { env: "LOVABLE_API_KEY", label: "Chave do gateway (fornecida pela plataforma)", required: true, secret: true },
    ],
    note: "A conexão é gerenciada pelo conector da plataforma. Use o teste abaixo para validar o vínculo.",
  },
  {
    slug: "sap",
    name: "SAP",
    category: "ERP",
    description: "Sincronização de produtos (listar_material) via SAP Bridge.",
    credentials: [
      { env: "SAP_BRIDGE_URL", label: "URL do SAP Bridge", required: true, secret: false },
      { env: "SAP_BRIDGE_AUTH", label: "Authorization pronto (alternativa a usuário/senha)", secret: true },
      { env: "SAP_BRIDGE_USER", label: "Usuário", secret: false },
      { env: "SAP_BRIDGE_PASSWORD", label: "Senha", secret: true },
    ],
    note: "Informe SAP_BRIDGE_AUTH ou o par usuário/senha.",
  },
  {
    slug: "metricool",
    name: "Metricool",
    category: "Marketing",
    description: "Métricas de redes sociais e mídia paga por organização.",
    docsUrl: "https://app.metricool.com",
    credentials: [
      { env: "METRICOOL_USER_TOKEN", label: "User token", required: true, secret: true },
      { env: "METRICOOL_USER_ID", label: "User ID", required: true, secret: false },
    ],
  },
  {
    slug: "notion",
    name: "Notion",
    category: "Marketing",
    description: "Calendário editorial de Social Mídia.",
    docsUrl: "https://developers.notion.com",
    credentials: [
      { env: "NOTION_API_KEY", label: "Integration token", required: true, secret: true },
      { env: "NOTION_CALENDAR_DB_ID", label: "ID do banco do calendário", secret: false },
    ],
  },
  {
    slug: "serpro-cnpja",
    name: "Serpro / CNPJá",
    category: "Cadastros",
    description: "Enriquecimento de cadastro de clientes por CNPJ.",
    docsUrl: "https://cnpja.com/api",
    credentials: [{ env: "CNPJA_API_KEY", label: "API key CNPJá", required: true, secret: true }],
  },
  {
    slug: "viacep",
    name: "ViaCEP",
    category: "Cadastros",
    description: "Preenchimento automático de endereço a partir do CEP.",
    docsUrl: "https://viacep.com.br",
    credentials: [],
    note: "Serviço público — não exige credenciais.",
  },
  {
    slug: "base-contas-carregadores",
    name: "Base do Grupo 2P",
    category: "Dados e Arquivos",
    description: "Banco único do Grupo 2P: contas/oportunidades do Salesforce, clientes e leads (Solar e Carregadores).",
    credentials: [
      { env: "GRUPO2P_SUPABASE_URL", label: "URL do banco do Grupo 2P", required: true, secret: false },
      { env: "GRUPO2P_SUPABASE_SERVICE_ROLE_KEY", label: "Chave de serviço do Grupo 2P", required: true, secret: true },
    ],
  },
  {
    slug: "top20",
    name: "Top 20",
    category: "Dados e Arquivos",
    description: "Upload do CSV de faturamento usado no Ranking de Clientes.",
    credentials: [],
    note: "Usa o Storage da plataforma (bucket top20). Sem credenciais externas.",
  },
  {
    slug: "storage",
    name: "Storage — Top 20 / Logos",
    category: "Dados e Arquivos",
    description: "Armazenamento de arquivos do portal.",
    credentials: [],
    note: "Gerenciado pela plataforma.",
  },
  {
    slug: "lovable-cloud",
    name: "Lovable Cloud",
    category: "Plataforma",
    description: "Banco de dados, autenticação e funções do portal.",
    credentials: [
      { env: "SUPABASE_URL", label: "URL do backend", required: true, secret: false },
      { env: "SUPABASE_SERVICE_ROLE_KEY", label: "Chave de serviço", required: true, secret: true },
    ],
    note: "Credenciais gerenciadas automaticamente pela plataforma.",
  },
  {
    slug: "lovable-ai",
    name: "Lovable AI (Atlas)",
    category: "Plataforma",
    description: "Modelos de IA usados no Atlas e nas Sugestões.",
    credentials: [{ env: "LOVABLE_API_KEY", label: "Chave do gateway de IA", required: true, secret: true }],
  },
  {
    slug: "emails",
    name: "E-mails transacionais",
    category: "Plataforma",
    description: "Envio de e-mails do portal (avisos, autenticação).",
    credentials: [{ env: "RESEND_API_KEY", label: "API key do provedor de e-mail", secret: true }],
  },
  {
    slug: "mcp",
    name: "Servidor MCP",
    category: "Plataforma",
    description: "Endpoint /mcp para agentes externos consultarem o portal.",
    credentials: [{ env: "MCP_API_KEY", label: "Chave de acesso ao MCP", secret: true }],
  },
];

export function integrationBySlug(slug: string): IntegrationDef | undefined {
  return INTEGRATIONS.find((i) => i.slug === slug);
}
