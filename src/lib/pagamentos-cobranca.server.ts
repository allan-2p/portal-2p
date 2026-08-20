/**
 * Motor de cobrança do checkout (Itaú): boleto à vista e Pix.
 *
 * Regra da plataforma (mantida igual ao sistema legado):
 *  - `boleto_vista`  → emite AUTOMATICAMENTE 1 boleto único do valor total
 *                      (produtos + frete − desconto), vencimento hoje + 5 dias.
 *  - `boleto_prazo`  → NÃO emite nada. O pedido vai para "Aguardando pagamento"
 *                      e as parcelas são tratadas fora do portal (financeiro/SAP).
 *  - `pix`           → cria a cobrança Pix (QR Code / copia e cola); a baixa vem
 *                      pelo webhook.
 *  - `cartao_credito`→ fluxo próprio, sem emissão aqui.
 *
 * Falha na emissão nunca trava o pedido: registra o erro e devolve mensagem
 * de suporte, exatamente como na plataforma atual.
 */

import * as db from "./propostas-db.server";
import { ItauIndisponivel, chamarItau, credenciaisBoleto, credenciaisPix, itauEnv } from "./itau-api.server";

export type CobrancaResultado = {
  gerada: boolean;
  meio: "boleto" | "pix" | null;
  motivo?: string;
  erro?: string;
  txid?: string | null;
  linhaDigitavel?: string | null;
  vencimento?: string | null;
  pixCopiaCola?: string | null;
};

const DIAS_EXPIRACAO = Number(itauEnv("ITAU_BOLETO_DIAS_EXPIRACAO") ?? 5) || 5;

function soDigitos(v: unknown): string {
  return String(v ?? "").replace(/\D+/g, "");
}

function isoData(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Valor total do pedido: produtos + frete − desconto. */
export function valorTotalPedido(row: Record<string, any>): number {
  const totais = (row["totais"] ?? {}) as Record<string, number>;
  const total = Number(totais["valorTotal"] ?? 0);
  if (total > 0) return Math.round(total * 100) / 100;
  const itens = Array.isArray(row["itens"]) ? (row["itens"] as any[]) : [];
  const bruto = itens.reduce((s, i) => s + Number(i?.qtd ?? 0) * Number(i?.valor ?? 0), 0);
  return Math.round((bruto + Number(row["frete_valor"] ?? 0) - Number(row["desconto"] ?? 0)) * 100) / 100;
}

/** 17 dígitos em centavos, formato exigido pela API de boletos. */
function valor17(valor: number): string {
  return String(Math.round(valor * 100)).padStart(17, "0");
}

function correlation(prefix: string, id: string): string {
  return `${prefix}-${id}`.slice(0, 64);
}

// --------------------------------------------------------------------------
// Boleto à vista
// --------------------------------------------------------------------------

/**
 * Consulta se já existe boleto para este nosso-número. Devolve os dados do
 * boleto existente (para reaproveitar) ou null quando não há nenhum. Falha na
 * consulta devolve null: a emissão segue, para não travar o checkout por uma
 * indisponibilidade de leitura.
 */
async function consultarBoletoExistente(
  cred: NonNullable<ReturnType<typeof credenciaisBoleto>>,
  beneficiario: string,
  nossoNumero: string,
  propostaId: string,
): Promise<{
  nossoNumero: string;
  linhaDigitavel: string | null;
  codigoBarras: string | null;
  url: string | null;
  vencimento: string | null;
} | null> {
  try {
    const resp = await chamarItau({
      escopo: "boleto",
      cred,
      metodo: "GET",
      caminho: `/cash_management/v2/boletos?id_beneficiario=${encodeURIComponent(beneficiario)}&nosso_numero=${encodeURIComponent(nossoNumero)}`,
      correlationId: correlation("boleto-consulta", propostaId),
    });
    const lista = Array.isArray(resp["data"]) ? resp["data"] : resp["data"] ? [resp["data"]] : [];
    const item = lista[0];
    const dado = item?.["dado_boleto"] ?? item;
    if (!dado) return null;
    const ind = Array.isArray(dado?.["dados_individuais_boleto"]) ? dado["dados_individuais_boleto"][0] : dado;
    const linha = ind?.["numero_linha_digitavel"] ?? null;
    if (!linha && !ind?.["numero_nosso_numero"]) return null;
    return {
      nossoNumero: ind?.["numero_nosso_numero"] ?? nossoNumero,
      linhaDigitavel: linha,
      codigoBarras: ind?.["codigo_barras"] ?? null,
      url: ind?.["url_acesso_boleto"] ?? null,
      vencimento: ind?.["data_vencimento"] ?? null,
    };
  } catch {
    return null;
  }
}

async function emitirBoleto(row: Record<string, any>, valor: number) {

  const cred = credenciaisBoleto();
  const beneficiario = itauEnv("ITAU_BOLETO_BENEFICIARIO");
  const agencia = itauEnv("ITAU_BOLETO_AGENCIA");
  const conta = itauEnv("ITAU_BOLETO_CONTA");
  const carteira = itauEnv("ITAU_BOLETO_CARTEIRA") ?? "109";
  if (!cred || !beneficiario || !agencia || !conta) {
    throw new ItauIndisponivel(
      "Credenciais do boleto Itaú não configuradas (client id/secret, beneficiário, agência e conta).",
    );
  }

  const hoje = new Date();
  const venc = new Date(hoje.getTime() + DIAS_EXPIRACAO * 86_400_000);
  const nossoNumero = soDigitos(row["numero"]).padStart(8, "0").slice(-8);
  const docPagador = soDigitos(row["cliente_doc"]);

  const body = {
    etapa_processo_boleto: "efetivacao",
    beneficiario: { id_beneficiario: beneficiario },
    dado_boleto: {
      descricao_instrumento_cobranca: "boleto",
      forma_envio: "impressa",
      tipo_boleto: "a vista",
      codigo_carteira: carteira,
      valor_total_titulo: valor17(valor),
      codigo_especie: "01",
      data_emissao: isoData(hoje),
      // Sempre 1 boleto único do valor total — a plataforma não emite carnê.
      quantidade_parcelas: 1,
      pagador: {
        pessoa: {
          nome_pessoa: String(row["cliente_nome"] ?? "").slice(0, 50),
          tipo_pessoa: {
            codigo_tipo_pessoa: docPagador.length > 11 ? "J" : "F",
            ...(docPagador.length > 11
              ? { numero_cadastro_nacional_pessoa_juridica: docPagador }
              : { numero_cadastro_pessoa_fisica: docPagador }),
          },
        },
        endereco: {
          nome_logradouro: String(row["logradouro"] ?? row["endereco"] ?? "").slice(0, 45),
          nome_bairro: String(row["bairro"] ?? "").slice(0, 15),
          nome_cidade: String(row["cidade"] ?? "").slice(0, 20),
          sigla_UF: String(row["uf"] ?? "").slice(0, 2),
          numero_CEP: soDigitos(row["cep"]),
        },
      },
      dados_individuais_boleto: [
        {
          numero_nosso_numero: nossoNumero,
          data_vencimento: isoData(venc),
          valor_titulo: valor17(valor),
        },
      ],
    },
    dados_qrcode: {},
  };

  // Antes de emitir: o boleto pode já existir no Itaú (retentativa do checkout,
  // ou POST que respondeu com timeout depois de gravar). Emitir de novo geraria
  // duas cobranças para o mesmo pedido.
  const existente = await consultarBoletoExistente(cred, beneficiario, nossoNumero, String(row["id"]));
  if (existente) return { ...existente, vencimento: existente.vencimento ?? isoData(venc), agencia, conta };

  const resp = await chamarItau({
    escopo: "boleto",
    cred,
    metodo: "POST",
    caminho: "/cash_management/v2/boletos",
    body,
    correlationId: correlation("boleto", String(row["id"])),
  });


  const dado = (resp["data"] ?? resp)?.["dado_boleto"] ?? resp["dado_boleto"] ?? {};
  const individual = Array.isArray(dado?.["dados_individuais_boleto"])
    ? dado["dados_individuais_boleto"][0]
    : {};

  return {
    nossoNumero: individual?.["numero_nosso_numero"] ?? nossoNumero,
    linhaDigitavel: individual?.["numero_linha_digitavel"] ?? resp["numero_linha_digitavel"] ?? null,
    codigoBarras: individual?.["codigo_barras"] ?? resp["codigo_barras"] ?? null,
    url: individual?.["url_acesso_boleto"] ?? resp["url_acesso_boleto"] ?? null,
    vencimento: isoData(venc),
    agencia,
    conta,
  };
}

// --------------------------------------------------------------------------
// Pix
// --------------------------------------------------------------------------

function novoTxid(row: Record<string, any>): string {
  const base = `2P${soDigitos(row["numero"]) || ""}${String(row["id"]).replace(/-/g, "")}`;
  return base.replace(/[^A-Za-z0-9]/g, "").slice(0, 35).padEnd(26, "0");
}

async function criarCobrancaPix(row: Record<string, any>, valor: number) {
  const cred = credenciaisPix();
  const chave = itauEnv("ITAU_PIX_CHAVE");
  if (!cred || !chave) throw new ItauIndisponivel("Credenciais do Pix Itaú não configuradas.");

  const txid = novoTxid(row);
  const doc = soDigitos(row["cliente_doc"]);
  const body = {
    calendario: { expiracao: Number(itauEnv("ITAU_PIX_EXPIRACAO_SEG") ?? 86400) || 86400 },
    ...(doc
      ? {
          devedor:
            doc.length > 11
              ? { cnpj: doc, nome: String(row["cliente_nome"] ?? "").slice(0, 60) }
              : { cpf: doc, nome: String(row["cliente_nome"] ?? "").slice(0, 60) },
        }
      : {}),
    valor: { original: valor.toFixed(2) },
    chave,
    solicitacaoPagador: `Pedido ${row["numero"] ?? ""}`.trim().slice(0, 140),
  };

  const resp = await chamarItau({
    escopo: "pix",
    cred,
    metodo: "PUT",
    caminho: `/cob/${txid}`,
    body,
    correlationId: correlation("pix", String(row["id"])),
  });

  return {
    txid: String(resp["txid"] ?? txid),
    copiaCola: (resp["pixCopiaECola"] ?? resp["pix_copia_e_cola"] ?? null) as string | null,
    location: (resp["location"] ?? null) as string | null,
    expiracao: (resp["calendario"]?.["expiracao"] ?? null) as number | null,
  };
}

// --------------------------------------------------------------------------
// Orquestração do checkout
// --------------------------------------------------------------------------

/**
 * Gera a cobrança do pedido logo após a finalização (equivalente ao
 * `geraBoletoPagamento` da plataforma atual, agora com Pix também).
 */
export async function gerarCobrancaCheckout(propostaId: string): Promise<CobrancaResultado> {
  const row = await db.getProposta(propostaId);
  if (!row) return { gerada: false, meio: null, motivo: "Pedido não encontrado." };

  const forma = String(row["forma_pagamento"] ?? "");
  if (forma === "boleto_prazo") {
    return {
      gerada: false,
      meio: null,
      motivo: "Boleto a prazo: as parcelas não são emitidas pelo portal (financeiro/SAP).",
    };
  }
  if (forma !== "boleto_vista" && forma !== "pix") {
    return { gerada: false, meio: null, motivo: `Forma de pagamento "${forma || "não informada"}" sem emissão automática.` };
  }

  // Idempotência: pedido que já tem cobrança emitida não gera outra.
  const jaEmitida =
    String(row["pagamento_linha_digitavel"] ?? "").trim() || String(row["pagamento_txid"] ?? "").trim();
  if (jaEmitida && String(row["pagamento_status"] ?? "") !== "cancelado") {
    return {
      gerada: false,
      meio: (String(row["pagamento_meio"] ?? "") || null) as CobrancaResultado["meio"],
      motivo: "Cobrança já emitida para este pedido.",
      txid: (row["pagamento_txid"] as string) ?? undefined,
      linhaDigitavel: (row["pagamento_linha_digitavel"] as string) ?? undefined,
      vencimento: (row["pagamento_vencimento"] as string) ?? undefined,
      pixCopiaCola: (row["pagamento_pix_copia_cola"] as string) ?? undefined,
    };
  }

  const valor = valorTotalPedido(row);
  if (!(valor > 0)) return { gerada: false, meio: null, erro: "Valor total do pedido inválido." };



  try {
    if (forma === "boleto_vista") {
      const b = await emitirBoleto(row, valor);
      await db.atualizarProposta(row.id, {
        pagamento_meio: "boleto",
        pagamento_status: "pendente",
        pagamento_valor: valor,
        pagamento_vencimento: b.vencimento,
        pagamento_nosso_numero: b.nossoNumero,
        pagamento_linha_digitavel: b.linhaDigitavel,
        pagamento_codigo_barras: b.codigoBarras,
        pagamento_url: b.url,
        pagamento_atualizado_em: new Date().toISOString(),
      });
      return {
        gerada: true,
        meio: "boleto",
        linhaDigitavel: b.linhaDigitavel,
        vencimento: b.vencimento,
      };
    }

    const p = await criarCobrancaPix(row, valor);
    await db.atualizarProposta(row.id, {
      pagamento_meio: "pix",
      pagamento_status: "pendente",
      pagamento_valor: valor,
      pagamento_txid: p.txid,
      pagamento_pix_copia_cola: p.copiaCola,
      pagamento_url: p.location,
      pagamento_atualizado_em: new Date().toISOString(),
    });
    return { gerada: true, meio: "pix", txid: p.txid, pixCopiaCola: p.copiaCola };
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    // O pedido não trava: apenas fica sem cobrança emitida.
    return {
      gerada: false,
      meio: forma === "pix" ? "pix" : "boleto",
      erro: msg,
      motivo: "Não foi possível emitir a cobrança. Entre em contato com o suporte.",
    };
  }
}
