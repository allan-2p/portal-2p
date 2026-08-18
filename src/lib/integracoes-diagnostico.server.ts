/**
 * Testes de conectividade por destino (banco, SAP, Salesforce, contatos).
 * Não altera dados — apenas valida credenciais/acesso para separar onde está
 * o erro antes de reenviar um cadastro.
 */

import type { ClientesInstance } from "./clientes-db.server";

export type TesteAlvo = "banco" | "sap" | "salesforce" | "contatos";

export type TesteResultado = {
  alvo: TesteAlvo;
  ok: boolean;
  mensagem: string;
  detalhe?: string | null;
  duracaoMs: number;
};

function texto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return typeof v === "string" ? v : JSON.stringify(v, null, 2);
}

async function medir(
  alvo: TesteAlvo,
  fn: () => Promise<{ ok: boolean; mensagem: string; detalhe?: unknown }>,
): Promise<TesteResultado> {
  const inicio = Date.now();
  try {
    const r = await fn();
    return { alvo, ok: r.ok, mensagem: r.mensagem, detalhe: texto(r.detalhe), duracaoMs: Date.now() - inicio };
  } catch (err) {
    return {
      alvo,
      ok: false,
      mensagem: (err as Error)?.message ?? String(err),
      duracaoMs: Date.now() - inicio,
    };
  }
}

export async function testarIntegracoes(
  instancia: ClientesInstance,
  alvos: TesteAlvo[],
  clienteId?: string | null,
): Promise<TesteResultado[]> {
  const out: TesteResultado[] = [];

  if (alvos.includes("banco")) {
    out.push(
      await medir("banco", async () => {
        const db = await import("./clientes-db.server");
        const existe = await db.clientesTableExists(instancia);
        if (!existe) return { ok: false, mensagem: "Tabela `clientes` não encontrada no banco grupo-2p." };
        if (clienteId) {
          const row = await db.getClienteById(instancia, clienteId);
          if (!row) return { ok: false, mensagem: "Cadastro não encontrado na tabela `clientes`." };
          return {
            ok: true,
            mensagem: "Banco acessível e cadastro localizado.",
            detalhe: {
              numero_sap: (row as any)?.numero_sap ?? null,
              sap_status: (row as any)?.sap_status ?? null,
              sf_account_id: (row as any)?.sf_account_id ?? null,
              sf_status: (row as any)?.sf_status ?? null,
            },
          };
        }
        return { ok: true, mensagem: "Banco acessível." };
      }),
    );
  }

  if (alvos.includes("contatos")) {
    out.push(
      await medir("contatos", async () => {
        const contatos = await import("./contatos-db.server");
        const existe = await contatos.contatosTableExists();
        if (!existe) return { ok: false, mensagem: "Tabela `contatos` não encontrada no banco grupo-2p." };
        if (clienteId) {
          const rows = await contatos.listContatos(clienteId);
          return {
            ok: true,
            mensagem: `${rows.length} contato(s) vinculado(s) a este cadastro.`,
            detalhe: rows.map((c) => ({
              nome: c.nome,
              tipo: c.tipo,
              sf_contact_id: c.sf_contact_id,
              sf_status: c.sf_status,
              sf_erro: c.sf_erro,
            })),
          };
        }
        return { ok: true, mensagem: "Tabela `contatos` acessível." };
      }),
    );
  }

  if (alvos.includes("sap")) {
    out.push(
      await medir("sap", async () => {
        const url = process.env["SAP_CLIENTES_URL"];
        if (!url) return { ok: false, mensagem: "SAP_CLIENTES_URL não configurada no ambiente." };
        const user = process.env["SAP_BRIDGE_USER"];
        const pass = process.env["SAP_BRIDGE_PASSWORD"];
        const auth =
          process.env["SAP_CLIENTES_AUTH"] ??
          process.env["SAP_BRIDGE_AUTH"] ??
          (user && pass ? `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}` : undefined);
        if (!auth) return { ok: false, mensagem: "Credenciais do SAP não configuradas." };

        // 1) Tenta o contrato (WSDL). Em muitos ambientes o SAP não publica o
        //    WSDL mesmo com o serviço de runtime ativo, então isso é só um indício.
        const res = await fetch(`${url}${url.includes("?") ? "&" : "?"}wsdl`, {
          method: "GET",
          headers: { Authorization: auth },
        });
        const corpo = (await res.text()).slice(0, 600);
        const ehWsdl = corpo.includes("definitions") || corpo.includes("wsdl:");
        if (res.ok && ehWsdl) {
          return { ok: true, mensagem: "Endpoint do SAP acessível e contrato (WSDL) publicado.", detalhe: corpo };
        }

        // 2) Teste de runtime: envia um envelope propositalmente vazio.
        //    Se o serviço estiver ativo, o SAP responde com SOAP Fault (400/500),
        //    o que comprova que o binding está funcionando — sem gravar nada.
        const ping = await fetch(url, {
          method: "POST",
          headers: { Authorization: auth, "Content-Type": "text/xml;charset=UTF-8", SOAPAction: '""' },
          body:
            '<?xml version="1.0" encoding="UTF-8"?>' +
            '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">' +
            "<soapenv:Header/><soapenv:Body/></soapenv:Envelope>",
        });
        const pingCorpo = (await ping.text()).slice(0, 600);
        const respondeuSoap =
          pingCorpo.includes("Envelope") || pingCorpo.includes("Fault") || pingCorpo.includes("faultstring");

        const wspConfig = /WSP Exception|config key/i.test(corpo);
        if (respondeuSoap) {
          return {
            ok: true,
            mensagem: wspConfig
              ? "Serviço de runtime do SAP respondendo (o WSDL não está publicado, mas o envio funciona)."
              : "Serviço de runtime do SAP respondendo.",
            detalhe: `WSDL (HTTP ${res.status}):\n${corpo}\n\nRuntime (HTTP ${ping.status}):\n${pingCorpo}`,
          };
        }

        return {
          ok: false,
          mensagem: wspConfig
            ? "O WSDL não está publicado (WSP Exception: config key) e o runtime não respondeu SOAP — verifique o binding no SOAMANAGER."
            : `SAP respondeu HTTP ${res.status}/${ping.status} sem contrato nem resposta SOAP.`,
          detalhe: `WSDL (HTTP ${res.status}):\n${corpo}\n\nRuntime (HTTP ${ping.status}):\n${pingCorpo}`,
        };
      }),
    );
  }

  if (alvos.includes("salesforce")) {
    out.push(
      await medir("salesforce", async () => {
        const lovableKey = process.env["LOVABLE_API_KEY"];
        const sfKey = process.env["SALESFORCE_API_KEY"];
        if (!lovableKey || !sfKey) return { ok: false, mensagem: "Conector do Salesforce não está configurado." };
        const soql = "SELECT Id FROM Account LIMIT 1";
        const res = await fetch(
          `https://connector-gateway.lovable.dev/salesforce/query?q=${encodeURIComponent(soql)}`,
          { headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": sfKey } },
        );
        const corpo = await res.text();
        if (!res.ok) return { ok: false, mensagem: `Salesforce respondeu HTTP ${res.status}.`, detalhe: corpo.slice(0, 400) };
        return { ok: true, mensagem: "Conexão com o Salesforce validada." };
      }),
    );
  }

  return out;
}
