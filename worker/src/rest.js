// Cliente PostgREST minimalista (sem dependências) para as bases Supabase.

export function createRest({ url, key }) {
  const base = `${url}/rest/v1`;
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  async function call(path, init = {}) {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers || {}) },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  }

  return {
    select: (table, query = "") => call(`/${table}?${query}`),
    insert: (table, rows, prefer = "return=representation") =>
      call(`/${table}`, { method: "POST", headers: { Prefer: prefer }, body: JSON.stringify(rows) }),
    upsert: (table, rows, onConflict) =>
      call(`/${table}?on_conflict=${onConflict}`, {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(rows),
      }),
    patch: (table, query, values) =>
      call(`/${table}?${query}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(values),
      }),
  };
}
