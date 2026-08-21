/**
 * Documentos da NF do pedido (DANFE, XML da NF-e e boleto).
 *
 * Fluxo: se o arquivo já está no bucket privado `danfes`, serve de lá. Se não,
 * busca sob demanda no SAP (ZNFE_OV_CONSULTAR com o flag do documento),
 * persiste no Storage e devolve o caminho.
 *
 * Caminhos: danfes/propostas/{propostaId}/{danfe.pdf|nfe.xml|boleto.pdf}
 */

import {
  consultarDocumentoNfSap,
  bytesDocumentoSap,
  pdfIntegro,
  type DocumentoNfTipo,
} from "./sap-nfs.server";
import * as db from "./propostas-db.server";
import { logIntegrationEvent } from "./integration-logs.server";

export type { DocumentoNfTipo };

export const DOCUMENTOS: Record<
  DocumentoNfTipo,
  { arquivo: string; contentType: string; rotulo: string; inline: boolean }
> = {
  danfe: { arquivo: "danfe.pdf", contentType: "application/pdf", rotulo: "DANFE", inline: true },
  xml: { arquivo: "nfe.xml", contentType: "text/xml", rotulo: "XML da NF-e", inline: false },
  boleto: { arquivo: "boleto.pdf", contentType: "application/pdf", rotulo: "Boleto", inline: false },
};

export const BUCKET = "danfes";

export function caminhoDocumento(propostaId: string, tipo: DocumentoNfTipo) {
  return `propostas/${propostaId}/${DOCUMENTOS[tipo].arquivo}`;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/**
 * Um arquivo já em cache só vale se estiver íntegro. Arquivos gravados antes da
 * correção da decodificação do base64 do SAP ficaram truncados; nesses casos o
 * cache é descartado e o documento é rebuscado no SAP.
 */
async function cacheUtilizavel(path: string, tipo: DocumentoNfTipo): Promise<boolean> {
  const sb = await admin();
  const barra = path.lastIndexOf("/");
  const pasta = path.slice(0, barra);
  const nome = path.slice(barra + 1);
  const { data } = await sb.storage.from(BUCKET).list(pasta, { search: nome, limit: 100 });
  if (!(data ?? []).some((f) => f.name === nome)) return false;
  if (tipo === "xml") return true;

  const { data: arquivo, error } = await sb.storage.from(BUCKET).download(path);
  if (error || !arquivo) return false;
  const bytes = Buffer.from(await arquivo.arrayBuffer());
  if (pdfIntegro(bytes)) return true;
  await sb.storage.from(BUCKET).remove([path]);
  return false;
}

async function guardar(path: string, base64: string, contentType: string): Promise<void> {
  const sb = await admin();
  const bytes = bytesDocumentoSap(base64);
  if (!bytes) throw new Error("O SAP devolveu um documento vazio ou inválido.");
  if (contentType === "application/pdf" && !pdfIntegro(bytes)) {
    throw new Error("O SAP devolveu um PDF incompleto. Tente novamente em instantes.");
  }
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Não foi possível guardar o documento: ${error.message}`);
}


export type DocumentoNfResultado = {
  tipo: DocumentoNfTipo;
  url: string;
  filename: string;
  contentType: string;
  inline: boolean;
  origem: "storage" | "sap";
};

/**
 * Garante o documento no Storage (buscando no SAP quando necessário) e devolve
 * uma URL assinada curta (5 min). O bucket é privado — a URL é o único acesso.
 */
export async function obterDocumentoNf(
  propostaId: string,
  tipo: DocumentoNfTipo,
  row: Record<string, any>,
): Promise<DocumentoNfResultado> {
  const meta = DOCUMENTOS[tipo];
  const nfNumero = String(row["nf_numero"] ?? "").trim();
  const path =
    tipo === "danfe" && String(row["danfe_path"] ?? "").trim()
      ? String(row["danfe_path"]).trim()
      : caminhoDocumento(propostaId, tipo);

  let origem: "storage" | "sap" = "storage";
  if (!(await existeNoStorage(path))) {
    const nroped = String(row["numero"] ?? "").trim();
    if (!nroped) throw new Error("Pedido sem número — não é possível consultar o SAP.");
    const { base64 } = await consultarDocumentoNfSap(nroped, tipo);
    if (!base64) {
      throw new Error(
        tipo === "boleto"
          ? "O SAP ainda não disponibilizou o boleto deste pedido."
          : "NF ainda não emitida pelo SAP.",
      );
    }
    await guardar(path, base64, meta.contentType);
    origem = "sap";
    if (tipo === "danfe" && !String(row["danfe_path"] ?? "").trim()) {
      try {
        await db.atualizarProposta(propostaId, { danfe_path: path });
      } catch (e) {
        await logIntegrationEvent({
          slug: "cron.sap-nfs",
          level: "warn",
          event: "danfe-path",
          message: `Não foi possível gravar danfe_path: ${(e as Error).message}`.slice(0, 500),
          detail: { proposta_id: propostaId },
        });
      }
    }
  }

  const base = nfNumero ? `NF-${nfNumero}` : `pedido-${row["numero"] ?? propostaId}`;
  const filename =
    tipo === "xml" ? `${base}.xml` : tipo === "boleto" ? `${base}-boleto.pdf` : `${base}-danfe.pdf`;

  const sb = await admin();
  const { data, error } = await sb.storage
    .from(BUCKET)
    .createSignedUrl(path, 300, meta.inline ? {} : { download: filename });
  if (error || !data?.signedUrl) {
    throw new Error(`Não foi possível abrir o documento: ${error?.message ?? "URL indisponível"}`);
  }

  return { tipo, url: data.signedUrl, filename, contentType: meta.contentType, inline: meta.inline, origem };
}
