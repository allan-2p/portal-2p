import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Sun } from "lucide-react";
import logo from "@/assets/2p-logo.jpg";
import authBg from "@/assets/auth-bg.jpg";
import { ThemeToggle } from "@/components/theme-toggle";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar — Portal 2P" },
      { name: "description", content: "Acesse o Portal 2P." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetMode, setResetMode] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/" });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (resetMode) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Enviamos um e-mail com as instruções.");
        setResetMode(false);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bem-vindo de volta!");
        navigate({ to: "/" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao entrar";
      toast.error(msg.includes("Invalid login") ? "E-mail ou senha incorretos." : msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Hero panel */}
      <div className="relative hidden lg:block overflow-hidden">
        <img
          src={authBg}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-black/80 via-black/40 to-transparent" />
        <div className="absolute inset-0 flex flex-col justify-between p-10 text-white">
          <div className="flex items-center gap-3">
            <img src={logo} alt="2P" className="h-10 w-auto rounded-lg ring-1 ring-white/20" />
            <div>
              <div className="font-display font-bold text-lg leading-none">Portal 2P</div>
              <div className="text-[11px] text-white/70 mt-1">Inteligência de vendas</div>
            </div>
          </div>
          <div className="max-w-md">
            <div className="h-px w-12 bg-primary mb-5" />
            <h2 className="font-display font-semibold text-3xl leading-tight">
              Energia que move metas.
            </h2>
            <p className="text-sm text-white/70 mt-3">
              Carteira, pedidos e insights do Atlas em uma única tela — feita para quem vende.
            </p>
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="relative flex items-center justify-center px-4 py-10">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-8 lg:hidden">
            <div className="flex items-center gap-3 mb-3">
              <img src={logo} alt="2P" className="h-12 w-auto rounded-lg" />
              <div>
                <div className="font-display font-bold text-xl leading-none">Portal 2P</div>
                <div className="text-xs text-muted-foreground mt-1">Inteligência de vendas</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sun className="h-3 w-3" /> Acesso restrito ao time 2P
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4"
          >
            <h1 className="font-display font-bold text-lg">
              {resetMode ? "Recuperar senha" : "Entrar na sua conta"}
            </h1>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">E-mail</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@2pgroup.com.br"
                className="w-full px-3 py-2.5 rounded-lg bg-background border border-border text-sm focus:outline-none focus:border-primary"
              />
            </div>

            {!resetMode && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Senha</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2.5 rounded-lg bg-background border border-border text-sm focus:outline-none focus:border-primary"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {resetMode ? "Enviar instruções" : "Entrar"}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => setResetMode((v) => !v)}
                className="text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                {resetMode ? "Voltar ao login" : "Esqueci minha senha"}
              </button>
            </div>
          </form>

          <p className="text-center text-xs text-muted-foreground mt-6">
            Não tem acesso?{" "}
            <Link to="/auth" className="text-primary hover:underline">
              Fale com o administrador
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
