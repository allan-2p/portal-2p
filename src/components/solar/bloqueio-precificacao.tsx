/**
 * Diagnóstico do bloqueio da etapa 3 (produtos/preços) da proposta.
 *
 * Traduz as mensagens cruas do SAP em uma causa provável e em ações objetivas
 * para o vendedor resolver sozinho: CNPJ sem parceiro cadastrado, falha de
 * conexão/credencial, tabela de preço sem condição e item sem preço.
 */

import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export type CausaBloqueio = "parceiro" | "conexao" | "tabela" | "sem-preco" | "outro";

export type DiagnosticoBloqueio = {
  causa: CausaBloqueio;
  titulo: string;
  explicacao: string;
  acoes: string[];
  mensagensSap: string[];
  itensSemPreco: string[];
};

const inclui = (txt: string, ...termos: string[]) =>
  termos.some((t) => txt.toLowerCase().includes(t));

/** Classifica o bloqueio a partir das mensagens do SAP e dos itens sem preço. */
export function diagnosticarBloqueio(input: {
  mensagensSap: string[];
  itensSemPreco: string[];
  documento?: string;
  tabelaPreco?: string;
}): DiagnosticoBloqueio | null {
  const msgs = input.mensagensSap.filter(Boolean);
  const semPreco = input.itensSemPreco.filter(Boolean);
  if (!msgs.length && !semPreco.length) return null;

  const texto = msgs.join(" ").toLowerCase();
  const doc = input.documento ? ` (${input.documento})` : "";

  // De-para pendente: a simulação nem chegou a ser enviada, então os demais
  // itens não estão "sem preço" — listar apenas os materiais pendentes.
  if (inclui(texto, "de/para", "de-para", "código sap numérico", "codigo sap numerico")) {
    const pendentes = [
      ...new Set(
        msgs
          .flatMap((m) => m.split(":").slice(1).join(":").split(","))
          .map((s) => s.replace(/[.\s]+$/g, "").trim())
          .filter((s) => s && !/^\d+$/.test(s)),
      ),
    ];
    return {
      causa: "de-para",
      titulo: "Material sem código SAP numérico no catálogo",
      explicacao:
        "A simulação não foi enviada porque o item abaixo está cadastrado com o SKU comercial (2P-…) em vez do número do material. " +
        "Os demais itens da proposta não foram simulados — só este precisa de correção.",
      acoes: [
        "Abra Gestão de Produtos 2P Solar (ou o cadastro de trilhos/suportes) e grave o código numérico do material.",
        "Depois clique em “Recalcular preços”.",
      ],
      mensagensSap: msgs,
      itensSemPreco: pendentes,
    };
  }


  if (inclui(texto, "parceiro", "cliente não encontrado", "cnpj"))
    return {
      causa: "parceiro",
      titulo: "CNPJ do cliente não está cadastrado como parceiro no SAP",
      explicacao:
        `O SAP recusou a simulação porque não encontrou um parceiro de negócio para o CNPJ do cliente${doc}. ` +
        "Sem parceiro, ele não devolve preço nem peso — por isso os itens ficariam zerados e a proposta não pode avançar.",
      acoes: [
        "Confirme se o cliente já foi enviado ao SAP no cadastro (deve ter o Nº SAP preenchido na lista de clientes).",
        "Se não tiver Nº SAP, abra o cadastro do cliente e reenvie a integração pelo painel de Integrações.",
        "Se o cliente tem Nº SAP mas o erro persiste, peça ao time fiscal para validar o parceiro na organização de vendas usada na proposta.",
        "Depois de regularizar, volte aqui e clique em “Recalcular preços”.",
      ],
      mensagensSap: msgs,
      itensSemPreco: semPreco,
    };

  if (inclui(texto, "conexão", "conexao", "timeout", "fetch", "credencial", "500", "502", "503", "indisponí"))
    return {
      causa: "conexao",
      titulo: "Não foi possível conectar ao SAP",
      explicacao:
        "A chamada de simulação de preços não completou (rede, indisponibilidade do SAP ou credencial de integração). " +
        "Nenhum valor foi retornado, então o portal não deixa seguir com preços zerados.",
      acoes: [
        "Aguarde alguns segundos e clique em “Recalcular preços”.",
        "Se repetir, verifique o status da integração SAP em Admin › Log de Integrações.",
        "Persistindo, avise o administrador do portal: pode ser credencial ou instabilidade do ambiente SAP.",
      ],
      mensagensSap: msgs,
      itensSemPreco: semPreco,
    };

  if (inclui(texto, "tabela", "pltyp", "condição", "condicao"))
    return {
      causa: "tabela",
      titulo: "Tabela de preço sem condição para estes itens",
      explicacao:
        `O SAP respondeu, mas não há condição de preço válida na tabela ${input.tabelaPreco ?? "selecionada"} para os materiais da proposta.`,
      acoes: [
        "Troque a tabela de preço e recalcule.",
        "Confirme com o time comercial qual tabela vale para este cliente.",
        "Se a tabela estiver correta, solicite o cadastro da condição de preço no SAP.",
      ],
      mensagensSap: msgs,
      itensSemPreco: semPreco,
    };

  if (!msgs.length)
    return {
      causa: "sem-preco",
      titulo: "Itens sem preço retornado pelo SAP",
      explicacao:
        "O SAP respondeu sem erro, mas não devolveu valor para todos os materiais e também não há preço sugerido no catálogo para eles.",
      acoes: [
        "Confira o código SAP dos itens listados abaixo em Gestão de Produtos 2P Solar.",
        "Cadastre um preço sugerido no catálogo como contingência, ou solicite a condição de preço no SAP.",
        "Depois clique em “Recalcular preços”.",
      ],
      mensagensSap: msgs,
      itensSemPreco: semPreco,
    };

  return {
    causa: "outro",
    titulo: "O SAP recusou a precificação",
    explicacao: "A simulação retornou mensagens de negócio que impedem o uso dos valores nesta proposta.",
    acoes: [
      "Leia a mensagem original do SAP abaixo — ela indica o cadastro que precisa de ajuste.",
      "Corrija o cadastro apontado e clique em “Recalcular preços”.",
      "Se a mensagem não for clara, encaminhe-a ao administrador do portal (o detalhe fica no log de auditoria da proposta).",
    ],
    mensagensSap: msgs,
    itensSemPreco: semPreco,
  };
}

export function BloqueioPrecificacaoAlert({
  diagnostico,
  onRecalcular,
  recalculando,
}: {
  diagnostico: DiagnosticoBloqueio;
  onRecalcular?: () => void;
  recalculando?: boolean;
}) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 sm:p-5 space-y-3"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div className="min-w-0 space-y-1">
          <div className="font-semibold text-destructive">
            Etapa bloqueada: {diagnostico.titulo}
          </div>
          <p className="text-sm text-muted-foreground">{diagnostico.explicacao}</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card/60 p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">
            Como resolver
          </div>
          <ol className="list-decimal pl-4 text-sm text-muted-foreground space-y-1">
            {diagnostico.acoes.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ol>
        </div>

        <div className="rounded-xl border border-border bg-card/60 p-3 space-y-2 min-w-0">
          {diagnostico.mensagensSap.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">
                Resposta do SAP
              </div>
              <ul className="text-sm space-y-1">
                {diagnostico.mensagensSap.map((m) => (
                  <li key={m} className="break-words text-foreground/90">
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {diagnostico.itensSemPreco.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">
                Itens sem preço ({diagnostico.itensSemPreco.length})
              </div>
              <div className="text-sm text-muted-foreground break-words">
                {diagnostico.itensSemPreco.slice(0, 12).join(", ")}
                {diagnostico.itensSemPreco.length > 12 ? "…" : ""}
              </div>
            </div>
          )}
        </div>
      </div>

      {onRecalcular && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={onRecalcular} disabled={recalculando} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${recalculando ? "animate-spin" : ""}`} />
            Recalcular preços
          </Button>
          <span className="text-xs text-muted-foreground">
            Cada tentativa fica registrada no log de auditoria da proposta.
          </span>
        </div>
      )}
    </div>
  );
}
