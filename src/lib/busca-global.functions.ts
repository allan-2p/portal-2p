// Busca global do portal (Cmd/Ctrl+K): clientes, propostas, pedidos e contatos
// das unidades a que o usuário tem acesso.
//
// SEGURANÇA: o banco do Grupo 2P é acessado com service role (RLS ignorada),
// então TODO o controle de acesso é feito aqui — permissão de objeto
// (`getPerm`) + escopo do consultor (`escopoDoConsultor`).

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type BuscaTipo = "cliente" | "proposta" | "pedido" | "contato";

export type BuscaResultado = {
  tipo: BuscaTipo;
  id: string;
  titulo: string;
  subtitulo: string;
  instancia: "solar" | "carregadores";
  /** Deep link já pronto para o `navigate`. */
  to: string;
  search: Record<string, string>;
  score: number;
};

const INSTANCIAS = ["solar", "carregadores"] as const;
type Inst = (typeof INSTANCIAS)[number];

/** Status de pós-fechamento: a partir daqui a proposta é um pedido. */
const PEDIDO_STATUS = new Set([
  "Aguardando Pagamento",
  "Processando",
  "Separação",
  "Faturado",
  "Coletado",
]);

const LIMITE_POR_GRUPO = 5;
/** Teto por grupo na página de resultados completos (`/busca`). */
const LIMITE_MAX = 30;


const norm = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/** Ranking simples: prefixo vale mais que "contém". */
function pontuar(termo: string, ...campos: unknown[]): number {
  const t = norm(termo);
  let melhor = 0;
  for (const c of campos) {
    const v = norm(c);
    if (!v || !t) continue;
    if (v === t) melhor = Math.max(melhor, 100);
    else if (v.startsWith(t)) melhor = Math.max(melhor, 70);
    else if (v.includes(t)) melhor = Math.max(melhor, 40);
  }
  return melhor;
}

const mascararDoc = (doc: string) => {
  const d = String(doc ?? "").replace(/\D/g, "");
  if (!d) return "";
  return `•••${d.slice(-4)}`;
};

const fmtDoc = (doc: unknown, podeVer: boolean) => {
  const d = String(doc ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (!podeVer) return mascararDoc(d);
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return d;
};

export const buscaGlobalFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = (input ?? {}) as Record<string, unknown>;
    const limite = Number(i["limite"]);
    return {
      q: typeof i["q"] === "string" ? i["q"].slice(0, 120) : "",
      limite: Number.isFinite(limite)
        ? Math.min(Math.max(Math.trunc(limite), 1), LIMITE_MAX)
        : LIMITE_POR_GRUPO,
    };
  })
  .handler(async ({ data, context }): Promise<{ resultados: BuscaResultado[] }> => {
    const termo = data.q.trim();
    const porGrupo = data.limite;
    if (termo.length < 2) return { resultados: [] };


    const { resolveAccess } = await import("./guards.server");
    const { getPerm } = await import("./object-perms.server");
    const { escopoDoConsultor } = await import("./escopo-consultor.server");
    const clientesDb = await import("./clientes-db.server");
    const propostasDb = await import("./propostas-db.server");
    const contatosDb = await import("./contatos-db.server");
    const { ORGANIZACAO } = await import("./grupo2p-db.server");

    const acesso = await resolveAccess(context as any);
    const instancias = INSTANCIAS.filter((i) => acesso.instances.has(i));
    if (!instancias.length) return { resultados: [] };

    const porInstancia = await Promise.all(
      instancias.map(async (inst: Inst) => {
        const out: BuscaResultado[] = [];
        const [permContas, permPropostas, permContatos] = await Promise.all([
          getPerm(context as any, inst, "contas").catch(() => null),
          getPerm(context as any, inst, "propostas").catch(() => null),
          getPerm(context as any, inst, "contatos").catch(() => null),
        ]);

        const escopoContas = permContas?.can_read
          ? await escopoDoConsultor(context as any, inst, permContas)
          : null;

        // ---- Clientes ------------------------------------------------------
        if (permContas?.can_read) {
          try {
            const { rows } = await clientesDb.listClientesPagina(inst, {
              q: termo,
              porPagina: LIMITE_POR_GRUPO,
              pagina: 1,
              ...(permContas.view_all
                ? {}
                : {
                    donoId: (context as any).userId as string,
                    consultorSap: escopoContas?.sap ?? undefined,
                  }),
            } as any);
            for (const c of rows) {
              const podeVer = !!permContas.view_all_fields;
              out.push({
                tipo: "cliente",
                id: String(c.id),
                titulo: String(c["razao_social"] ?? c["nome"] ?? c["fantasia"] ?? "Cliente"),
                subtitulo: [fmtDoc(c["doc"], podeVer), c["uf"], c["cidade"]]
                  .filter(Boolean)
                  .join(" · "),
                instancia: inst,
                to:
                  inst === "solar"
                    ? "/solar/clientes/perfil"
                    : "/carregadores/clientes/cadastros",
                search:
                  inst === "solar"
                    ? { account: String(c.id) }
                    : { q: String(c["doc"] ?? c["razao_social"] ?? "") },
                score:
                  pontuar(termo, c["razao_social"], c["fantasia"], c["nome"], c["doc"]) + 5,
              });
            }
          } catch {
            /* busca é best-effort */
          }
        }

        // ---- Propostas e pedidos ------------------------------------------
        if (permPropostas?.can_read) {
          try {
            const escopo = await escopoDoConsultor(context as any, inst, permPropostas);
            const { rows } = await propostasDb.listarPropostasPagina({
              organizacao: ORGANIZACAO[inst],
              q: termo,
              porPagina: LIMITE_POR_GRUPO * 2,
              pagina: 1,
              select:
                "id,numero,numero_anterior,status,cliente_nome,cliente_doc,sap_ov_numero,created_at,organizacao",
              donoId: escopo.userId,
              donoSap: escopo.sap,
              donoDocs: escopo.docs,
              somenteFavoritas: true,
            });
            const podeVer = !!permPropostas.view_all_fields;
            for (const p of rows) {
              const ehPedido = PEDIDO_STATUS.has(String(p["status"] ?? "")) || !!p["sap_ov_numero"];
              out.push({
                tipo: ehPedido ? "pedido" : "proposta",
                id: String(p.id),
                titulo: `${ehPedido ? "Pedido" : "Proposta"} ${p["numero"] ?? p["id"]}`,
                subtitulo: [
                  p["cliente_nome"],
                  p["status"],
                  p["sap_ov_numero"] ? `OV ${p["sap_ov_numero"]}` : "",
                  podeVer ? "" : "",
                ]
                  .filter(Boolean)
                  .join(" · "),
                instancia: inst,
                to:
                  inst === "solar" ? "/solar/propostas" : "/carregadores/propostas/visualizar",
                search:
                  inst === "solar" ? { ver: String(p.id) } : { id: String(p.id) },
                score: pontuar(
                  termo,
                  p["numero"],
                  p["numero_anterior"],
                  p["sap_ov_numero"],
                  p["cliente_nome"],
                ),
              });
            }
          } catch {
            /* idem */
          }
        }

        // ---- Contatos ------------------------------------------------------
        if (permContatos?.can_read && permContas?.can_read) {
          try {
            const docs = permContas.view_all
              ? null
              : await clientesDb.listarDocsDoConsultor(inst, {
                  donoId: (context as any).userId as string,
                  consultorSap: escopoContas?.sap ?? undefined,
                });
            const contatos = await contatosDb.buscarContatos(inst, {
              q: termo,
              docsCarteira: docs,
              limite: LIMITE_POR_GRUPO,
            });
            const podeVer = !!permContatos.view_all_fields;
            for (const c of contatos) {
              out.push({
                tipo: "contato",
                id: String(c.id),
                titulo: c.nome,
                subtitulo: [
                  c.cargo,
                  podeVer ? (c.emails ?? [])[0] : "",
                  fmtDoc(c.cliente_doc, podeVer),
                ]
                  .filter(Boolean)
                  .join(" · "),
                instancia: inst,
                to:
                  inst === "solar"
                    ? "/solar/clientes/perfil"
                    : "/carregadores/clientes/cadastros",
                search:
                  inst === "solar"
                    ? { account: String(c.cliente_id) }
                    : { q: String(c.cliente_doc ?? "") },
                score: pontuar(termo, c.nome, c.cargo, ...(c.emails ?? [])),
              });
            }
          } catch {
            /* idem */
          }
        }

        return out;
      }),
    );

    const vistos = new Set<string>();
    const resultados: BuscaResultado[] = [];
    for (const lista of porInstancia)
      for (const r of lista) {
        const chave = `${r.tipo}:${r.id}`;
        if (vistos.has(chave)) continue;
        vistos.add(chave);
        resultados.push(r);
      }
    resultados.sort((a, b) => b.score - a.score || a.titulo.localeCompare(b.titulo, "pt-BR"));

    return { resultados: resultados.slice(0, 30) };
  });
