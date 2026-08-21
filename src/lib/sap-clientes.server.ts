/**
 * Envio do cadastro de clientes para o SAP (RFC ZHDIT_CLIENTES_CADASTRO).
 * Usa o mesmo bridge SOAP das demais integrações, mas com endpoint próprio
 * (SAP_CLIENTES_URL) porque a RFC é publicada em outro serviço.
 */

import { XMLParser } from "fast-xml-parser";
import { camposSapCliente, validarParaSap, type ClienteSapInput } from "./sap-clientes-map";
import { SAP_ACCEPT_LANGUAGE, comIdiomaPT } from "./sap-lang.server";

export type SapClienteResultado =
  | {
      ok: true;
      numero_sap: string | null;
      mensagem: string | null;
      /** Espelho do que foi enviado/retornado (VKGRP / VKBUR). */
      equipe_vendas: string | null;
      escritorio_vendas: string | null;
      raw: unknown;
    }
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

function montarEnvelope(cliente: ClienteSapInput): string {
  const c = camposSapCliente(cliente);
  const tag = (nome: string, valor: string) => `<${nome}>${escXml(valor)}</${nome}>`;
  const names = c.NAMES.map((v, i) => tag(`NAME${i + 1}`, v)).join("");
  const indSector = c.IND_SECTOR ? tag("IND_SECTOR", c.IND_SECTOR) : "";

  // SOAP 1.1 (`schemas.xmlsoap.org`) + namespace `rfc:functions`: é o único
  // binding ativo desse serviço no SAP. SOAP 1.2 responde "config key INITIALIZE".
  return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:sap-com:document:sap:rfc:functions">
  <soapenv:Header/>
  <soapenv:Body>
    <urn:ZHDIT_CLIENTES_CADASTRO>
      <I_S_CLIENTE>
        ${tag("ATUALIZAR", c.ATUALIZAR)}${tag("EMPRESA", c.EMPRESA)}
        ${tag("CNPJ", c.CNPJ)}${tag("CPF", c.CPF)}${tag("CODCLI", c.CODCLI)}
        ${names}
        <SORTL/>${tag("IE", c.IE)}<IMUN/><RG/><RNE/><CNAE/>
        ${tag("CIDADE", c.CIDADE)}${tag("BAIRRO", c.BAIRRO)}${tag("CEP", c.CEP)}
        ${tag("LOGRADOURO", c.LOGRADOURO)}${tag("NUMERO", c.NUMERO)}${tag("COMPLEMENTO", c.COMPLEMENTO)}
        <PAIS>BR</PAIS>${tag("UF", c.UF)}${tag("TELEFONE", c.TELEFONE)}<FAX/>
        <INCO1>FOB</INCO1><INCO2/>${tag("E_MAIL", c.E_MAIL)}
        ${tag("CFOPC", c.CFOPC)}${tag("ICMSTAXPAY", c.ICMSTAXPAY)}${tag("VENDEDOR", c.VENDEDOR)}
        <BZIRK>SOUTH</BZIRK><KALKS>01</KALKS><VZSKZ>01</VZSKZ>
        ${tag("PLTYP", c.PLTYP)}${tag("KONDA", c.KONDA)}${tag("CRT", c.CRT)}${tag("ZTERM", c.ZTERM)}
        ${c.INTEGRADOR ? tag("INTEGRADOR", c.INTEGRADOR) : ""}
        ${tag("EQUIPE_VENDAS", c.EQUIPE_VENDAS)}${tag("ESCRITORIO", c.ESCRITORIO)}
        ${indSector}
      </I_S_CLIENTE>
      <WERKS/>
    </urn:ZHDIT_CLIENTES_CADASTRO>
  </soapenv:Body>
</soapenv:Envelope>`;
}

/** Extrai o texto útil (e o ID de transação) de um SOAP Fault do SAP. */
function resumoFalha(texto: string) {
  const m = /<[^>]*Text[^>]*>([\s\S]*?)<\/[^>]*Text>/i.exec(texto);
  return (m?.[1] ?? texto).replace(/\s+/g, " ").trim().slice(0, 400);
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

  const body = montarEnvelope(cliente);
  let texto = "";
  // O SAP às vezes devolve 500 `env:Receiver` (dump momentâneo do provedor).
  // Nesses casos vale reenviar: a RFC é idempotente pelo CNPJ.
  const tentativas = 3;
  for (let i = 1; i <= tentativas; i++) {
    try {
      const res = await fetch(comIdiomaPT(url), {
        method: "POST",
        headers: {
          "Content-Type": "text/xml;charset=UTF-8",
          "accept-language": SAP_ACCEPT_LANGUAGE,
          ...(auth ? { Authorization: auth } : {}),
        },
        body,
      });
      texto = await res.text();
      if (res.ok) break;
      const transitorio = res.status >= 500 || /Receiver|processamento do Web Service/i.test(texto);
      if (transitorio && i < tentativas) {
        await new Promise((r) => setTimeout(r, 1500 * i));
        continue;
      }
      return {
        ok: false,
        erro: `SAP ${res.status}: ${resumoFalha(texto)}`,
        raw: { resposta: texto.slice(0, 2000), tentativas: i },
      };
    } catch (err) {
      if (i < tentativas) {
        await new Promise((r) => setTimeout(r, 1500 * i));
        continue;
      }
      return { ok: false, erro: `Falha ao chamar o SAP: ${(err as Error).message}` };
    }
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
    achar(json, "E_CODCLI") ??
    achar(json, "ECodcli") ??
    achar(json, "EKunnr") ??
    achar(json, "Kunnr") ??
    null;
  const mensagem =
    achar(json, "E_MENSAGEM") ?? achar(json, "EMessage") ?? achar(json, "Message") ?? null;
  const tipo = achar(json, "E_TYPE") ?? achar(json, "EType") ?? null;

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

  const enviados = camposSapCliente(cliente);
  const equipe = achar(json, "E_EQUIPE_VENDAS") ?? achar(json, "EQUIPE_VENDAS") ?? achar(json, "VKGRP");
  const escritorio = achar(json, "E_ESCRITORIO") ?? achar(json, "ESCRITORIO") ?? achar(json, "VKBUR");

  return {
    ok: true,
    numero_sap: String(numero).replace(/^0+/, "") || String(numero),
    mensagem: mensagem ? String(mensagem) : null,
    equipe_vendas: String(equipe ?? enviados.EQUIPE_VENDAS) || null,
    escritorio_vendas: String(escritorio ?? enviados.ESCRITORIO) || null,
    raw: json,
  };
}
