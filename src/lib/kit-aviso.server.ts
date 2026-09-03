/**
 * Aviso de pedido com Kit Fotovoltaico para produção/logística.
 *
 * O kit-base (200000691) é montado internamente e sai no SAP como o material
 * de produção 100000278, então a equipe precisa ser avisada assim que o pedido
 * é concluído. Nunca lança: o aviso não pode derrubar o checkout.
 */

const DESTINOS = () =>
  String(process.env["KIT_NOTIFICACAO_EMAIL"] ?? "")
    .split(/[;,]/)
    .map((e) => e.trim())
    .filter((e) => e.includes("@"));

export async function avisarKitFotovoltaico(row: Record<string, any>): Promise<boolean> {
  try {
    if (!row?.["kit_fotovoltaico"]) return false;

    const numero = String(row["numero"] ?? row["id"] ?? "");
    const cliente = String(row["cliente_nome"] ?? "");
    const vbeln = String(row["sap_ov_numero"] ?? "").trim();
    const itens = Array.isArray(row["itens"]) ? (row["itens"] as any[]) : [];
    const linhas = itens
      .map((i) => `<li>${i?.codigo ?? ""} — ${i?.nome ?? i?.descricao ?? ""} — ${Number(i?.qtd ?? 0)} un</li>`)
      .join("");

    const { enviarEmail, layoutEmail } = await import("./email.server");
    const html = layoutEmail(
      `Kit fotovoltaico — pedido ${numero}`,
      `<p>Novo pedido com <strong>kit fotovoltaico</strong>.</p>` +
      `<p>Pedido: <strong>${numero}</strong><br/>Cliente: ${cliente}<br/>` +
      `Ordem de venda SAP: ${vbeln || "aguardando"}</p>` +
      `<p>Material de produção: <strong>100000278</strong> (comercial 200000691).</p>` +
      `<ul>${linhas}</ul>`,
      `Pedido ${numero} — ${cliente}`,
    );

    const destinos = DESTINOS();
    let enviados = 0;
    for (const to of destinos) {
      const ok = await enviarEmail({
        to,
        subject: `Kit fotovoltaico do pedido ${numero}`,
        html,
        label: "kit-fotovoltaico",
        idempotencyKey: `kit-${row["id"]}-${to}`,
      });
      if (ok) enviados++;
    }

    // Sem destinatário configurado o aviso não pode sumir em silêncio:
    // registra a pendência para aparecer no monitoramento.
    if (!destinos.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("integration_logs").insert({
        integracao: "kit-fotovoltaico",
        evento: "aviso_sem_destinatario",
        status: "erro",
        mensagem:
          "Pedido de kit fotovoltaico concluído sem KIT_NOTIFICACAO_EMAIL configurado — produção não foi avisada.",
        ref_id: row["id"] ?? null,
      } as any);
    }
    return enviados > 0;
  } catch {
    return false;
  }
}
