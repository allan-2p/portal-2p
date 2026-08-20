/**
 * Autenticação dos hooks de cron (`/api/public/hooks/*`).
 *
 * Os hooks são públicos na borda, então a autorização acontece aqui: o
 * chamador precisa enviar o header `x-cron-secret` com o valor do segredo
 * CRON_HOOK_SECRET. A chave pública (anon) NÃO é aceita — ela está no bundle
 * do front e não serve como senha.
 */
export function cronSecretValido(request: Request): boolean {
  const esperado = (process.env["CRON_HOOK_SECRET"] ?? "").trim();
  if (!esperado) return false;
  const recebido = (request.headers.get("x-cron-secret") ?? "").trim();
  if (recebido.length !== esperado.length) return false;
  // comparação de tempo constante
  let diff = 0;
  for (let i = 0; i < esperado.length; i++) diff |= esperado.charCodeAt(i) ^ recebido.charCodeAt(i);
  return diff === 0;
}
