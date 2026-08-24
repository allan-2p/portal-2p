/**
 * Catálogo vendável — quem tem preço no SAP é quem pode ser vendido.
 *
 * A plataforma antiga não tem flag de catálogo: o material só é vendável quando
 * existe condição de preço vigente na VK12. Como a condição tem validade, o
 * item pode ganhar/perder preço a qualquer momento — por isso a varredura roda
 * junto da sincronização de produtos e também como gatilho próprio
 * (`sap.sync-produtos`).
 *
 * Regras:
 *  - simula preço real (`ZNFE_OV_SIMULAR`, filial 9802) em lotes de até 40
 *    materiais, nas listas 01 e 02;
 *  - material "veneno" (aborta o lote, ex.: "UM de venda UN não prevista") é
 *    isolado por bisseção e marcado como sem preço;
 *  - sem preço → inativo; com preço → ativo, com o preço gravado como
 *    contingência (`preco_vk12`, e `preco_sugerido` quando estiver zerado);
 *  - `ativo_override` (definido manualmente na Gestão de Produtos) sempre vence
 *    a varredura.
 */

import { simularSap } from "./sap-precos.server";

export type VarreduraResult = {
  verificados: number;
  comPreco: number;
  semPreco: number;
  ativados: number;
  desativados: number;
  overrides: number;
  chamadas: number;
  venenos: string[];
  duracaoMs: number;
  skipped?: boolean;
  motivo?: string;
};

const LOTE = 40;
const LISTAS = ["01", "02"];

type Achado = { lista: string; valor: number };

/** Simula um lote e devolve o preço por material; lote que aborta é bissecado. */
async function precosDoLote(
  codigos: string[],
  lista: string,
  estado: { chamadas: number; venenos: Set<string> },
): Promise<Map<string, number>> {
  const achados = new Map<string, number>();
  if (!codigos.length) return achados;

  estado.chamadas += 1;
  const r = await simularSap(
    codigos.map((codigo) => ({ codigo, quantidade: 1 })),
    { listaPreco: lista, filial: "9802" },
  );

  const abortou = Boolean(r.motivo) || (r.erros.length > 0 && r.valores.size === 0);
  if (abortou) {
    if (codigos.length === 1) {
      estado.venenos.add(codigos[0]!);
      return achados;
    }
    const meio = Math.ceil(codigos.length / 2);
    for (const metade of [codigos.slice(0, meio), codigos.slice(meio)]) {
      for (const [k, v] of await precosDoLote(metade, lista, estado)) achados.set(k, v);
    }
    return achados;
  }

  for (const [codigo, valores] of r.valores) {
    const valor = Number(valores.valor ?? 0);
    if (valor > 0) achados.set(codigo, valor);
  }
  return achados;
}

/**
 * Varre o catálogo do SAP e atualiza o flag de vendável/ativo.
 *
 * `limite` mantém a execução dentro do tempo de request: os materiais são
 * priorizados pelo que está há mais tempo sem verificação, então execuções
 * seguidas cobrem o catálogo inteiro.
 */
export async function varrerCatalogoVendaveis(
  opts?: { limite?: number; codigos?: string[]; actorId?: string | null },
): Promise<VarreduraResult> {
  const inicio = Date.now();
  const limite = Math.max(1, Math.min(900, Number(opts?.limite ?? 250)));
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let q = supabaseAdmin
    .from("sap_produtos")
    .select("codigo, ativo, ativo_override, vendavel_sap, preco_sugerido, listas_com_preco, preco_vk12")
    .eq("origem", "sap");
  if (opts?.codigos?.length) q = q.in("codigo", opts.codigos);
  else q = q.order("preco_checado_em", { ascending: true, nullsFirst: true }).limit(limite);

  const { data, error } = await q;
  if (error) throw new Error(`catálogo: ${error.message}`);

  const linhas = (data ?? []).filter((r: any) => /^\d+$/.test(String(r.codigo ?? "").trim()));
  if (!linhas.length) return {
    verificados: 0, comPreco: 0, semPreco: 0, ativados: 0, desativados: 0,
    overrides: 0, chamadas: 0, venenos: [], duracaoMs: Date.now() - inicio,
    skipped: true, motivo: "Nenhum material do SAP para verificar.",
  };

  const estado = { chamadas: 0, venenos: new Set<string>() };
  const achados = new Map<string, Achado>();
  let pendentes = linhas.map((r: any) => String(r.codigo));

  for (const lista of LISTAS) {
    if (!pendentes.length) break;
    const restantes: string[] = [];
    for (let i = 0; i < pendentes.length; i += LOTE) {
      const lote = pendentes.slice(i, i + LOTE);
      const precos = await precosDoLote(lote, lista, estado);
      for (const codigo of lote) {
        const valor = precos.get(codigo);
        if (valor && valor > 0) achados.set(codigo, { lista, valor });
        else restantes.push(codigo);
      }
    }
    pendentes = restantes.filter((c) => !estado.venenos.has(c));
  }

  const now = new Date().toISOString();
  let ativados = 0;
  let desativados = 0;
  let overrides = 0;
  const updates: Record<string, unknown>[] = [];

  for (const linha of linhas as any[]) {
    const codigo = String(linha.codigo);
    const achado = achados.get(codigo) ?? null;
    const vendavel = Boolean(achado);
    const override = linha.ativo_override as boolean | null;
    if (override !== null && override !== undefined) overrides += 1;
    const ativo = override ?? vendavel;
    if (ativo !== Boolean(linha.ativo)) (ativo ? ativados++ : desativados++);

    const patch: Record<string, unknown> = {
      codigo,
      vendavel_sap: vendavel,
      listas_com_preco: achado ? `${achado.lista}:${achado.valor.toFixed(2)}` : null,
      preco_vk12: achado ? achado.valor : null,
      preco_checado_em: now,
      ativo,
    };
    // Preço de contingência: só preenche quando o portal ainda não tem preço.
    if (achado && !(Number(linha.preco_sugerido ?? 0) > 0)) patch["preco_sugerido"] = achado.valor;
    updates.push(patch);
  }

  for (let i = 0; i < updates.length; i += 200) {
    const { error: upErr } = await supabaseAdmin
      .from("sap_produtos")
      .upsert(updates.slice(i, i + 200) as any, { onConflict: "codigo" });
    if (upErr) throw new Error(`gravação do catálogo: ${upErr.message}`);
  }

  // Espelha o status no catálogo consolidado de estoque.
  for (const grupo of [true, false]) {
    const codigos = updates.filter((u) => u["ativo"] === grupo).map((u) => String(u["codigo"]));
    for (let i = 0; i < codigos.length; i += 200) {
      await supabaseAdmin
        .from("produtos")
        .update({ ativo: grupo })
        .eq("origem", "sap")
        .in("codigo", codigos.slice(i, i + 200));
    }
  }

  const resultado: VarreduraResult = {
    verificados: linhas.length,
    comPreco: achados.size,
    semPreco: linhas.length - achados.size,
    ativados,
    desativados,
    overrides,
    chamadas: estado.chamadas,
    venenos: [...estado.venenos].slice(0, 50),
    duracaoMs: Date.now() - inicio,
  };

  const { logIntegrationEvent } = await import("./integration-logs.server");
  await logIntegrationEvent({
    slug: "sap",
    level: "info",
    event: "catalogo-vendaveis",
    message:
      `Catálogo vendável: ${resultado.verificados} verificados, ${resultado.comPreco} com preço, ` +
      `${resultado.ativados} ativados, ${resultado.desativados} desativados` +
      (resultado.overrides ? `, ${resultado.overrides} com override manual` : "") +
      (resultado.venenos.length ? `, ${resultado.venenos.length} sem simulação` : "") +
      ".",
    detail: { ...resultado },
    actorId: opts?.actorId ?? null,
  });

  return resultado;
}
