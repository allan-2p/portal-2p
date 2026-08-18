import { describe, it, expect, beforeEach } from "vitest";
import {
  hmacSha256Hex,
  lerCabecalhosAssinatura,
  limparCacheReplay,
  validarAssinaturaWebhook,
} from "@/lib/webhook-assinatura.server";

const SEGREDO = "segredo-de-teste";
const BODY = JSON.stringify({ pix: [{ txid: "2P050004ABC", endToEndId: "E1", valor: "1000.00" }] });
const AGORA = 1_760_000_000_000;

async function headersAssinados(body = BODY, tsSeg = Math.floor(AGORA / 1000), segredo = SEGREDO) {
  const v1 = await hmacSha256Hex(segredo, `${tsSeg}.${body}`);
  return new Headers({ "x-webhook-signature": `t=${tsSeg},v1=${v1}` });
}

describe("webhook Pix — assinatura e timestamp", () => {
  beforeEach(() => limparCacheReplay());

  it("aceita assinatura válida dentro da janela", async () => {
    const r = await validarAssinaturaWebhook({
      rawBody: BODY,
      headers: await headersAssinados(),
      segredo: SEGREDO,
      agoraMs: AGORA,
    });
    expect(r).toMatchObject({ ok: true, modo: "hmac" });
  });

  it("rejeita corpo adulterado (integridade)", async () => {
    const headers = await headersAssinados();
    const r = await validarAssinaturaWebhook({
      rawBody: BODY.replace("1000.00", "10.00"),
      headers,
      segredo: SEGREDO,
      agoraMs: AGORA,
    });
    expect(r).toMatchObject({ ok: false, status: 401, erro: "Assinatura inválida." });
  });

  it("rejeita assinatura de outro segredo", async () => {
    const r = await validarAssinaturaWebhook({
      rawBody: BODY,
      headers: await headersAssinados(BODY, Math.floor(AGORA / 1000), "outro"),
      segredo: SEGREDO,
      agoraMs: AGORA,
    });
    expect(r).toMatchObject({ ok: false, status: 401 });
  });

  it("rejeita timestamp fora da janela (replay antigo)", async () => {
    const tsAntigo = Math.floor(AGORA / 1000) - 3600;
    const r = await validarAssinaturaWebhook({
      rawBody: BODY,
      headers: await headersAssinados(BODY, tsAntigo),
      segredo: SEGREDO,
      agoraMs: AGORA,
    });
    expect(r).toMatchObject({ ok: false, status: 401 });
    expect((r as any).erro).toContain("janela");
  });

  it("rejeita ausência de assinatura quando o segredo está configurado", async () => {
    const r = await validarAssinaturaWebhook({
      rawBody: BODY,
      headers: new Headers(),
      segredo: SEGREDO,
      agoraMs: AGORA,
    });
    expect(r).toMatchObject({ ok: false, status: 401, erro: "Assinatura ausente." });
  });

  it("bloqueia reentrega idêntica assinada (anti-replay)", async () => {
    const headers = await headersAssinados();
    const primeiro = await validarAssinaturaWebhook({ rawBody: BODY, headers, segredo: SEGREDO, agoraMs: AGORA });
    const segundo = await validarAssinaturaWebhook({ rawBody: BODY, headers, segredo: SEGREDO, agoraMs: AGORA + 1000 });
    expect(primeiro.ok).toBe(true);
    expect(segundo).toMatchObject({ ok: false, status: 409 });
  });

  it("libera novamente após a janela expirar", async () => {
    const headers = await headersAssinados();
    await validarAssinaturaWebhook({ rawBody: BODY, headers, segredo: SEGREDO, agoraMs: AGORA });
    const depois = await validarAssinaturaWebhook({
      rawBody: BODY,
      headers,
      segredo: SEGREDO,
      agoraMs: AGORA + 400_000,
    });
    // Fora da janela o timestamp já é recusado antes do cache.
    expect(depois).toMatchObject({ ok: false, status: 401 });
  });

  it("sem segredo configurado, aceita mas bloqueia o corpo idêntico repetido", async () => {
    const a = await validarAssinaturaWebhook({ rawBody: BODY, headers: new Headers(), agoraMs: AGORA });
    const b = await validarAssinaturaWebhook({ rawBody: BODY, headers: new Headers(), agoraMs: AGORA + 500 });
    expect(a).toMatchObject({ ok: true, modo: "sem-assinatura" });
    expect(b).toMatchObject({ ok: false, status: 409 });
  });

  it("lê formatos alternativos de header", async () => {
    const h1 = lerCabecalhosAssinatura(
      new Headers({ "x-signature": "sha256=ABCDEF", "x-timestamp": "1760000000000" }),
    );
    expect(h1).toEqual({ assinatura: "abcdef", timestamp: 1760000000 });
    const h2 = lerCabecalhosAssinatura(new Headers({ "x-webhook-signature": "t=1760000000,v1=aa11" }));
    expect(h2).toEqual({ assinatura: "aa11", timestamp: 1760000000 });
  });
});
