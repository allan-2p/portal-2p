/**
 * "Pedidos parados": pedidos em andamento que não mudam de status no portal
 * há mais tempo do que o esperado. Para cada um consultamos o SAP ao vivo
 * (ZNFE_OV_CONSULTAR) e mostramos o último status recebido do ERP, deixando
 * claro se o SAP já tem novidade que o portal ainda não aplicou.
 */

import { listarPropostas } from "./propostas-db.server";
import {
  consultarStatusSap,
  proximoStatus,
  sapNfsConfigurado,
  type ConsultaSap,
} from "./sap-nfs.server";

export type PedidoParado = {
  id: string;
  numero: string | null;
  cliente: string | null;
  organizacao: string | null;
  status: string;
  desde: string | null;
  horasParado: number;
  ovNumero: string | null;
  nfNumero: string | null;
  /** Último retorno do SAP para a ordem de venda. */
  sap: {
    picking: string | null;
    romaneio: string | null;
    remessa: string | null;
    nfNumero: string | null;
    nfSerie: string | null;
    dataExpedicao: string | null;
    /** Leitura em texto do que o SAP indica hoje. */
    resumo: string;
    /** Status para onde o portal avançaria com esse retorno. */
    sugerido: string | null;
    erro: string | null;
    consultadoEm: string;
  } | null;
};

export type PedidosParadosDados = {
  pedidos: PedidoParado[];
  totalElegiveis: number;
  horas: number;
  consultados: number;
  geradoEm: string;
  aviso: string | null;
};

const EM_ANDAMENTO = [
  "Aguardando Pagamento",
  "Processando",
  "Separação",
  "Faturado",
  "Coletado",
];

const SELECT =
  "id,numero,status,cliente_nome,organizacao,created_at,status_alterado_em,sap_ov_numero,nf_numero";

/** Resumo em português do retorno do SAP. */
export function resumoSap(c: ConsultaSap): string {
  const partes: string[] = [];
  if (c.picking) partes.push(`Picking ${c.picking}`);
  if (c.remessa) partes.push(`Remessa ${c.remessa}`);
  if (c.nfNumero) partes.push(`NF ${c.nfNumero}${c.nfSerie ? `/${c.nfSerie}` : ""}`);
  if (c.romaneio) partes.push(`Romaneio ${c.romaneio}`);
  if (c.dataExpedicao) partes.push(`Expedição ${c.dataExpedicao.split("-").reverse().join("/")}`);
  return partes.length ? partes.join(" · ") : "SAP ainda não devolveu nenhum andamento.";
}

const horasDesde = (iso: string | null | undefined) => {
  const t = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return Math.round(((Date.now() - t) / 3600_000) * 10) / 10;
};

export async function listarPedidosParados(
  opts: { horas?: number; limite?: number } = {},
): Promise<PedidosParadosDados> {
  const horas = Math.min(Math.max(opts.horas ?? 24, 1), 24 * 30);
  const limite = Math.min(Math.max(opts.limite ?? 25, 1), 60);

  const rows = await listarPropostas({
    statusIn: EM_ANDAMENTO,
    select: SELECT,
    order: "asc",
    naoVazio: ["sap_ov_numero"],
    limit: 20000,
  });

  const parados = rows
    .map((r) => {
      const desde = (r["status_alterado_em"] as string) ?? (r["created_at"] as string) ?? null;
      return { row: r, desde, horasParado: horasDesde(desde) };
    })
    .filter((p) => p.horasParado >= horas)
    .sort((a, b) => b.horasParado - a.horasParado);

  const alvo = parados.slice(0, limite);
  const configurado = sapNfsConfigurado();

  const pedidos: PedidoParado[] = new Array(alvo.length);
  const CONCORRENCIA = 6;
  let cursor = 0;
  const trabalhar = async () => {
    for (;;) {
      const i = cursor++;
      if (i >= alvo.length) return;
      const p = alvo[i]!;
      const row = p.row;
      const ov = String(row["sap_ov_numero"] ?? "").trim() || null;
      const status = String(row["status"] ?? "");
      let sap: PedidoParado["sap"] = null;
      if (configurado && ov) {
        const consultadoEm = new Date().toISOString();
        try {
          const c = await consultarStatusSap(ov);
          sap = {
            picking: c.picking,
            romaneio: c.romaneio,
            remessa: c.remessa,
            nfNumero: c.nfNumero,
            nfSerie: c.nfSerie,
            dataExpedicao: c.dataExpedicao,
            resumo: resumoSap(c),
            sugerido: proximoStatus(status, c),
            erro: null,
            consultadoEm,
          };
        } catch (e) {
          sap = {
            picking: null,
            romaneio: null,
            remessa: null,
            nfNumero: null,
            nfSerie: null,
            dataExpedicao: null,
            resumo: "Não foi possível consultar o SAP agora.",
            sugerido: null,
            erro: e instanceof Error ? e.message.slice(0, 300) : String(e),
            consultadoEm,
          };
        }
      }
      pedidos[i] = {
        id: String(row["id"]),
        numero: (row["numero"] as string) ?? null,
        cliente: (row["cliente_nome"] as string) ?? null,
        organizacao: (row["organizacao"] as string) ?? null,
        status,
        desde: p.desde,
        horasParado: Number.isFinite(p.horasParado) ? p.horasParado : 0,
        ovNumero: ov,
        nfNumero: (row["nf_numero"] as string) ?? null,
        sap,
      };
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCORRENCIA, alvo.length) }, trabalhar));

  return {
    pedidos: pedidos.filter(Boolean),
    totalElegiveis: parados.length,
    horas,
    consultados: alvo.length,
    geradoEm: new Date().toISOString(),
    aviso: configurado ? null : "Integração SAP de notas fiscais não configurada.",
  };
}
