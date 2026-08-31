/**
 * Layout base dos e-mails do portal (puro, sem dependência de servidor).
 *
 * Fica separado de `email.server.ts` para que o painel de controle de e-mails
 * consiga renderizar a prévia exatamente com o mesmo HTML do envio real.
 */
export function layoutEmail(titulo: string, corpo: string, preheader?: string): string {
  const previa = (preheader ?? String(titulo).replace(/<[^>]+>/g, " ")).slice(0, 140);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title></head><body style="margin:0;background:#f5f6f8;font-family:Arial,Helvetica,sans-serif;color:#1c1f23">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${previa}</div>
  <div style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:12px;padding:28px">
    <h1 style="margin:0 0 16px;font-size:18px;line-height:1.4">${titulo}</h1>
    <div style="font-size:14px;line-height:1.6">${corpo}</div>
    <p style="margin:24px 0 0;font-size:12px;color:#6b7280">Você recebeu este e-mail porque tem um pedido ou cadastro no Portal 2P.<br />
    Responda a esta mensagem se precisar falar com a nossa equipe.</p>
    <p style="margin:8px 0 0;font-size:12px;color:#9ca3af">2P Group · portal.2pgroup.app</p>
  </div></body></html>`;
}
