import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { checkDisponibilidadeLote, type DisponibilidadeInfo } from "@/lib/estoque.functions";

/**
 * Selo informativo de disponibilidade (mesma régua da plataforma antiga):
 * imediato → entreposto → chegada (remessa futura) → verificar.
 * Nunca bloqueia proposta/checkout — é apenas informação.
 */

function fmtData(v?: string | null) {
  if (!v) return "";
  const d = new Date(`${String(v).slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR");
}

export function DisponibilidadeBadge({
  info,
  className,
}: {
  info?: DisponibilidadeInfo | null;
  className?: string;
}) {
  if (!info) return null;
  const tipo = info.ok === false ? "indisponivel" : (info.tipo ?? "indisponivel");
  const mapa: Record<string, { txt: string; cls: string }> = {
    imediato: { txt: "Disponibilidade Imediata", cls: "text-emerald-600" },
    entreposto: { txt: "Disponível no Entreposto", cls: "text-sky-600" },
    eta: { txt: `Chegada: ${fmtData(info.dt_remessa) || "a confirmar"}`, cls: "text-amber-600" },
    indisponivel: { txt: "Verificar Disponibilidade", cls: "text-red-600" },
  };
  const m = mapa[tipo] ?? mapa['indisponivel']!;
  return (
    <span className={`text-[11px] font-medium ${m.cls} ${className ?? ""}`}>{m.txt}</span>
  );
}

export type ItemDisponibilidade = { material: string; qtd: number };

/**
 * Consulta em lote (uma chamada por proposta) com debounce para não disparar
 * a cada clique de +/− na quantidade.
 */
export function useDisponibilidadeLote(itens: ItemDisponibilidade[], debounceMs = 500) {
  const consultar = useServerFn(checkDisponibilidadeLote);

  const normalizados = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const i of itens) {
      const mat = String(i.material ?? "").trim();
      const qtd = Number(i.qtd);
      if (!mat || !(qtd > 0)) continue;
      mapa.set(mat, Math.max(mapa.get(mat) ?? 0, qtd));
    }
    return [...mapa.entries()]
      .map(([material, qtd]) => ({ material, qtd }))
      .sort((a, b) => a.material.localeCompare(b.material))
      .slice(0, 100);
  }, [itens]);

  const chave = useMemo(
    () => normalizados.map((i) => `${i.material}:${i.qtd}`).join("|"),
    [normalizados],
  );

  const [chaveDebounce, setChaveDebounce] = useState(chave);
  useEffect(() => {
    if (!debounceMs) {
      setChaveDebounce(chave);
      return;
    }
    const t = setTimeout(() => setChaveDebounce(chave), debounceMs);
    return () => clearTimeout(t);
  }, [chave, debounceMs]);

  const q = useQuery({
    queryKey: ["disponibilidade-lote", chaveDebounce],
    enabled: chaveDebounce.length > 0 && chaveDebounce === chave,
    staleTime: 60_000,
    queryFn: () =>
      consultar({
        data: {
          itens: chaveDebounce.split("|").map((p) => {
            const [material, qtd] = p.split(":");
            return { material: material!, qtd: Number(qtd) };
          }),
        },
      }),
  });

  return (q.data ?? {}) as Record<string, DisponibilidadeInfo>;
}
