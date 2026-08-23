/**
 * Cliente Microsoft Graph (app-only / client credentials) para o SharePoint
 * do financeiro — site `NFs-Sadas`, onde os PDFs dos boletos a prazo são
 * publicados manualmente pelo time de contas a receber.
 *
 * Só leitura: token → siteId → driveId da biblioteca padrão → listagem
 * recursiva de uma pasta → download de arquivo por id.
 * Nunca registrar token/secret em logs.
 */

const GRAPH = "https://graph.microsoft.com/v1.0";

export type SharepointConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  hostname: string;
  sitePath: string;
  pastaBoletos: string;
};

export function sharepointConfig(): SharepointConfig | null {
  const tenantId = process.env["SHAREPOINT_TENANT_ID"] ?? "";
  const clientId = process.env["SHAREPOINT_CLIENT_ID"] ?? "";
  const clientSecret = process.env["SHAREPOINT_CLIENT_SECRET"] ?? "";
  if (!tenantId || !clientId || !clientSecret) return null;
  return {
    tenantId,
    clientId,
    clientSecret,
    hostname: process.env["SHAREPOINT_SITE_HOSTNAME"] || "2pgroupcombr.sharepoint.com",
    sitePath: process.env["SHAREPOINT_SITE_PATH"] || "/sites/NFs-Sadas",
    pastaBoletos: process.env["SHAREPOINT_BOLETOS_PASTA"] || "4- Boletos/1- Filial (9802)",
  };
}

export class SharepointNaoConfigurado extends Error {
  constructor() {
    super(
      "SharePoint não configurado — faltam SHAREPOINT_TENANT_ID / SHAREPOINT_CLIENT_ID / SHAREPOINT_CLIENT_SECRET.",
    );
    this.name = "SharepointNaoConfigurado";
  }
}

async function token(cfg: SharepointConfig): Promise<string> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const r = await fetch(`https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`Falha na autenticação do SharePoint (${r.status}): ${txt.slice(0, 300)}`);
  const json = JSON.parse(txt) as { access_token?: string };
  if (!json.access_token) throw new Error("SharePoint não devolveu access_token.");
  return json.access_token;
}

async function graph(tk: string, path: string): Promise<any> {
  const r = await fetch(`${GRAPH}${path}`, { headers: { authorization: `Bearer ${tk}` } });
  const txt = await r.text();
  if (!r.ok) throw new Error(`Graph ${r.status} em ${path}: ${txt.slice(0, 400)}`);
  return txt ? JSON.parse(txt) : null;
}

export type SharepointArquivo = {
  id: string;
  nome: string;
  caminho: string;
  tamanho: number;
  atualizado_em: string | null;
};

export type SharepointSessao = {
  cfg: SharepointConfig;
  token: string;
  driveId: string;
};

export async function abrirSharepoint(): Promise<SharepointSessao> {
  const cfg = sharepointConfig();
  if (!cfg) throw new SharepointNaoConfigurado();
  const tk = await token(cfg);
  const site = await graph(tk, `/sites/${cfg.hostname}:${cfg.sitePath}`);
  const siteId = String(site?.id ?? "");
  if (!siteId) throw new Error("Site do SharePoint não encontrado.");
  const drive = await graph(tk, `/sites/${siteId}/drive`);
  const driveId = String(drive?.id ?? "");
  if (!driveId) throw new Error("Biblioteca de documentos do SharePoint não encontrada.");
  return { cfg, token: tk, driveId };
}

const MAX_NIVEIS = 10;
const MAX_ITENS = 5000;

/** Lista recursivamente (até 10 níveis / 5000 itens) os arquivos de uma pasta. */
export async function listarArquivos(
  s: SharepointSessao,
  pasta: string,
): Promise<SharepointArquivo[]> {
  const out: SharepointArquivo[] = [];
  const fila: Array<{ path: string; nivel: number }> = [{ path: pasta, nivel: 0 }];

  while (fila.length && out.length < MAX_ITENS) {
    const atual = fila.shift()!;
    const encoded = encodeURIComponent(atual.path).replace(/%2F/g, "/");
    let url =
      `/drives/${s.driveId}/root:/${encoded}:/children` +
      `?$top=200&$select=id,name,size,folder,file,lastModifiedDateTime,parentReference`;
    while (url && out.length < MAX_ITENS) {
      const page: any = await graph(s.token, url);
      for (const item of page?.value ?? []) {
        if (item.folder) {
          if (atual.nivel + 1 < MAX_NIVEIS) fila.push({ path: `${atual.path}/${item.name}`, nivel: atual.nivel + 1 });
          continue;
        }
        out.push({
          id: String(item.id),
          nome: String(item.name),
          caminho: `${atual.path}/${item.name}`,
          tamanho: Number(item.size ?? 0),
          atualizado_em: item.lastModifiedDateTime ?? null,
        });
      }
      const next = page?.["@odata.nextLink"] as string | undefined;
      url = next ? next.replace(GRAPH, "") : "";
    }
  }

  out.sort((a, b) => String(b.atualizado_em ?? "").localeCompare(String(a.atualizado_em ?? "")));
  return out;
}

/** Baixa o conteúdo de um arquivo pelo id do item. */
export async function baixarArquivo(s: SharepointSessao, itemId: string): Promise<Uint8Array> {
  const r = await fetch(`${GRAPH}/drives/${s.driveId}/items/${itemId}/content`, {
    headers: { authorization: `Bearer ${s.token}` },
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Falha ao baixar arquivo do SharePoint (${r.status}): ${txt.slice(0, 300)}`);
  }
  return new Uint8Array(await r.arrayBuffer());
}

/** Nome do arquivo casa com a NF (com e sem zeros à esquerda), como na plataforma antiga. */
export function arquivoCasaComNf(nome: string, nf: string): boolean {
  const limpo = String(nf ?? "").trim();
  if (!limpo) return false;
  const semZeros = limpo.replace(/^0+/, "");
  const alvo = nome.toLowerCase();
  const candidatos = [limpo, semZeros].filter(Boolean).map((n) => n.toLowerCase());
  return candidatos.some((n) => alvo.includes(n));
}
