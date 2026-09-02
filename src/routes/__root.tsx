import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  useRouterState,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import spaceGrotesk600 from "@fontsource/space-grotesk/files/space-grotesk-latin-600-normal.woff2?url";
import inter400 from "@fontsource/inter/files/inter-latin-400-normal.woff2?url";

import { reportLovableError } from "../lib/lovable-error-reporting";
import { InstanceProvider } from "@/components/instance-provider";
import { SimulationProvider, SimulationBanner } from "@/components/simulation";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { logUserActivity } from "@/lib/activity.functions";
import { useIdleSignout } from "@/hooks/use-idle-signout";
import { useAppVersionRefresh } from "@/hooks/use-app-version-refresh";

import { applyAreaAttribute } from "@/lib/admin-area";
import { AccessDenied } from "@/components/access-denied";
import { toFriendlyError } from "@/lib/friendly-errors";
import {
  ehErroDeVersaoAntiga,
  ouvirErrosDeVersaoAntiga,
  recarregarPorVersaoAntiga,
} from "@/lib/chunk-reload";

// Origem do backend — sempre derivada da configuração, nunca hardcoded.
const SUPABASE_ORIGIN: string =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  "https://npzlinbglznnnwxxcawh.supabase.co";


function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const friendly = toFriendlyError(error);
  const versaoAntiga = ehErroDeVersaoAntiga(error);
  useEffect(() => {
    // Aba presa numa publicação anterior: o arquivo pedido não existe mais.
    // Em vez de mostrar erro, limpa o cache e recarrega uma única vez.
    if (versaoAntiga && recarregarPorVersaoAntiga()) return;
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error, versaoAntiga]);

  if (versaoAntiga) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Atualizando o portal…
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Uma nova versão foi publicada. Estamos recarregando a página para você.
          </p>
        </div>
      </div>
    );
  }


  if (friendly.kind === "permissao") {
    return (
      <div className="min-h-screen bg-background">
        <AccessDenied title={friendly.title} description={friendly.description} />
      </div>
    );
  }

  if (friendly.kind === "sessao") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold tracking-tight">{friendly.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{friendly.description}</p>
          <a
            href="/auth"
            className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Entrar novamente
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Esta página não carregou
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ocorreu um problema da nossa parte. Tente novamente ou volte para a página inicial.
        </p>
        {error?.message && (
          <p className="mt-3 break-words rounded-md bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
            {error.message.slice(0, 300)}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Ir para o início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Portal 2P — Inteligência para Vendedores" },
      { name: "description", content: "Portal 2P: visão de carteira, pedidos e insights do Atlas para acelerar vendas." },
      { property: "og:title", content: "Portal 2P — Inteligência para Vendedores" },
      { property: "og:description", content: "Portal 2P: visão de carteira, pedidos e insights do Atlas para acelerar vendas." },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "Portal 2P — Inteligência para Vendedores" },
      { name: "twitter:description", content: "Portal 2P: visão de carteira, pedidos e insights do Atlas para acelerar vendas." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/0b017d20-3d07-4558-818e-42bc2a024677" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/0b017d20-3d07-4558-818e-42bc2a024677" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // Warm up the TLS connection to the backend — first auth check happens right after hydration.
      { rel: "preconnect", href: SUPABASE_ORIGIN, crossOrigin: "anonymous" },
      { rel: "dns-prefetch", href: SUPABASE_ORIGIN },
      // Preload only the two font files needed above the fold on first paint.
      // The remaining weights load via the CSS @font-face rules (font-display: swap).
      { rel: "preload", href: inter400, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
      { rel: "preload", href: spaceGrotesk600, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
    ],


  }),

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function AreaThemeSync() {
  // Tema por área, válido para todo o portal (qualquer instância):
  // rotas do Grupo 2P (administração/configurações) usam o tema neutro preto/branco.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    applyAreaAttribute(pathname);
  }, [pathname]);
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useIdleSignout();
  // Nova publicação detectada → refresh completo, sem cache antigo.
  useAppVersionRefresh();


  useEffect(() => {
    let lastUserId: string | null = null;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const uid = session?.user?.id ?? null;
      // Only nuke the cache on real identity boundaries: sign-out, or a different user
      // taking the session. SIGNED_IN and USER_UPDATED fire on ordinary token refreshes
      // and tab focus — clearing then would invalidate every fresh query for no reason.
      if (event === "SIGNED_OUT" || (event === "SIGNED_IN" && lastUserId !== null && lastUserId !== uid)) {
        queryClient.clear();
      }
      if (event === "SIGNED_IN" && uid && lastUserId !== uid) {
        // O middleware do cliente lê o token do storage; no instante do
        // SIGNED_IN ele ainda pode não estar persistido → 401. Só registra
        // depois de confirmar que a sessão já está hidratada.
        void (async () => {
          for (let i = 0; i < 5; i++) {
            const { data: s } = await supabase.auth.getSession();
            if (s.session?.access_token) {
              await logUserActivity({ data: { event: "login" } }).catch(() => {});
              return;
            }
            await new Promise((r) => setTimeout(r, 300));
          }
        })();
      }
      lastUserId = uid;
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <SimulationProvider>
        <InstanceProvider>
          <AreaThemeSync />
          <SimulationBanner />
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
          {/* Container dos avisos (toasts) — sem ele nenhuma mensagem de sucesso/erro aparece. */}
          <Toaster position="top-center" duration={2500} visibleToasts={2} closeButton />
        </InstanceProvider>
      </SimulationProvider>
    </QueryClientProvider>
  );
}
