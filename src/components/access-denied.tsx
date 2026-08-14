import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Home, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAccessSuggestions } from "@/lib/access-fallback.functions";

/**
 * Tela padrão de bloqueio por permissão: explica em linguagem simples
 * e oferece rotas alternativas que o usuário realmente pode abrir.
 */
export function AccessDenied({
  title = "Acesso restrito",
  description = "Seu perfil não libera esta tela. Se precisar dela, peça a um administrador para ajustar o seu perfil de acesso.",
}: {
  title?: string;
  description?: string;
}) {
  const fetchSuggestions = useServerFn(getAccessSuggestions);
  const { data: suggestions } = useQuery({
    queryKey: ["access-suggestions"],
    queryFn: () => fetchSuggestions(),
    staleTime: 5 * 60_000,
  });

  return (
    <div className="mx-auto flex min-h-[55vh] w-full max-w-lg flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <ShieldAlert className="h-7 w-7 text-muted-foreground" />
      </div>
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>

      {!!suggestions?.length && (
        <div className="w-full rounded-lg border bg-card p-4 text-left">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Telas liberadas para você
          </p>
          <div className="flex flex-col gap-1">
            {suggestions.map((s) => (
              <Button
                key={s.path}
                asChild
                variant="ghost"
                className="h-9 justify-between px-2 text-sm"
              >
                <a href={s.path}>
                  <span>{s.label}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </a>
              </Button>
            ))}
          </div>
        </div>
      )}

      <Button asChild variant="outline">
        <Link to="/">
          <Home className="mr-2 h-4 w-4" />
          Voltar para a home
        </Link>
      </Button>
    </div>
  );
}
