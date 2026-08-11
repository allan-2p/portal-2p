import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://connector-gateway.lovable.dev/notion/v1";

export type NotionCalendarEvent = {
  id: string;
  title: string;
  start: string | null; // YYYY-MM-DD
  end: string | null;   // YYYY-MM-DD
  status: string | null;
  units: string[];
  url: string;
};

type Input = {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
  unit?: "solar" | "carregadores" | "station";
};

const UNIT_MATCH: Record<string, string[]> = {
  solar: ["solar", "2p solar"],
  carregadores: ["carregador", "2p carregadores"],
  station: ["station", "2p station"],
};

async function nfetch(path: string, init: RequestInit = {}) {
  const lovKey = process.env.LOVABLE_API_KEY;
  const nKey = process.env.NOTION_API_KEY;
  if (!lovKey) throw new Error("LOVABLE_API_KEY não configurada");
  if (!nKey) throw new Error("NOTION_API_KEY não configurada — reconecte o Notion");
  const res = await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${lovKey}`,
      "X-Connection-Api-Key": nKey,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion ${res.status}: ${body}`);
  }
  return res.json();
}

function extractDate(prop: any): string | null {
  if (!prop || prop.type !== "date" || !prop.date) return null;
  return prop.date.start ?? null;
}
function extractEnd(prop: any): string | null {
  if (!prop || prop.type !== "date" || !prop.date) return null;
  return prop.date.end ?? prop.date.start ?? null;
}
function extractTitle(props: Record<string, any>): string {
  for (const p of Object.values(props)) {
    if ((p as any)?.type === "title") {
      const rt = (p as any).title as Array<{ plain_text: string }>;
      return rt?.map((t) => t.plain_text).join("") || "(sem título)";
    }
  }
  return "(sem título)";
}
function extractSelect(prop: any): string | null {
  if (!prop) return null;
  if (prop.type === "select") return prop.select?.name ?? null;
  if (prop.type === "status") return prop.status?.name ?? null;
  return null;
}
function extractMulti(prop: any): string[] {
  if (!prop) return [];
  if (prop.type === "multi_select") return (prop.multi_select ?? []).map((o: any) => o.name);
  return [];
}

function findProp(props: Record<string, any>, matchers: string[]) {
  const keys = Object.keys(props);
  const lower = keys.map((k) => k.toLowerCase());
  for (const m of matchers) {
    const idx = lower.findIndex((k) => k.includes(m));
    if (idx >= 0) return props[keys[idx]];
  }
  return null;
}

export const getNotionCalendar = createServerFn({ method: "POST" })
  .inputValidator((data: Input) => data)
  .handler(async ({ data }) => {
    // 1. Descobre databases compartilhados com a integração.
    const search = await nfetch("/search", {
      method: "POST",
      body: JSON.stringify({
        filter: { property: "object", value: "database" },
        page_size: 50,
      }),
    });
    const dbs: any[] = search.results ?? [];

    // Prioriza databases com propriedades de data (calendário).
    const calDbs = dbs.filter((db) =>
      Object.values(db.properties ?? {}).some((p: any) => p.type === "date"),
    );

    const events: NotionCalendarEvent[] = [];
    const seen = new Set<string>();

    for (const db of calDbs) {
      let cursor: string | undefined;
      let guard = 0;
      do {
        const body: any = { page_size: 100 };
        if (cursor) body.start_cursor = cursor;
        const q = await nfetch(`/databases/${db.id}/query`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        for (const page of q.results as any[]) {
          if (seen.has(page.id)) continue;
          seen.add(page.id);
          const props = page.properties ?? {};
          const dateProp =
            findProp(props, ["data de início", "data inicio", "início", "inicio", "start", "data"]) ??
            Object.values(props).find((p: any) => p?.type === "date");
          const start = extractDate(dateProp);
          if (!start) continue;
          const endProp =
            findProp(props, ["data de término", "termino", "término", "fim", "end"]);
          const end = endProp ? extractEnd(endProp) : extractEnd(dateProp);
          const statusProp = findProp(props, ["status"]);
          const unitProp = findProp(props, ["unidade", "marca", "caixa", "brand"]);
          events.push({
            id: page.id,
            title: extractTitle(props),
            start,
            end,
            status: extractSelect(statusProp),
            units: extractMulti(unitProp),
            url: page.url,
          });
        }
        cursor = q.has_more ? q.next_cursor : undefined;
        guard++;
      } while (cursor && guard < 10);
    }

    // Filtro por range: interseção [start,end] com [range.start, range.end]
    const rs = data.start;
    const re = data.end;
    const inRange = events.filter((e) => {
      const s = e.start ?? "";
      const en = e.end ?? e.start ?? "";
      return s <= re && en >= rs;
    });

    // Filtro por unidade quando informado (multi_select livre)
    const filtered = data.unit
      ? inRange.filter((e) => {
          if (!e.units.length) return true; // sem tag → aparece em todas
          const needles = UNIT_MATCH[data.unit!];
          return e.units.some((u) => {
            const lu = u.toLowerCase();
            return needles.some((n) => lu.includes(n));
          });
        })
      : inRange;

    // Ordena por data de início
    filtered.sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""));

    return { events: filtered, databases: calDbs.length };
  });
