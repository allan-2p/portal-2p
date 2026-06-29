import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Lock, Sparkles, TrendingUp, Package, ArrowRight } from "lucide-react";
import logo from "@/assets/2p-logo.jpg";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

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

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0 },
};

function BentoCard({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="show"
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay }}
      className={cn(
        "relative rounded-2xl border border-border/70 bg-card overflow-hidden",
        "shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.08)]",
        className,
      )}
    >
      {children}
    </motion.div>
  );
}

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
    <div className="relative min-h-screen bg-background overflow-hidden">
      {/* ambient background — radial dot grid + warm glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, color-mix(in oklab, var(--foreground) 18%, transparent) 1px, transparent 0)",
          backgroundSize: "22px 22px",
        }}
      />
      <div className="pointer-events-none absolute -top-32 -left-32 h-[520px] w-[520px] rounded-full bg-primary/25 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-20 h-[480px] w-[480px] rounded-full bg-[oklch(0.78_0.18_60)]/20 blur-[140px]" />

      {/* top bar */}
      <header className="relative z-10 flex items-center justify-between px-6 md:px-10 py-5">
        <div className="flex items-center gap-3">
          <img src={logo} alt="2P" className="h-9 w-auto rounded-lg ring-1 ring-border" />
          <div>
            <div className="font-display font-bold text-base leading-none">Portal 2P</div>
            <div className="text-[11px] text-muted-foreground mt-1">Inteligência de vendas</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground px-2.5 py-1 rounded-full border border-border bg-card/60">
            <Lock className="h-3 w-3" /> Acesso restrito
          </span>
          <ThemeToggle />
        </div>
      </header>

      {/* bento grid */}
      <main className="relative z-10 px-4 md:px-10 pb-10">
        <div className="mx-auto max-w-7xl grid gap-4 lg:grid-cols-12 lg:grid-rows-[auto_auto_auto]">
          {/* Hero card */}
          <BentoCard className="lg:col-span-7 lg:row-span-2 p-8 md:p-12" delay={0.05}>
            <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-primary/5" />
            <div className="relative flex flex-col h-full">
              <div className="inline-flex items-center gap-2 text-[11px] font-medium text-muted-foreground self-start px-2.5 py-1 rounded-full border border-border bg-background/60">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
                </span>
                Portal interno · time 2P
              </div>

              <h1 className="font-display font-bold tracking-tight text-4xl md:text-5xl lg:text-6xl leading-[1.02] mt-8">
                Inteligência<br />que move <span className="text-primary">metas.</span>
              </h1>
              <p className="text-base md:text-lg text-muted-foreground mt-5 max-w-md leading-relaxed">
                Carteira, pedidos e insights do Atlas em uma única tela — feita para quem vende.
              </p>

              <div className="mt-auto pt-10 flex items-center gap-3 text-xs text-muted-foreground">
                <div className="flex -space-x-2">
                  {["#ff6b35", "#1a1a2e", "#f7931e"].map((c) => (
                    <span key={c} className="h-6 w-6 rounded-full ring-2 ring-card" style={{ background: c }} />
                  ))}
                </div>
                <span>Vendedores ativos no Portal hoje</span>
              </div>
            </div>
          </BentoCard>

          {/* Form card */}
          <BentoCard className="lg:col-span-5 lg:row-span-3 p-7 md:p-9" delay={0.12}>
            <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-primary/20 via-transparent to-transparent opacity-60 pointer-events-none" />
            <motion.div
              key={shake}
              animate={shake ? { x: [0, -6, 6, -4, 4, 0] } : {}}
              transition={{ duration: 0.4 }}
              className="relative flex flex-col h-full"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-display font-semibold text-xl">
                  {resetMode ? "Recuperar senha" : "Entrar na sua conta"}
                </h2>
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary px-2 py-0.5 rounded-full bg-primary/10">
                  <Sparkles className="h-3 w-3" /> Atlas
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-1.5">
                {resetMode ? "Enviamos um link de redefinição." : "Use seu e-mail corporativo 2P."}
              </p>

              <form onSubmit={handleSubmit} className="mt-7 space-y-4 flex-1 flex flex-col">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    E-mail
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@2pgroup.com.br"
                    className="w-full px-3.5 py-3 rounded-xl bg-background border border-border text-sm transition-all focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                </div>

                {!resetMode && (
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Senha
                    </label>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3.5 py-3 rounded-xl bg-background border border-border text-sm transition-all focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="group relative w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm transition-all hover:shadow-[0_8px_24px_-8px_var(--primary)] hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0"
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
                    className="text-muted-foreground hover:text-primary transition-colors"
                  >
                    {resetMode ? "Voltar ao login" : "Esqueci minha senha"}
                  </button>
                  <span className="text-muted-foreground/70">v1.0</span>
                </div>

                <div className="mt-auto pt-6 border-t border-border/70">
                  <p className="text-[11px] text-muted-foreground text-center">
                    Problemas para acessar? Fale com o administrador.
                  </p>
                </div>
              </form>
            </motion.div>
          </BentoCard>

          {/* Stat card 1 */}
          <BentoCard className="lg:col-span-3 p-6 group hover:-translate-y-0.5 transition-transform" delay={0.2}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Vendido no mês
              </span>
              <TrendingUp className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="font-display font-bold text-3xl mt-3 tracking-tight">R$ 38M</div>
            <div className="text-xs text-success mt-1">+12% vs. meta</div>
          </BentoCard>

          {/* Stat card 2 */}
          <BentoCard className="lg:col-span-2 p-6 group hover:-translate-y-0.5 transition-transform" delay={0.25}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Pedidos
              </span>
              <Package className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="font-display font-bold text-3xl mt-3 tracking-tight">1.2k</div>
            <div className="text-xs text-muted-foreground mt-1">ativos hoje</div>
          </BentoCard>

          {/* Tag Atlas (full width on the row) */}
          <BentoCard className="lg:col-span-2 p-6 bg-gradient-to-br from-primary/10 via-card to-card" delay={0.3}>
            <div className="flex flex-col h-full justify-between">
              <Sparkles className="h-5 w-5 text-primary" />
              <div>
                <div className="font-display font-semibold text-sm leading-tight">Atlas AI</div>
                <div className="text-[11px] text-muted-foreground mt-1">sugestões em tempo real</div>
              </div>
            </div>
          </BentoCard>

          {/* Quote */}
          <BentoCard className="lg:col-span-7 p-6 md:p-7" delay={0.35}>
            <div className="flex items-start gap-4">
              <div className="w-1 self-stretch rounded-full bg-primary shrink-0" />
              <div>
                <p className="font-display italic text-base md:text-lg leading-snug text-foreground/90">
                  "Inovação e parceria é o que nos move!"
                </p>
                <div className="text-[11px] text-muted-foreground mt-2 uppercase tracking-wider">
                  — Diretoria 2P Acessórios
                </div>
              </div>
            </div>
          </BentoCard>
        </div>
      </main>
    </div>
  );
}
