/**
 * Diagnóstico read-only da integração Itaú (proxy mTLS).
 *
 * Faz UMA chamada GET a `/cob/{txid}` com um txid propositalmente inexistente.
 * Não cria cobrança, não escreve nada no banco. O 404 do Itaú é o resultado
 * esperado de sucesso: prova que o proxy respondeu, o certificado foi aceito e
 * o token OAuth foi emitido.
 *
 * Nunca retorna segredo, token, certificado ou dado de cliente.
 */

import { ItauIndisponivel, chamarItau, credenciaisPix, modoItau, proxyConfigurado } from "./itau-api.server";

export type ItauDiagnostico = {
  ok: boolean;
  modo: "proxy" | "direto" | "indisponivel";
  /** Só o host do proxy — nunca o segredo. */
  proxyHost: string | null;
  credenciaisPix: boolean;
  txidTeste: string;
  /** Status HTTP devolvido pelo Itaú, quando foi possível identificar. */
  statusItau: number | null;
  duracaoMs: number;
  diagnostico: string;
  detalhe?: string;
};

/** txid válido pelo formato do Itaú (26–35 alfanuméricos) e inexistente. */
function txidDeTeste(): string {
  return `diag${Date.now()}${"0".repeat(10)}`.slice(0, 32);
}

function hostDe(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/** Extrai o status HTTP das mensagens de erro do cliente Itaú. */
function statusDaMensagem(msg: string): number | null {
  const m = msg.match(/\((\d{3})\)/) ?? msg.match(/respondeu (\d{3})/) ?? msg.match(/HTTP (\d{3})/);
  return m?.[1] ? Number(m[1]) : null;
}

function classificar(msg: string, status: number | null): { ok: boolean; diagnostico: string } {
  if (status === 404) {
    return {
      ok: true,
      diagnostico:
        "Proxy mTLS respondeu e o Itaú devolveu 404 para a cobrança de teste (esperado). Certificado aceito e token OAuth emitido — Pix e boleto estão operacionais.",
    };
  }
  if (/não foi possível falar com o proxy/i.test(msg)) {
    return {
      ok: false,
      diagnostico:
        "Não foi possível alcançar o proxy mTLS na URL configurada. O serviço do proxy provavelmente está fora do ar ou mudou de endereço — Pix e boleto estão quebrados até isso ser resolvido.",
    };
  }
  if (status === 401 || status === 403) {
    if (/certificado/i.test(msg)) {
      return {
        ok: false,
        diagnostico:
          "O proxy respondeu, mas o Itaú recusou por ausência do certificado. O proxy perdeu o certificado mTLS (variáveis de certificado no servidor do proxy).",
      };
    }
    return {
      ok: false,
      diagnostico:
        "Chamada recusada com 401/403. Verifique se o segredo do proxy está igual no portal e no servidor do proxy, e se as credenciais Pix continuam válidas.",
    };
  }
  if (status && status >= 500) {
    return {
      ok: false,
      diagnostico: `Itaú ou proxy indisponível no momento (HTTP ${status}). Vale repetir o teste em alguns minutos antes de concluir que há falha de configuração.`,
    };
  }
  return {
    ok: false,
    diagnostico: `Resposta inesperada na chamada de teste${status ? ` (HTTP ${status})` : ""}. Confira o detalhe abaixo.`,
  };
}

export async function diagnosticarItau(): Promise<ItauDiagnostico> {
  const modo = modoItau();
  const proxy = proxyConfigurado();
  const cred = credenciaisPix();
  const txid = txidDeTeste();
  const base: Omit<ItauDiagnostico, "ok" | "statusItau" | "duracaoMs" | "diagnostico"> = {
    modo,
    proxyHost: proxy ? hostDe(proxy.url) : null,
    credenciaisPix: Boolean(cred),
    txidTeste: txid,
  };

  if (modo === "indisponivel") {
    return {
      ...base,
      ok: false,
      statusItau: null,
      duracaoMs: 0,
      diagnostico:
        "Nenhum caminho de mTLS configurado: não há proxy nem certificado direto. Pix e boleto não podem ser emitidos neste ambiente.",
    };
  }
  if (!cred) {
    return {
      ...base,
      ok: false,
      statusItau: null,
      duracaoMs: 0,
      diagnostico: "Credenciais Pix não configuradas neste ambiente — não é possível testar a chamada.",
    };
  }

  const inicio = Date.now();
  try {
    await chamarItau({
      escopo: "pix",
      cred,
      metodo: "GET",
      caminho: `/cob/${txid}`,
      correlationId: `diag-${txid}`,
    });
    // Improvável: um txid de teste não deveria existir.
    return {
      ...base,
      ok: true,
      statusItau: 200,
      duracaoMs: Date.now() - inicio,
      diagnostico:
        "Proxy mTLS respondeu e o Itaú devolveu 200 para a cobrança de teste. A comunicação está funcionando.",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = statusDaMensagem(msg);
    const { ok, diagnostico } = classificar(msg, status);
    return {
      ...base,
      ok,
      statusItau: status,
      duracaoMs: Date.now() - inicio,
      diagnostico,
      detalhe: `${e instanceof ItauIndisponivel ? "[indisponivel] " : ""}${msg.slice(0, 400)}`,
    };
  }
}
