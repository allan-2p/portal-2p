/**
 * Áreas do Grupo 2P (administração/configurações gerais).
 * Nestas rotas o portal usa tema neutro (preto/branco), sem identidade de instância.
 * Fora delas, cada instância mantém seu próprio tema.
 */
const GROUP_PREFIXES = ["/admin", "/integracoes", "/usuarios", "/perfil"];

export function isGroupAdminPath(pathname: string): boolean {
  return GROUP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Aplica/remove o atributo global usado pelo CSS (html[data-area="admin"]). */
export function applyAreaAttribute(pathname: string) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  if (isGroupAdminPath(pathname)) el.setAttribute("data-area", "admin");
  else el.removeAttribute("data-area");
}
