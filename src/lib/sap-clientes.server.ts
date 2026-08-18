/**
 * Envio do cadastro de clientes para o SAP (RFC ZHDIT_CLIENTES_CADASTRO).
 * Usa o mesmo bridge SOAP das demais integrações, mas com endpoint próprio
 * (SAP_CLIENTES_URL) porque a RFC é publicada em outro serviço.
 */

import { XMLParser } from "fast-xml-parser";
import { mapClienteParaSap, validarParaSap, type ClienteSapInput } from "./sap-clientes-map";

export type SapClienteResultado =
  | { ok: true; numero_sap: string | null; mensagem: string | null; raw: unknown }
  | { ok: false; erro: string; raw?: unknown };

function escXml(v: string) {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function achar(o: any, chave: string): any {
  if (o == null || typeof o !== "object") return undefined;
  if (chave in o) return o[chave];
  for (const k of Object.keys(o)) {
    const r = achar(o[k], chave);
    if (r !== undefined) return r;
  }
  return undefined;
}

function credenciais() {
  const url = process.env["SAP_CLIENTES_URL"];
  const user = process.env["SAP_BRIDGE_USER"];
  const pass = process.env["SAP_BRIDGE_PASSWORD"];
  const auth =
    process.env["SAP_CLIENTES_AUTH"] ??
    process.env["SAP_BRIDGE_AUTH"] ??
    (user && pass ? `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}` : undefined);
  return { url, auth };
}

export function sapClientesConfigurado() {
  return Boolean(credenciais().url);
}

function montarEnvelope(pares: Array<{ atributo: string; valor: string }>) {
  const itens = pares
    .map((p) => `<item><Atributo>${escXml(p.atributo)}</Atributo><Valor>${escXml(p.valor)}</Valor></item>`)
    .join("");
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:urn="urn:sap-com:document:sap:soap:functions:mc-style">
  <soap:Header/>
  <soap:Body>
    <urn:ZhditClientesCadastro>
      <i_t_param>${itens}</i_t_param>
    </urn:ZhditClientesCadastro>
  </soap:Body>
</soap:Envelope>`;
}
/** Extrai o texto útil (e o ID de transação) de um SOAP Fault do SAP. */
function resumoFalha(texto: string) {
  const m = /<[^>]*Text[^>]*>([\s\S]*?)<\/[^>]*Text>/i.exec(texto);
  return (m?.[1] ?? texto).replace(/\s+/g, " ").trim().slice(0, 400);
}

/**
 * O SAP responde `env:Receiver` genérico tanto para payload inválido quanto
 * para serviço sem binding configurado. Consultando o `?wsdl` conseguimos a
 * mensagem real do provedor (ex.: "Initialer Wert 'config key'"), o que evita
 * caçar erro no payload quando o problema é configuração no SOAMANAGER.
 */
async function diagnosticarEndpoint(url: string, auth: string | undefined): Promise<string | null> {
  try {
    const res = await fetch(`${url.split("?")[0]}?wsdl`, {
      headers: { ...(auth ? { Authorization: auth } : {}) },
    });
    const txt = await res.text();
    const erro = /<errorText>([\s\S]*?)<\/errorText>/i.exec(txt)?.[1]?.trim();
    if (!erro) return null;
    return `o serviço ZHDIT_CLIENTES_CADASTRO não está configurado no SAP (SOAMANAGER) — resposta do provedor: "${erro}". Peça ao time de Basis para ativar/configurar o binding deste serviço.`;
  } catch {
    return null;
  }
}


/** Cria/atualiza o cliente no SAP e devolve o código (KUNNR) quando houver. */
export async function enviarClienteParaSap(cliente: ClienteSapInput): Promise<SapClienteResultado> {
  const faltando = validarParaSap(cliente);
  if (faltando.length > 0) {
    return { ok: false, erro: `Dados obrigatórios para o SAP ausentes: ${faltando.join(", ")}.` };
  }

  const { url, auth } = credenciais();
  if (!url) {
    return { ok: false, erro: "Integração SAP de clientes não configurada (SAP_CLIENTES_URL)." };
  }

  const body = montarEnvelope(mapClienteParaSap(cliente));
  let texto = "";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/soap+xml; charset=utf-8",
        ...(auth ? { Authorization: auth } : {}),
      },
      body,
    });
    texto = await res.text();
    if (!res.ok) {
      const diag = await diagnosticarEndpoint(url, auth);
      return {
        ok: false,
        erro: `SAP ${res.status}: ${diag ?? resumoFalha(texto)}`,
        raw: { resposta: texto.slice(0, 2000), diagnostico: diag },
      };
    }

  } catch (err) {
    return { ok: false, erro: `Falha ao chamar o SAP: ${(err as Error).message}` };
  }

  const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false });
  let json: any = null;
  try {
    json = parser.parse(texto);
  } catch {
    return { ok: false, erro: "Resposta do SAP em formato inesperado.", raw: texto.slice(0, 2000) };
  }

  const fault = achar(json, "Fault");
  if (fault) {
    const msg = achar(fault, "Text") ?? achar(fault, "faultstring") ?? "Erro SOAP no SAP.";
    return { ok: false, erro: String(msg).slice(0, 400), raw: json };
  }

  const numero =
    achar(json, "EKunnr") ??
    achar(json, "e_kunnr") ??
    achar(json, "Kunnr") ??
    achar(json, "EVCodigo") ??
    null;
  const mensagem = achar(json, "EMessage") ?? achar(json, "e_message") ?? achar(json, "Message") ?? null;
  const tipo = achar(json, "EType") ?? achar(json, "e_type") ?? null;

  if (tipo && /^E|^A/i.test(String(tipo))) {
    return { ok: false, erro: String(mensagem ?? "SAP retornou erro no cadastro."), raw: json };
  }
  if (!numero) {
    return {
      ok: false,
      erro: String(mensagem ?? "SAP não retornou o código do cliente."),
      raw: json,
    };
  }

  return {
    ok: true,
    numero_sap: String(numero).replace(/^0+/, "") || String(numero),
    mensagem: mensagem ? String(mensagem) : null,
    raw: json,
  };
}
