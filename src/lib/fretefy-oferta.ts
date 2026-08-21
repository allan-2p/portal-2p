/**
 * Montagem dos payloads da Oferta de Carga da Fretefy (lógica pura, testável).
 *
 * Contrato extraído da plataforma antiga (vendor/custom/fretefy.php), que roda
 * em produção: constantes fixas (unidade de negócio, origem CD Itajaí, tipo de
 * carga, tarifa) e o placeholder de documento na criação — a NF real entra
 * depois, via PUT ofertacarga/{id}/documentos, quando o pedido fatura.
 */

export const UNIDADE_NEGOCIO_ID = "56b891c8-4062-f011-8f7c-002248e04faa";
export const TIPO_CARGA_ID = "87db0f2b-f454-41fe-afbe-c79c35506862";
export const TIPO_TARIFA_ID = "12820fdf-ff63-4cd4-858a-5d89eb6dc23f";
export const VEICULO_GENERICO = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
export const CHAVE_PLACEHOLDER = "0".repeat(43);

const ENDERECO_2P =
  "CONDOMINIO LOGI STICO TRADE PARK SARDAGNA, Rodovia BR 101, Km 124 +400M, n 12750";

export const EMPRESA_2P = {
  documento: 37241071000277,
  razaoSocial: "2P ACESSÓRIOS LTDA.",
  endereco: ENDERECO_2P,
  cidade: "Itajaí",
  uf: "SC",
} as const;

export type Endereco = {
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  cidade?: string | null;
  uf?: string | null;
};

export type OfertaCargaCtx = {
  numero: string;
  nomeProjeto: string;
  sapOvNumero: string;
  clienteNome: string;
  clienteDoc: string;
  entrega: Endereco;
  pesoTotal: number;
  valorCarga: number;
  freteValor: number;
  transportadoraId: string;
  agora?: Date;
};

/** "YYYY-MM-DD HH:mm:ss" no fuso local do servidor (mesmo formato da antiga). */
export function dataHora(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes(),
  )}:${p(d.getSeconds())}`;
}

/** Documento com zeros à esquerda (14 = CNPJ, 11 = CPF). */
export function docPad(doc: string): string {
  const so = String(doc ?? "").replace(/\D/g, "");
  if (!so) return "";
  return so.length <= 11 ? so.padStart(11, "0") : so.padStart(14, "0");
}

export function localidade(e: Endereco): string {
  return [
    [e.logradouro ?? "", e.numero ?? ""].filter(Boolean).join(", "),
    e.complemento ?? "",
  ]
    .filter((s) => String(s).trim())
    .join(" ")
    .trim();
}

export function montarOfertaCarga(ctx: OfertaCargaCtx): Record<string, unknown> {
  const agora = ctx.agora ?? new Date();
  const coleta = new Date(agora.getTime() + 2 * 24 * 60 * 60 * 1000);
  const destinoEmpresa = {
    documento: docPad(ctx.clienteDoc),
    razaoSocial: ctx.clienteNome,
    endereco: localidade(ctx.entrega),
    cidade: ctx.entrega.cidade ?? "",
    uf: ctx.entrega.uf ?? "",
  };
  const pedidoEmbarcador = `${ctx.sapOvNumero} - ${ctx.nomeProjeto}`.trim();

  return {
    unidadeNegocioId: UNIDADE_NEGOCIO_ID,
    origem: {
      localidade: ENDERECO_2P,
      cidade: EMPRESA_2P.cidade,
      uf: EMPRESA_2P.uf,
      dhInicio: dataHora(coleta),
      motivo: 1,
      empresa: { ...EMPRESA_2P },
    },
    destino: {
      localidade: localidade(ctx.entrega),
      cidade: ctx.entrega.cidade ?? "",
      uf: ctx.entrega.uf ?? "",
      dhInicio: dataHora(agora),
      motivo: 1,
      empresa: destinoEmpresa,
      documentos: [
        {
          chave: CHAVE_PLACEHOLDER,
          serie: "001",
          numero: "0000000000",
          pedido: ctx.numero,
          dhEmissao: agora.toISOString(),
          dhCriacaoPedido: dataHora(agora),
          emitente: { ...EMPRESA_2P },
          destinatario: destinoEmpresa,
          peso: ctx.pesoTotal,
          cubagem: 0.0,
          quantidade: 1,
          valor: ctx.valorCarga,
        },
      ],
      observacao: `Peso: ${ctx.pesoTotal} . Pedido: ${ctx.numero} Plataforma - SAP ${ctx.sapOvNumero} - ${ctx.nomeProjeto}`,
    },
    paradas: [],
    carga: {
      unidadeMedida: 5,
      modalidade: 3,
      pesoBruto: ctx.pesoTotal,
      valorCarga: ctx.valorCarga,
      tipoCargaId: TIPO_CARGA_ID,
      pedidoEmbarcador,
    },
    veiculo: {
      apenasCavaloMecanico: true,
      tiposVeiculo: [VEICULO_GENERICO],
      tiposCarrocerias: [VEICULO_GENERICO],
    },
    pagamento: {
      tipoTarifaId: TIPO_TARIFA_ID,
      valorFrete: ctx.freteValor,
    },
    direcionamentos: [ctx.transportadoraId],
    visibilidade: 2,
  };
}

export type DocumentoNfCtx = {
  destinoId: string;
  documentoId: string;
  entrega: Endereco;
  clienteNome: string;
  clienteDoc: string;
  sapOvNumero: string;
  nfChave: string;
  nfSerie: string;
  nfNumero: string;
  dhEmissao: string;
  pesoTotal: number;
  quantidade: number;
  valorTotal: number;
  agora?: Date;
};

export function montarAtualizacaoDocumento(ctx: DocumentoNfCtx): Record<string, unknown> {
  const agora = ctx.agora ?? new Date();
  const destinatario = {
    documento: docPad(ctx.clienteDoc),
    razaoSocial: ctx.clienteNome,
    endereco: localidade(ctx.entrega),
    cidade: ctx.entrega.cidade ?? "",
    uf: ctx.entrega.uf ?? "",
  };
  return {
    destino: {
      id: ctx.destinoId,
      localidade: localidade(ctx.entrega),
      cidade: ctx.entrega.cidade ?? "",
      uf: ctx.entrega.uf ?? "",
      dhInicio: dataHora(agora),
      motivo: 1,
      empresa: { ...EMPRESA_2P },
      documentos: [
        {
          id: ctx.documentoId,
          chave: ctx.nfChave,
          serie: ctx.nfSerie,
          numero: ctx.nfNumero,
          pedido: ctx.sapOvNumero,
          dhEmissao: ctx.dhEmissao,
          dhCriacaoPedido: ctx.dhEmissao,
          emitente: { ...EMPRESA_2P },
          destinatario,
          peso: ctx.pesoTotal,
          cubagem: 0.0,
          quantidade: ctx.quantidade,
          valor: ctx.valorTotal,
        },
      ],
    },
  };
}

/** Oferta só existe para frete da 2P: FOB nunca gera carga. */
export function deveCriarOferta(freteMod: string | null | undefined): boolean {
  const m = String(freteMod ?? "").trim().toUpperCase();
  return m === "CIF" || m === "DEDICADO";
}
