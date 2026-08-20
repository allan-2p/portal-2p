/**
 * De-para entre o cadastro do portal e os campos esperados pela RFC
 * `ZHDIT_CLIENTES_CADASTRO` do SAP (estrutura I_S_CLIENTE). Módulo puro
 * (sem I/O) para poder ser testado e importado do servidor ou do cliente.
 */

export const FINALIDADES = ["Revenda", "Industrialização", "Uso e Consumo"] as const;
export type Finalidade = (typeof FINALIDADES)[number];

/** Tabelas de preço do SAP (PLTYP). O código enviado ao SAP é o `pltyp`. */
export const TABELAS_PRECO = [
  { codigo: "2P-0001", pltyp: "01", label: "2P-0001 — Varejo" },
  { codigo: "2P-0002", pltyp: "02", label: "2P-0002 — Atacado" },
  { codigo: "2P-0003", pltyp: "03", label: "2P-0003 — Especial" },
  { codigo: "2P-0004", pltyp: "04", label: "2P-0004 — Distribuidor" },
  { codigo: "2P-0005", pltyp: "05", label: "2P-0005 — Distribuidor especial" },
] as const;

/** Tabela usada por padrão (2P Carregadores sempre usa esta). */
export const TABELA_PRECO_PADRAO = "2P-0001";

export function pltypDaTabela(tabela: string | null | undefined): string {
  const t = String(tabela ?? "").trim();
  const achado = TABELAS_PRECO.find((x) => x.codigo === t || x.pltyp === t);
  if (achado) return achado.pltyp;
  const num = /^(\d)/.exec(t)?.[1];
  return num ? num.padStart(2, "0") : "01";
}

/** CRT (código de regime tributário) do SAP a partir do regime do cadastro. */
export function crtDoRegime(regime: string | null | undefined): string {
  const r = String(regime ?? "").toLowerCase();
  if (r.includes("simples")) return "1";
  if (r.includes("mei")) return "1";
  return "3"; // Lucro Presumido / Lucro Real / demais = regime normal
}

export type ClienteSapInput = {
  doc: string;
  razao_social: string;
  nome_fantasia?: string | null;
  ie?: string | null;
  suframa?: string | null;
  contribuinte: boolean;
  regime_tributario?: string | null;
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
  /** Unidade (organização) do cliente — define equipe/escritório de vendas. */
  escopo_org?: EscopoOrg | null;
  /** Valores explícitos (espelho do SAP); sobrepõem o cálculo pelo escopo. */
  equipe_vendas?: string | null;
  escritorio_vendas?: string | null;
};

/** Escopo comercial do cliente no SAP. */
export type EscopoOrg = "solar" | "carregadores" | "grupo";

/** EQUIPE_VENDAS (VKGRP) e ESCRITORIO (VKBUR) por unidade. */
export const VENDAS_POR_ESCOPO: Record<EscopoOrg, { equipe: string; escritorio: string }> = {
  solar: { equipe: "001", escritorio: "0002" },
  carregadores: { equipe: "002", escritorio: "0003" },
  grupo: { equipe: "003", escritorio: "0004" },
};

/** Normaliza organização/instância ("2P Solar", "carregadores", "Grupo 2P"…). */
export function escopoOrg(valor: unknown): EscopoOrg {
  const v = String(valor ?? "").toLowerCase();
  if (v.includes("grupo")) return "grupo";
  if (v.includes("carregad")) return "carregadores";
  return "solar";
}

export function vendasDoEscopo(c: {
  escopo_org?: EscopoOrg | null;
  equipe_vendas?: string | null;
  escritorio_vendas?: string | null;
}): { EQUIPE_VENDAS: string; ESCRITORIO: string } {
  const base = VENDAS_POR_ESCOPO[c.escopo_org ?? "solar"] ?? VENDAS_POR_ESCOPO.solar;
  return {
    EQUIPE_VENDAS: so(c.equipe_vendas) || base.equipe,
    ESCRITORIO: so(c.escritorio_vendas) || base.escritorio,
  };
}

const so = (v: unknown) => String(v ?? "").trim();
const digitos = (v: unknown) => so(v).replace(/\D/g, "");

/** Quebra a razão social em até 4 linhas de 40 caracteres (NAME1..NAME4). */
export function quebrarNome(nome: string, largura = 40): string[] {
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of so(nome).split(/\s+/).filter(Boolean)) {
    if (!atual) atual = palavra.slice(0, largura);
    else if ((atual + " " + palavra).length <= largura) atual += " " + palavra;
    else {
      linhas.push(atual);
      atual = palavra.slice(0, largura);
    }
  }
  if (atual) linhas.push(atual);
  return linhas.slice(0, 4);
}

export type CamposSapCliente = {
  ATUALIZAR: string;
  EMPRESA: string;
  CNPJ: string;
  CPF: string;
  CODCLI: string;
  NAMES: string[];
  IE: string;
  CIDADE: string;
  BAIRRO: string;
  CEP: string;
  LOGRADOURO: string;
  NUMERO: string;
  COMPLEMENTO: string;
  UF: string;
  TELEFONE: string;
  E_MAIL: string;
  CFOPC: string;
  ICMSTAXPAY: string;
  VENDEDOR: string;
  PLTYP: string;
  KONDA: string;
  CRT: string;
  ZTERM: string;
  IND_SECTOR: string;
  EQUIPE_VENDAS: string;
  ESCRITORIO: string;
};

const UFS_KONDA_04 = ["SP", "RJ", "ES", "MG", "RS", "PR", "SC"];

/** Monta os campos da estrutura I_S_CLIENTE conforme as regras do SAP. */
export function camposSapCliente(c: ClienteSapInput): CamposSapCliente {
  const doc = digitos(c.doc);
  const pessoaFisica = doc.length === 11;
  const finalidade = (so(c.finalidade) || "Revenda") as Finalidade;
  const contribuinte = c.contribuinte === true;

  let ie = so(c.ie).replace(/[.\-/]/g, "").slice(0, 18);
  let icmstaxpay = "01";
  let cfopc: string;
  if (contribuinte && finalidade === "Revenda") cfopc = "08";
  else if (contribuinte && finalidade === "Industrialização") cfopc = "00";
  else if (contribuinte && finalidade === "Uso e Consumo") cfopc = "90";
  else {
    ie = ie || "ISENTO";
    cfopc = "6";
    icmstaxpay = "09";
  }

  const uf = so(c.uf).toUpperCase().slice(0, 2);
  const atualizar = digitos(c.numero_sap) ? "X" : "";

  return {
    ATUALIZAR: atualizar,
    EMPRESA: "9800",
    CNPJ: pessoaFisica ? "" : doc.padStart(14, "0"),
    CPF: pessoaFisica ? doc : "",
    CODCLI: digitos(c.numero_sap),
    NAMES: quebrarNome(c.razao_social),
    IE: ie,
    CIDADE: so(c.cidade).slice(0, 40),
    BAIRRO: so(c.bairro).slice(0, 40),
    CEP: digitos(c.cep),
    LOGRADOURO: so(c.logradouro).slice(0, 60),
    NUMERO: so(c.numero).slice(0, 10),
    COMPLEMENTO: so(c.complemento).slice(0, 40),
    UF: uf,
    TELEFONE: so(c.telefone).slice(0, 30),
    E_MAIL: so(c.email).slice(0, 60),
    CFOPC: cfopc,
    ICMSTAXPAY: icmstaxpay,
    VENDEDOR: so(c.vendedor_sap),
    PLTYP: pltypDaTabela(c.tabela_preco),
    KONDA: UFS_KONDA_04.includes(uf) ? "04" : "03",
    CRT: crtDoRegime(c.regime_tributario),
    ZTERM: digitos(c.numero_sap) ? so(c.condicao_pgto_sap) : "2P00",
    IND_SECTOR: uf === "SC" && finalidade === "Industrialização" ? "04" : "",
  };
}

/** Validações que precisam existir antes de tentar o envio ao SAP. */
export function validarParaSap(c: ClienteSapInput): string[] {
  const faltando: string[] = [];
  if (!so(c.razao_social)) faltando.push("Razão social");
  if (!digitos(c.doc)) faltando.push("CNPJ / CPF");
  if (!so(c.logradouro)) faltando.push("Logradouro");
  if (!so(c.numero)) faltando.push("Número");
  if (!so(c.bairro)) faltando.push("Bairro");
  if (!so(c.cidade)) faltando.push("Cidade");
  if (!so(c.uf)) faltando.push("UF");
  if (digitos(c.cep).length !== 8) faltando.push("CEP");
  if (!so(c.finalidade)) faltando.push("Finalidade de uso");
  if (!so(c.tabela_preco)) faltando.push("Tabela de preço");
  if (!so(c.vendedor_sap)) faltando.push("Código SAP do vendedor");
  if (quebrarNome(c.razao_social).join(" ").length < so(c.razao_social).length) {
    faltando.push("Razão social (excede 4 linhas de 40 caracteres)");
  }
  return faltando;
}
