import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ArrowRight, Eye, EyeOff, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import logoBlack from "@/assets/2p-logo-black.png.asset.json";
import { ThemeToggle } from "@/components/theme-toggle";
import { LoginSplash } from "@/components/login-splash";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getActiveUsersToday } from "@/lib/active-users.functions";

const emailSchema = z
  .string()
  .trim()
  .min(1, "Informe seu e-mail.")
  .email("E-mail inválido.")
  .max(255, "E-mail muito longo.");

const passwordSchema = z
  .string()
  .min(1, "Informe sua senha.")
  .min(6, "Senha deve ter ao menos 6 caracteres.")
  .max(128, "Senha muito longa.");


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
  const [shake, setShake] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [splash, setSplash] = useState(false);
  const [touched, setTouched] = useState<{ email: boolean; password: boolean }>({ email: false, password: false });
  const [authError, setAuthError] = useState<string | null>(null);

  const fetchActive = useServerFn(getActiveUsersToday);
  const activeQ = useQuery({
    queryKey: ["auth-active-today"],
    queryFn: () => fetchActive(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const activeUsers = activeQ.data?.records ?? [];

  const emailError = useMemo(() => {
    if (!touched.email && !email) return null;
    const r = emailSchema.safeParse(email);
    return r.success ? null : r.error.issues[0].message;
  }, [email, touched.email]);

  const passwordError = useMemo(() => {
    if (resetMode) return null;
    if (!touched.password && !password) return null;
    const r = passwordSchema.safeParse(password);
    return r.success ? null : r.error.issues[0].message;
  }, [password, touched.password, resetMode]);

  const canSubmit =
    emailSchema.safeParse(email).success &&
    (resetMode || passwordSchema.safeParse(password).success);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/" });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setTouched({ email: true, password: true });
    const emailCheck = emailSchema.safeParse(email);
    const pwdCheck = resetMode ? { success: true as const } : passwordSchema.safeParse(password);
    if (!emailCheck.success || !pwdCheck.success) {
      toast.error("Corrija os campos destacados.");
      setShake((s) => s + 1);
      return;
    }
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
        setSplash(true);
        setTimeout(() => navigate({ to: "/" }), 1100);
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Erro ao entrar";
      const friendly =
        raw.includes("Invalid login") || raw.toLowerCase().includes("invalid credentials")
          ? "E-mail ou senha incorretos."
          : raw;
      setAuthError(friendly);
      toast.error(friendly);
      setShake((s) => s + 1);
      setLoading(false);
      return;
    }
    setLoading(false);
  }

  return (
    <div className="relative min-h-screen bg-background overflow-hidden flex flex-col">
      {splash && <LoginSplash />}
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

            <div className="flex items-center gap-3 min-h-[28px]">
              {activeQ.isLoading ? (
                <span className="text-xs text-muted-foreground/70 flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> carregando atividade…
                </span>
              ) : activeUsers.length === 0 ? (
                <span className="text-xs text-muted-foreground/70">
                  Nenhum usuário ativo no Portal hoje ainda.
                </span>
              ) : (
                <>
                  <div className="flex -space-x-2">
                    {activeUsers.slice(0, 5).map((u) => {
                      const initials = u.name
                        .split(/\s+/)
                        .map((s) => s[0])
                        .filter(Boolean)
                        .slice(0, 2)
                        .join("")
                        .toUpperCase();
                      return (
                        <div
                          key={u.id}
                          title={u.name}
                          className="h-7 w-7 rounded-full ring-2 ring-background bg-muted overflow-hidden flex items-center justify-center text-[10px] font-medium text-muted-foreground"
                        >
                          {u.avatarUrl ? (
                            <img src={u.avatarUrl} alt={u.name} className="h-full w-full object-cover" />
                          ) : (
                            initials || "·"
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {activeUsers.length === 1
                      ? "1 usuário ativo no Portal hoje"
                      : `${activeUsers.length} usuários ativos no Portal hoje`}
                  </span>
                </>
              )}
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

            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  E-mail
                </label>
                <div className="relative">
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); if (authError) setAuthError(null); }}
                    onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                    aria-invalid={!!emailError}
                    aria-describedby={emailError ? "email-error" : undefined}
                    placeholder="voce@2pgroup.com.br"
                    className={cn(
                      "w-full px-0 py-2.5 pr-7 bg-transparent border-0 border-b text-sm transition-colors focus:outline-none placeholder:text-muted-foreground/60",
                      emailError
                        ? "border-destructive focus:border-destructive"
                        : "border-border focus:border-primary",
                    )}
                  />
                  {!emailError && email && emailSchema.safeParse(email).success && (
                    <CheckCircle2 className="absolute right-0 top-1/2 -translate-y-1/2 h-4 w-4 text-success" />
                  )}
                </div>
                {emailError && (
                  <p id="email-error" className="flex items-center gap-1 text-[11px] text-destructive animate-fade-in">
                    <AlertCircle className="h-3 w-3" /> {emailError}
                  </p>
                )}
              </div>

              {!resetMode && (
                <div className="space-y-1.5">
                  <label htmlFor="password" className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Senha
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); if (authError) setAuthError(null); }}
                      onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                      aria-invalid={!!passwordError}
                      aria-describedby={passwordError ? "password-error" : undefined}
                      placeholder="••••••••"
                      className={cn(
                        "w-full px-0 py-2.5 pr-8 bg-transparent border-0 border-b text-sm transition-colors focus:outline-none placeholder:text-muted-foreground/60",
                        passwordError
                          ? "border-destructive focus:border-destructive"
                          : "border-border focus:border-primary",
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                      tabIndex={-1}
                      className="absolute right-0 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {passwordError && (
                    <p id="password-error" className="flex items-center gap-1 text-[11px] text-destructive animate-fade-in">
                      <AlertCircle className="h-3 w-3" /> {passwordError}
                    </p>
                  )}
                </div>
              )}

              {authError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive animate-fade-in"
                >
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}


              <button
                type="submit"
                disabled={loading || !canSubmit}
                className="group mt-2 w-full flex items-center justify-center gap-2 py-3 rounded-full bg-foreground text-background font-medium text-sm transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
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
