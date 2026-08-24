/**
 * Agregação dos painéis "Integrações → SAP" e "Integrações → Salesforce":
 * saúde por fluxo (24h/7d) + pendências acionáveis.
 *
 * As execuções e os logs vêm do banco do portal (`job_runs`,
 * `integration_logs`, lidos com o cliente do usuário para respeitar o RLS).
 * Clientes e pedidos vêm do banco do Grupo 2P.
 */

import { FLUXOS_SAP, FLUXOS_SALESFORCE, type FluxoDic } from "./integracoes-dicionario";
import { consultarPropostas } from "./propostas-db.server";
import { grupo2pRest } from "./grupo2p-db.server";

export type Painel = "sap" | "salesforce";

export type FluxoSaude = {
  id: string;
  titulo: string;
  chamada: string;
  job: string | null;
  /** Última execução/registro conhecido do fluxo. */
  ultimo: { em: string | null; ok: boolean | null; mensagem: string | null };
  /** Execuções (job_runs) e registros de log no período. */
  execucoes24h: number;
  erros24h: number;
  execucoes7d: number;
  erros7d: number;
  /** Fluxo com cron: horas desde a última execução (para detectar cron parado). */
  horasDesdeUltima: number | null;
  cronEsperadoHoras: number | null;
};

export type PendenciaItem = {
  id: string;
  titulo: string;
  subtitulo: string | null;
  mensagem: string | null;
  em: string | null;
  /** Ação de reprocesso disponível para o item. */
  acao: "cliente" | "ov" | "salesforce-pedido" | "salesforce-cliente" | "cron" | null;
  clienteId: string | null;
  /** Unidade do cliente (necessária para reenviar o cadastro). */
  instancia: string | null;
  propostaId: string | null;
  job: string | null;
};

export type PendenciaGrupo = {
  id: string;
  titulo: string;
  descricao: string;
  itens: PendenciaItem[];
  /** Aviso quando a consulta do grupo falhou (banco/coluna ausente). */
  erro: string | null;
};

export type PainelDados = {
  fluxos: FluxoSaude[];
  pendencias: PendenciaGrupo[];
  geradoEm: string;
};

/** Cron esperado de cada job, em horas (usado no alerta de "cron parado"). */
const CRON_HORAS: Record<string, number> = {
  "cron.estoque": 6,
  "cron.sap-nfs": 1,
  "cron.pix-reconsulta": 1,
  "cron.boleto-avisos": 24,
  "sap.sync-produtos": 24,
};

type Ctx = { supabase: any; userId: string };

const horasAtras = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

/** Casa cada fluxo do dicionário com os eventos de `integration_logs`. */
function combina(fluxo: FluxoDic, slug: string, event: string): boolean {
  if (slug !== fluxo.logSlug) return false;
  switch (fluxo.id) {
    case "sap-ov":
      return event.startsWith("ov.") || event === "reserva-estoque";
    case "sap-precos":
      return /preco|simul/i.test(event);
    case "sap-estoque":
      return /estoque/i.test(event) && event !== "reserva-estoque";
    case "sap-catalogo":
      return /produto|catalogo|material/i.test(event);
    case "sap-nfs":
      return true;
    default:
      return true;
  }
}

async function saude(ctx: Ctx, fluxos: FluxoDic[]): Promise<FluxoSaude[]> {
  const desde7d = horasAtras(24 * 7);

  const [runs, logs] = await Promise.all([
    ctx.supabase
      .from("job_runs")
      .select("job, status, error_message, started_at")
      .gte("started_at", desde7d)
      .order("started_at", { ascending: false })
      .limit(5000),
    ctx.supabase
      .from("integration_logs")
      .select("slug, event, level, message, created_at")
      .gte("created_at", desde7d)
      .order("created_at", { ascending: false })
      .limit(5000),
  ]);
  if (runs.error) throw new Error(runs.error.message);
  if (logs.error) throw new Error(logs.error.message);

  const corte24h = horasAtras(24);
  const runRows = (runs.data ?? []) as Array<{
    job: string;
    status: string;
    error_message: string | null;
    started_at: string;
  }>;
  const logRows = (logs.data ?? []) as Array<{
    slug: string;
    event: string;
    level: string;
    message: string | null;
    created_at: string;
  }>;

  return fluxos.map((fluxo) => {
    const doJob = fluxo.job ? runRows.filter((r) => r.job === fluxo.job) : [];
    const doLog = logRows.filter((l) => combina(fluxo, l.slug, l.event));

    const eventos = [
      ...doJob.map((r) => ({
        em: r.started_at,
        erro: r.status === "error",
        mensagem: r.error_message,
      })),
      ...doLog.map((l) => ({ em: l.created_at, erro: l.level === "error", mensagem: l.message })),
    ].sort((a, b) => (a.em < b.em ? 1 : -1));

    const recentes = eventos.filter((e) => e.em >= corte24h);
    const ultimo = eventos[0] ?? null;
    // Para "cron parado", só a execução do job conta (log solto não é execução).
    const ultimaExecucao = fluxo.job ? doJob[0]?.started_at ?? null : ultimo?.em ?? null;

    return {
      id: fluxo.id,
      titulo: fluxo.titulo,
      chamada: fluxo.chamada,
      job: fluxo.job ?? null,
      ultimo: {
        em: ultimo?.em ?? null,
        ok: ultimo ? !ultimo.erro : null,
        mensagem: ultimo?.mensagem ?? null,
      },
      execucoes24h: recentes.length,
      erros24h: recentes.filter((e) => e.erro).length,
      execucoes7d: eventos.length,
      erros7d: eventos.filter((e) => e.erro).length,
      horasDesdeUltima: ultimaExecucao
        ? Math.round(((Date.now() - new Date(ultimaExecucao).getTime()) / 3600_000) * 10) / 10
        : null,
      cronEsperadoHoras: fluxo.job ? CRON_HORAS[fluxo.job] ?? null : null,
    } satisfies FluxoSaude;
  });
}

/** Consulta livre na tabela `clientes` do Grupo 2P. */
async function clientes(filtros: Record<string, string>, select: string, limit = 100) {
  const params = new URLSearchParams({ select, limit: String(limit), order: "created_at.desc" });
  for (const [k, v] of Object.entries(filtros)) params.append(k, v);
  const { ok, status, text } = await grupo2pRest(`clientes?${params}`);
  if (!ok) throw new Error(`Erro no banco (${status}): ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : []) as Array<Record<string, any>>;
}

async function grupo(
  id: string,
  titulo: string,
  descricao: string,
  carregar: () => Promise<PendenciaItem[]>,
): Promise<PendenciaGrupo> {
  try {
    return { id, titulo, descricao, itens: await carregar(), erro: null };
  } catch (e) {
    return { id, titulo, descricao, itens: [], erro: e instanceof Error ? e.message : String(e) };
  }
}

const nomeCliente = (c: Record<string, any>) =>
  (c["razao_social"] as string) || (c["nome_fantasia"] as string) || (c["doc"] as string) || c["id"];

const rotuloProposta = (p: Record<string, any>) =>
  `Pedido ${p["numero"] ?? p["id"]}${p["nome_projeto"] ? ` — ${p["nome_projeto"]}` : ""}`;

const CAMPOS_PROPOSTA =
  "id, numero, nome_projeto, cliente_nome, status, organizacao, created_at, status_alterado_em," +
  " sap_ov_numero, sap_ov_status, sap_ov_mensagem, sap_ov_enviado_em, nf_numero, danfe_path," +
  " sf_opp_id, sf_status, sf_mensagem, sf_enviado_em";

async function pendenciasSap(fluxos: FluxoSaude[]): Promise<PendenciaGrupo[]> {
  return Promise.all([
    grupo(
      "clientes-sem-codigo",
      "Clientes sem código SAP",
      "Cadastros que nunca receberam código do SAP — o pedido desses clientes não pode ser criado.",
      async () => {
        const rows = await clientes(
          { or: "(numero_sap.is.null,numero_sap.eq.)" },
          "id, razao_social, nome_fantasia, doc, instancia, sap_status, sap_erro, created_at",
        );
        return rows.map((c) => ({
          id: `cliente:${c["id"]}`,
          titulo: nomeCliente(c),
          subtitulo: `${c["doc"] ?? "sem documento"} · ${c["instancia"] ?? "—"}`,
          mensagem: (c["sap_erro"] as string) ?? (c["sap_status"] ? `Status: ${c["sap_status"]}` : "Nunca enviado"),
          em: (c["created_at"] as string) ?? null,
          acao: "cliente" as const,
          clienteId: c["id"] as string,
          instancia: (c["instancia"] as string) ?? null,
          propostaId: null,
          job: null,
        }));
      },
    ),
    grupo(
      "ov-erro",
      "Pedidos com falha na ordem de venda",
      "Envio ao ZNFE_OV_CRIAR recusado — a mensagem completa do T_MSG está no item.",
      async () => {
        const rows = await consultarPropostas(
          { sap_ov_status: "eq.erro" },
          { select: CAMPOS_PROPOSTA, order: "created_at.desc", limit: 100 },
        );
        return rows.map((p) => ({
          id: `ov:${p["id"]}`,
          titulo: rotuloProposta(p),
          subtitulo: `${p["cliente_nome"] ?? "—"} · ${p["organizacao"] ?? "—"}`,
          mensagem: (p["sap_ov_mensagem"] as string) ?? null,
          em: (p["sap_ov_enviado_em"] as string) ?? (p["created_at"] as string) ?? null,
          acao: "ov" as const,
          clienteId: null,
          instancia: null,
          propostaId: p["id"] as string,
          job: "sap.ov-criar",
        }));
      },
    ),
    grupo(
      "ov-travada",
      "Envios travados em “enviando”",
      "O claim de envio foi feito há mais de uma hora e não concluiu — provável interrupção no meio do envio.",
      async () => {
        const rows = await consultarPropostas(
          { sap_ov_status: "eq.enviando" },
          { select: CAMPOS_PROPOSTA, order: "created_at.desc", limit: 100 },
        );
        const corte = Date.now() - 3600_000;
        return rows
          .filter((p) => {
            const t = Date.parse((p["sap_ov_enviado_em"] as string) ?? (p["created_at"] as string) ?? "");
            return Number.isFinite(t) ? t < corte : true;
          })
          .map((p) => ({
            id: `ov-travada:${p["id"]}`,
            titulo: rotuloProposta(p),
            subtitulo: `${p["cliente_nome"] ?? "—"} · ${p["organizacao"] ?? "—"}`,
            mensagem: "Envio marcado como em andamento sem retorno do SAP.",
            em: (p["sap_ov_enviado_em"] as string) ?? null,
            acao: "ov" as const,
            clienteId: null,
            instancia: null,
            propostaId: p["id"] as string,
            job: "sap.ov-criar",
          }));
      },
    ),
    grupo(
      "pedido-sem-ov",
      "Pedidos concluídos sem ordem de venda",
      "Pedido fechado no portal e ainda sem número (VBELN) do SAP.",
      async () => {
        const rows = await consultarPropostas(
          {
            sap_ov_numero: "is.null",
            status: 'in.("Aguardando Pagamento","Processando","Separação","Faturado","Coletado","Entregue")',
          },
          { select: CAMPOS_PROPOSTA, order: "created_at.desc", limit: 100 },
        );
        return rows
          .filter((p) => p["sap_ov_status"] !== "erro" && p["sap_ov_status"] !== "enviando")
          .map((p) => ({
            id: `sem-ov:${p["id"]}`,
            titulo: rotuloProposta(p),
            subtitulo: `${p["status"] ?? "—"} · ${p["cliente_nome"] ?? "—"}`,
            mensagem: (p["sap_ov_mensagem"] as string) ?? "Sem número de ordem de venda.",
            em: (p["status_alterado_em"] as string) ?? (p["created_at"] as string) ?? null,
            acao: "ov" as const,
            clienteId: null,
            instancia: null,
            propostaId: p["id"] as string,
            job: "sap.ov-criar",
          }));
      },
    ),
    grupo(
      "sem-danfe",
      "Faturados sem DANFE",
      "Nota fiscal emitida e o PDF da DANFE ainda não chegou pela consulta do SAP.",
      async () => {
        const rows = await consultarPropostas(
          { nf_numero: "not.is.null", danfe_path: "is.null" },
          { select: CAMPOS_PROPOSTA, order: "created_at.desc", limit: 100 },
        );
        return rows.map((p) => ({
          id: `danfe:${p["id"]}`,
          titulo: rotuloProposta(p),
          subtitulo: `NF ${p["nf_numero"]} · ${p["cliente_nome"] ?? "—"}`,
          mensagem: "Nota fiscal sem PDF da DANFE gravado.",
          em: (p["status_alterado_em"] as string) ?? null,
          acao: "cron" as const,
          clienteId: null,
          instancia: null,
          propostaId: p["id"] as string,
          job: "cron.sap-nfs",
        }));
      },
    ),
    grupo(
      "cron-parado",
      "Automações paradas",
      "Cron sem execução dentro da janela esperada — os pedidos param de avançar em silêncio.",
      async () =>
        fluxos
          .filter(
            (f) =>
              f.cronEsperadoHoras !== null &&
              (f.horasDesdeUltima === null || f.horasDesdeUltima > f.cronEsperadoHoras * 2),
          )
          .map((f) => ({
            id: `cron:${f.job}`,
            titulo: f.titulo,
            subtitulo: f.job,
            mensagem:
              f.horasDesdeUltima === null
                ? "Nenhuma execução nos últimos 7 dias."
                : `Última execução há ${f.horasDesdeUltima}h (esperado a cada ${f.cronEsperadoHoras}h).`,
            em: f.ultimo.em,
            acao: "cron" as const,
            clienteId: null,
            instancia: null,
            propostaId: null,
            job: f.job,
          })),
    ),
  ]);
}

async function pendenciasSalesforce(): Promise<PendenciaGrupo[]> {
  return Promise.all([
    grupo(
      "conta-sem-sf",
      "Clientes sem conta no Salesforce",
      "Sem Account sincronizada o pedido não consegue criar a Opportunity.",
      async () => {
        const rows = await clientes(
          { or: "(sf_account_id.is.null,sf_account_id.eq.,sf_status.eq.erro)" },
          "id, razao_social, nome_fantasia, doc, instancia, sf_account_id, sf_status, sf_erro, created_at",
        );
        return rows.map((c) => ({
          id: `sf-cliente:${c["id"]}`,
          titulo: nomeCliente(c),
          subtitulo: `${c["doc"] ?? "sem documento"} · ${c["instancia"] ?? "—"}`,
          mensagem: (c["sf_erro"] as string) ?? (c["sf_account_id"] ? "Última sincronização com erro." : "Nunca sincronizado."),
          em: (c["created_at"] as string) ?? null,
          acao: "salesforce-cliente" as const,
          clienteId: c["id"] as string,
          instancia: (c["instancia"] as string) ?? null,
          propostaId: null,
          job: null,
        }));
      },
    ),
    grupo(
      "pedido-erro-sf",
      "Pedidos com erro de sincronização",
      "A org do Salesforce recusou a operação — a mensagem real está no item.",
      async () => {
        const rows = await consultarPropostas(
          { sf_status: "eq.erro" },
          { select: CAMPOS_PROPOSTA, order: "created_at.desc", limit: 100 },
        );
        return rows.map((p) => ({
          id: `sf-erro:${p["id"]}`,
          titulo: rotuloProposta(p),
          subtitulo: `${p["cliente_nome"] ?? "—"} · ${p["organizacao"] ?? "—"}`,
          mensagem: (p["sf_mensagem"] as string) ?? null,
          em: (p["sf_enviado_em"] as string) ?? (p["created_at"] as string) ?? null,
          acao: "salesforce-pedido" as const,
          clienteId: null,
          instancia: null,
          propostaId: p["id"] as string,
          job: "salesforce.pedido",
        }));
      },
    ),
    grupo(
      "pedido-sem-opp",
      "Pedidos fechados sem Opportunity",
      "Pedido já fechado no portal e sem Opportunity criada.",
      async () => {
        const rows = await consultarPropostas(
          {
            sf_opp_id: "is.null",
            status:
              'in.("Aguardando Pagamento","Processando","Separação","Faturado","Coletado","Entregue","Pedido Concluído")',
          },
          { select: CAMPOS_PROPOSTA, order: "created_at.desc", limit: 100 },
        );
        return rows
          .filter((p) => p["sf_status"] !== "erro")
          .map((p) => ({
            id: `sf-sem-opp:${p["id"]}`,
            titulo: rotuloProposta(p),
            subtitulo: `${p["status"] ?? "—"} · ${p["cliente_nome"] ?? "—"}`,
            mensagem: "Sem Opportunity no Salesforce.",
            em: (p["status_alterado_em"] as string) ?? (p["created_at"] as string) ?? null,
            acao: "salesforce-pedido" as const,
            clienteId: null,
            instancia: null,
            propostaId: p["id"] as string,
            job: "salesforce.pedido",
          }));
      },
    ),
    grupo(
      "estagio-defasado",
      "Estágios defasados",
      "O status mudou no portal depois da última sincronização — a Opportunity está com o estágio antigo.",
      async () => {
        const rows = await consultarPropostas(
          { sf_opp_id: "not.is.null", status_alterado_em: "not.is.null" },
          { select: CAMPOS_PROPOSTA, order: "status_alterado_em.desc", limit: 200 },
        );
        return rows
          .filter((p) => {
            const mudou = Date.parse((p["status_alterado_em"] as string) ?? "");
            const sync = Date.parse((p["sf_enviado_em"] as string) ?? "");
            return Number.isFinite(mudou) && (!Number.isFinite(sync) || sync < mudou - 60_000);
          })
          .slice(0, 100)
          .map((p) => ({
            id: `sf-estagio:${p["id"]}`,
            titulo: rotuloProposta(p),
            subtitulo: `${p["status"] ?? "—"} · ${p["cliente_nome"] ?? "—"}`,
            mensagem: `Status alterado em ${p["status_alterado_em"]} · última sincronização ${p["sf_enviado_em"] ?? "nunca"}.`,
            em: (p["status_alterado_em"] as string) ?? null,
            acao: "salesforce-pedido" as const,
            clienteId: null,
            instancia: null,
            propostaId: p["id"] as string,
            job: "salesforce.pedido",
          }));
      },
    ),
  ]);
}

/** Dados completos de um painel de integração. */
export async function carregarPainel(ctx: Ctx, painel: Painel): Promise<PainelDados> {
  const fluxos = await saude(ctx, painel === "sap" ? FLUXOS_SAP : FLUXOS_SALESFORCE);
  const pendencias = painel === "sap" ? await pendenciasSap(fluxos) : await pendenciasSalesforce();
  return { fluxos, pendencias, geradoEm: new Date().toISOString() };
}
