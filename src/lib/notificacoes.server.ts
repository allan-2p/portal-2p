/**
 * Notificações do portal (persistidas em public.notificacoes).
 *
 * São gravadas por processos de servidor (ex.: webhook do Pix) e lidas pelo
 * sino do portal. A coluna `chave` garante que o mesmo evento nunca gere
 * duas notificações para o mesmo usuário (idempotência).
 */

export type NovaNotificacao = {
  user_id: string;
  tipo?: "pagamento" | "task" | "atlas" | "info";
  titulo: string;
  descricao?: string | null;
  link?: string | null;
  ref_tipo?: string | null;
  ref_id?: string | null;
  /** Identificador único do evento — evita duplicidade em reentregas. */
  chave?: string | null;
};

/** Cria a notificação. Nunca lança: notificação não pode quebrar o fluxo. */
export async function criarNotificacao(n: NovaNotificacao): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("notificacoes")
      .upsert(
        {
          user_id: n.user_id,
          tipo: n.tipo ?? "info",
          titulo: n.titulo,
          descricao: n.descricao ?? null,
          link: n.link ?? null,
          ref_tipo: n.ref_tipo ?? null,
          ref_id: n.ref_id ?? null,
          chave: n.chave ?? null,
        } as any,
        { onConflict: "user_id,chave", ignoreDuplicates: true },
      );
    return !error;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Textos das notificações de pagamento Pix
// ---------------------------------------------------------------------------

export type PixNotificacaoTipo = "pago" | "expirado" | "cancelado";

const TEXTOS: Record<PixNotificacaoTipo, { titulo: (n: string) => string; descricao: string }> = {
  pago: {
    titulo: (numero) => `Pix confirmado · pedido ${numero}`,
    descricao: "Pagamento aprovado. O pedido seguiu para Processando.",
  },
  expirado: {
    titulo: (numero) => `Pix expirado · pedido ${numero}`,
    descricao: "A cobrança venceu sem pagamento. Reemita o Pix para o cliente.",
  },
  cancelado: {
    titulo: (numero) => `Pix cancelado · pedido ${numero}`,
    descricao: "A cobrança foi removida/devolvida e o pedido foi cancelado.",
  },
};

export function montarNotificacaoPix(input: {
  tipo: PixNotificacaoTipo;
  user_id: string;
  proposta_id: string;
  numero: string | null;
  cliente?: string | null;
  txid: string;
  de: string;
  para: string;
}): NovaNotificacao {
  const numero = input.numero ?? "s/nº";
  const t = TEXTOS[input.tipo];
  const cliente = input.cliente ? `${input.cliente} · ` : "";
  return {
    user_id: input.user_id,
    tipo: "pagamento",
    titulo: t.titulo(numero),
    descricao: `${cliente}${t.descricao}${input.de !== input.para ? ` (${input.de} → ${input.para})` : ""}`,
    ref_tipo: "proposta",
    ref_id: input.proposta_id,
    chave: `pix:${input.txid}:${input.tipo}`,
  };
}
