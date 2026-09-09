import { formatSapNumero } from "@/lib/sap-numero";
/**
 * Aviso de pedido em triangulação (remessa por conta e ordem).
 *
 * O SAP não cadastra o destinatário sozinho: a ordem sai normal no cliente da
 * proposta e o fiscal precisa cadastrar o destinatário vinculado ao cliente e
 * emitir as notas de venda à ordem. Nunca lança: o aviso não pode derrubar o
 * checkout.
 */

const FIXOS = ["allan@2pgroup.com.br", "nfe@2pgroup.com.br", "financeiro@2pgroup.com.br"];

/** E-mail do consultor responsável, quando o perfil tiver um cadastrado. */
async function emailConsultor(row: Record<string, any>): Promise<string> {
  const direto = String(row["consultor_email"] ?? row["vendedor_email"] ?? "").trim();
  if (direto) return direto;
  const id = String(row["consultor_id"] ?? "").trim();
  if (!id) return "";
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("profiles").select("email").eq("id", id).maybeSingle();
    return String((data as any)?.email ?? "").trim();
  } catch {
    return "";
  }
}

async function destinos(row: Record<string, any>): Promise<string[]> {
  const extras = String(process.env["TRIANGULACAO_NOTIFICACAO_EMAIL"] ?? "")
    .split(/[;,]/)
    .map((e) => e.trim());
  const consultor = await emailConsultor(row);
  return Array.from(
    new Set([...FIXOS, ...extras, consultor].map((e) => e.toLowerCase()).filter((e) => e.includes("@"))),
  );
}

export async function avisarTriangulacao(row: Record<string, any>): Promise<boolean> {
  try {
    if (!String(row?.["tipo_nf"] ?? "").toLowerCase().startsWith("triangul")) return false;

    const numero = String(row["numero"] ?? row["id"] ?? "");
    const cliente = String(row["cliente_nome"] ?? "");
    const clienteDoc = String(row["cliente_doc"] ?? "");
    const vbeln = String(row["sap_ov_numero"] ?? "").trim();
    const e = (row["entrega"] ?? {}) as Record<string, any>;
    const endereco = [
      [e["logradouro"], e["numero"]].filter(Boolean).join(", "),
      e["complemento"],
      e["bairro"],
      [e["cidade"], e["uf"]].filter(Boolean).join(" - "),
      e["cep"] ? `CEP ${e["cep"]}` : "",
    ]
      .filter((p) => String(p ?? "").trim())
      .join(" · ");

    const { enviarEmail, layoutEmail } = await import("./email.server");
    const html = layoutEmail(
      `Venda à ordem — pedido ${numero}`,
      `<p>Pedido concluído como <strong>triangulação (remessa por conta e ordem)</strong>.</p>` +
        `<p>Pedido: <strong>${numero}</strong><br/>Ordem de venda SAP: ${formatSapNumero(vbeln) || "aguardando"}</p>` +
        `<p><strong>Faturar para (cliente da proposta)</strong><br/>${cliente}${clienteDoc ? ` — ${clienteDoc}` : ""}</p>` +
        `<p><strong>Entregar no destinatário</strong><br/>${String(e["nome"] ?? "")}` +
        `${e["doc"] ? ` — CNPJ/CPF ${e["doc"]}` : ""}` +
        `${e["ie"] ? `<br/>IE ${e["ie"]}` : ""}` +
        `<br/>${e["contribuinte"] === true ? "Contribuinte de ICMS" : "Não contribuinte de ICMS"}` +
        `${endereco ? `<br/>${endereco}` : ""}` +
        `${e["contato"] ? `<br/>Contato ${e["contato"]}` : ""}${e["telefone"] ? ` · ${e["telefone"]}` : ""}</p>` +
        `<p>Cadastrar o destinatário no SAP vinculado ao cliente e emitir as notas de venda à ordem.</p>`,
      `Pedido ${numero} — venda à ordem`,
    );

    const lista = await destinos(row);
    let enviados = 0;
    for (const to of lista) {
      const ok = await enviarEmail({
        to,
        subject: `Venda à ordem (triangulação) — pedido ${numero}`,
        html,
        label: "triangulacao",
        idempotencyKey: `triangulacao-${row["id"]}-${to}`,
      });
      if (ok) enviados++;
    }
    return enviados > 0;
  } catch {
    return false;
  }
}
