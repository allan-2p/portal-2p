/**
 * Traduz erros técnicos (guards de permissão, auth, rede) em mensagens
 * amigáveis para o usuário final.
 */
export type FriendlyError = {
  kind: "permissao" | "sessao" | "rede" | "desconhecido";
  title: string;
  description: string;
};

function messageOf(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  const anyErr = error as any;
  return String(anyErr?.message ?? anyErr?.error ?? "");
}

export function toFriendlyError(error: unknown): FriendlyError {
  const raw = messageOf(error);
  const msg = raw.toLowerCase();

  if (
    msg.includes("forbidden") ||
    msg.includes("403") ||
    msg.includes("não permite") ||
    msg.includes("nao permite") ||
    msg.includes("permission denied") ||
    msg.includes("row-level security") ||
    msg.includes("not allowed")
  ) {
    return {
      kind: "permissao",
      title: "Você não tem permissão para isso",
      description:
        "Seu perfil de acesso não libera esta ação. Peça a um administrador para ajustar o seu perfil.",
    };
  }

  if (
    msg.includes("unauthorized") ||
    msg.includes("401") ||
    msg.includes("jwt") ||
    msg.includes("no authorization header")
  ) {
    return {
      kind: "sessao",
      title: "Sua sessão expirou",
      description: "Entre novamente para continuar de onde parou.",
    };
  }

  if (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("timeout") ||
    msg.includes("504")
  ) {
    return {
      kind: "rede",
      title: "Falha de conexão",
      description: "Não conseguimos falar com o servidor. Tente novamente em instantes.",
    };
  }

  return {
    kind: "desconhecido",
    title: "Não foi possível concluir",
    description: raw || "Tente novamente. Se continuar, avise um administrador.",
  };
}

export function isPermissionError(error: unknown): boolean {
  return toFriendlyError(error).kind === "permissao";
}
