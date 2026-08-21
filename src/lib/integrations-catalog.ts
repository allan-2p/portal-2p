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
    slug: "sap-rfc",
    name: "SAP — RFCs (preços, OV, NFs, clientes)",
    category: "ERP",
    description:
      "Endpoints SOAP usados na simulação de preço, criação/consulta de ordem de venda, notas fiscais e cadastro de clientes.",
    credentials: [
      { env: "SAP_BRIDGE_URL", label: "URL base do SAP Bridge (simulação)", required: true, secret: false },
      { env: "SAP_OV_CRIAR_URL", label: "URL ZNFE_OV_CRIAR", required: true, secret: false },
      { env: "SAP_NFS_URL", label: "URL ZNFE_OV_CONSULTAR (notas fiscais)", required: true, secret: false },
      { env: "SAP_CLIENTES_URL", label: "URL de cadastro de clientes", secret: false },
      { env: "SAP_ZMMR059_URL", label: "URL ZMMR059 (estoque)", secret: false },
      { env: "SAP_ZMMR059_AUTH", label: "Authorization da ZMMR059", secret: true },
      { env: "SAP_BRIDGE_AUTH", label: "Authorization das RFCs", secret: true },
    ],
    note: "Os endpoints são fornecidos pelo time de SAP; o Authorization é o mesmo do SAP Bridge quando não houver um específico.",
  },
  {
    slug: "itau",
    name: "Itaú — Pix e Boleto",
    category: "Pagamentos",
    description: "Emissão e baixa de cobranças Pix e boleto (API de cash management, com mTLS).",
    credentials: [
      { env: "ITAU_API_BASE", label: "URL base da API", required: true, secret: false },
      { env: "ITAU_MTLS_CERT_PEM", label: "Certificado mTLS (PEM)", required: true, secret: true },
      { env: "ITAU_MTLS_KEY_PEM", label: "Chave privada mTLS (PEM)", required: true, secret: true },
      { env: "ITAU_PIX_CLIENT_ID", label: "Client ID (Pix)", required: true, secret: true },
      { env: "ITAU_PIX_CLIENT_SECRET", label: "Client Secret (Pix)", required: true, secret: true },
      { env: "ITAU_PIX_CHAVE", label: "Chave Pix recebedora", required: true, secret: false },
      { env: "ITAU_PIX_WEBHOOK_SECRET", label: "Segredo do webhook Pix", required: true, secret: true },
      { env: "ITAU_BOLETO_CLIENT_ID", label: "Client ID (Boleto)", required: true, secret: true },
      { env: "ITAU_BOLETO_CLIENT_SECRET", label: "Client Secret (Boleto)", required: true, secret: true },
      { env: "ITAU_BOLETO_BENEFICIARIO", label: "Beneficiário", required: true, secret: false },
      { env: "ITAU_BOLETO_CARTEIRA", label: "Carteira", required: true, secret: false },
      { env: "ITAU_BOLETO_AGENCIA", label: "Agência", secret: false },
      { env: "ITAU_BOLETO_CONTA", label: "Conta", secret: false },
    ],
  },
  {
    slug: "fretefy",
    name: "Fretefy",
    category: "Logística",
    description: "Cotação de frete e webhook de rastreio (coleta e entrega) dos pedidos.",
    credentials: [{ env: "FRETEFY_TOKEN", label: "Token da API Fretefy", required: true, secret: true }],
    note: "O mesmo token autentica o webhook de rastreio no header x-fretefy-token.",
  },
  {
    slug: "cron",
    name: "Gatilhos automáticos (cron)",
    category: "Plataforma",
    description: "Segredo que autentica os disparos agendados dos hooks internos (estoque, Pix, NFs, boletos).",
    credentials: [{ env: "CRON_HOOK_SECRET", label: "Segredo dos hooks de cron", required: true, secret: true }],
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
    ],
  },
  {
    slug: "serpro-cnpja",
    name: "Serpro / CNPJá",
    category: "Cadastros",
    description: "Enriquecimento de cadastro de clientes por CNPJ.",
    docsUrl: "https://cnpja.com/api",
    credentials: [
      { env: "CNPJA_API_KEY", label: "API key CNPJá", required: true, secret: true },
      { env: "SERPRO_CONSUMER_KEY", label: "Consumer key Serpro", secret: true },
      { env: "SERPRO_CONSUMER_SECRET", label: "Consumer secret Serpro", secret: true },
    ],
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
    credentials: [],
    note: "Gerenciado pela plataforma — não exige credencial própria.",
  },
  {
    slug: "mcp",
    name: "Servidor MCP",
    category: "Plataforma",
    description: "Endpoint /mcp para agentes externos consultarem o portal.",
    credentials: [],
    note: "Autenticação via OAuth da plataforma — sem chave dedicada.",
  },
];

export function integrationBySlug(slug: string): IntegrationDef | undefined {
  return INTEGRATIONS.find((i) => i.slug === slug);
}
