/**
 * Provider do Lovable AI Gateway para o AI SDK.
 *
 * Só pode ser usado em código de servidor: a LOVABLE_API_KEY é segredo.
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const ATLAS_MODEL = "google/gemini-3.7-flash";

export function createLovableAiGatewayProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "lovable-ai-gateway",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
  });
}

/** Mensagem amigável para os erros conhecidos do gateway. */
export function mensagemErroGateway(status: number): string {
  if (status === 429) return "O Atlas está recebendo muitas perguntas agora. Tente de novo em instantes.";
  if (status === 402) return "Os créditos de IA do workspace acabaram. Recarregue para continuar usando o Atlas.";
  if (status === 403) return "A IA está bloqueada por política do workspace. Fale com um administrador.";
  if (status === 401) return "A chave da IA não está configurada no ambiente.";
  return "Não consegui falar com a IA agora.";
}
