/**
 * Cadastro do webhook Pix no Itaú (Recebimentos Pix).
 *
 * O portal do Itaú não tem tela de cadastro: o webhook é registrado pela
 * própria API — `PUT /webhook/{chave}` com `{ "webhookUrl": "..." }`.
 * O Itaú acrescenta o sufixo "/pix" à URL cadastrada, por isso o token
 * do portal vai no caminho e não na query string.
 */

import { chamarItau, credenciaisPix, itauEnv } from "@/lib/itau-api.server";

function chavePix(): string {
  const chave = itauEnv("ITAU_PIX_CHAVE");
  if (!chave) throw new Error("Chave Pix não configurada (ITAU_PIX_CHAVE).");
  return chave;
}

function credenciais() {
  const cred = credenciaisPix();
  if (!cred) throw new Error("Credenciais do Pix Itaú não configuradas.");
  return cred;
}

function correlationId(): string {
  return crypto.randomUUID();
}

/** URL que deve ser cadastrada no Itaú (sem o sufixo "/pix"). */
export function urlSugerida(): { url: string; configurada: boolean } {
  const base =
    itauEnv("PORTAL_PUBLIC_URL") ?? itauEnv("VITE_PUBLIC_SITE_URL") ?? "https://portal.2pgroup.app";
  const token = itauEnv("ITAU_PIX_WEBHOOK_SECRET");
  return {
    url: `${base.replace(/\/+$/, "")}/api/public/hooks/pix-itau/${token ?? "<ITAU_PIX_WEBHOOK_SECRET>"}`,
    configurada: Boolean(token),
  };
}

export async function consultarWebhookPix(): Promise<Record<string, any>> {
  return await chamarItau({
    escopo: "pix",
    cred: credenciais(),
    metodo: "GET",
    caminho: `/webhook/${encodeURIComponent(chavePix())}`,
    correlationId: correlationId(),
  });
}

export async function cadastrarWebhookPix(webhookUrl: string): Promise<Record<string, any>> {
  const url = webhookUrl.trim();
  if (!/^https:\/\//i.test(url)) throw new Error("A URL do webhook precisa começar com https://");
  if (/\/pix\/?$/i.test(url)) {
    throw new Error('Não inclua o sufixo "/pix": o Itaú o acrescenta automaticamente.');
  }
  const resp = await chamarItau({
    escopo: "pix",
    cred: credenciais(),
    metodo: "PUT",
    caminho: `/webhook/${encodeURIComponent(chavePix())}`,
    body: { webhookUrl: url },
    correlationId: correlationId(),
  });
  return { ok: true, webhookUrl: url, resposta: resp };
}

export async function excluirWebhookPix(): Promise<Record<string, any>> {
  const resp = await chamarItau({
    escopo: "pix",
    cred: credenciais(),
    metodo: "DELETE",
    caminho: `/webhook/${encodeURIComponent(chavePix())}`,
    correlationId: correlationId(),
  });
  return { ok: true, resposta: resp };
}
