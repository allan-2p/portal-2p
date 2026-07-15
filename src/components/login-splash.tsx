import logo from "@/assets/2p-logo-black-sm.webp";

export function LoginSplash() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-100 dark:bg-neutral-900 animate-in fade-in duration-200">
      {/* ambient pulse (grayscale) */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="splash-pulse h-[420px] w-[420px] rounded-full bg-neutral-400/30 dark:bg-neutral-500/20 blur-[120px]" />
      </div>

      <div className="relative flex flex-col items-center gap-6">
        {/* orbit ring (grayscale) */}
        <div className="relative h-28 w-28 flex items-center justify-center">
          <div
            className="absolute inset-0 rounded-full border-2 border-transparent border-t-neutral-800 dark:border-t-neutral-200 border-r-neutral-500/50 animate-spin"
            style={{ animationDuration: "2.2s" }}
          />
          <div className="h-16 w-16 flex items-center justify-center animate-in fade-in zoom-in-95 duration-300">
            <img src={logo} alt="2P" className="h-full w-full object-contain dark:invert" width={64} height={64} decoding="async" />
          </div>
        </div>

        <div className="text-center space-y-1.5 animate-in fade-in slide-in-from-bottom-1 duration-300 delay-150 fill-mode-both">
          <div className="font-display font-semibold text-base tracking-tight text-neutral-800 dark:text-neutral-100">
            Preparando seu Portal
          </div>
          <div className="flex items-center justify-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
            <span>Carregando carteira e insights do Atlas</span>
            <span className="flex gap-0.5">
              <span className="splash-dot">.</span>
              <span className="splash-dot" style={{ animationDelay: "0.2s" }}>.</span>
              <span className="splash-dot" style={{ animationDelay: "0.4s" }}>.</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
