import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ArrowRight, Eye, EyeOff, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import logoBlackSm from "@/assets/2p-logo-black-sm.webp";
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
  const activeTotal = activeQ.data?.total ?? 0;

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
    <div className="relative min-h-screen w-full flex flex-col bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 overflow-hidden transition-colors duration-300">
      {splash && <LoginSplash />}

      {/* Futuristic silver atmosphere */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {/* Base metallic wash */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(226,232,240,0.55),transparent_60%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(63,63,70,0.35),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(203,213,225,0.4),transparent_55%)] dark:bg-[radial-gradient(ellipse_at_bottom,rgba(24,24,27,0.6),transparent_55%)]" />

        {/* Slowly rotating chrome conic — the "sheen" */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[140vmax] h-[140vmax] opacity-[0.35] dark:opacity-[0.18]"
          style={{
            background:
              "conic-gradient(from 0deg at 50% 50%, rgba(148,163,184,0), rgba(226,232,240,0.55), rgba(148,163,184,0), rgba(203,213,225,0.5), rgba(148,163,184,0), rgba(241,245,249,0.6), rgba(148,163,184,0))",
            filter: "blur(60px)",
          }}
        />

        {/* Silver orbs */}
        <motion.div
          animate={{ y: [0, -30, 0], x: [0, 20, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[8%] left-[6%] w-[38vw] h-[38vw] rounded-full blur-[100px] bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.9),rgba(203,213,225,0.35)_45%,transparent_70%)] dark:bg-[radial-gradient(circle_at_30%_30%,rgba(212,212,216,0.28),rgba(63,63,70,0.2)_45%,transparent_70%)]"
        />
        <motion.div
          animate={{ y: [0, 30, 0], x: [0, -20, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-[6%] right-[4%] w-[42vw] h-[42vw] rounded-full blur-[110px] bg-[radial-gradient(circle_at_70%_70%,rgba(226,232,240,0.75),rgba(148,163,184,0.25)_45%,transparent_70%)] dark:bg-[radial-gradient(circle_at_70%_70%,rgba(161,161,170,0.22),rgba(24,24,27,0.15)_45%,transparent_70%)]"
        />

        {/* Faint precision grid */}
        <div
          className="absolute inset-0 opacity-[0.35] dark:opacity-[0.12]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(120,120,130,0.10) 1px, transparent 1px), linear-gradient(to bottom, rgba(120,120,130,0.10) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse at center, rgba(0,0,0,0.9), transparent 70%)",
            WebkitMaskImage: "radial-gradient(ellipse at center, rgba(0,0,0,0.9), transparent 70%)",
          }}
        />

        {/* Concentric radar rings */}
        <svg
          className="absolute -bottom-[35vmin] -right-[35vmin] w-[90vmin] h-[90vmin] opacity-40 dark:opacity-25"
          viewBox="0 0 400 400"
          fill="none"
        >
          <defs>
            <radialGradient id="ringGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(148,163,184,0.5)" />
              <stop offset="100%" stopColor="rgba(148,163,184,0)" />
            </radialGradient>
          </defs>
          {[60, 110, 160, 210, 260].map((r) => (
            <circle key={r} cx="200" cy="200" r={r} stroke="url(#ringGrad)" strokeWidth="0.6" />
          ))}
          <circle cx="200" cy="200" r="4" fill="rgba(226,232,240,0.9)" />
        </svg>

        <svg
          className="absolute -top-[30vmin] -left-[30vmin] w-[80vmin] h-[80vmin] opacity-30 dark:opacity-20"
          viewBox="0 0 400 400"
          fill="none"
        >
          {[50, 95, 140, 185, 230].map((r) => (
            <circle key={r} cx="200" cy="200" r={r} stroke="rgba(148,163,184,0.35)" strokeWidth="0.5" strokeDasharray="2 6" />
          ))}
        </svg>

        {/* Crosshair guides */}
        <div className="absolute inset-y-0 left-1/2 w-px bg-gradient-to-b from-transparent via-slate-400/20 dark:via-zinc-500/15 to-transparent" />
        <div className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-slate-400/20 dark:via-zinc-500/15 to-transparent" />

        {/* Scanline shimmer */}
        <motion.div
          animate={{ y: ["-20%", "120%"] }}
          transition={{ duration: 9, repeat: Infinity, ease: "linear" }}
          className="absolute inset-x-0 h-[40vh] bg-gradient-to-b from-transparent via-white/25 dark:via-zinc-300/[0.04] to-transparent blur-2xl"
        />

        {/* Corner brackets */}
        <div className="absolute top-6 left-6 w-6 h-6 border-l border-t border-slate-400/40 dark:border-zinc-600/40" />
        <div className="absolute top-6 right-6 w-6 h-6 border-r border-t border-slate-400/40 dark:border-zinc-600/40" />
        <div className="absolute bottom-6 left-6 w-6 h-6 border-l border-b border-slate-400/40 dark:border-zinc-600/40" />
        <div className="absolute bottom-6 right-6 w-6 h-6 border-r border-b border-slate-400/40 dark:border-zinc-600/40" />

        {/* Subtle depth gradients */}
        <div className="absolute inset-x-0 top-0 h-[45%] bg-gradient-to-b from-white/50 via-white/10 to-transparent dark:from-zinc-100/[0.04] dark:via-zinc-100/[0.01] dark:to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-slate-300/30 via-slate-200/10 to-transparent dark:from-black/60 dark:via-black/20 dark:to-transparent" />
        <div className="absolute inset-y-0 left-0 w-[30%] bg-gradient-to-r from-slate-200/25 to-transparent dark:from-black/40 dark:to-transparent" />
        <div className="absolute inset-y-0 right-0 w-[30%] bg-gradient-to-l from-slate-200/25 to-transparent dark:from-black/40 dark:to-transparent" />

        {/* Vignette */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 40%, rgba(15,23,42,0.18) 100%)",
          }}
        />
        <div
          className="absolute inset-0 hidden dark:block"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.65) 100%)",
          }}
        />

        {/* Grain */}
        <div
          className="absolute inset-0 opacity-[0.08] dark:opacity-[0.06] mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.6'/></svg>\")",
          }}
        />
      </div>

      {/* Top-right theme toggle */}
      <div className="absolute z-20 top-6 right-6 md:top-8 md:right-10">
        <ThemeToggle />
      </div>

      {/* Content */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-16 md:py-24">
        <motion.div
          key={shake}
          initial={{ opacity: 0, y: 14 }}
          animate={
            shake
              ? { x: [0, -6, 6, -4, 4, 0], opacity: 1, y: 0 }
              : { opacity: 1, y: 0 }
          }
          transition={{ duration: shake ? 0.4 : 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-5xl flex flex-col md:flex-row bg-white/80 dark:bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-[0_30px_80px_-30px_rgba(0,0,0,0.25)] dark:shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)]"
        >
          {/* Chrome hairline highlight */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 dark:via-white/20 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-zinc-400/40 dark:via-zinc-500/20 to-transparent" />

          {/* Narrative column */}
          <div className="w-full md:w-1/2 p-8 lg:p-12 flex flex-col justify-between border-b md:border-b-0 md:border-r border-zinc-200 dark:border-zinc-800 bg-gradient-to-br from-transparent via-zinc-50/50 to-zinc-100/60 dark:via-zinc-900/20 dark:to-zinc-800/20">
            <div>
              {/* 2P Logo tile */}
              <div className="w-12 h-12 bg-white dark:bg-zinc-100 rounded-xl flex items-center justify-center shadow-lg ring-1 ring-zinc-900/10 dark:ring-white/10">
                <img src={logoBlackSm} alt="Grupo 2P" width={80} height={50} className="h-7 w-auto" fetchPriority="high" decoding="async" />
              </div>

              <div className="mt-14">
                <span className="inline-flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                  <span className="h-1 w-1 rounded-full bg-zinc-500 dark:bg-zinc-400" />
                  Portal interno · Grupo 2P
                </span>
                <h1 className="mt-4 text-3xl lg:text-[40px] font-light text-zinc-900 dark:text-zinc-100 leading-[1.05] tracking-tight font-display">
                  Um grupo. <span className="font-medium">Uma plataforma.</span>
                </h1>
                <p className="mt-5 text-sm text-zinc-500 dark:text-zinc-400 max-w-sm leading-relaxed">
                  Carteira, pedidos e insights do Atlas em uma única tela — feita para todo o time do Grupo 2P.
                </p>
              </div>
            </div>

            <div className="mt-12">
              {/* Active users row */}
              <div className="flex items-center gap-3 min-h-[32px] mb-8">
                {activeQ.isLoading ? (
                  <span className="text-xs text-zinc-500 dark:text-zinc-500 flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" /> carregando atividade…
                  </span>
                ) : activeTotal === 0 ? (
                  <span className="text-xs text-zinc-500 dark:text-zinc-500">
                    Nenhum usuário ativo no Portal hoje ainda.
                  </span>
                ) : (
                  <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    {activeTotal === 1
                      ? "1 usuário ativo no Portal hoje"
                      : `${activeTotal} usuários ativos no Portal hoje`}
                  </span>
                )}
              </div>


              <blockquote className="border-l-2 border-zinc-300 dark:border-zinc-700 pl-4 py-1 max-w-md">
                <p className="text-sm italic text-zinc-500 dark:text-zinc-500 leading-relaxed">
                  "Inovação e parceria é o que nos move."
                </p>
              </blockquote>
            </div>
          </div>

          {/* Form column */}
          <div className="w-full md:w-1/2 p-8 lg:p-12 flex flex-col justify-center">
            <div className="max-w-sm mx-auto w-full">
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 font-display">
                {resetMode ? "Recuperar senha" : "Bem-vindo de volta"}
              </h2>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1 mb-8">
                {resetMode ? "Enviaremos um link de redefinição." : "Use seu e-mail corporativo 2P para entrar."}
              </p>

              <form onSubmit={handleSubmit} noValidate className="space-y-5">
                <div>
                  <label htmlFor="email" className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-2">
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
                        "w-full px-4 py-3 pr-10 bg-white dark:bg-zinc-950 border rounded-lg outline-none text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 transition-all focus:ring-1",
                        emailError
                          ? "border-destructive focus:border-destructive focus:ring-destructive/20"
                          : "border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-600 focus:ring-zinc-400/20",
                      )}
                    />
                    {!emailError && email && emailSchema.safeParse(email).success && (
                      <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-success" />
                    )}
                  </div>
                  {emailError && (
                    <p id="email-error" className="flex items-center gap-1 text-[11px] text-destructive animate-fade-in mt-1.5">
                      <AlertCircle className="h-3 w-3" /> {emailError}
                    </p>
                  )}
                </div>

                {!resetMode && (
                  <div>
                    <div className="flex justify-between mb-2">
                      <label htmlFor="password" className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
                        Senha
                      </label>
                      <button
                        type="button"
                        onClick={() => setResetMode(true)}
                        className="text-[11px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                      >
                        Esqueceu?
                      </button>
                    </div>
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
                          "w-full px-4 py-3 pr-10 bg-white dark:bg-zinc-950 border rounded-lg outline-none text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 transition-all focus:ring-1",
                          passwordError
                            ? "border-destructive focus:border-destructive focus:ring-destructive/20"
                            : "border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-600 focus:ring-zinc-400/20",
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                        tabIndex={-1}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {passwordError && (
                      <p id="password-error" className="flex items-center gap-1 text-[11px] text-destructive animate-fade-in mt-1.5">
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

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading || !canSubmit}
                    className="group relative w-full py-3 px-4 rounded-lg font-medium text-sm bg-gradient-to-b from-zinc-800 to-black dark:from-white dark:to-zinc-200 text-white dark:text-zinc-900 border border-zinc-700/60 dark:border-white/30 shadow-lg hover:shadow-zinc-400/30 dark:hover:shadow-white/10 transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        {resetMode ? "Enviar instruções" : "Entrar no Portal"}
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </>
                    )}
                  </button>
                </div>

                {resetMode && (
                  <button
                    type="button"
                    onClick={() => setResetMode(false)}
                    className="w-full text-center text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                  >
                    Voltar ao login
                  </button>
                )}
              </form>

              <p className="mt-10 text-center text-[11px] uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-600">
                Acesso restrito · v1.0
              </p>
            </div>
          </div>
        </motion.div>
      </main>

      <footer className="relative z-10 px-6 md:px-12 py-5 text-[10px] uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-600 flex justify-between">
        <span>© Grupo 2P</span>
        <span>Portal interno</span>
      </footer>
    </div>
  );
}
