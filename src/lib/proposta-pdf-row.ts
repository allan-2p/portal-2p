/**
 * Converte uma proposta já salva (linha do banco) nos dados de PDF usados
 * pelos geradores de Carregadores e Solar — permite prévia/impressão a partir
 * da tela de detalhes, sem reabrir o wizard.
 */
import { buildPropostaPdfHtml, propostaPdfFileName, type PropostaPdfData } from "@/lib/carregadores-proposta-pdf";
import {
  buildSolarPropostaPdfHtml,
  solarPropostaPdfFileName,
  type SolarPropostaPdfData,
} from "@/lib/solar-proposta-pdf";
import { cidadeUfCep } from "@/lib/local-format";

type Row = Record<string, any>;

const txt = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function linhasEndereco(o: Row | null | undefined): string[] {
  const e = (o ?? {}) as Row;
  return [
    [txt(e['logradouro']), txt(e['numero'])].filter(Boolean).join(", "),
    [txt(e['complemento']), txt(e['bairro'])].filter(Boolean).join(" · "),
    cidadeUfCep(txt(e['cidade']), txt(e['uf']), txt(e['cep']), ""),
  ].filter((l) => l.trim());
}

/** Endereço de faturamento: o do cliente final quando houver, senão o da entrega. */
function baseFaturamento(p: Row): Row {
  const fat = (p['faturamento'] ?? {}) as Row;
  return Object.keys(fat).length ? fat : ((p['entrega'] ?? {}) as Row);
}

function itensDaProposta(p: Row) {
  return (Array.isArray(p['itens']) ? p['itens'] : []) as Row[];
}

export function propostaEhSolar(p: Row) {
  return txt(p['organizacao']).toLowerCase() === "solar";
}

/** Dados do PDF de Carregadores a partir da proposta salva. */
export function pdfDataCarregadoresDaProposta(p: Row): PropostaPdfData {
  const itens = itensDaProposta(p);
  const totais = (p['totais'] ?? {}) as Row;
  const valorItens = itens.reduce((a, i) => a + num(i['valor']) * num(i['qtd']), 0);
  const base = num(totais['valor']) || valorItens;
  const icmsRate = num(totais['icmsRate']);
  const ipiRate = base > 0 ? num(totais['ipi']) / base : 0;
  const pisCofinsRate = base > 0 ? num(totais['pisCofins']) / base : 0;
  const fat = baseFaturamento(p);
  const ent = (p['entrega'] ?? {}) as Row;
  const frete = num(p['frete_valor']);

  return {
    numero: txt(p['numero']) || undefined,
    propostaNome: txt(p['nome']) || null,
    numeroSap: txt(p['sap_ov_numero'] || p['numero_sap']) || null,
    cliente: {
      nome: txt(p['cliente_nome']),
      nomeFantasia: txt(p['cliente_nome']),
      doc: txt(p['cliente_doc']),
      ie: txt(p['cliente_ie']),
      email: txt(p['cliente_email']),
      telefone: txt(p['cliente_telefone']),
      uf: txt(fat['uf'] || ent['uf'] || p['uf']),
      cidade: txt(fat['cidade'] || ent['cidade']) || null,
      contribuinte: p['contribuinte'] === true,
    },
    itens: itens.map((i) => ({
      codigo: txt(i['codigo']) || null,
      nome: txt(i['nome']),
      qtd: num(i['qtd']),
      valor: num(i['valor']),
      ipiRate: ipiRate || null,
      icmsRate: icmsRate || null,
      pisCofinsRate: pisCofinsRate || null,
    })),
    freteMod: txt(p['frete_mod']) || "—",
    freteValor: frete,
    impostos: {
      ipiRate,
      ipiValor: num(totais['ipi']),
      icmsRate,
      icms: num(totais['icms']),
      pisCofinsRate,
      pisCofins: num(totais['pisCofins']),
    },
    totalNf: valorItens + frete,
    valorTotal: num(totais['valorTotal']) || valorItens + frete,
    valor: num(totais['valor']) || valorItens,
    observacoes: txt(p['observacoes']),
    consultor: txt(p['consultor_nome']) || undefined,
    formaPagamento: txt(p['forma_pagamento']) || null,
    enderecoFaturamento: {
      nome: txt(fat['nome']) || txt(p['cliente_nome']),
      doc: txt(fat['doc']) || txt(p['cliente_doc']),
      ie: txt(fat['ie']) || txt(p['cliente_ie']),
      linhas: linhasEndereco(fat),
    },
    enderecoEntrega: {
      contato: txt(ent['contato']) || null,
      telefone: txt(ent['telefone']) || null,
      linhas: linhasEndereco(ent),
    },
  };
}

/** Dados do PDF Solar a partir da proposta salva. */
export function pdfDataSolarDaProposta(p: Row): SolarPropostaPdfData {
  const itens = itensDaProposta(p);
  const totais = (p['totais'] ?? {}) as Row;
  const subtotal = num(totais['subtotal']) || itens.reduce((a, i) => a + num(i['valor']) * num(i['qtd']), 0);
  const frete = num(p['frete_valor']);
  const fat = baseFaturamento(p);
  const ent = (p['entrega'] ?? {}) as Row;
  const disposicao = ((totais['calculo'] ?? {}) as Row)['disposicao'];


  return {
    numero: txt(p['numero']) || null,
    propostaNome: txt(p['nome']) || null,
    cliente: {
      nome: txt(p['cliente_nome']) || "—",
      doc: txt(p['cliente_doc']),
      ie: txt(p['cliente_ie']),
      email: txt(p['cliente_email']),
      telefone: txt(p['cliente_telefone']),
      uf: txt(fat['uf'] || ent['uf'] || p['uf']),
      cidade: txt(fat['cidade'] || ent['cidade']),
    },
    consultor: txt(p['consultor_nome']) || null,
    itens: itens.map((i) => ({
      codigo: txt(i['codigo']) || null,
      nome: txt(i['nome']) || "Item",
      qtd: num(i['qtd']),
      valor: num(i['valor']),
    })),
    subtotal,
    desconto: num(totais['desconto']),
    cupom: txt(totais['cupom']) || null,
    freteMod: txt(p['frete_mod']) || null,
    freteValor: frete,
    freteGratis: frete === 0,
    freteBonificado: p['frete_bonificado'] === true,
    transportadora: txt(p['transportadora']) || null,
    total: num(totais['valorTotal']) || subtotal + frete,
    tipoNf: txt(p['tipo_nf']) || null,
    formaPagamento: txt(p['forma_pagamento']) || null,
    observacoes: txt(p['observacoes']) || null,
    enderecoFaturamento: {
      nome: txt(fat['nome']) || txt(p['cliente_nome']),
      doc: txt(fat['doc']) || txt(p['cliente_doc']),
      linhas: linhasEndereco(fat),
    },
    enderecoEntrega: p['entrega_diferente']
      ? { contato: txt(ent['contato']), telefone: txt(ent['telefone']), linhas: linhasEndereco(ent) }
      : { nome: "Mesmo do faturamento", linhas: linhasEndereco(fat) },
    estrutura: Array.isArray(disposicao) && disposicao.length ? { fileiras: disposicao } : null,
  };
}


/** HTML + nome de arquivo do PDF conforme a unidade da proposta. */
export function propostaPdfDaLinha(p: Row): { html: string; fileName: string } {
  if (propostaEhSolar(p)) {
    const d = pdfDataSolarDaProposta(p);
    return { html: buildSolarPropostaPdfHtml(d), fileName: solarPropostaPdfFileName(d) };
  }
  const d = pdfDataCarregadoresDaProposta(p);
  return { html: buildPropostaPdfHtml(d), fileName: propostaPdfFileName(d) };
}
