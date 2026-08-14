import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { toFriendlyError } from "@/lib/friendly-errors";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // Erros de permissão/sessão viram mensagem amigável em qualquer tela do portal.
  const notify = (error: unknown) => {
    const f = toFriendlyError(error);
    if (f.kind === "desconhecido") return;
    toast.error(f.title, {
      description: f.description,
      action:
        f.kind === "sessao"
          ? { label: "Entrar", onClick: () => (window.location.href = "/auth") }
          : undefined,
    });
  };

  const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError: notify }),
    mutationCache: new MutationCache({ onError: notify }),
    defaultOptions: {
      queries: {
        // Trocar de janela/aba não deve disparar refetch: o cache continua fresco por 60s
        // e nenhuma tela recarrega/reanima ao voltar do alt-tab. Atualizações em tempo real
        // continuam funcionando via invalidateQueries após mutações e polling explícito.
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false,
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultPreloadDelay: 40,
  });

  return router;
};
