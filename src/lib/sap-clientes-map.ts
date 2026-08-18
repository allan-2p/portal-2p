/**
 * De-para entre o cadastro do portal e os campos esperados pela RFC
 * `ZHDIT_CLIENTES_CADASTRO` do SAP. Módulo puro (sem I/O) para poder ser
 * testado e importado tanto do servidor quanto de código cliente.
 */

export const FINALIDADES = ["Revenda", "Industrialização", "Uso e Consumo"] as const;
export type Finalidade = (typeof FINALIDADES)[number];

/** Tabelas de preço do SAP (PLTYP). */
export const TABELAS_PRECO = [
  { codigo: "2P-0001", label: "2P-0001 — Tabela padrão" },
  { codigo: "2P-0002", label: "2P-0002 — Tabela especial" },
] as const;

/** CFOP de cadastro (CFOPC) conforme a finalidade da mercadoria. */
export const CFOPC_POR_FINALIDADE: Record<Finalidade, string> = {
  Revenda: "1",
  "Industrialização": "2",
  "Uso e Consumo": "3",
};

/** Categoria de contribuinte do ICMS (ICMSTAXPAY). */
export function icmsTaxPay(contribuinte: boolean, ie: string | null | undefined): string {
  if (!contribuinte) return "9"; // não contribuinte
  return ie && ie.trim() ? "1" : "2"; // contribuinte com IE / contribuinte isento
}

export type ClienteSapInput = {
  doc: string;
  razao_social: string;
  nome_fantasia?: string | null;
  ie?: string | null;
  suframa?: string | null;
  contribuinte: boolean;
  finalidade?: string | null;
  tabela_preco?: string | null;
  condicao_pgto_sap?: string | null;
  email?: string | null;
  telefone?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf: string;
  municipio_ibge?: string | null;
  vendedor_sap?: string | null;
  /** KUNNR já existente: quando presente, o SAP atualiza em vez de criar. */
  numero_sap?: string | null;
};

const so = (v: unknown) => String(v ?? "").trim();
const digitos = (v: unknown) => so(v).replace(/\D/g, "");

/** Lista de pares Atributo/Valor enviados no `i_t_param` da RFC. */
export function mapClienteParaSap(c: ClienteSapInput): Array<{ atributo: string; valor: string }> {
  const doc = digitos(c.doc);
  const pessoaFisica = doc.length === 11;
  const finalidade = (so(c.finalidade) || "Revenda") as Finalidade;

  const pares: Array<[string, string]> = [
    ["KUNNR", digitos(c.numero_sap)],
    ["NOME1", so(c.razao_social).slice(0, 40)],
    ["NAME2", so(c.nome_fantasia).slice(0, 40)],
    [pessoaFisica ? "STCD2" : "STCD1", doc],
    ["STCD3", so(c.ie)],
    ["SUFRAMA", so(c.suframa)],
    ["ICMSTAXPAY", icmsTaxPay(c.contribuinte, c.ie)],
    ["CFOPC", CFOPC_POR_FINALIDADE[finalidade] ?? "1"],
    ["FINALIDADE", finalidade],
    ["PLTYP", so(c.tabela_preco) || "2P-0001"],
    ["ZTERM", so(c.condicao_pgto_sap)],
    ["STRAS", so(c.logradouro).slice(0, 60)],
    ["HAUSN", so(c.numero).slice(0, 10)],
    ["COMPLEMENTO", so(c.complemento).slice(0, 40)],
    ["ORT02", so(c.bairro).slice(0, 40)],
    ["ORT01", so(c.cidade).slice(0, 40)],
    ["REGIO", so(c.uf).toUpperCase().slice(0, 2)],
    ["PSTLZ", digitos(c.cep)],
    ["LAND1", "BR"],
    ["SPRAS", "P"],
    ["TXJCD", digitos(c.municipio_ibge)],
    ["SMTP_ADDR", so(c.email).slice(0, 60)],
    ["TELF1", so(c.telefone).slice(0, 30)],
    ["VENDEDOR", so(c.vendedor_sap)],
  ];

  return pares.filter(([, valor]) => valor !== "").map(([atributo, valor]) => ({ atributo, valor }));
}

/** Validações que precisam existir antes de tentar o envio ao SAP. */
export function validarParaSap(c: ClienteSapInput): string[] {
  const faltando: string[] = [];
  if (!so(c.razao_social)) faltando.push("Razão social");
  if (!digitos(c.doc)) faltando.push("CNPJ / CPF");
  if (!so(c.logradouro)) faltando.push("Logradouro");
  if (!so(c.numero)) faltando.push("Número");
  if (!so(c.cidade)) faltando.push("Cidade");
  if (!so(c.uf)) faltando.push("UF");
  if (digitos(c.cep).length !== 8) faltando.push("CEP");
  if (!so(c.finalidade)) faltando.push("Finalidade da mercadoria");
  if (!so(c.tabela_preco)) faltando.push("Tabela de preço");
  return faltando;
}
