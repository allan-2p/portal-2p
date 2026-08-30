/**
 * Radar do Atlas: varredura semanal que detecta clientes piorando.
 *
 * Sinais avaliados por cliente (janela de 90 dias contra os 90 anteriores):
 *  - geração: queda forte de faturamento ou parada de compras;
 *  - inatividade: tempo sem comprar acima do intervalo normal do cliente;
 *  - visitas/tarefas: nenhuma atividade registrada no Salesforce no período;
 *  - projeção x realizado: ritmo do trimestre abaixo da projeção histórica.
 *
 * Cada alerta tem uma recomendação de ação gerada pela IA (com texto de
 * fallback quando a IA não estiver disponível). O consultor responsável recebe
 * notificação no portal e um resumo por e-mail.
 */
import { escopoAtlas, propostasComEscopo, STATUS_GERACAO, type PropostaAtlas } from "./atlas-dados.server";
import { docCanonico } from "./cnpj";

const DIA = 86400000;
const JANELA = 90;

export type Sinal = { tipo: string; titulo: string; detalhe: string; peso: number };

type Agregado = {
  doc: string;
  nome: string;
  instancia: string;
  consultorId: string | null;
  consultorNome: string | null;
  atual: number;
  anterior: number;
  pedidosAtual: number;
  pedidosAnterior: number;
  ultimaCompra: number | null;
  intervaloMedio: number | null;
  historico: PropostaAtlas[];
};

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function agregar(rows: PropostaAtlas[], agora: number): Agregado[] {
  const inicioAtual = agora - JANELA * DIA;
  const inicioAnterior = agora - 2 * JANELA * DIA;
  const mapa = new Map<string, Agregado>();

  for (const r of rows) {
    if (!STATUS_GERACAO.includes(String(r.status))) continue;
    const doc = docCanonico(String(r.cliente_doc ?? ""));
    if (!doc) continue;
    const t = r.created_at ? Date.parse(String(r.created_at)) : NaN;
    if (!Number.isFinite(t)) continue;

    const a =
      mapa.get(doc) ??
      ({
        doc,
        nome: r.cliente_nome ?? doc,
        instancia: String(r.organizacao ?? "solar"),
        consultorId: r.consultor_id ?? null,
        consultorNome: r.consultor_nome ?? null,
        atual: 0,
        anterior: 0,
        pedidosAtual: 0,
        pedidosAnterior: 0,
        ultimaCompra: null,
        intervaloMedio: null,
        historico: [],
      } as Agregado);

    a.historico.push(r);
    if (t >= inicioAtual) {
      a.atual += r.valor;
      a.pedidosAtual += 1;
      a.consultorId = r.consultor_id ?? a.consultorId;
      a.consultorNome = r.consultor_nome ?? a.consultorNome;
      a.instancia = String(r.organizacao ?? a.instancia);
    } else if (t >= inicioAnterior) {
      a.anterior += r.valor;
      a.pedidosAnterior += 1;
    }
    a.ultimaCompra = Math.max(a.ultimaCompra ?? 0, t);
    mapa.set(doc, a);
  }

  for (const a of mapa.values()) {
    const datas = a.historico
      .map((h) => (h.created_at ? Date.parse(String(h.created_at)) : NaN))
      .filter((n) => Number.isFinite(n))
      .sort((x, y) => x - y);
    if (datas.length >= 3) {
      const gaps: number[] = [];
      for (let i = 1; i < datas.length; i++) gaps.push((datas[i]! - datas[i - 1]!) / DIA);
      a.intervaloMedio = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    }
  }
  return [...mapa.values()];
}

function sinaisDoCliente(a: Agregado, agora: number, temAtividade: boolean | null): Sinal[] {
  const sinais: Sinal[] = [];
  const diasSemComprar = a.ultimaCompra ? Math.floor((agora - a.ultimaCompra) / DIA) : null;

  if (a.anterior > 0) {
    const variacao = (a.atual - a.anterior) / a.anterior;
    if (a.atual === 0) {
      sinais.push({
        tipo: "geracao",
        titulo: "Parou de comprar",
        detalhe: `Faturou ${brl(a.anterior)} nos 90 dias anteriores e nada nos últimos 90.`,
        peso: 45,
      });
    } else if (variacao <= -0.4) {
      sinais.push({
        tipo: "geracao",
        titulo: "Queda de geração",
        detalhe: `${brl(a.atual)} nos últimos 90 dias contra ${brl(a.anterior)} no período anterior (${Math.round(variacao * 100)}%).`,
        peso: Math.min(40, Math.round(Math.abs(variacao) * 45)),
      });
    }
  }

  if (a.pedidosAnterior >= 2 && a.pedidosAtual < a.pedidosAnterior / 2) {
    sinais.push({
      tipo: "frequencia",
      titulo: "Frequência caindo",
      detalhe: `${a.pedidosAtual} pedido(s) nos últimos 90 dias contra ${a.pedidosAnterior} no período anterior.`,
      peso: 15,
    });
  }

  if (
    diasSemComprar !== null &&
    a.intervaloMedio &&
    diasSemComprar > Math.max(a.intervaloMedio * 2, 45)
  ) {
    sinais.push({
      tipo: "inatividade",
      titulo: "Tempo sem comprar acima do normal",
      detalhe: `${diasSemComprar} dias desde a última compra; o intervalo típico dele é de ${Math.round(a.intervaloMedio)} dias.`,
      peso: 20,
    });
  }

  if (temAtividade === false) {
    sinais.push({
      tipo: "visitas",
      titulo: "Sem visitas ou tarefas",
      detalhe: "Nenhuma atividade registrada no Salesforce nos últimos 90 dias.",
      peso: 15,
    });
  }

  // Projeção x realizado: ritmo dos últimos 90 dias projetado contra a média
  // histórica trimestral do próprio cliente.
  const historicoTotal = a.historico.reduce((s, h) => s + h.valor, 0);
  const primeira = a.historico
    .map((h) => (h.created_at ? Date.parse(String(h.created_at)) : NaN))
    .filter((n) => Number.isFinite(n))
    .sort((x, y) => x - y)[0];
  if (primeira) {
    const trimestres = Math.max((agora - primeira) / (DIA * JANELA), 1);
    const media = historicoTotal / trimestres;
    if (media > 0 && a.atual < media * 0.6 && a.anterior > 0) {
      sinais.push({
        tipo: "projecao",
        titulo: "Abaixo da projeção",
        detalhe: `Projeção pelo histórico: ${brl(media)} por trimestre; realizado no atual: ${brl(a.atual)}.`,
        peso: 10,
      });
    }
  }

  return sinais;
}

/** Contas com tarefas/eventos no Salesforce nos últimos 90 dias. */
async function contasComAtividade(): Promise<Set<string> | null> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const sfKey = process.env["SALESFORCE_API_KEY"];
  if (!lovableKey || !sfKey) return null;
  const desde = new Date(Date.now() - JANELA * DIA).toISOString().slice(0, 10);
  const soql = `SELECT AccountId FROM Task WHERE AccountId != null AND ActivityDate >= ${desde} LIMIT 2000`;
  try {
    const res = await fetch(
      `https://connector-gateway.lovable.dev/salesforce/query?q=${encodeURIComponent(soql)}`,
      {
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": sfKey,
        },
      },
    );
    if (!res.ok) {
      console.error("[atlas-radar] Salesforce", res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const json = (await res.json()) as { records?: Array<{ AccountId?: string }> };
    return new Set((json.records ?? []).map((r) => String(r.AccountId ?? "")).filter(Boolean));
  } catch (e) {
    console.error("[atlas-radar] Salesforce indisponível:", e);
    return null;
  }
}

function recomendacaoPadrao(a: Agregado, sinais: Sinal[]): string {
  const acoes = [
    `Ligar para ${a.nome} nesta semana e entender o que mudou na demanda.`,
    "Levantar o último pedido e propor recompra com condição comercial vigente.",
    "Agendar visita ou reunião nos próximos 15 dias e registrar a tarefa no Salesforce.",
  ];
  if (sinais.some((s) => s.tipo === "visitas")) {
    acoes.push("Registrar a atividade no CRM — hoje não há histórico de contato no período.");
  }
  return acoes.map((t) => `- ${t}`).join("\n");
}

/** Gera resumo + plano de ação com a IA (com fallback determinístico). */
async function recomendacaoIA(
  itens: Array<{ a: Agregado; sinais: Sinal[] }>,
): Promise<Map<string, { resumo: string; recomendacao: string }>> {
  const out = new Map<string, { resumo: string; recomendacao: string }>();
  const key = process.env["LOVABLE_API_KEY"];
  if (!key || !itens.length) return out;

  const { createLovableAiGatewayProvider, ATLAS_MODEL } = await import("./ai-gateway.server");
  const { generateObject } = await import("ai");
  const { z } = await import("zod");
  const gateway = createLovableAiGatewayProvider(key);

  const lote = itens.slice(0, 40).map(({ a, sinais }) => ({
    doc: a.doc,
    cliente: a.nome,
    unidade: a.instancia,
    faturamento_90d: brl(a.atual),
    faturamento_90d_anterior: brl(a.anterior),
    sinais: sinais.map((s) => `${s.titulo}: ${s.detalhe}`),
  }));

  try {
    const { object } = await generateObject({
      model: gateway(ATLAS_MODEL),
      schema: z.object({
        clientes: z.array(
          z.object({
            doc: z.string(),
            resumo: z.string(),
            recomendacao: z.string(),
          }),
        ),
      }),
      system:
        "Você é o Atlas, copiloto comercial do Grupo 2P. Para cada cliente em risco, escreva em português do Brasil: " +
        "um resumo de no máximo duas frases com os números do caso e uma recomendação com 3 ações objetivas em lista (uma por linha, começando com '- '), com prazo sugerido. " +
        "Não invente dados além dos fornecidos.",
      prompt: JSON.stringify(lote),
    });
    for (const c of object.clientes ?? []) {
      out.set(docCanonico(c.doc), { resumo: c.resumo, recomendacao: c.recomendacao });
    }
  } catch (e) {
    console.error("[atlas-radar] IA indisponível, usando texto padrão:", e);
  }
  return out;
}

export type ResultadoRadar = {
  avaliados: number;
  alertas: number;
  criticos: number;
  notificados: number;
  runId: string | null;
};

/** Executa a varredura completa (chamado pelo cron semanal e pelo botão admin). */
export async function executarRadarAtlas(): Promise<ResultadoRadar> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const agora = Date.now();
  const inicio = new Date(agora - JANELA * DIA).toISOString().slice(0, 10);
  const fim = new Date(agora).toISOString().slice(0, 10);

  const { data: run } = await supabaseAdmin
    .from("atlas_alerta_runs")
    .insert({ status: "running" } as never)
    .select("id")
    .single();
  const runId = (run as { id?: string } | null)?.id ?? null;

  try {
    // Varredura global: o escopo por consultor é aplicado na leitura (RLS da
    // tabela de alertas), então aqui olhamos a base inteira.
    const escopoGlobal = {
      verTudo: true,
      porInstancia: {
        solar: { userId: null, sap: null, docs: null },
        carregadores: { userId: null, sap: null, docs: null },
      },
    } as Awaited<ReturnType<typeof escopoAtlas>>;

    const rows = await propostasComEscopo(escopoGlobal, {});
    const agregados = agregar(rows, agora);
    const atividade = await contasComAtividade();

    const candidatos: Array<{ a: Agregado; sinais: Sinal[]; score: number }> = [];
    for (const a of agregados) {
      if (a.anterior === 0 && a.atual === 0) continue;
      const sinais = sinaisDoCliente(a, agora, atividade ? false : null);
      if (!sinais.length) continue;
      const score = sinais.reduce((s, x) => s + x.peso, 0);
      if (score < 20) continue;
      candidatos.push({ a, sinais, score });
    }
    candidatos.sort((x, y) => y.score - x.score);

    const textos = await recomendacaoIA(candidatos.slice(0, 40));

    let criticos = 0;
    let notificados = 0;
    const porConsultor = new Map<string, Array<{ nome: string; resumo: string }>>();

    for (const { a, sinais, score } of candidatos) {
      const severidade = score >= 45 ? "critico" : "atencao";
      if (severidade === "critico") criticos += 1;
      const texto = textos.get(a.doc);
      const resumo =
        texto?.resumo ??
        `${a.nome}: ${brl(a.atual)} nos últimos 90 dias contra ${brl(a.anterior)} no período anterior.`;
      const recomendacao = texto?.recomendacao ?? recomendacaoPadrao(a, sinais);
      const chave = `${a.doc}|${inicio}`;

      const { data: existente } = await supabaseAdmin
        .from("atlas_alertas")
        .select("id, situacao, silenciado_ate")
        .eq("chave", chave)
        .maybeSingle();

      const registro = {
        instancia: a.instancia,
        cliente_doc: a.doc,
        cliente_nome: a.nome,
        consultor_id: a.consultorId,
        consultor_nome: a.consultorNome,
        periodo_inicio: inicio,
        periodo_fim: fim,
        sinais: sinais.map(({ tipo, titulo, detalhe }) => ({ tipo, titulo, detalhe })),
        metricas: {
          faturamento_90d: a.atual,
          faturamento_90d_anterior: a.anterior,
          pedidos_90d: a.pedidosAtual,
          pedidos_90d_anterior: a.pedidosAnterior,
          dias_sem_comprar: a.ultimaCompra ? Math.floor((agora - a.ultimaCompra) / DIA) : null,
          intervalo_medio_dias: a.intervaloMedio ? Math.round(a.intervaloMedio) : null,
        },
        severidade,
        score,
        resumo,
        recomendacao,
        chave,
        run_id: runId,
      };

      if (existente) {
        await supabaseAdmin
          .from("atlas_alertas")
          .update(registro as never)
          .eq("id", (existente as { id: string }).id);
        continue;
      }

      await supabaseAdmin.from("atlas_alertas").insert(registro as never);

      // Silenciado recentemente para este cliente? Não incomoda de novo.
      const { data: silenciado } = await supabaseAdmin
        .from("atlas_alertas")
        .select("id")
        .eq("cliente_doc", a.doc)
        .eq("situacao", "silenciado")
        .gt("silenciado_ate", new Date().toISOString())
        .maybeSingle();
      if (silenciado) continue;

      if (a.consultorId) {
        const { criarNotificacao } = await import("./notificacoes.server");
        const ok = await criarNotificacao({
          user_id: a.consultorId,
          tipo: "atlas",
          titulo: `Atlas • ${a.nome} precisa de atenção`,
          descricao: resumo.slice(0, 240),
          link: "/atlas-ia/radar",
          ref_tipo: "atlas_alerta",
          chave,
        });
        if (ok) notificados += 1;
        const lista = porConsultor.get(a.consultorId) ?? [];
        lista.push({ nome: a.nome, resumo });
        porConsultor.set(a.consultorId, lista);
      }
    }

    await enviarResumoSemanal(porConsultor, inicio);

    if (runId) {
      await supabaseAdmin
        .from("atlas_alerta_runs")
        .update({
          status: "ok",
          finished_at: new Date().toISOString(),
          clientes_avaliados: agregados.length,
          alertas_gerados: candidatos.length,
        } as never)
        .eq("id", runId);
    }

    return {
      avaliados: agregados.length,
      alertas: candidatos.length,
      criticos,
      notificados,
      runId,
    };
  } catch (e) {
    if (runId) {
      await supabaseAdmin
        .from("atlas_alerta_runs")
        .update({
          status: "error",
          finished_at: new Date().toISOString(),
          erro: String((e as Error)?.message ?? e).slice(0, 500),
        } as never)
        .eq("id", runId);
    }
    throw e;
  }
}

/** Resumo semanal por e-mail para cada consultor com alertas novos. */
async function enviarResumoSemanal(
  porConsultor: Map<string, Array<{ nome: string; resumo: string }>>,
  inicio: string,
): Promise<void> {
  if (!porConsultor.size) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { enviarEmail, layoutEmail } = await import("./email.server");

  for (const [userId, itens] of porConsultor) {
    const { data: perfil } = await supabaseAdmin
      .from("profiles")
      .select("email, full_name")
      .eq("id", userId)
      .maybeSingle();
    const email = String((perfil as { email?: string } | null)?.email ?? "").trim();
    if (!email) continue;

    const corpo =
      `<p>Olá, ${(perfil as any)?.full_name ?? "tudo bem"}! O Atlas encontrou ${itens.length} cliente(s) da sua carteira precisando de atenção.</p>` +
      "<ul>" +
      itens
        .slice(0, 15)
        .map((i) => `<li><strong>${i.nome}</strong><br/>${i.resumo}</li>`)
        .join("") +
      "</ul>" +
      "<p>Abra o Radar do Atlas no portal para ver o plano de ação de cada cliente.</p>";

    await enviarEmail({
      to: email,
      subject: `Atlas • ${itens.length} cliente(s) precisando de atenção`,
      html: layoutEmail("Radar do Atlas", corpo),
      label: "atlas-radar-semanal",
      idempotencyKey: `atlas-radar-${userId}-${inicio}`,
    });
  }
}
