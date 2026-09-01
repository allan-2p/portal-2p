/**
 * Carregamento sob demanda do chat do Atlas.
 *
 * O AtlasChat arrasta bibliotecas pesadas (markdown, realce de código,
 * diagramas e animações). Importado direto, esse peso entrava no bundle de
 * todas as telas por causa do widget no rodapé do AppLayout. Aqui ele vira um
 * chunk separado, baixado só quando o chat é aberto de fato.
 */
import { Suspense, lazy, type ComponentProps } from "react";
import { Loader2 } from "lucide-react";
import type { AtlasChat as AtlasChatType } from "./atlas-chat";

const AtlasChatImpl = lazy(() =>
  import("./atlas-chat").then((m) => ({ default: m.AtlasChat })),
);

export function AtlasChatLazy(props: ComponentProps<typeof AtlasChatType>) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full min-h-40 items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      }
    >
      <AtlasChatImpl {...props} />
    </Suspense>
  );
}
