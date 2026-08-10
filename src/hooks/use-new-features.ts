import { useCallback, useEffect, useState } from "react";
import { INSTANCES, FEATURE_LABELS, type InstanceId, type FeatureKey } from "@/lib/instances";

const STORAGE_KEY = "portal2p.seen-features.v1";

export type NewFeature = { instance: InstanceId; feature: FeatureKey; label: string };

function currentPairs(): string[] {
  const out: string[] = [];
  for (const inst of Object.values(INSTANCES)) {
    for (const f of inst.routes as FeatureKey[]) out.push(`${inst.id}:${f}`);
  }
  return out;
}

function readSeen(): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : null;
  } catch {
    return null;
  }
}

function writeSeen(list: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

/**
 * Detecta telas/abas novas no portal comparando o mapa atual de features
 * com o que já foi visto pelo administrador neste navegador.
 * No primeiro uso, tudo é marcado como visto (sem alarme falso).
 */
export function useNewFeatures() {
  const [seen, setSeen] = useState<string[] | null>(null);

  useEffect(() => {
    const stored = readSeen();
    if (stored === null) {
      const all = currentPairs();
      writeSeen(all);
      setSeen(all);
    } else {
      setSeen(stored);
    }
  }, []);

  const newFeatures: NewFeature[] =
    seen === null
      ? []
      : currentPairs()
          .filter((p) => !seen.includes(p))
          .map((p) => {
            const [instance, feature] = p.split(":") as [InstanceId, FeatureKey];
            return { instance, feature, label: FEATURE_LABELS[feature] ?? feature };
          });

  const markSeen = useCallback((items?: NewFeature[]) => {
    const stored = readSeen() ?? [];
    const add = items
      ? items.map((i) => `${i.instance}:${i.feature}`)
      : currentPairs();
    const next = Array.from(new Set([...stored, ...add]));
    writeSeen(next);
    setSeen(next);
  }, []);

  return { newFeatures, markSeen, ready: seen !== null };
}
