/**
 * Bloco "Dados do Destinatário (Remessa por conta e ordem)".
 *
 * Aparece quando o Tipo de NF é Triangulação (Solar e Carregadores). O
 * faturamento continua no cliente da etapa 1; aqui é capturado quem RECEBE a
 * mercadoria (CPF ou CNPJ, com endereço próprio, contribuinte de ICMS e
 * contato). Os dados são gravados dentro do jsonb `entrega` da proposta.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Search, Building2, User, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CepInput, type EnderecoCep } from "@/components/cep-input";
import { enriquecerCnpjFn } from "@/lib/clientes.functions";
import { cnpjValido, cpfValido } from "@/lib/cnpj";

export type DestinatarioValor = Record<string, string | boolean>;

const txt = (v: unknown) => (v == null ? "" : String(v));

/** Documento do destinatário: CPF (11) ou CNPJ (14). */
export function destTipoDoc(valor: DestinatarioValor): "cnpj" | "cpf" {
  if (valor['tipo_doc'] === "cpf" || valor['tipo_doc'] === "cnpj") return valor['tipo_doc'];
  return txt(valor['doc']).replace(/\D/g, "").length === 11 ? "cpf" : "cnpj";
}

/** Erros que travam o avanço/salvamento quando o pedido é triangulação. */
export function validarDestinatario(valor: DestinatarioValor): string[] {
  const e: string[] = [];
  const doc = txt(valor['doc']).replace(/\D/g, "");
  const tipo = destTipoDoc(valor);
  if (!txt(valor['nome']).trim()) e.push("Informe o nome do destinatário da remessa.");
  if (tipo === "cpf" && !cpfValido(doc)) e.push("CPF do destinatário inválido.");
  if (tipo === "cnpj" && !cnpjValido(doc)) e.push("CNPJ do destinatário inválido.");
  else if (tipo === "cnpj" && txt(valor['consulta_fiscal_doc']).replace(/\D/g, "") !== doc)
    e.push(
      "Clique em Buscar para consultar o CNPJ do destinatário — a consulta define a inscrição estadual e se ele é contribuinte de ICMS.",
    );
  if (!txt(valor['logradouro']).trim() || !txt(valor['cidade']).trim())
    e.push("Complete o endereço de entrega do destinatário.");
  if (txt(valor['uf']).trim().length !== 2) e.push("Informe a UF do destinatário.");
  if (valor['contribuinte'] === true && !txt(valor['ie']).trim())
    e.push("Destinatário contribuinte de ICMS: informe a inscrição estadual.");
  return e;
}

export function DestinatarioTriangulacao({
  valor,
  onChange,
  onEnderecoAlterado,
}: {
  valor: DestinatarioValor;
  onChange: (patch: DestinatarioValor) => void;
  /** Chamado quando o endereço muda (invalida a cotação de frete). */
  onEnderecoAlterado?: () => void;
}) {
  const enriquecer = useServerFn(enriquecerCnpjFn);
  const [buscando, setBuscando] = useState(false);
  const [cepOk, setCepOk] = useState(false);
  const tipo = destTipoDoc(valor);

  async function buscarCnpj() {
    const doc = txt(valor['doc']).replace(/\D/g, "");
    if (tipo !== "cnpj" || !cnpjValido(doc)) {
      toast.error("Informe um CNPJ válido (14 dígitos).");
      return;
    }
    setBuscando(true);
    try {
      const e = await enriquecer({ data: { cnpj: doc } });
      if (!e) {
        onChange({ consulta_fiscal_doc: doc, ie_habilitada: false, contribuinte: false });
        toast.warning("Não encontramos dados públicos — preencha manualmente.");
        return;
      }
      onChange({
        consulta_fiscal_doc: doc,
        nome: e.razao_social ?? txt(valor['nome']),
        ie: e.ie ?? txt(valor['ie']),
        ie_situacao: e.ie_situacao ?? "",
        ie_habilitada: e.ie_habilitada === true,
        contribuinte: e.ie_habilitada === true,
        cep: e.cep ?? txt(valor['cep']),
        logradouro: e.logradouro ?? txt(valor['logradouro']),
        numero: e.numero ?? txt(valor['numero']),
        complemento: e.complemento ?? txt(valor['complemento']),
        bairro: e.bairro ?? txt(valor['bairro']),
        cidade: e.cidade ?? txt(valor['cidade']),
        uf: e.uf ?? txt(valor['uf']),
        telefone: e.telefone ?? txt(valor['telefone']),
      });
      onEnderecoAlterado?.();
      toast.success("Dados do CNPJ preenchidos. Você ainda pode editá-los.");
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível consultar o CNPJ.");
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4 space-y-4">
      <div>
        <div className="text-xs uppercase tracking-wider font-semibold text-primary">
          Dados do Destinatário (Remessa por conta e ordem)
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          O faturamento continua no cliente da proposta; a mercadoria é entregue a este
          destinatário.
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <span>
          Com a mudança de faturamento se aumenta 2 dias para emissão da nota fiscal — é o prazo
          para cadastrar o destinatário.
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">O destinatário é:</span>
        <div className="inline-flex rounded-xl border border-border bg-surface-2 p-1">
          {([
            ["cnpj", "CNPJ", Building2],
            ["cpf", "CPF", User],
          ] as const).map(([v, label, Icon]) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                if (v === tipo) return;
                onChange({
                  tipo_doc: v,
                  doc: "",
                  nome: "",
                  ie: "",
                  ie_situacao: "",
                  ie_habilitada: false,
                  contribuinte: false,
                  consulta_fiscal_doc: "",
                });
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${
                v === tipo ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">{tipo === "cpf" ? "CPF" : "CNPJ"}</label>
          <div className="flex gap-2">
            <Input
              value={txt(valor['doc'])}
              onChange={(e) => onChange({ doc: e.target.value, consulta_fiscal_doc: "" })}
              placeholder={tipo === "cpf" ? "000.000.000-00" : "00.000.000/0000-00"}
            />
            {tipo === "cnpj" && (
              <Button type="button" variant="secondary" onClick={() => void buscarCnpj()} disabled={buscando}>
                {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                <span className="ml-1 hidden sm:inline">Buscar</span>
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <label className="text-xs text-muted-foreground">
            {tipo === "cpf" ? "Nome" : "Razão social"}
          </label>
          <Input value={txt(valor['nome'])} onChange={(e) => onChange({ nome: e.target.value })} />
        </div>

        {tipo === "cnpj" && (
          <>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Inscrição estadual</label>
              <Input value={txt(valor['ie'])} onChange={(e) => onChange({ ie: e.target.value })} />
            </div>
            <div className="flex items-end gap-2 pb-2 text-sm md:col-span-2">
              <Checkbox
                checked={valor['contribuinte'] === true}
                onCheckedChange={(v) => onChange({ contribuinte: v === true })}
              />
              <span>
                Destinatário é contribuinte de ICMS
                <span className="block text-xs text-muted-foreground">
                  {txt(valor['consulta_fiscal_doc']) === ""
                    ? "Clique em Buscar: a consulta do CNPJ define a inscrição estadual."
                    : valor['ie_habilitada'] === true
                      ? `IE habilitada${txt(valor['ie']).trim() ? ` — ${txt(valor['ie'])}` : ""}.`
                      : `Sem IE habilitada${txt(valor['ie_situacao']).trim() ? ` (${txt(valor['ie_situacao'])})` : ""}. Marque apenas se ele possuir IE.`}
                </span>
              </span>
            </div>
          </>
        )}

        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">CEP</label>
          <CepInput
            value={txt(valor['cep'])}
            onChange={(v) => onChange({ cep: v })}
            onFound={(e: EnderecoCep) => {
              onChange({
                cep: e.cep,
                logradouro: e.logradouro || txt(valor['logradouro']),
                complemento: e.complemento || txt(valor['complemento']),
                bairro: e.bairro || txt(valor['bairro']),
                cidade: e.cidade || txt(valor['cidade']),
                uf: e.uf || txt(valor['uf']),
              });
              setCepOk(!!e.cidade && !!e.uf);
              onEnderecoAlterado?.();
            }}
          />
        </div>

        {([
          ["logradouro", "Logradouro"],
          ["numero", "Número"],
          ["complemento", "Complemento"],
          ["bairro", "Bairro"],
          ["cidade", "Cidade"],
          ["uf", "UF"],
          ["contato", "Contato"],
          ["telefone", "Telefone"],
        ] as const).map(([k, label]) => (
          <div key={k} className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{label}</label>
            <Input
              value={txt(valor[k])}
              disabled={cepOk && (k === "cidade" || k === "uf")}
              onChange={(e) => {
                onChange({ [k]: e.target.value });
                if (k === "cidade" || k === "uf" || k === "logradouro") onEnderecoAlterado?.();
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
