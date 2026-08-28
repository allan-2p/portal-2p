/** Opções do seletor "Buscar em" das listas de propostas (Solar e Carregadores). */
export const CAMPOS_BUSCA = [
  { valor: "tudo", rotulo: "Todos os campos", placeholder: "Buscar por cliente, nome, nº ou nº SAP" },
  { valor: "numero", rotulo: "Nº da proposta", placeholder: "Buscar pelo nº da proposta" },
  { valor: "sap", rotulo: "Nº SAP / OV", placeholder: "Buscar pelo nº SAP da ordem" },
  { valor: "cliente", rotulo: "Cliente", placeholder: "Buscar pelo nome do cliente" },
  { valor: "documento", rotulo: "CNPJ / CPF", placeholder: "Buscar por CNPJ ou CPF" },
  { valor: "nome", rotulo: "Nome da proposta", placeholder: "Buscar pelo nome da proposta" },
  { valor: "consultor", rotulo: "Consultor", placeholder: "Buscar pelo consultor responsável" },
  { valor: "nf", rotulo: "Nota fiscal", placeholder: "Buscar pelo nº ou chave da NF-e" },
] as const;

export const placeholderBusca = (campo: string) =>
  CAMPOS_BUSCA.find((c) => c.valor === campo)?.placeholder ?? CAMPOS_BUSCA[0].placeholder;
