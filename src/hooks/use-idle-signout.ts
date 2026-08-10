import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logUserActivity } from "@/lib/activity.functions";

const IDLE_MS = 60 * 60 * 1000; // 1 hora
const STORAGE_KEY = "portal2p-last-activity";
const EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "visibilitychange"];

/**
 * Desloga o usuário após 1 hora de inatividade.
 * Compartilha o timestamp entre abas via localStorage.
 */
export function useIdleSignout() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const now = () => Date.now();
    const touch = () => {
      try {
        window.localStorage.setItem(STORAGE_KEY, String(now()));
      } catch {
        /* ignore */
      }
    };
    const getLast = () => {
      try {
        const v = window.localStorage.getItem(STORAGE_KEY);
        return v ? parseInt(v, 10) : now();
      } catch {
        return now();
      }
    };

    touch();

    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      if (now() - getLast() >= IDLE_MS) {
        await logUserActivity({ data: { event: "logout", detail: "inatividade" } }).catch(() => {});
        await supabase.auth.signOut();
      }
    };

    const onActivity = () => {
      if (document.visibilityState === "hidden") return;
      touch();
    };

    EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    const interval = window.setInterval(check, 60_000);

    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      window.clearInterval(interval);
    };
  }, []);
}
