import { motion } from "framer-motion";
import logo from "@/assets/2p-logo.jpg";

export function LoginSplash() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background"
    >
      {/* ambient pulse */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <motion.div
          initial={{ scale: 0.9, opacity: 0.4 }}
          animate={{ scale: [0.9, 1.15, 0.9], opacity: [0.35, 0.6, 0.35] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          className="h-[420px] w-[420px] rounded-full bg-primary/15 blur-[120px]"
        />
      </div>

      <div className="relative flex flex-col items-center gap-6">
        {/* orbit ring */}
        <div className="relative h-24 w-24 flex items-center justify-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary border-r-primary/40"
          />
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="h-14 w-14 rounded-xl overflow-hidden shadow-lg shadow-primary/20 ring-1 ring-border bg-surface flex items-center justify-center"
          >
            <img src={logo} alt="2P" className="h-full w-full object-cover" />
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.35 }}
          className="text-center space-y-1.5"
        >
          <div className="font-display font-semibold text-base tracking-tight">
            Preparando seu Portal
          </div>
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <span>Carregando carteira e insights do Atlas</span>
            <span className="flex gap-0.5">
              <motion.span
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: 0 }}
              >.</motion.span>
              <motion.span
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }}
              >.</motion.span>
              <motion.span
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }}
              >.</motion.span>
            </span>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
