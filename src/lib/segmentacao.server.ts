/**
 * Segmentação de clientes — 100% no banco do Grupo 2P.
 *
 * A base de clientes é a tabela `clientes` (separada por `instancia` /
 * `organizacao` e pelo consultor responsável). Os números de vendas/geração
 * saem do espelho `opportunity_sf`, que já vive no mesmo banco — não existe
 * mais nenhuma chamada à API do Salesforce nesta tela.
 */

import { grupo2pRest, ORGANIZACAO } from "./grupo2p-db.server";

export type SegmentacaoInstance = "solar" | "carregadores";
export type Segmento = "A" | "B" | "C" | "D";

const PAGINA_DB = 1000;

/** Status considerados "pedido em andamento" (até a coleta). */
export const STATUS_PEDIDO_ANDAMENTO = [
  "Aguardando Pagamento",
  "Processando",
  "Separação",
  "Faturado",
  "Coletado",
];

/** Status que contam como venda concluída no período. */
const STATUS_VENDIDO = [
  ...STATUS_PEDIDO_ANDAMENTO,
  "Entregue",
  "Documentação Liberada",
  "Finalizado",
];

const OPP_COLS = [
  "id",
  "name",
  "account_id",
  "stage_name",
  "amount",
  "total__c",
  "close_date",
  "created_date",
  "status_do_pedido__c",
  "tipo_de_nf__c",
].join(",");

type OppRow = {
  id: string;
  name: string | null;
  account_id: string | null;
  stage_name: string | null;
  amount: number | null;
  total__c: number | null;
  close_date: string | null;
  created_date: string | null;
  status_do_pedido__c: string | null;
  tipo_de_nf__c: string | null;
};

async function buscarTudo(tabela: string, params: URLSearchParams, maxPaginas = 40): Promise<any[]> {
  const out: any[] = [];
  for (let p = 0; p < maxPaginas; p++) {
    const from = p * PAGINA_DB;
    const { ok, status, text } = await grupo2pRest(`${tabela}?${params}`, {
      range: { from, to: from + PAGINA_DB - 1 },
    });
    if (!ok) {
      if (status === 416) break;
      throw new Error(`Erro no banco (${status}): ${text.slice(0, 300)}`);
    }
    const bloco: any[] = text ? JSON.parse(text) : [];
    out.push(...bloco);
    if (bloco.length < PAGINA_DB) break;
  }
  return out;
}

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}
function chave(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Trimestre anterior — base da segmentação/projeção. */
export function trimestreAnterior() {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3) + 1;
  let qq = q - 1;
  let yy = now.getFullYear();
  if (qq < 1) {
    qq = 4;
    yy -= 1;
  }
  return {
    start: chave(new Date(yy, (qq - 1) * 3, 1)),
    end: chave(new Date(yy, qq * 3, 0)),
    label: `Q${qq}/${yy}`,
  };
}

/** Mês ou trimestre corrente — base dos números realizados. */
function periodoAtual(periodo: "mes" | "tri") {
  const now = new Date();
  const y = now.getFullYear();
  if (periodo === "tri") {
    const q = Math.floor(now.getMonth() / 3);
    return { start: chave(new Date(y, q * 3, 1)), end: chave(new Date(y, q * 3 + 3, 0)) };
  }
  return {
    start: chave(new Date(y, now.getMonth(), 1)),
    end: chave(new Date(y, now.getMonth() + 1, 0)),
  };
}

function classificar(vendasTriAnterior: number): Segmento {
  if (vendasTriAnterior <= 0) return "D";
  if (vendasTriAnterior < 15000) return "C";
  if (vendasTriAnterior <= 30000) return "B";
  return "A";
}

const semBonificacao = "(tipo_de_nf__c.is.null,tipo_de_nf__c.neq.Bonificação)";
const valor = (o: OppRow) => Number(o.total__c ?? o.amount ?? 0) || 0;

function paramsOpp(extra: Record<string, string>) {
  const p = new URLSearchParams({ select: OPP_COLS, is_deleted: "is.false", ...extra });
  p.set("or", semBonificacao);
  return p;
}

export type SegmentacaoRow = {
  id: string;
  nome: string;
  consultor: string | null;
  cidade: string | null;
  uf: string | null;
  numeroSap: string | null;
  sfAccountId: string | null;
  observacoes: string | null;
  segmento: Segmento;
  vendasTriAnterior: number;
  projecao: number;
  geracao: number;
  vendas: number;
  pedidos: Array<{
    id: string;
    name: string | null;
    status: string | null;
    total: number;
    closeDate: string | null;
  }>;
};

export type SegmentacaoResult = {
  baseLabel: string;
  periodo: "mes" | "tri";
  rows: SegmentacaoRow[];
  consultores: string[];
};

export async function calcularSegmentacao(opts: {
  instance: SegmentacaoInstance;
  periodo: "mes" | "tri";
  donoId?: string | null;
  consultorSap?: string | null;
}): Promise<SegmentacaoResult> {
  const base = trimestreAnterior();
  const atual = periodoAtual(opts.periodo);

  // ---------- Base: clientes do Grupo 2P ----------
  const clientesParams = new URLSearchParams({
    select:
      "id,razao_social,nome_fantasia,cidade,uf,numero_sap,sf_account_id,observacoes,consultor_nome,consultor_sap,created_by",
    instancia: `eq.${opts.instance}`,
    organizacao: `eq.${ORGANIZACAO[opts.instance]}`,
    order: "razao_social.asc.nullslast,id.asc",
  });
  if (opts.donoId || opts.consultorSap) {
    const alvos: string[] = [];
    if (opts.donoId) alvos.push(`created_by.eq.${opts.donoId}`);
    if (opts.consultorSap) alvos.push(`consultor_sap.eq.${opts.consultorSap}`);
    clientesParams.set("or", `(${alvos.join(",")})`);
  }
  const clientes = await buscarTudo("clientes", clientesParams);

  // ---------- Oportunidades (espelho no mesmo banco) ----------
  const [vendasTri, vendidoAtual, geradoAtual, pedidos] = await Promise.all([
    buscarTudo(
      "opportunity_sf",
      paramsOpp({
        stage_name: "eq.Pedido Concluído",
        close_date: `gte.${base.start}`,
        and: `(close_date.lte.${base.end})`,
      }),
    ) as Promise<OppRow[]>,
    buscarTudo(
      "opportunity_sf",
      paramsOpp({
        stage_name: "eq.Pedido Concluído",
        status_do_pedido__c: `in.(${STATUS_VENDIDO.map((s) => `"${s}"`).join(",")})`,
        close_date: `gte.${atual.start}`,
        and: `(close_date.lte.${atual.end})`,
      }),
    ) as Promise<OppRow[]>,
    buscarTudo(
      "opportunity_sf",
      paramsOpp({
        created_date: `gte.${atual.start}T00:00:00Z`,
        and: `(created_date.lte.${atual.end}T23:59:59Z)`,
      }),
    ) as Promise<OppRow[]>,
    buscarTudo(
      "opportunity_sf",
      paramsOpp({
        stage_name: "eq.Pedido Concluído",
        status_do_pedido__c: `in.(${STATUS_PEDIDO_ANDAMENTO.map((s) => `"${s}"`).join(",")})`,
      }),
    ) as Promise<OppRow[]>,
  ]);

  // ---------- Agregações por conta ----------
  const vendasBase = new Map<string, number>();
  const vendasAtual = new Map<string, number>();
  const geracaoAtual = new Map<string, number>();
  const pedidosPorConta = new Map<string, SegmentacaoRow["pedidos"]>();

  const inc = (m: Map<string, number>, k: string | null, v: number) => {
    if (!k) return;
    m.set(k, (m.get(k) ?? 0) + v);
  };

  for (const o of vendasTri) inc(vendasBase, o.account_id, valor(o));
  for (const o of vendidoAtual) inc(vendasAtual, o.account_id, valor(o));
  for (const o of geradoAtual) inc(geracaoAtual, o.account_id, valor(o));
  for (const o of pedidos) {
    if (!o.account_id) continue;
    const lista = pedidosPorConta.get(o.account_id) ?? [];
    lista.push({
      id: o.id,
      name: o.name,
      status: o.status_do_pedido__c,
      total: valor(o),
      closeDate: o.close_date,
    });
    pedidosPorConta.set(o.account_id, lista);
  }

  const mult = opts.periodo === "tri" ? 3 : 1;

  const consultores = new Set<string>();
  const rows: SegmentacaoRow[] = clientes.map((c) => {
    const acc = (c.sf_account_id as string | null) ?? null;
    const vendasTriAnterior = (acc && vendasBase.get(acc)) || 0;
    const mensal = vendasTriAnterior / 3;
    const consultor = (c.consultor_nome as string | null) || null;
    if (consultor) consultores.add(consultor);
    return {
      id: c.id as string,
      nome: (c.razao_social as string) || (c.nome_fantasia as string) || "(sem nome)",
      consultor,
      cidade: (c.cidade as string | null) ?? null,
      uf: (c.uf as string | null) ?? null,
      numeroSap: (c.numero_sap as string | null) ?? null,
      sfAccountId: acc,
      observacoes: (c.observacoes as string | null) ?? null,
      segmento: classificar(vendasTriAnterior),
      vendasTriAnterior,
      projecao: Math.round(mensal * mult),
      // Geração projetada usa a conversão do próprio cliente (fallback global).
      geracao: Math.round((acc && geracaoAtual.get(acc)) || 0),
      vendas: Math.round((acc && vendasAtual.get(acc)) || 0),
      pedidos: (acc && pedidosPorConta.get(acc)) || [],
    };
  });

  return {
    baseLabel: base.label,
    periodo: opts.periodo,
    rows,
    consultores: Array.from(consultores).sort((a, b) => a.localeCompare(b, "pt-BR")),
  };
}
