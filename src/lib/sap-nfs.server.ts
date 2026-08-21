/**
 * Motor do cron de notas fiscais — RFC `ZNFE_OV_CONSULTAR`.
 *
 * Depois que a ordem de venda é criada (`sap-ov.server.ts`), o pedido fica em
 * "Processando". Este motor consulta o SAP pelo mesmo `NROPED` usado na criação
 * e avança o status do pedido conforme o andamento no ERP:
 *
 *   STATUS_PICKING = AOK/OK → Separação   (separado_em)
 *   NUM_NF presente         → Faturado    (faturado_em + nf_numero/serie/chave)
 *   STATUS_ROMANEIO = OK    → Coletado    (enviado_em)
 *
 * As transições são sempre para frente e idempotentes: reexecutar sem novidade
 * no SAP não muda nada. Quando o SAP devolve a DANFE em base64, o PDF é
 * guardado no bucket privado `danfes` e o caminho fica em `danfe_path`.
 *
 * Contrato: SOAP 1.2 (`application/soap+xml`), namespace
 * `urn:sap-com:document:sap:rfc:functions` — mesma receita validada em
 * produção na criação da OV (só os headers `authorization` e `content-type`).

 *
 * Variáveis de ambiente:
 *   SAP_NFS_URL               endpoint da RFC (obrigatório para ativar o motor)
 *   SAP_BRIDGE_USER/PASSWORD ou SAP_BRIDGE_AUTH / SAP_NFS_AUTH
 */

import { XMLParser } from "fast-xml-parser";
import * as db from "./propostas-db.server";
import { logIntegrationEvent } from "./integration-logs.server";
import { criarNotificacao } from "./notificacoes.server";
import { SAP_ACCEPT_LANGUAGE, comIdiomaPT } from "./sap-lang.server";

/**
 * Status do portal em ordem de avanço (nunca regride).
 *
 * "Aguardando Pagamento" entra na fila porque boleto a prazo e cartão criam a
 * ordem já no checkout: quando o financeiro libera a ordem no SAP, o pedido
 * anda sozinho (STATUS_PICKING NOK → Processando; AOK/OK → Separação).
 */
const ORDEM = ["Aguardando Pagamento", "Processando", "Separação", "Faturado", "Coletado"] as const;
export type StatusNf = (typeof ORDEM)[number];


const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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
  const url = process.env["SAP_NFS_URL"];
  const user = process.env["SAP_BRIDGE_USER"];
  const pass = process.env["SAP_BRIDGE_PASSWORD"];
  const bruto = process.env["SAP_NFS_AUTH"] ?? process.env["SAP_BRIDGE_AUTH"];
  const auth = bruto
    ? bruto.startsWith("Basic ") || bruto.startsWith("Bearer ")
      ? bruto
      : `Basic ${bruto}`
    : user && pass
      ? `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`
      : undefined;
  return { url, auth };
}

export function sapNfsConfigurado() {
  const { url, auth } = credenciais();
  return Boolean(url && auth);
}

export type DocumentoNfTipo = "danfe" | "xml" | "boleto";

/**
 * Envelope da RFC. `docs` liga os flags de documento (I_DANFE / I_XML_NFE /
 * I_BOLETO); o cron pede só a DANFE, o download sob demanda pede o que o
 * usuário clicou.
 */
function envelope(nroped: string, docs: DocumentoNfTipo[] = ["danfe"]): string {
  const on = (t: DocumentoNfTipo) => (docs.includes(t) ? "X" : "");
  return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://www.w3.org/2003/05/soap-envelope" xmlns:urn="urn:sap-com:document:sap:rfc:functions">
  <soapenv:Header/>
  <soapenv:Body>
    <urn:ZNFE_OV_CONSULTAR>
      <I_BOLETO>${on("boleto")}</I_BOLETO>
      <I_DADOS>X</I_DADOS>
      <I_DANFE>${on("danfe")}</I_DANFE>
      <I_NROPED>${esc(nroped)}</I_NROPED>
      <I_XML_NFE>${on("xml")}</I_XML_NFE>
    </urn:ZNFE_OV_CONSULTAR>
  </soapenv:Body>
</soapenv:Envelope>`;
}


export type ConsultaSap = {
  picking: string | null;
  romaneio: string | null;
  nfNumero: string | null;
  nfSerie: string | null;
  nfChave: string | null;
  danfeBase64: string | null;
};

/**
 * Número de documento válido? O SAP devolve `0000000000` (só zeros) quando
 * NÃO existe nota — sem esta guarda todo pedido em Processando seria
 * "faturado" com NF de zeros.
 */
export function documentoValido(v: unknown): boolean {
  const s = String(v ?? "").trim();
  return /\d/.test(s) && !/^0+$/.test(s.replace(/\D/g, ""));
}

/** Extrai da resposta do SAP só o que o portal usa. */
export function lerConsulta(doc: any): ConsultaSap {
  const txt = (v: unknown) => {
    const s = String(v ?? "").trim();
    return s && s !== "undefined" ? s : null;
  };
  /** Texto de número de documento: zeros/vazio = ausente. */
  const num = (v: unknown) => {
    const s = txt(v);
    return s && documentoValido(s) ? s : null;
  };
  const dados = achar(doc, "E_S_DADOS") ?? achar(doc, "ZNFE_OV_CONSULTARResponse") ?? doc;
  return {
    picking: txt(achar(dados, "STATUS_PICKING")),
    romaneio: txt(achar(dados, "STATUS_ROMANEIO")),
    nfNumero: num(achar(dados, "NUM_NF") ?? achar(dados, "DOCNUM")),
    nfSerie: txt(achar(dados, "SERIE_NF") ?? achar(dados, "SERIE")),
    nfChave: num(achar(dados, "CHAVE_NFE") ?? achar(dados, "CHAVE") ?? achar(dados, "NFE_CHAVE")),
    danfeBase64: txt(achar(doc, "E_DANFE") ?? achar(doc, "DANFE")),
  };
}


/** Próximo status conforme as regras da plataforma antiga (só avança). */
export function proximoStatus(atual: string, c: ConsultaSap): StatusNf | null {
  const idxAtual = ORDEM.indexOf(atual as StatusNf);
  const base = idxAtual < 0 ? 0 : idxAtual;

  let alvo = base;
  const picking = (c.picking ?? "").toUpperCase();
  // Qualquer sinal de picking no SAP significa que a ordem já está liberada:
  // NOK = liberada mas ainda não separada → Processando.
  if (picking) alvo = Math.max(alvo, ORDEM.indexOf("Processando"));
  if (picking === "AOK" || picking === "OK") alvo = Math.max(alvo, ORDEM.indexOf("Separação"));
  if (c.nfNumero) alvo = Math.max(alvo, ORDEM.indexOf("Faturado"));
  if ((c.romaneio ?? "").toUpperCase() === "OK") alvo = Math.max(alvo, ORDEM.indexOf("Coletado"));


  return alvo > base ? (ORDEM[alvo] as StatusNf) : null;
}

async function chamarSap(
  nroped: string,
  docs: DocumentoNfTipo[] = ["danfe"],
): Promise<{ doc: any; xml: string }> {
  // O portal guarda o número com zeros à esquerda ("050019"); o SAP indexa o
  // NROPED sem eles ("50019") e devolve vazio se enviarmos com zeros.
  nroped = String(nroped ?? "").trim().replace(/^0+(?=\d)/, "");
  const { url, auth } = credenciais();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(comIdiomaPT(url!), {
      method: "POST",
      // Mesma receita validada em produção na criação da OV: SOAP 1.2 e só
      // dois headers (sem SOAPAction, accept ou cookie sap-usercontext).
      headers: {
        "content-type": "application/soap+xml; charset=utf-8",
        "accept-language": SAP_ACCEPT_LANGUAGE,
        authorization: auth!,
      },
      body: envelope(nroped, docs),
      signal: controller.signal,
    });
    const xml = await res.text();
    if (!res.ok) throw new Error(`SAP respondeu HTTP ${res.status}: ${xml.replace(/\s+/g, " ").slice(0, 300)}`);
    const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true, parseTagValue: false });
    return { doc: parser.parse(xml), xml };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Recupera o nº da ordem de venda (VBELN_VA) já existente no SAP para um
 * NROPED. Usado quando a criação falha por pedido duplicado: a ordem existe,
 * só não voltou o número na resposta do CRIAR.
 */
export async function consultarVbelnPorPedido(nroped: string): Promise<string | null> {
  if (!sapNfsConfigurado()) return null;
  try {
    const { doc } = await chamarSap(nroped);
    const dados = achar(doc, "E_S_DADOS") ?? doc;
    const v = String(
      achar(dados, "VBELN_VA") ?? achar(doc, "VBELN_VA") ?? achar(doc, "E_VBELN_VA") ?? "",
    ).trim();
    return documentoValido(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Limpa o base64 que vem dentro do XML do SAP.
 *
 * O parser é configurado com `parseTagValue: false` para não estragar números,
 * e isso mantém as entidades XML literais (`&#xA;`, `&#13;`, `&amp;`) dentro do
 * conteúdo. Se essas sequências forem para o `Buffer.from(..., "base64")`, o
 * decode para no primeiro caractere inválido e o arquivo sai truncado. Aqui as
 * entidades são resolvidas e qualquer caractere fora do alfabeto base64 é
 * descartado antes da decodificação.
 */
export function limparBase64Sap(bruto: unknown): string {
  let s = String(bruto ?? "");
  if (!s || s === "undefined" || s === "null") return "";
  s = s
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
  return s.replace(/[^A-Za-z0-9+/=]/g, "");
}

/** Decodifica o base64 do SAP em bytes, já com as entidades XML resolvidas. */
export function bytesDocumentoSap(bruto: unknown): Buffer | null {
  const limpo = limparBase64Sap(bruto);
  if (limpo.length < 100) return null;
  const bytes = Buffer.from(limpo, "base64");
  return bytes.length > 0 ? bytes : null;
}

/** Um PDF só é servido se tiver cabeçalho `%PDF` e o marcador final `%%EOF`. */
export function pdfIntegro(bytes: Buffer): boolean {
  if (bytes.length < 1000) return false;
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") return false;
  const fim = bytes.subarray(Math.max(0, bytes.length - 4096)).toString("latin1");
  return fim.includes("%%EOF");
}

/**
 * Busca sob demanda um documento da NF no SAP (DANFE, XML da NF-e ou boleto).
 * Devolve o base64 cru — quem chama decide onde guardar.
 */
export async function consultarDocumentoNfSap(
  nroped: string,
  tipo: DocumentoNfTipo,
): Promise<{ base64: string | null; consulta: ConsultaSap }> {
  if (!sapNfsConfigurado()) throw new Error("Integração SAP de notas fiscais não configurada.");
  const { doc } = await chamarSap(nroped, [tipo]);
  const documentos = achar(doc, "E_S_DOCUMENTOS") ?? doc;
  const chaves: Record<DocumentoNfTipo, string[]> = {
    danfe: ["DANFE", "E_DANFE"],
    xml: ["XML_NFE", "E_XML_NFE"],
    boleto: ["BOLETO", "E_BOLETO"],
  };
  let base64: string | null = null;
  for (const chave of chaves[tipo]) {
    const v = achar(documentos, chave) ?? achar(doc, chave);
    const s = tipo === "xml" ? String(v ?? "").replace(/\s+/g, "") : limparBase64Sap(v);
    if (s && s !== "undefined" && s.length > 100) {
      base64 = s;
      break;
    }
  }
  return { base64, consulta: lerConsulta(doc) };
}




/** Guarda a DANFE no bucket privado e devolve o caminho. */
async function salvarDanfe(propostaId: string, base64: string): Promise<string | null> {
  const avisar = async (motivo: string) => {
    await logIntegrationEvent({
      slug: "cron.sap-nfs",
      level: "warn",
      event: "danfe-upload",
      message: `Não foi possível guardar a DANFE: ${motivo}`.slice(0, 500),
      detail: { proposta_id: propostaId },
    });
  };
  try {
    const bytes = bytesDocumentoSap(base64);
    if (!bytes) {
      await avisar("conteúdo base64 muito curto/inválido");
      return null;
    }
    if (!pdfIntegro(bytes)) {
      await avisar("PDF incompleto na resposta do SAP (sem %PDF/%%EOF) — não gravado");
      return null;
    }
    const path = `propostas/${propostaId}/danfe.pdf`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.storage
      .from("danfes")
      .upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (error) {
      await avisar(error.message);
      return null;
    }
    return path;
  } catch (e) {
    await avisar((e as Error).message);
    return null;
  }
}


const TITULOS: Record<StatusNf, string> = {
  "Aguardando Pagamento": "Pedido aguardando pagamento",
  Processando: "Pedido em processamento",
  Separação: "Pedido em separação",
  Faturado: "Pedido faturado",
  Coletado: "Pedido coletado",
};


export type NfAplicacao = {
  proposta_id: string;
  numero: string | null;
  de: string;
  para: string | null;
  nf: string | null;
};

async function processarProposta(row: Record<string, any>): Promise<NfAplicacao> {
  const id = String(row["id"]);
  const de = String(row["status"] ?? "");
  const nroped = String(row["numero"] ?? "").trim();
  const { doc } = await chamarSap(nroped);
  const c = lerConsulta(doc);
  const para = proximoStatus(de, c);

  const patch: Record<string, unknown> = {};
  if (c.nfNumero && !row["nf_numero"]) {
    patch["nf_numero"] = c.nfNumero;
    patch["nf_serie"] = c.nfSerie;
    patch["nf_chave"] = c.nfChave;
  }
  if (c.danfeBase64 && !row["danfe_path"]) {
    const path = await salvarDanfe(id, c.danfeBase64);
    if (path) patch["danfe_path"] = path;
  }

  if (Object.keys(patch).length) {
    try {
      await db.atualizarProposta(id, patch);
    } catch (e) {
      // Colunas ainda não criadas no banco: registra e segue (não derruba o lote).
      if (!/42703|PGRST204/i.test((e as Error).message)) throw e;
      await logIntegrationEvent({
        slug: "cron.sap-nfs",
        level: "warn",
        event: "coluna-ausente",
        message: `Rode supabase/external/propostas-nf.sql: ${(e as Error).message}`,
        detail: { proposta_id: id },
      });
    }
  }

  // O status vai pela máquina de estados, um passo por vez: o SAP pode indicar
  // um salto (Processando → Coletado) e cada etapa precisa ser válida e
  // auditável.
  if (para) {
    const { aplicarTransicao } = await import("./proposta-transicao.server");
    // As datas por status (separado_em, faturado_em, coletado_em…) são
    // carimbadas dentro do `aplicarTransicao`. Aqui só mantemos `enviado_em`,
    // coluna legada usada por telas/integrações antigas.
    const carimbos: Record<string, string> = {
      "Coletado": "enviado_em",
    };
    let atual = de;
    const alvo = ORDEM.indexOf(para);
    for (let i = ORDEM.indexOf(atual as StatusNf) + 1; i <= alvo; i++) {
      const passo = ORDEM[i] as StatusNf;
      const col = carimbos[passo];
      const r = await aplicarTransicao(id, passo, "cron-sap", {
        de: atual,
        ...(col ? { patch: { [col]: new Date().toISOString() } } : {}),
      });
      if (!r.ok) break;
      atual = passo;
    }
  }


  if (para) {
    // Efeitos colaterais nunca derrubam o avanço de status.
    try {
      const { sincronizarPedidoSalesforce } = await import("./salesforce-pedidos.server");
      await sincronizarPedidoSalesforce(id, { forcar: true });
    } catch {
      /* best effort */
    }
    // Faturou: a carga na Fretefy troca o documento placeholder pela NF real.
    if (c.nfNumero && String(row["fretefy_oferta_id"] ?? "").trim()) {
      try {
        const { runJob } = await import("./job-runs.server");
        const { atualizarDocumentoOferta } = await import("./fretefy-oferta.server");
        await runJob(
          {
            job: "fretefy.oferta-carga",
            trigger: "cron",
            payload: { propostaId: id, acao: "documento" },
            refId: id,
          },
          () =>
            atualizarDocumentoOferta(id, {
              nfNumero: c.nfNumero,
              nfSerie: c.nfSerie,
              nfChave: c.nfChave,
            }),
        );
      } catch {
        /* best effort */
      }
    }

    const dono = row["created_by"] ? String(row["created_by"]) : null;
    if (dono) {
      await criarNotificacao({
        user_id: dono,
        tipo: "info",
        titulo: `${TITULOS[para]} • ${row["numero"] ?? ""}`.trim(),
        descricao: c.nfNumero ? `NF ${c.nfNumero}${c.nfSerie ? `/${c.nfSerie}` : ""}` : `${de} → ${para}`,
        ref_tipo: "proposta",
        ref_id: id,
        chave: `nf:${id}:${para}`,
      });
    }
  }

  return { proposta_id: id, numero: row["numero"] ?? null, de, para, nf: c.nfNumero };
}

export type NfResultado = {
  verificados: number;
  atualizados: number;
  detalhes: NfAplicacao[];
  erros?: { proposta_id: string; erro: string }[];
  skipped?: boolean;
  motivo?: string;
};

/**
 * Varre os pedidos em andamento e sincroniza o status com o SAP.
 * Lote de até 50 por execução, mais antigos primeiro.
 */
export async function sincronizarNotasFiscais(limite = 50): Promise<NfResultado> {
  if (!sapNfsConfigurado()) {
    return { verificados: 0, atualizados: 0, detalhes: [], skipped: true, motivo: "SAP_NFS_URL/credencial não configurada." };
  }

  // Ordenação e filtro no banco: com backlog grande, ordenar em memória
  // deixaria os pedidos mais antigos sem nunca serem processados.
  const rows = await db.listarPropostas({
    // "Aguardando Pagamento" só entra com ordem criada (boleto a prazo/cartão);
    // o `naoVazio` abaixo já exclui os pedidos Pix, que ainda não têm OV.
    statusIn: ["Aguardando Pagamento", "Processando", "Separação", "Faturado"],

    select:
      "id,numero,status,created_by,sap_ov_numero,nf_numero,danfe_path,created_at,fretefy_oferta_id",

    order: "asc",
    naoVazio: ["sap_ov_numero"],
    limit: limite,
  });

  const fila = rows
    .filter((r) => String(r["sap_ov_numero"] ?? "").trim() && String(r["numero"] ?? "").trim())
    .slice(0, limite);


  const detalhes: NfAplicacao[] = [];
  const erros: { proposta_id: string; erro: string }[] = [];
  for (const row of fila) {
    try {
      detalhes.push(await processarProposta(row));
    } catch (e) {
      erros.push({ proposta_id: String(row["id"]), erro: (e as Error).message.slice(0, 300) });
    }
  }

  const atualizados = detalhes.filter((d) => d.para).length;
  return { verificados: fila.length, atualizados, detalhes, ...(erros.length ? { erros } : {}) };
}
