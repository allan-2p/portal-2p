import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listConsultoresPortal,
  type ConsultorPortal,
  type OrganizacaoConsultor,
} from "@/lib/consultores.functions";

/**
 * Consultores elegíveis da organização (ativo + marcado como consultor +
 * código SAP). Regra universal do portal — ver `consultores.functions.ts`.
 */
export function useConsultores(organizacao: OrganizacaoConsultor) {
  const fetchConsultores = useServerFn(listConsultoresPortal);
  return useQuery({
    queryKey: ["consultores-portal", organizacao],
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<ConsultorPortal[]> => {
      const res = await fetchConsultores({ data: { organizacao } });
      return res.records;
    },
  });
}
