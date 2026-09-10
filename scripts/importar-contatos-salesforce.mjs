/**
 * Importa os contatos do Salesforce (espelho `contact_sf`) para o banco do
 * portal, tornando as tabelas `clientes.contatos` (jsonb) e `contatos` a
 * FONTE DA VERDADE. Depois disso o portal não lê mais contatos do
 * Salesforce — guarda só o `sf_contact_id` para conseguir atualizar lá.
 *
 * Regras:
 *  - O contato preenchido vira o CONTATO PRINCIPAL; se não houver financeiro
 *    preenchido, ele é replicado para o financeiro.
 *  - Os demais contatos entram como CONTATOS ADICIONAIS.
 *
 * Uso:
 *   node scripts/importar-contatos-salesforce.mjs           # simulação
 *   node scripts/importar-contatos-salesforce.mjs --aplicar
 *   node scripts/importar-contatos-salesforce.mjs --aplicar --doc 65634468000183
 */

const URL_BASE = process.env.GRUPO2P_SUPABASE_URL;
const KEY = process.env.GRUPO2P_SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) {
  console.error("Faltam GRUPO2P_SUPABASE_URL / GRUPO2P_SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const APLICAR = process.argv.includes("--aplicar");
const docFiltro = (() => {
  const i = process.argv.indexOf("--doc");
  return i >= 0 ? String(process.argv[i + 1] ?? "").replace(/\D/g, "") : null;
})();

async function rest(path, init = {}) {
  const r = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...(init.prefer ? { Prefer: init.prefer } : {}),
      ...(init.headers ?? {}),
    },
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${path} :: ${txt.slice(0, 300)}`);
  return txt ? JSON.parse(txt) : null;
}

async function paginar(path, tamanho = 1000) {
  const out = [];
  for (let inicio = 0; ; inicio += tamanho) {
    const pagina = await rest(path, {
      headers: { Range: `${inicio}-${inicio + tamanho - 1}`, "Range-Unit": "items" },
    });
    out.push(...pagina);
    if (pagina.length < tamanho) break;
  }
  return out;
}

const txt = (v) => String(v ?? "").trim();
const lista = (v) => {
  if (Array.isArray(v)) return v.map((x) => txt(x)).filter(Boolean);
  const t = txt(v);
  return t ? t.split(/[;,]/).map((x) => x.trim()).filter(Boolean) : [];
};
const limparNome = (v) => txt(v).replace(/\s*\.\s*$/, "").replace(/\s+/g, " ").trim();
const preenchido = (c) => !!(c && (c.nome || c.emails.length || c.telefones.length));
const digitos = (v) => txt(v).replace(/\D/g, "");
/** Junta listas sem repetir (telefones comparados só pelos dígitos). */
const unir = (a, b, porDigitos = false) => {
  const out = [];
  const vistos = new Set();
  for (const v of [...a, ...b]) {
    const k = porDigitos ? digitos(v) : txt(v).toLowerCase();
    if (!k || vistos.has(k)) continue;
    vistos.add(k);
    out.push(txt(v));
  }
  return out;
};
const chave = (c) => `${c.nome.toLowerCase()}|${(c.emails[0] ?? "").toLowerCase()}`;

function doPortal(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c) => c && typeof c === "object")
    .map((c) => {
      const tipoBruto = txt(c.tipo ?? c.papel);
      return {
        tipo: ["principal", "financeiro", "outro"].includes(tipoBruto) ? tipoBruto : "outro",
        nome: limparNome(c.nome),
        cargo: txt(c.cargo),
        emails: unir(lista(c.emails ?? c.email), []),
        telefones: unir(lista(c.telefones ?? c.telefone ?? c.fone), [], true),
        sf_contact_id: txt(c.sf_contact_id) || null,
      };
    })
    .filter(preenchido);
}

function doSalesforce(row) {
  const nome = limparNome([row.first_name, row.last_name].filter(Boolean).join(" ")) || limparNome(row.name);
  const emails = [txt(row.email)].filter(Boolean);
  const telefones = [...new Set([txt(row.phone), txt(row.mobile_phone)].filter(Boolean))];
  return {
    tipo: "outro",
    nome,
    cargo: txt(row.title) || txt(row.cargo__c),
    emails,
    telefones,
    sf_contact_id: row.id,
  };
}

function montar(portal, salesforce) {
  const todos = [];
  const vistos = new Set();
  for (const c of [...portal, ...salesforce]) {
    if (!preenchido(c)) continue;
    const k = chave(c);
    const igual = todos.find((x) => chave(x) === k || (c.nome && x.nome.toLowerCase() === c.nome.toLowerCase()));
    if (igual) {
      // Mesmo contato nas duas bases: completa dados que faltam e guarda o id do SF.
      igual.emails = unir(igual.emails, c.emails);
      igual.telefones = unir(igual.telefones, c.telefones, true);
      igual.cargo = igual.cargo || c.cargo;
      igual.sf_contact_id = igual.sf_contact_id || c.sf_contact_id;
      if (igual.tipo === "outro" && c.tipo !== "outro") igual.tipo = c.tipo;
      continue;
    }
    vistos.add(k);
    todos.push({ ...c });
  }
  if (todos.length === 0) return null;

  let principal =
    todos.find((c) => c.tipo === "principal") ??
    todos.find((c) => c.emails.length > 0) ??
    todos[0];
  principal.tipo = "principal";

  let financeiro = todos.find((c) => c !== principal && c.tipo === "financeiro");
  if (!financeiro) {
    financeiro = { ...principal, tipo: "financeiro", emails: [...principal.emails], telefones: [...principal.telefones] };
  }

  const outros = todos
    .filter((c) => c !== principal && c !== financeiro)
    .map((c) => ({ ...c, tipo: "outro" }));

  // A chave única da tabela é cliente_id + tipo + nome: evita nomes repetidos.
  const nomes = new Set();
  const unicos = [];
  for (const c of outros) {
    const n = c.nome.toLowerCase();
    if (!n || nomes.has(n) || n === principal.nome.toLowerCase()) continue;
    nomes.add(n);
    unicos.push(c);
  }

  return [principal, financeiro, ...unicos];
}

async function main() {
  const filtro = docFiltro ? `&doc=eq.${docFiltro}` : "";
  const clientes = await paginar(
    `clientes?select=id,doc,razao_social,instancia,organizacao,numero_sap,sf_account_id,contatos&sf_account_id=not.is.null${filtro}&order=id.asc`,
  );
  console.log(`clientes com conta no Salesforce: ${clientes.length}`);

  const contatosSf = await paginar(
    "contact_sf?select=id,account_id,first_name,last_name,name,email,phone,mobile_phone,title,cargo__c,is_deleted&is_deleted=is.false&order=id.asc",
  );
  const porConta = new Map();
  for (const c of contatosSf) {
    if (!c.account_id) continue;
    const arr = porConta.get(c.account_id) ?? [];
    arr.push(c);
    porConta.set(c.account_id, arr);
  }
  console.log(`contatos no espelho do Salesforce: ${contatosSf.length}`);

  let atualizados = 0;
  let semMudanca = 0;
  for (const cliente of clientes) {
    const portal = doPortal(cliente.contatos);
    const sf = (porConta.get(cliente.sf_account_id) ?? []).map(doSalesforce).filter(preenchido);
    const final = montar(portal, sf);
    if (!final) continue;

    const antes = JSON.stringify(cliente.contatos ?? []);
    const depois = JSON.stringify(final);
    if (antes === depois) {
      semMudanca++;
      continue;
    }
    atualizados++;
    if (!APLICAR) {
      if (atualizados <= 5) {
        console.log(`\n${cliente.razao_social} (${cliente.doc})`);
        console.log("  antes :", antes.slice(0, 300));
        console.log("  depois:", depois.slice(0, 400));
      }
      continue;
    }

    await rest(`clientes?id=eq.${cliente.id}`, {
      method: "PATCH",
      body: JSON.stringify({ contatos: final, updated_at: new Date().toISOString() }),
    });

    const linhas = final.map((c) => ({
      cliente_id: cliente.id,
      instancia: cliente.instancia ?? "solar",
      organizacao: cliente.organizacao ?? cliente.instancia ?? "solar",
      cliente_doc: String(cliente.doc ?? "").replace(/\D/g, ""),
      numero_sap: cliente.numero_sap ?? null,
      sf_account_id: cliente.sf_account_id,
      sf_contact_id: c.sf_contact_id ?? null,
      tipo: c.tipo,
      nome: c.nome,
      cargo: c.cargo || null,
      emails: c.emails,
      telefones: c.telefones,
      ativo: true,
      updated_at: new Date().toISOString(),
    }));
    await rest("contatos?on_conflict=cliente_id,tipo,nome", {
      method: "POST",
      body: JSON.stringify(linhas),
      prefer: "resolution=merge-duplicates,return=minimal",
    });

    if (atualizados % 200 === 0) console.log(`  ... ${atualizados} clientes atualizados`);
  }

  console.log(
    `\n${APLICAR ? "APLICADO" : "SIMULAÇÃO"} — ${atualizados} cadastros ${APLICAR ? "atualizados" : "seriam atualizados"}, ${semMudanca} sem mudança.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
