import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { MapeamentoItem, SfObjeto } from "@/lib/salesforce-campos";

type Objeto = SfObjeto;

const objetoValido = (v: unknown): Objeto => (v === "Opportunity" ? "Opportunity" : "Account");

/** Mapeamento salvo + campos disponíveis na org (describe). */
export const getSalesforceFieldMap = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { objeto: string }) => ({ objeto: objetoValido(d?.objeto) }))
  .handler(async ({ data, context }) => {
    const { requireAdminFeature } = await import("@/lib/guards.server");
    await requireAdminFeature(context as any, "admin.integracoes", "visualizar");

    const { carregarMapeamento } = await import("@/lib/salesforce-campos.server");
    const { describeObjeto } = await import("@/lib/salesforce-describe.server");

    const [overrides, describe] = await Promise.all([
      carregarMapeamento(data.objeto),
      describeObjeto(data.objeto),
    ]);
    return { objeto: data.objeto, overrides, camposOrg: describe.campos, erroOrg: describe.erro };
  });

export const saveSalesforceFieldMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { objeto: string; itens: MapeamentoItem[] }) => ({
    objeto: objetoValido(d?.objeto),
    itens: (Array.isArray(d?.itens) ? d.itens : []).map((i) => ({
      campo_portal: String(i?.campo_portal ?? "").slice(0, 120),
      sf_field: i?.sf_field ? String(i.sf_field).slice(0, 120) : null,
      ativo: i?.ativo !== false,
    })),
  }))
  .handler(async ({ data, context }) => {
    const { requireAdminFeature } = await import("@/lib/guards.server");
    await requireAdminFeature(context as any, "admin.integracoes", "editar");
    const { salvarMapeamento } = await import("@/lib/salesforce-campos.server");
    await salvarMapeamento(data.objeto, data.itens, context.userId ?? null);
    return { ok: true as const };
  });

/**
 * Prévia real: monta o payload que seria enviado ao Salesforce para o último
 * cliente/proposta (ou um registro específico), sem enviar nada.
 */
export const previewSalesforcePayload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { objeto: string; registroId?: string | null; itens?: MapeamentoItem[] }) => ({
    objeto: objetoValido(d?.objeto),
    registroId: d?.registroId ? String(d.registroId).slice(0, 64) : null,
    itens: Array.isArray(d?.itens)
      ? d.itens.map((i) => ({
          campo_portal: String(i?.campo_portal ?? ""),
          sf_field: i?.sf_field ? String(i.sf_field) : null,
          ativo: i?.ativo !== false,
        }))
      : null,
  }))
  .handler(async ({ data, context }) => {
    const { requireAdminFeature } = await import("@/lib/guards.server");
    await requireAdminFeature(context as any, "admin.integracoes", "visualizar");
    const { montarPreview } = await import("@/lib/salesforce-preview.server");
    return montarPreview(data.objeto, data.registroId, data.itens);
  });
