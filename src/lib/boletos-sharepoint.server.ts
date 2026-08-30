/**
 * Boletos a prazo publicados pelo financeiro no SharePoint.
 *
 * O boleto a prazo (forma "boleto_prazo" / condição ZTERM) NÃO é emitido pelo portal:
 * depois do faturamento, o financeiro sobe os PDFs no SharePoint
 * (`4- Boletos/1- Filial (9802)`). Este job varre os pedidos faturados,
 * procura os PDFs pelo número da NF, guarda no Storage e avisa o cliente
 * por e-mail — exatamente como a plataforma antiga (`avisoBoletos`).
 *
 * Se ainda não houver arquivo para a NF, nada é marcado: o pedido volta a
 * ser tentado no próximo ciclo.
 */

import { enviarEmail, layoutEmail } from "./email.server";
import { abrirSharepoint, listarArquivosDaNf, baixarArquivo } from "./sharepoint.server";

export const BOLETOS_BUCKET = "danfes";

export type BoletoArquivo = {
  nome: string;
  path: string;
  atualizado_em: string | null;
  tamanho: number;
};

export type BoletosSharepointResultado = {
  varridos: number;
  com_arquivos: number;
  avisados: number;
  arquivos: number;
  erros: string[];
};

function pastaProposta(id: string): string {
  return `boletos/propostas/${id}`;
}

function nomeSeguro(nome: string): string {
  return nome.replace(/[^\w.\- ()]+/g, "_").slice(0, 120);
}

/** Destinatários: financeiro do cadastro → e-mail financeiro → e-mail do pedido. */
async function destinatarios(row: Record<string, any>): Promise<string[]> {
  const lista: string[] = [];
  const doc = String(row["cliente_doc"] ?? "").replace(/\D/g, "");
  if (doc) {
    try {
      const { emailsCobrancaPorDoc } = await import("./contatos-db.server");
      lista.push(...(await emailsCobrancaPorDoc(doc)));
    } catch {
      /* cadastro indisponível: cai no e-mail do pedido */
    }
  }
  const doPedido = String(row["cliente_email"] ?? "").trim();
  if (doPedido.includes("@")) lista.push(doPedido);
  return [...new Set(lista.map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@")))];
}

/**
 * Processa uma proposta: procura os PDFs da NF, guarda no Storage e avisa.
 * Devolve `null` quando nenhum arquivo foi encontrado (tenta de novo depois).
 */
async function processarProposta(
  sessao: Awaited<ReturnType<typeof abrirSharepoint>>,
  row: Record<string, any>,
): Promise<{ arquivos: BoletoArquivo[]; emails: number } | null> {
  const nf = String(row["nf_numero"] ?? "").trim();
  const achados = await listarArquivosDaNf(sessao, sessao.cfg.pastaBoletos, nf);
  if (!achados.length) return null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const salvos: BoletoArquivo[] = [];

  for (const arq of achados.slice(0, 20)) {
    const bytes = await baixarArquivo(sessao, arq.id);
    const path = `${pastaProposta(String(row["id"]))}/${nomeSeguro(arq.nome)}`;
    const { error } = await supabaseAdmin.storage
      .from(BOLETOS_BUCKET)
      .upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (error) throw new Error(`Falha ao guardar ${arq.nome}: ${error.message}`);
    salvos.push({ nome: arq.nome, path, atualizado_em: arq.atualizado_em, tamanho: arq.tamanho });
  }

  const numero = String(row["numero"] ?? "s/nº");
  const destinos = await destinatarios(row);
  let emails = 0;
  if (destinos.length) {
    const linhas = salvos
      .map((a) => `<li style="margin:4px 0">${a.nome}</li>`)
      .join("");
    const html = layoutEmail(
      `Boletos do pedido ${numero}`,
      `<p>Seguem os boletos referentes à nota fiscal <strong>${nf}</strong> do pedido <strong>${numero}</strong>.</p>
       <ul style="padding-left:18px;margin:12px 0">${linhas}</ul>
       <p>Os arquivos também ficam disponíveis no portal, no detalhe do pedido.</p>
       <p style="margin-top:16px">Contas a Receber · 2P Group</p>`,
    );
    for (const to of destinos) {
      const ok = await enviarEmail({
        to,
        subject: `Boletos do pedido ${numero} (nota fiscal ${nf})`,
        html,
        label: "boletos-sharepoint",
        idempotencyKey: `boletos-sp:${row["id"]}:${nf}:${to}`,
      });
      if (ok) emails++;
    }
  }

  const { atualizarProposta } = await import("./propostas-db.server");
  await atualizarProposta(String(row["id"]), {
    boletos: salvos,
    boletos_avisados_em: new Date().toISOString(),
  });

  return { arquivos: salvos, emails };
}

/**
 * Varredura do cron: pedidos com boleto a prazo (`forma_pagamento = 'boleto_prazo'`),
 * NF emitida e ainda sem aviso enviado. Só pedidos faturados dentro da janela
 * configurável (`BOLETOS_SP_JANELA_DIAS`, default 30) entram, evitando e-mails
 * retroativos em massa para pedidos antigos migrados.
 */
export async function sincronizarBoletosSharepoint(limite = 100): Promise<BoletosSharepointResultado> {
  const { consultarPropostas } = await import("./propostas-db.server");

  const janelaDias = Math.max(1, Number(process.env["BOLETOS_SP_JANELA_DIAS"] ?? 30) || 30);
  const corte = new Date(Date.now() - janelaDias * 86_400_000).toISOString();

  const rows = (await consultarPropostas(
    {
      forma_pagamento: "eq.boleto_prazo",
      nf_numero: "not.is.null",
      boletos_avisados_em: "is.null",
      faturado_em: `gte.${corte}`,
    },
    {
      select: "id, numero, nf_numero, cliente_nome, cliente_doc, cliente_email, organizacao",
      order: "created_at.desc",
      limit: limite,
    },
  )) as Record<string, any>[];

  const out: BoletosSharepointResultado = {
    varridos: rows.length,
    com_arquivos: 0,
    avisados: 0,
    arquivos: 0,
    erros: [],
  };
  if (!rows.length) return out;

  const sessao = await abrirSharepoint();

  for (const row of rows) {
    try {
      const r = await processarProposta(sessao, row);
      if (!r) continue;
      out.com_arquivos++;
      out.arquivos += r.arquivos.length;
      if (r.emails > 0) out.avisados++;
    } catch (e) {
      out.erros.push(`Pedido ${row["numero"] ?? row["id"]}: ${(e as Error).message}`.slice(0, 300));
    }
  }

  return out;
}

/** URL assinada (5 min) de um boleto já guardado no Storage. */
export async function urlBoletoSharepoint(path: string, filename: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.storage
    .from(BOLETOS_BUCKET)
    .createSignedUrl(path, 300, { download: filename });
  if (error || !data?.signedUrl) {
    throw new Error(`Não foi possível abrir o boleto: ${error?.message ?? "URL indisponível"}`);
  }
  return data.signedUrl;
}
