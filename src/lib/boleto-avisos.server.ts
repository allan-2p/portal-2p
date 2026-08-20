/**
 * Avisos de boleto (cron diário).
 *
 * Para cada pedido com boleto pendente:
 *  - vence em 2 dias  → aviso "vencendo"
 *  - já venceu        → aviso "vencido"
 *
 * Cada aviso gera notificação interna para o consultor dono do pedido e um
 * e-mail para o contato do cliente. A chave de idempotência garante 1 aviso
 * por pedido/tipo, mesmo se o cron rodar várias vezes no dia.
 */

import { criarNotificacao } from "./notificacoes.server";
import { enviarEmail, layoutEmail } from "./email.server";

export type BoletoAvisoTipo = "vencendo" | "vencido";

export type BoletoAvisosResultado = {
  analisados: number;
  vencendo: number;
  vencidos: number;
  notificacoes: number;
  emails: number;
};

const DIAS_AVISO = 2;

function dataISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dataBR(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export async function avisarBoletos(): Promise<BoletoAvisosResultado> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const hoje = new Date();
  const limite = new Date(hoje.getTime() + DIAS_AVISO * 86_400_000);

  const { data, error } = await supabaseAdmin
    .from("propostas")
    .select(
      "id, numero, created_by, cliente_nome, cliente_doc, cliente_email, pagamento_valor, pagamento_vencimento, pagamento_linha_digitavel, pagamento_url",
    )
    .eq("pagamento_meio", "boleto")
    .eq("pagamento_status", "pendente")
    .not("pagamento_vencimento", "is", null)
    .lte("pagamento_vencimento", dataISO(limite))
    .limit(200);

  if (error) throw new Error(`Falha ao listar boletos pendentes: ${error.message}`);

  const rows = (data ?? []) as Record<string, any>[];
  const out: BoletoAvisosResultado = {
    analisados: rows.length,
    vencendo: 0,
    vencidos: 0,
    notificacoes: 0,
    emails: 0,
  };

  for (const row of rows) {
    const venc = String(row["pagamento_vencimento"]).slice(0, 10);
    const tipo: BoletoAvisoTipo = venc < dataISO(hoje) ? "vencido" : "vencendo";
    if (tipo === "vencido") out.vencidos++;
    else out.vencendo++;

    const numero = String(row["numero"] ?? "s/nº");
    const valor = Number(row["pagamento_valor"] ?? 0);
    const chave = `boleto:${row["id"]}:${tipo}:${venc}`;

    // 1) Notificação interna para o consultor dono do pedido
    if (row["created_by"]) {
      const ok = await criarNotificacao({
        user_id: String(row["created_by"]),
        tipo: "pagamento",
        titulo:
          tipo === "vencido"
            ? `Boleto vencido · pedido ${numero}`
            : `Boleto vence em ${DIAS_AVISO} dias · pedido ${numero}`,
        descricao: `${row["cliente_nome"] ?? "Cliente"} · ${brl(valor)} · vencimento ${dataBR(venc)}.`,
        ref_tipo: "proposta",
        ref_id: String(row["id"]),
        chave,
      });
      if (ok) out.notificacoes++;
    }

    // 2) E-mail para o cliente
    const email = String(row["cliente_email"] ?? "").trim();
    if (email) {
      const linha = row["pagamento_linha_digitavel"]
        ? `<p style="margin:16px 0 0"><strong>Linha digitável:</strong><br><code style="font-size:13px">${row["pagamento_linha_digitavel"]}</code></p>`
        : "";
      const link = row["pagamento_url"]
        ? `<p style="margin:16px 0 0"><a href="${row["pagamento_url"]}" style="background:#111827;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Abrir boleto</a></p>`
        : "";
      const corpo =
        tipo === "vencido"
          ? `<p>Identificamos que o boleto do pedido <strong>${numero}</strong> no valor de <strong>${brl(valor)}</strong> venceu em <strong>${dataBR(venc)}</strong> e ainda não consta pago.</p><p>Se o pagamento já foi feito, desconsidere este aviso. Caso contrário, fale com o seu consultor para a emissão de uma nova via.</p>`
          : `<p>O boleto do pedido <strong>${numero}</strong> no valor de <strong>${brl(valor)}</strong> vence em <strong>${dataBR(venc)}</strong>.</p>`;

      const enviado = await enviarEmail({
        to: email,
        subject:
          tipo === "vencido"
            ? `Boleto vencido · pedido ${numero}`
            : `Seu boleto vence em ${DIAS_AVISO} dias · pedido ${numero}`,
        html: layoutEmail(tipo === "vencido" ? "Boleto vencido" : "Boleto a vencer", corpo + linha + link),
        label: `boleto-${tipo}`,
        idempotencyKey: chave,
      });
      if (enviado) out.emails++;
    }
  }

  return out;
}
