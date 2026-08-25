/** Utilitários de CNPJ/CPF: máscara e validação de dígitos verificadores. */

export const soDigitos = (v: string) => (v ?? "").replace(/\D/g, "");

export function mascaraDoc(v: string): string {
  const d = soDigitos(v).slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
  }
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

export function cnpjValido(v: string): boolean {
  const c = soDigitos(v);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const calc = (base: string) => {
    let peso = base.length - 7;
    let soma = 0;
    for (let i = 0; i < base.length; i++) {
      soma += Number(base[i]) * peso--;
      if (peso < 2) peso = 9;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(c.slice(0, 12)) === Number(c[12]) && calc(c.slice(0, 13)) === Number(c[13]);
}

export function cpfValido(v: string): boolean {
  const c = soDigitos(v);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (len: number) => {
    let soma = 0;
    for (let i = 0; i < len; i++) soma += Number(c[i]) * (len + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}

export function docValido(v: string): boolean {
  const d = soDigitos(v);
  if (d.length === 14) return cnpjValido(d);
  if (d.length === 11) return cpfValido(d);
  return false;
}

/** Máscara exclusiva de CNPJ (cadastro de clientes aceita só CNPJ). */
export function mascaraCnpj(v: string): string {
  const d = soDigitos(v).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

/**
 * Padrões de busca (`ilike`) para a coluna `doc` a partir de um termo digitado
 * com ou sem pontuação. Cobre bases mistas, onde o documento pode estar
 * gravado só com dígitos ("41445384000133") ou formatado
 * ("41.445.384/0001-33"): além dos dígitos puros e das máscaras de CNPJ/CPF,
 * gera um padrão com curinga entre cada dígito, que casa com qualquer
 * pontuação intermediária.
 */
export function padroesBuscaDoc(termo: string): string[] {
  const d = soDigitos(termo);
  if (d.length < 3) return [];
  const padroes = new Set<string>([d, d.split("").join("*")]);
  if (d.length === 14) padroes.add(mascaraCnpj(d));
  if (d.length === 11) padroes.add(mascaraDoc(d));
  return [...padroes];
}
