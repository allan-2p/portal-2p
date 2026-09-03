/**
 * ROTINA TEMPORÁRIA — carga única das 66 vendas de Limpador 2P (Intersolar 2026).
 *
 * Executa exatamente o mesmo caminho do portal (server functions de cadastro de
 * cliente e do wizard Solar): nada de INSERT manual de cliente/proposta.
 *
 * Autenticação: `x-cron-secret` (CRON_HOOK_SECRET) + `Authorization: Bearer`
 * de um usuário real do portal (o executor da carga). O bearer é o que as
 * server functions usam via `requireSupabaseAuth`.
 *
 * REMOVER APÓS A EXECUÇÃO (junto com scripts/importacao-intersolar.mjs).
 */
import { createFileRoute } from "@tanstack/react-router";
import { cronSecretValido } from "@/lib/cron-auth.server";
import { salvarClienteFn } from "@/lib/clientes.functions";
import { salvarPropostaSolar } from "@/lib/propostas-solar.functions";

const LIMPADOR = "200000052";
const ESCOVA = "200000104";

type Linha = {
  linha: string;
  contato: string;
  razao_social: string;
  doc: string;
  tipo_doc: string;
  contribuinte: string;
  telefone: string;
  email: string;
  cidade: string;
  endereco: string;
  uf?: string;
  qtd_limpador: string;
  qtd_escova: string;
  total_venda: string;
  forma_pagamento: string;
  vendedor: string;
  observacoes: string;
  /** Faturamento direto ao cliente final (opcional). */
  faturamento?: Record<string, string | boolean>;
};


const so = (v: unknown) => String(v ?? "").trim();
const dig = (v: unknown) => so(v).replace(/\D/g, "");
const num = (v: unknown) => Number(String(v ?? "").replace(",", ".")) || 0;
const money2 = (v: number) => Math.round(v * 100) / 100;

/** Código SAP do consultor do CSV (nome exato do perfil no portal). */
async function consultorDoVendedor(nome: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const alvo = so(nome);
  if (!alvo) return null;
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, numero_sap")
    .ilike("full_name", alvo)
    .maybeSingle();
  const sap = so((data as any)?.numero_sap);
  return sap ? { sap, nome: so((data as any)?.full_name) } : null;
}

async function produtoIdPorCodigo(codigo: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("sap_produtos")
    .select("id, codigo")
    .eq("codigo", codigo)
    .maybeSingle();
  if (!data) throw new Error(`Produto ${codigo} não está no catálogo de produtos do SAP.`);
  return String((data as any).id);
}

/** UF a partir da coluna cidade ("NOVO HORIZONTE - MT", "Buritama / SP", "Forquilha CE"). */
function ufDaCidade(cidade: string): string | null {
  const m = so(cidade)
    .toUpperCase()
    .match(/\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b\s*$/);
  return m ? m[1]! : null;
}

function cidadeLimpa(cidade: string) {
  return so(cidade).replace(/\s*[-/]\s*[A-Za-z]{2}\s*$/, "").replace(/\s+[A-Za-z]{2}$/, "").trim();
}

export const Route = createFileRoute("/api/public/hooks/importacao-intersolar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!cronSecretValido(request)) return new Response("Unauthorized", { status: 401 });

        const body = (await request.json()) as { linhas?: Linha[]; dryRun?: boolean; continuarEmErro?: boolean };
        const linhas = Array.isArray(body.linhas) ? body.linhas : [];
        const dryRun = body.dryRun === true;

        const db = await import("@/lib/clientes-db.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const idLimpador = await produtoIdPorCodigo(LIMPADOR);
        const idEscova = await produtoIdPorCodigo(ESCOVA);

        const relatorio: Record<string, unknown>[] = [];

        for (const l of linhas) {
          const doc = dig(l.doc);
          const item: Record<string, unknown> = { linha: l.linha, doc, razao_social: l.razao_social };
          try {
            const vend = await consultorDoVendedor(l.vendedor);
            item["consultor"] = vend?.nome ?? null;

            // ---------- Cliente ----------
            let achados = await db.findClienteByDoc(doc);
            let cadastro = achados[0]?.cliente ?? null;
            const instanciaAchada = achados[0]?.instancia ?? null;

            if (cadastro && instanciaAchada !== "solar") {
              item["cliente"] = "existente_outra_instancia";
              item["instancia"] = instanciaAchada;
            } else if (cadastro) {
              item["cliente"] = "reusado";
            } else {
              const ehCnpj = doc.length === 14;
              let enr: any = null;
              if (ehCnpj) {
                try {
                  const { enrichCnpj } = await import("@/lib/cnpj-enrich.server");
                  enr = await enrichCnpj(doc);
                } catch (e) {
                  item["enriquecimento_erro"] = (e as Error).message;
                }
              }
              const uf = so(enr?.uf) || so(l.uf) || ufDaCidade(l.cidade) || "";
              if (uf.length !== 2)
                throw new Error(`Não foi possível determinar a UF do cliente (cidade "${l.cidade}").`);

              const obs = so(l.observacoes);
              const nota = `Intersolar 2026 — vendedor ${so(l.vendedor) || "não informado"}.${obs ? ` ${obs}` : ""}`;

              if (dryRun) {
                item["cliente"] = "criaria";
                item["uf"] = uf;
              } else {
                await salvarClienteFn({
                  data: {
                    instancia: "solar",
                    id: null,
                    consultor_sap: vend?.sap ?? null,
                    consultor_nome: vend?.nome ?? null,
                    cliente: {
                      razao_social: so(enr?.razao_social) || so(l.razao_social),
                      nome_fantasia: so(enr?.nome_fantasia) || so(l.razao_social),
                      doc,
                      ie: so(enr?.ie) || null,
                      ie_situacao: so(enr?.ie_situacao) || null,
                      suframa: so(enr?.suframa) || null,
                      suframa_situacao: so(enr?.suframa_situacao) || null,
                      contribuinte: ehCnpj ? (enr ? enr.ie_habilitada === true : so(l.contribuinte).toUpperCase() === "S") : false,
                      regime_tributario: so(enr?.regime_tributario) || null,
                      natureza_juridica: so(enr?.natureza_juridica) || null,
                      porte: so(enr?.porte) || null,
                      situacao_cadastral: so(enr?.situacao_cadastral) || null,
                      data_abertura: so(enr?.data_abertura) || null,
                      cnae_principal_codigo: so(enr?.cnae_principal?.codigo) || null,
                      cnae_principal_descricao: so(enr?.cnae_principal?.descricao) || null,
                      cnaes_secundarios: Array.isArray(enr?.cnaes_secundarios) ? enr.cnaes_secundarios : [],
                      email: so(l.email) || so(enr?.email) || null,
                      telefone: so(l.telefone) || so(enr?.telefone) || null,
                      site: null,
                      contatos: so(l.contato)
                        ? [{ nome: so(l.contato), email: so(l.email), telefone: so(l.telefone), papel: "comercial" }]
                        : [],
                      contato_nome: so(l.contato) || null,
                      contato_cargo: null,
                      contato_email: so(l.email) || null,
                      contato_telefone: so(l.telefone) || null,
                      cep: dig(enr?.cep) || null,
                      logradouro: so(enr?.logradouro) || so(l.endereco) || null,
                      numero: so(enr?.numero) || null,
                      complemento: so(enr?.complemento) || null,
                      bairro: so(enr?.bairro) || null,
                      cidade: so(enr?.cidade) || cidadeLimpa(l.cidade) || null,
                      uf,
                      municipio_ibge: so(enr?.municipio_ibge) || null,
                      condicao_pagamento: null,
                      finalidade: "Revenda",
                      tabela_preco: "2P-0001",
                      condicao_pgto_sap: "",
                      observacoes: nota.slice(0, 2000),
                      ativo: true,
                      enriquecimento: enr ?? null,
                    },
                  },
                });
                achados = await db.findClienteByDoc(doc);
                cadastro = achados[0]?.cliente ?? null;
                item["cliente"] = "criado";
              }
            }

            if (dryRun) {
              relatorio.push(item);
              continue;
            }
            if (!cadastro) throw new Error("Cadastro do cliente não encontrado após a criação.");

            // ---------- Cliente final (faturamento direto) ----------
            // O SAP só precifica com o parceiro faturado cadastrado; no fluxo
            // normal isso acontece no checkout. Aqui o orçamento já nasce com
            // faturamento direto, então o mestre precisa existir antes.
            if (l.faturamento) {
              const docFat = dig(l.faturamento["doc"]);
              const { enviarClienteParaSap } = await import("@/lib/sap-clientes.server");
              const jaTem = await db.findClienteByDoc(docFat);
              const r = await enviarClienteParaSap(
                {
                  doc: docFat,
                  razao_social: so(l.faturamento["nome"]),
                  ie: so(l.faturamento["ie"]),
                  contribuinte: docFat.length === 11 ? false : l.faturamento["contribuinte"] === true,
                  cliente_final: true,
                  email: so(l.email),
                  telefone: so(l.faturamento["telefone"]) || so(l.telefone),
                  cep: dig(l.faturamento["cep"]),
                  logradouro: so(l.faturamento["logradouro"]),
                  numero: so(l.faturamento["numero"]),
                  complemento: so(l.faturamento["complemento"]),
                  bairro: so(l.faturamento["bairro"]),
                  cidade: so(l.faturamento["cidade"]),
                  uf: so(l.faturamento["uf"]),
                  vendedor_sap: vend?.sap ?? so(cadastro["vendedor_sap"]),
                  condicao_pgto_sap: so(cadastro["condicao_pgto_sap"]) || null,
                  tabela_preco: so(cadastro["tabela_preco"]) || "2P-0001",
                  numero_sap: so(jaTem[0]?.cliente?.["numero_sap"]) || null,
                  integrador_sap: so(cadastro["numero_sap"]) || null,
                  escopo_org: "solar",
                } as any,
                { tentativas: 2, retentarHttp5xx: false },
              );
              if (!r.ok) throw new Error(`Cadastro do cliente final no SAP falhou: ${r.erro}`);
              item["cliente_final_sap"] = r.numero_sap;
            }


            // ---------- Proposta (orçamento "Salvo") ----------
            const qtdL = Math.max(0, Math.round(num(l.qtd_limpador)));
            const qtdE = Math.max(0, Math.round(num(l.qtd_escova)));
            const itens = [
              ...(qtdL > 0 ? [{ produtoId: idLimpador, qtd: qtdL }] : []),
              ...(qtdE > 0 ? [{ produtoId: idEscova, qtd: qtdE }] : []),
            ];
            if (!itens.length) throw new Error("Linha sem quantidade de produto.");

            const obs = so(l.observacoes);
            const totalVenda = money2(num(l.total_venda));
            const formaLabel = l.forma_pagamento === "pix" ? "Pix" : "Cartão de crédito";
            const observacoes =
              `Intersolar 2026 — vendedor ${so(l.vendedor) || "não informado"}. ` +
              `Valor fechado: R$ ${totalVenda.toFixed(2).replace(".", ",")} (${formaLabel}). Frete bonificado.` +
              (obs ? ` ${obs}` : "");

            // Reexecução da carga: reaproveita a proposta já criada para o mesmo
            // cliente/nome (tabela `propostas` vive no banco do Grupo 2P).
            const { grupo2pRest } = await import("@/lib/grupo2p-db.server");
            const busca = await grupo2pRest(
              `propostas?select=id,created_at&organizacao=eq.solar&cliente_doc=eq.${doc}&nome=eq.Limpador%202P%20%E2%80%94%20Intersolar%202026&order=created_at.asc&limit=1`,
            );
            const achadas = busca.ok && busca.text ? (JSON.parse(busca.text) as { id: string }[]) : [];
            const propostaExistente = achadas[0] ? String(achadas[0].id) : null;



            const base = {
              propostaId: propostaExistente,
              propostaNome: "Limpador 2P — Intersolar 2026",
              vendidoClienteFinal: false,
              projetoVendido: "nao" as const,
              previsaoFechamento: null,
              listaPreco: "01",
              ehKit: false,
              cliente: {
                nome: so(cadastro["razao_social"]),
                doc,
                ie: so(cadastro["ie"]),
                telefone: so(cadastro["telefone"]) || so(l.telefone),
                email: so(cadastro["email"]) || so(l.email),
              },
              uf: so(cadastro["uf"]).toUpperCase(),
              contribuinte: cadastro["contribuinte"] === true,
              tipoNf: "venda",
              finalidadeUso: l.faturamento ? "Uso e Consumo" : null,
              faturarClienteFinal: !!l.faturamento,
              faturamento: l.faturamento ?? {},
              formaPagamento: l.forma_pagamento === "pix" ? "pix" : "cartao_credito",
              condicaoPagamento: null,
              entregaDiferente: false,
              entrega: {},

              freteMod: "CIF",
              freteAreaRural: false,
              freteValor: 0,
              freteBonificado: true,
              transportadora: null,
              cupomCodigo: null as string | null,
              observacoes,
              calculo: null,
              itens,
            };

            const salva = await salvarPropostaSolar({ data: base });
            item["proposta"] = salva.numero;
            item["proposta_id"] = salva.id;
            item["reaproveitada"] = !!propostaExistente;
            item["subtotal_simulado"] = salva.totais.subtotal;
            item["total_venda"] = totalVenda;

            // ---------- Fechamento do valor combinado ----------
            const desconto = money2(Number(salva.totais.subtotal) - totalVenda);
            if (desconto < -0.01) {
              // Venda acima do preço simulado: o acréscimo entra como valor de
              // frete cobrado (CIF, não bonificado) para o total bater.
              const acrescimo = money2(-desconto);
              const refeita = await salvarPropostaSolar({
                data: {
                  ...base,
                  propostaId: salva.id,
                  freteValor: acrescimo,
                  freteBonificado: false,
                  observacoes:
                    observacoes.replace("Frete bonificado.", "") +
                    ` Ajuste de R$ ${acrescimo.toFixed(2).replace(".", ",")} lançado no campo de frete para fechar o valor combinado.`,
                },
              });
              item["acrescimo_frete"] = acrescimo;
              item["total_final"] = refeita.totais.valorTotal;
            } else if (desconto > 0.01) {

              const codigo = `INTERSOLAR26-${String(l.linha).padStart(2, "0")}`;
              const validade = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
              const { data: jaTem } = await supabaseAdmin
                .from("solar_cupons")
                .select("id")
                .ilike("codigo", codigo)
                .maybeSingle();
              if (!jaTem) {
                const { error } = await supabaseAdmin.from("solar_cupons").insert({
                  codigo,
                  tipos: ["valor"],
                  valor: desconto,
                  percentual: 0,
                  validade,
                  validade_inicio: null,
                  reutilizavel: false,
                  limite_usos: 1,
                  cliente_nome: so(cadastro["razao_social"]),
                  cliente_doc: doc,
                  ativo: true,
                });
                if (error) throw new Error(`Falha ao criar o cupom ${codigo}: ${error.message}`);
              } else {
                await supabaseAdmin.from("solar_cupons").update({ valor: desconto, ativo: true }).eq("id", (jaTem as any).id);
              }
              const refeita = await salvarPropostaSolar({
                data: { ...base, propostaId: salva.id, cupomCodigo: codigo },
              });
              item["cupom"] = codigo;
              item["cupom_valor"] = desconto;
              item["total_final"] = refeita.totais.valorTotal;
            } else {
              item["total_final"] = salva.totais.valorTotal;
            }

            relatorio.push(item);
          } catch (e) {
            item["erro"] = (e as Error).message;
            relatorio.push(item);
            // `continuarEmErro`: a carga segue e as linhas com falha ficam no
            // relatório final para tratamento manual (parceiro do SAP, etc.).
            if (body.continuarEmErro === true) continue;
            return new Response(JSON.stringify({ ok: false, relatorio }), {
              status: 500,
              headers: { "content-type": "application/json", "cache-control": "no-store" },
            });
          }

        }

        return new Response(JSON.stringify({ ok: true, relatorio }), {
          status: 200,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      },
    },
  },
});
