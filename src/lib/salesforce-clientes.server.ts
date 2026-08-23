/**
 * Criação/atualização da Conta (Account) e do Contato (Contact) no Salesforce
 * a partir do cadastro de clientes do portal.
 */

const GATEWAY_URL = "https://connector-gateway.lovable.dev/salesforce";

export type SalesforceClienteInput = {
  doc: string;
  razao_social: string;
  nome_fantasia?: string | null;
  email?: string | null;
  telefone?: string | null;
  site?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf: string;
  cep?: string | null;
  contato_nome?: string | null;
  contato_email?: string | null;
  contato_telefone?: string | null;
  contato_cargo?: string | null;
  owner_sf_id?: string | null;
  organizacao?: string | null;
  /** Ids já gravados no cadastro: usados na atualização para não duplicar. */
  sf_account_id?: string | null;
  sf_contact_id?: string | null;
};

export type SalesforceClienteResultado =
  | { ok: true; accountId: string; contactId: string | null }
  | { ok: false; erro: string };

function secrets() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const sfKey = process.env["SALESFORCE_API_KEY"];
  if (!lovableKey || !sfKey) return null;
  return { lovableKey, sfKey };
}

export function salesforceClientesConfigurado() {
  return Boolean(secrets());
}

async function sf(path: string, init?: RequestInit): Promise<any> {
  const s = secrets();
  if (!s) throw new Error("Conector do Salesforce não está configurado.");
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${s.lovableKey}`,
      "X-Connection-Api-Key": s.sfKey,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg = typeof body === "object" ? JSON.stringify(body) : String(body);
    throw new Error(`Salesforce ${res.status}: ${msg.slice(0, 400)}`);
  }
  return body;
}

const esc = (v: string) => v.replace(/'/g, "\\'");
const so = (v: unknown) => String(v ?? "").trim();
const digitos = (v: unknown) => so(v).replace(/\D/g, "");

/** Nomes de campos recusados pela org, extraídos da mensagem de erro. */
function camposRecusados(msg: string): string[] {
  const achados = new Set<string>();
  for (const m of msg.matchAll(/([A-Za-z0-9_]+__c)/g)) achados.add(m[1]!);
  const nf = msg.match(/No such column '([A-Za-z0-9_]+)'/);
  if (nf?.[1]) achados.add(nf[1]);
  return [...achados];
}


function ruaCompleta(c: SalesforceClienteInput) {
  return [so(c.logradouro), so(c.numero), so(c.complemento), so(c.bairro)]
    .filter(Boolean)
    .join(", ")
    .slice(0, 255);
}

/** Procura a Account pelo CNPJ (campo CNPJ__c, com fallback para o nome). */
async function acharAccount(doc: string, nome: string): Promise<string | null> {
  const d = digitos(doc);
  try {
    const q = `SELECT Id FROM Account WHERE CNPJ__c = '${esc(d)}' LIMIT 1`;
    const r = await sf(`/query?q=${encodeURIComponent(q)}`);
    if (r?.records?.[0]?.Id) return r.records[0].Id;
  } catch {
    // Org sem o campo CNPJ__c — cai no fallback por nome.
  }
  const q2 = `SELECT Id FROM Account WHERE Name = '${esc(nome)}' LIMIT 1`;
  const r2 = await sf(`/query?q=${encodeURIComponent(q2)}`);
  return r2?.records?.[0]?.Id ?? null;
}

export async function sincronizarClienteSalesforce(
  c: SalesforceClienteInput,
): Promise<SalesforceClienteResultado> {
  if (!secrets()) return { ok: false, erro: "Conector do Salesforce não está configurado." };

  try {
    const nome = so(c.razao_social);

    // O corpo enviado sai do mapeamento configurável (Admin › Integrações ›
    // Salesforce › Campos), garantindo que a tela de conferência mostre
    // exatamente o que é gravado na org.
    const { carregarMapeamento } = await import("./salesforce-campos.server");
    const { montarPayload } = await import("./salesforce-campos");
    const overrides = await carregarMapeamento("Account");
    const { payload } = montarPayload("Account", { ...c }, overrides);
    const accountBody: Record<string, unknown> = { ...payload };

    let accountId = so(c.sf_account_id) || (await acharAccount(c.doc, nome));
    const enviar = async (body: Record<string, unknown>) =>
      accountId
        ? sf(`/sobjects/Account/${accountId}`, { method: "PATCH", body: JSON.stringify(body) })
        : sf(`/sobjects/Account`, { method: "POST", body: JSON.stringify(body) });

    // Campos que a org não tem (ou não aceita) são removidos e o envio é
    // refeito — os demais continuam sendo gravados.
    let corpo = accountBody;
    let res: any;
    for (let tentativa = 1; ; tentativa++) {
      try {
        res = await enviar(corpo);
        break;
      } catch (err) {
        const msg = (err as Error).message;
        const invalidos = camposRecusados(msg).filter((f) => f in corpo);
        if (invalidos.length && tentativa <= 6) {
          corpo = { ...corpo };
          for (const f of invalidos) delete corpo[f];
          continue;
        }
        throw err;
      }
    }

    accountId = accountId ?? res?.id ?? null;
    if (!accountId) return { ok: false, erro: "Salesforce não retornou o ID da conta." };

    // Contato principal
    let contactId: string | null = null;
    const contatoNome = so(c.contato_nome);
    if (contatoNome) {
      const partes = contatoNome.split(/\s+/);
      const lastName = partes.length > 1 ? partes.slice(1).join(" ") : contatoNome;
      const firstName = partes.length > 1 ? partes[0] : null;

      contactId = so(c.sf_contact_id) || null;
      if (!contactId) {
        const q = `SELECT Id FROM Contact WHERE AccountId = '${esc(accountId)}' AND LastName = '${esc(lastName)}' LIMIT 1`;
        const existente = await sf(`/query?q=${encodeURIComponent(q)}`);
        contactId = existente?.records?.[0]?.Id ?? null;
      }

      const contactBody: Record<string, unknown> = {
        AccountId: accountId,
        LastName: lastName.slice(0, 80),
        FirstName: firstName ? firstName.slice(0, 40) : null,
        Email: so(c.contato_email) || so(c.email) || null,
        Phone: so(c.contato_telefone) || so(c.telefone) || null,
        Title: so(c.contato_cargo) || null,
      };
      if (c.owner_sf_id) contactBody["OwnerId"] = c.owner_sf_id;

      const r = contactId
        ? await sf(`/sobjects/Contact/${contactId}`, { method: "PATCH", body: JSON.stringify(contactBody) })
        : await sf(`/sobjects/Contact`, { method: "POST", body: JSON.stringify(contactBody) });
      contactId = contactId ?? r?.id ?? null;
    }

    return { ok: true, accountId, contactId };
  } catch (err) {
    return { ok: false, erro: (err as Error).message };
  }
}

export type ContatoSalesforceInput = {
  /** Id do registro na tabela `contatos` (para gravar o retorno). */
  id: string;
  tipo?: string | null;
  nome?: string | null;
  cargo?: string | null;
  email?: string | null;
  telefone?: string | null;
  sf_contact_id?: string | null;
};

export type ContatoSalesforceResultado = {
  id: string;
  nome: string;
  ok: boolean;
  contactId: string | null;
  erro: string | null;
};

/**
 * Cria/atualiza um objeto Contact no Salesforce para cada contato do cliente,
 * sempre vinculado à Account (`AccountId`).
 */
export async function sincronizarContatosSalesforce(
  accountId: string,
  contatos: ContatoSalesforceInput[],
  ownerSfId?: string | null,
): Promise<ContatoSalesforceResultado[]> {
  const out: ContatoSalesforceResultado[] = [];
  if (!secrets()) {
    return contatos.map((c) => ({
      id: c.id,
      nome: so(c.nome),
      ok: false,
      contactId: null,
      erro: "Conector do Salesforce não está configurado.",
    }));
  }

  for (const c of contatos) {
    const nome = so(c.nome);
    if (!nome) continue;
    try {
      const partes = nome.split(/\s+/);
      const lastName = partes.length > 1 ? partes.slice(1).join(" ") : nome;
      const firstName = partes.length > 1 ? partes[0] : null;

      let contactId = so(c.sf_contact_id) || null;
      if (!contactId) {
        const q = `SELECT Id FROM Contact WHERE AccountId = '${esc(accountId)}' AND LastName = '${esc(lastName)}' LIMIT 1`;
        const existente = await sf(`/query?q=${encodeURIComponent(q)}`);
        contactId = existente?.records?.[0]?.Id ?? null;
      }

      const body: Record<string, unknown> = {
        AccountId: accountId,
        LastName: lastName.slice(0, 80),
        FirstName: firstName ? firstName.slice(0, 40) : null,
        Email: so(c.email) || null,
        Phone: so(c.telefone) || null,
        Title: so(c.cargo) || null,
      };
      if (ownerSfId) body["OwnerId"] = ownerSfId;

      const r = contactId
        ? await sf(`/sobjects/Contact/${contactId}`, { method: "PATCH", body: JSON.stringify(body) })
        : await sf(`/sobjects/Contact`, { method: "POST", body: JSON.stringify(body) });

      out.push({ id: c.id, nome, ok: true, contactId: contactId ?? r?.id ?? null, erro: null });
    } catch (err) {
      out.push({ id: c.id, nome, ok: false, contactId: null, erro: (err as Error).message });
    }
  }
  return out;
}

