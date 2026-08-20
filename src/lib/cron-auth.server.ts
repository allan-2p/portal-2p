/**
 * Autenticação dos hooks de cron (`/api/public/hooks/*`).
 *
 * Os hooks são públicos na borda, então a autorização acontece aqui: o
 * chamador precisa enviar o header `x-cron-secret` com o valor do segredo
 * CRON_HOOK_SECRET. A chave pública (anon) NÃO é aceita — ela está no bundle
 * do front e não serve como senha.
 */
function comparaSeguro(esperado: string, recebido: string): boolean {
  if (!esperado) return false;
  if (recebido.length !== esperado.length) return false;
  let diff = 0;
  for (let i = 0; i < esperado.length; i++) diff |= esperado.charCodeAt(i) ^ recebido.charCodeAt(i);
  return diff === 0;
}

export function cronSecretValido(request: Request): boolean {
  const recebido = (request.headers.get("x-cron-secret") ?? "").trim();
  if (!recebido) return false;
  // Aceita o segredo atual (V2, sincronizado com o Vault deste ambiente) e o
  // legado, para não quebrar chamadas externas já configuradas.
  const candidatos = [process.env["CRON_HOOK_SECRET_V2"], process.env["CRON_HOOK_SECRET"]];
  return candidatos.some((c) => comparaSeguro((c ?? "").trim(), recebido));
}
