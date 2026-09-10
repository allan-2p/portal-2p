#!/usr/bin/env node
/**
 * FASE 1 da consolidação: copia o catálogo do Lovable Cloud para o grupo-2p.
 *
 * Pré-requisito: rodar `docs/migracao/grupo2p-fase1-schema.sql` no grupo-2p
 * (cria as tabelas com o schema ATUAL, incluindo os overrides).
 *
 * Uso:
 *   node scripts/migrar-catalogo-grupo2p.mjs                 # simulação (só conta)
 *   node scripts/migrar-catalogo-grupo2p.mjs --aplicar       # copia os dados
 *   node scripts/migrar-catalogo-grupo2p.mjs --aplicar --fotos  # dados + imagens
 *   node scripts/migrar-catalogo-grupo2p.mjs --conferir      # paridade de contagens
 *
 * Os `id` (uuid) são preservados: `propostas.itens[].produtoId` aponta para
 * `sap_produtos.id`, então mudar os ids quebraria as propostas.
 */

const APLICAR = process.argv.includes("--aplicar");
const FOTOS = process.argv.includes("--fotos");
const SO_CONFERIR = process.argv.includes("--conferir");

const ORIGEM = {
  url: (process.env.SUPABASE_URL || "").replace(/\/+$/, ""),
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
const DESTINO = {
  url: (process.env.GRUPO2P_SUPABASE_URL || "https://npzlinbglznnnwxxcawh.supabase.co").replace(/\/+$/, ""),
  key: process.env.GRUPO2P_SUPABASE_SERVICE_ROLE_KEY || process.env.GRUPO2P_SUPABASE_KEY,
};

if (!ORIGEM.url || !ORIGEM.key) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes.");
if (!DESTINO.key) throw new Error("GRUPO2P_SUPABASE_SERVICE_ROLE_KEY ausente.");

/** Ordem importa: pai antes de filho (FKs). */
const TABELAS = [
  { nome: "carregadores_ncm", chave: "id" },
  { nome: "carregadores_config", chave: "id" },
  { nome: "carregadores_uf_rates", chave: "uf" },
  { nome: "sap_produtos", chave: "id" },
  { nome: "sap_catalogo_sap", chave: "id" },
  { nome: "sap_produtos_sync_runs", chave: "id" },
  { nome: "estoque", chave: "material" },
  { nome: "estoque_sync_runs", chave: "id" },
  { nome: "containers", chave: "id", identidade: true },
  { nome: "produtos", chave: "codigo" },
  { nome: "solar_modulos", chave: "id" },
  { nome: "solar_microinversores", chave: "id" },
  { nome: "solar_trilhos", chave: "id" },
  { nome: "solar_suportes", chave: "id" },
  { nome: "solar_trilho_suportes", chave: "trilho_id,suporte_id" },
  { nome: "solar_geradores", chave: "id" },
  { nome: "solar_calc_config", chave: "id" },
  { nome: "solar_cupons", chave: "id" },
  { nome: "solar_cupom_usos", chave: "id" },
];

const PAGINA = 1000;

async function rest(alvo, path, init = {}) {
  const headers = {
    apikey: alvo.key,
    Authorization: `Bearer ${alvo.key}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(init.headers || {}),
  };
  const res = await fetch(`${alvo.url}/rest/v1/${path}`, { ...init, headers });
  const texto = await res.text();
  return { ok: res.ok, status: res.status, texto, contentRange: res.headers.get("content-range") };
}

async function contar(alvo, tabela) {
  const r = await rest(alvo, `${tabela}?select=*`, {
    method: "HEAD",
    headers: { Prefer: "count=exact", Range: "0-0", "Range-Unit": "items" },
  });
  if (!r.ok) return null;
  const total = r.contentRange?.split("/")[1];
  return total && /^\d+$/.test(total) ? Number(total) : null;
}

async function lerPagina(tabela, from) {
  const r = await rest(ORIGEM, `${tabela}?select=*`, {
    headers: { Range: `${from}-${from + PAGINA - 1}`, "Range-Unit": "items" },
  });
  if (!r.ok) throw new Error(`Leitura de ${tabela} falhou (${r.status}): ${r.texto.slice(0, 200)}`);
  return JSON.parse(r.texto);
}

async function gravar(tabela, chave, linhas, identidade = false) {
  // Colunas de identidade (GENERATED ALWAYS) não aceitam valor: o destino gera o seu.
  const corpo = identidade ? linhas.map(({ [chave]: _ignorado, ...resto }) => resto) : linhas;
  const path = identidade ? tabela : `${tabela}?on_conflict=${encodeURIComponent(chave)}`;
  const r = await rest(DESTINO, path, {
    method: "POST",
    headers: { Prefer: identidade ? "return=minimal" : "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(corpo),
  });
  if (!r.ok) throw new Error(`Gravação em ${tabela} falhou (${r.status}): ${r.texto.slice(0, 300)}`);
}

async function limpar(tabela, chave) {
  const r = await rest(DESTINO, `${tabela}?${encodeURIComponent(chave)}=gte.0`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
  if (!r.ok) throw new Error(`Limpeza de ${tabela} falhou (${r.status}): ${r.texto.slice(0, 300)}`);
}


async function copiarTabelas() {
  for (const { nome, chave, identidade } of TABELAS) {
    const origem = await contar(ORIGEM, nome);
    const destinoAntes = await contar(DESTINO, nome);
    if (origem === null) {
      console.log(`- ${nome}: não existe na origem — pulado`);
      continue;
    }
    if (destinoAntes === null) {
      console.log(`! ${nome}: NÃO EXISTE no grupo-2p — rode o SQL do schema antes`);
      continue;
    }
    if (SO_CONFERIR) {
      const ok = origem === destinoAntes ? "ok" : "DIVERGENTE";
      console.log(`- ${nome}: origem ${origem} / destino ${destinoAntes} → ${ok}`);
      continue;
    }
    if (!APLICAR) {
      console.log(`- ${nome}: copiaria ${origem} linhas (destino tem ${destinoAntes})`);
      continue;
    }
    if (identidade) await limpar(nome, chave);
    let copiadas = 0;
    for (let from = 0; from < origem; from += PAGINA) {
      const linhas = await lerPagina(nome, from);
      if (!linhas.length) break;
      await gravar(nome, chave, linhas, identidade);
      copiadas += linhas.length;
    }
    const destinoDepois = await contar(DESTINO, nome);
    console.log(`- ${nome}: ${copiadas} copiadas → destino agora ${destinoDepois} (origem ${origem})`);
  }
}

async function listarObjetos(prefixo = "") {
  const res = await fetch(`${ORIGEM.url}/storage/v1/object/list/produtos`, {
    method: "POST",
    headers: { apikey: ORIGEM.key, Authorization: `Bearer ${ORIGEM.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prefix: prefixo, limit: 1000, sortBy: { column: "name", order: "asc" } }),
  });
  if (!res.ok) throw new Error(`Listagem do bucket falhou: ${res.status}`);
  const itens = await res.json();
  const arquivos = [];
  for (const item of itens) {
    const caminho = prefixo ? `${prefixo}/${item.name}` : item.name;
    if (item.id === null && !item.metadata) arquivos.push(...(await listarObjetos(caminho)));
    else arquivos.push(caminho);
  }
  return arquivos;
}

async function copiarFotos() {
  const arquivos = await listarObjetos();
  console.log(`Fotos encontradas: ${arquivos.length}`);
  if (!APLICAR) return;
  let ok = 0;
  let falhas = 0;
  for (const caminho of arquivos) {
    try {
      const baixa = await fetch(`${ORIGEM.url}/storage/v1/object/produtos/${encodeURI(caminho)}`, {
        headers: { apikey: ORIGEM.key, Authorization: `Bearer ${ORIGEM.key}` },
      });
      if (!baixa.ok) throw new Error(`download ${baixa.status}`);
      const corpo = await baixa.arrayBuffer();
      const sobe = await fetch(`${DESTINO.url}/storage/v1/object/produtos/${encodeURI(caminho)}`, {
        method: "POST",
        headers: {
          apikey: DESTINO.key,
          Authorization: `Bearer ${DESTINO.key}`,
          "Content-Type": baixa.headers.get("content-type") || "application/octet-stream",
          "x-upsert": "true",
        },
        body: corpo,
      });
      if (!sobe.ok) throw new Error(`upload ${sobe.status} ${(await sobe.text()).slice(0, 120)}`);
      ok++;
    } catch (e) {
      falhas++;
      console.log(`  ! ${caminho}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`Fotos copiadas: ${ok} (falhas: ${falhas})`);
}

console.log(SO_CONFERIR ? "== CONFERÊNCIA ==" : APLICAR ? "== APLICANDO ==" : "== SIMULAÇÃO (use --aplicar) ==");
await copiarTabelas();
if (FOTOS) await copiarFotos();
console.log("Fim.");
