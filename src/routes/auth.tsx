import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ArrowRight } from "lucide-react";
import logo from "@/assets/2p-logo.jpg";
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

const ACTIVE_SELLERS = [
  "https://i.pravatar.cc/80?img=12",
  "https://i.pravatar.cc/80?img=32",
  "https://i.pravatar.cc/80?img=47",
  "https://i.pravatar.cc/80?img=68",
];

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [shake, setShake] = useState(0);

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
      setShake((s) => s + 1);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-background overflow-hidden flex flex-col">
      {/* ambient — single soft glow */}
      <div className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[640px] w-[640px] rounded-full bg-primary/10 blur-[140px]" />

      {/* top bar */}
      <header className="relative z-10 flex items-center justify-between px-6 md:px-12 py-6">
        <div className="flex items-center gap-2.5">
          <img src={logo} alt="2P" className="h-8 w-auto rounded-md" />
          <span className="font-display font-semibold text-sm tracking-tight">Portal 2P</span>
        </div>
        <ThemeToggle />
      </header>

      {/* content */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-6 pb-16">
        <div className="w-full max-w-5xl grid lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          {/* Left — narrative */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-10"
          >
            <div className="space-y-6">
              <span className="inline-flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Portal interno · time 2P
              </span>
              <h1 className="font-display font-semibold tracking-tight text-[44px] md:text-[56px] leading-[1.02]">
                Inteligência
                <br />
                que move <span className="text-primary">metas.</span>
              </h1>
              <p className="text-[15px] text-muted-foreground max-w-md leading-relaxed">
                Carteira, pedidos e insights do Atlas em uma única tela — feita para quem vende.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                {ACTIVE_SELLERS.map((src, i) => (
                  <img
                    key={i}
                    src={src}
                    alt=""
                    className="h-7 w-7 rounded-full ring-2 ring-background object-cover"
                  />
                ))}
              </div>
              <span className="text-xs text-muted-foreground">
                Vendedores ativos no Portal hoje
              </span>
            </div>

            <div className="pt-6 border-t border-border/60 max-w-md">
              <p className="font-display italic text-[15px] leading-snug text-foreground/80">
                "Inovação e parceria é o que nos move!"
              </p>
            </div>
          </motion.div>

          {/* Right — form */}
          <motion.div
            key={shake}
            initial={{ opacity: 0, y: 12 }}
            animate={
              shake
                ? { x: [0, -6, 6, -4, 4, 0], opacity: 1, y: 0 }
                : { opacity: 1, y: 0 }
            }
            transition={{ duration: shake ? 0.4 : 0.6, ease: [0.22, 1, 0.36, 1], delay: shake ? 0 : 0.08 }}
            className="w-full max-w-sm justify-self-center lg:justify-self-end"
          >
            <div className="space-y-1.5 mb-8">
              <h2 className="font-display font-semibold text-2xl tracking-tight">
                {resetMode ? "Recuperar senha" : "Entrar"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {resetMode ? "Enviaremos um link de redefinição." : "Use seu e-mail corporativo 2P."}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  E-mail
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@2pgroup.com.br"
                  className="w-full px-0 py-2.5 bg-transparent border-0 border-b border-border text-sm transition-colors focus:outline-none focus:border-primary placeholder:text-muted-foreground/60"
                />
              </div>

              {!resetMode && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Senha
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-0 py-2.5 bg-transparent border-0 border-b border-border text-sm transition-colors focus:outline-none focus:border-primary placeholder:text-muted-foreground/60"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="group mt-2 w-full flex items-center justify-center gap-2 py-3 rounded-full bg-foreground text-background font-medium text-sm transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-60"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    {resetMode ? "Enviar instruções" : "Entrar"}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>

              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  type="button"
                  onClick={() => setResetMode((v) => !v)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {resetMode ? "Voltar ao login" : "Esqueci minha senha"}
                </button>
                <span className="text-muted-foreground/60">v1.0</span>
              </div>
            </form>
          </motion.div>
        </div>
      </main>

      <footer className="relative z-10 px-6 md:px-12 py-5 text-[11px] text-muted-foreground/70 flex justify-between">
        <span>© 2P Acessórios</span>
        <span>Acesso restrito</span>
      </footer>
    </div>
  );
}
