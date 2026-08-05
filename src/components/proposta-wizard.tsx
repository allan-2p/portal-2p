import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Minus, ArrowLeft, Construction } from "lucide-react";
import { toast } from "sonner";

export type NovaPropostaResult = {
  cliente: string;
  projeto: string;
  vendido: "sim" | "nao" | "estoque" | "";
  metodo: Metodo;
};

type Metodo = "" | "proposta" | "lista";

type Fileira = {
  id: string;
  trilho: string;
  suporte: string;
  fileiras: string;
  modulos: string;
  orientacao: string;
  distancia: string;
  balanco: string;
};

const STEPS = [
  "Identificação",
  "Estruturas",
  "Faturamento",
  "Quantificação",
  "Finalização",
] as const;

const novaFileira = (): Fileira => ({
  id: crypto.randomUUID(),
  trilho: "",
  suporte: "",
  fileiras: "",
  modulos: "",
  orientacao: "",
  distancia: "",
  balanco: "0,5",
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl p-5 space-y-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function EmProducao({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-2 py-12 rounded-xl border border-dashed border-border">
      <Construction className="h-8 w-8 text-muted-foreground" />
      <div className="font-medium">{title}</div>
      <p className="text-sm text-muted-foreground max-w-md">{description}</p>
    </div>
  );
}

export function PropostaWizard({
  onCancel,
  onFinish,
}: {
  onCancel: () => void;
  onFinish: (r: NovaPropostaResult) => void;
}) {
  const [step, setStep] = useState(0);

  // Identificação
  const [cliente, setCliente] = useState("");
  const [projeto, setProjeto] = useState("");
  const [vendido, setVendido] = useState<"sim" | "nao" | "estoque" | "">("");
  const [previsao, setPrevisao] = useState("");
  const [metodo, setMetodo] = useState<Metodo>("");

  // Estruturas (Realizar Proposta)
  const [kit, setKit] = useState("");
  const [modulo, setModulo] = useState("");
  const [altura, setAltura] = useState("");
  const [largura, setLargura] = useState("");
  const [espessura, setEspessura] = useState("");
  const [qtdPaineis, setQtdPaineis] = useState("");
  const [tipoGerador, setTipoGerador] = useState("");
  const [qtdMicro, setQtdMicro] = useState("");
  const [trilhos, setTrilhos] = useState("");
  const [fileiras, setFileiras] = useState<Fileira[]>([novaFileira()]);

  // Faturamento
  const [tabelaPreco, setTabelaPreco] = useState("01");
  const [tipoNF, setTipoNF] = useState("Venda");
  const [faturarFinal, setFaturarFinal] = useState(false);
  const [entregaDiferente, setEntregaDiferente] = useState(false);
  const [formaPagamento, setFormaPagamento] = useState("");
  const [entrega, setEntrega] = useState("receber");
  const [areaRural, setAreaRural] = useState(false);

  const identOk = cliente.trim() !== "" && projeto.trim() !== "";

  const goNext = () => {
    if (step === 0) {
      if (!identOk) return toast.error("Preencha cliente e nome do projeto.");
      if (!metodo) return toast.error("Selecione o modo de cálculo de estruturas.");
      setStep(metodo === "lista" ? 2 : 1);
      return;
    }
    if (step === 1) {
      if (!modulo || !qtdPaineis) return toast.error("Preencha os dados do módulo e a quantidade de painéis.");
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!formaPagamento) return toast.error("Selecione a forma de pagamento.");
      setStep(3);
      return;
    }
    if (step === 3) return setStep(4);
    onFinish({ cliente: cliente.trim(), projeto: projeto.trim(), metodo });
  };

  const goBack = () => {
    if (step === 0) return onCancel();
    if (step === 2 && metodo === "lista") return setStep(0);
    setStep((s) => s - 1);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onCancel} aria-label="Voltar para propostas">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Carteira</div>
          <h1 className="text-3xl font-bold mt-1">Nova proposta</h1>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2 flex-wrap">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={`text-xs px-3 py-1.5 rounded-full border ${
              i === step
                ? "bg-primary text-primary-foreground border-transparent"
                : i < step
                  ? "bg-surface-2 text-foreground border-border"
                  : "text-muted-foreground border-border"
            }`}
          >
            {i + 1}. {s}
          </div>
        ))}
      </div>

      {step === 0 && (
        <>
          <Section title="Identificação">
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Cliente">
                <Input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Busque um cliente" />
              </Field>
              <Field label="Nome do Projeto">
                <Input value={projeto} onChange={(e) => setProjeto(e.target.value)} placeholder="Nome do projeto" />
              </Field>
            </div>
            <div className="flex items-center gap-6 flex-wrap">
              <span className="text-sm">O projeto já foi vendido para o cliente final?</span>
              {([["sim", "Sim"], ["nao", "Não"], ["estoque", "Estoque"]] as const).map(([v, l]) => (
                <label key={v} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={vendido === v} onCheckedChange={() => setVendido(vendido === v ? "" : v)} />
                  {l}
                </label>
              ))}
            </div>
            <div className="max-w-xs">
              <Field label="Qual previsão de fechamento?">
                <Input type="date" value={previsao} onChange={(e) => setPrevisao(e.target.value)} />
              </Field>
            </div>
          </Section>

          {identOk && (
            <Section title="Cálculo de estruturas">
              <p className="text-sm text-muted-foreground">
                Selecione a opção que deseja utilizar para orçar as estruturas do seu projeto.
                <br />
                <strong className="text-foreground">Realizar Proposta</strong>: a calculadora quantifica automaticamente
                os componentes necessários com base nas informações inseridas.
                <br />
                <strong className="text-foreground">Lista de Produtos</strong>: selecione manualmente os itens e as
                quantidades que deseja orçar.
              </p>
              <div className="max-w-md">
                <Field label="Vamos lá! Qual modo você deseja utilizar?">
                  <Select value={metodo} onValueChange={(v) => setMetodo(v as Metodo)}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="proposta">Realizar Proposta</SelectItem>
                      <SelectItem value="lista">Lista de Produtos</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </Section>
          )}
        </>
      )}

      {step === 1 && (
        <>
          <Section title="Realizar Proposta">
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Kit Fotovoltaico?">
                <Select value={kit} onValueChange={setKit}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sim">Sim</SelectItem>
                    <SelectItem value="nao">Não</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Módulo">
                <Select value={modulo} onValueChange={setModulo}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="outro">Outro / Personalizado</SelectItem>
                    <SelectItem value="canadian">Canadian Solar</SelectItem>
                    <SelectItem value="ja-solar">JA Solar</SelectItem>
                    <SelectItem value="trina">Trina Solar</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              <Field label="Altura (mm)">
                <Input type="number" value={altura} onChange={(e) => setAltura(e.target.value)} />
              </Field>
              <Field label="Largura (mm)">
                <Input type="number" value={largura} onChange={(e) => setLargura(e.target.value)} />
              </Field>
              <Field label="Espessura (mm)">
                <Input type="number" value={espessura} onChange={(e) => setEspessura(e.target.value)} />
              </Field>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              <Field label="Quantidade de Painéis">
                <Input type="number" value={qtdPaineis} onChange={(e) => setQtdPaineis(e.target.value)} />
              </Field>
              <Field label="Tipo de Gerador">
                <Select value={tipoGerador} onValueChange={setTipoGerador}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inversor">Inversor</SelectItem>
                    <SelectItem value="microinversor">Microinversor</SelectItem>
                    <SelectItem value="otimizador">Otimizador</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Quant. de Microinversores/Otimizadores">
                <Input type="number" value={qtdMicro} onChange={(e) => setQtdMicro(e.target.value)} />
              </Field>
            </div>
            <div className="max-w-md">
              <Field label="Selecione os Trilhos">
                <Select value={trilhos} onValueChange={setTrilhos}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trilho-2p">Trilho 2P</SelectItem>
                    <SelectItem value="trilho-reforcado">Trilho Reforçado</SelectItem>
                    <SelectItem value="perfil-mini">Perfil Mini</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </Section>

          <Section title="Disposição dos Painéis nas Fileiras">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                    <th className="text-left px-2 py-2">Fileira</th>
                    <th className="text-left px-2 py-2">Trilhos</th>
                    <th className="text-left px-2 py-2">Suporte</th>
                    <th className="text-left px-2 py-2">Qtd. Fileiras</th>
                    <th className="text-left px-2 py-2">Qtd. Módulos</th>
                    <th className="text-left px-2 py-2">Orientação</th>
                    <th className="text-left px-2 py-2">Dist. máx. apoios (m)</th>
                    <th className="text-left px-2 py-2">Balanço strings (m)</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {fileiras.map((f, i) => (
                    <tr key={f.id} className="border-b border-border/50">
                      <td className="px-2 py-2 whitespace-nowrap">Fileira {i + 1}</td>
                      <td className="px-2 py-2">
                        <Select
                          value={f.trilho}
                          onValueChange={(v) =>
                            setFileiras((p) => p.map((x) => (x.id === f.id ? { ...x, trilho: v } : x)))
                          }
                        >
                          <SelectTrigger className="w-36"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="trilho-2p">Trilho 2P</SelectItem>
                            <SelectItem value="trilho-reforcado">Reforçado</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-2">
                        <Select
                          value={f.suporte}
                          onValueChange={(v) =>
                            setFileiras((p) => p.map((x) => (x.id === f.id ? { ...x, suporte: v } : x)))
                          }
                        >
                          <SelectTrigger className="w-36"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ceramico">Cerâmico</SelectItem>
                            <SelectItem value="metalico">Metálico</SelectItem>
                            <SelectItem value="fibrocimento">Fibrocimento</SelectItem>
                            <SelectItem value="solo">Solo</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          className="w-24"
                          type="number"
                          value={f.fileiras}
                          onChange={(e) =>
                            setFileiras((p) => p.map((x) => (x.id === f.id ? { ...x, fileiras: e.target.value } : x)))
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          className="w-24"
                          type="number"
                          value={f.modulos}
                          onChange={(e) =>
                            setFileiras((p) => p.map((x) => (x.id === f.id ? { ...x, modulos: e.target.value } : x)))
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Select
                          value={f.orientacao}
                          onValueChange={(v) =>
                            setFileiras((p) => p.map((x) => (x.id === f.id ? { ...x, orientacao: v } : x)))
                          }
                        >
                          <SelectTrigger className="w-32"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="retrato">Retrato</SelectItem>
                            <SelectItem value="paisagem">Paisagem</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          className="w-24"
                          value={f.distancia}
                          onChange={(e) =>
                            setFileiras((p) => p.map((x) => (x.id === f.id ? { ...x, distancia: e.target.value } : x)))
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          className="w-24"
                          value={f.balanco}
                          onChange={(e) =>
                            setFileiras((p) => p.map((x) => (x.id === f.id ? { ...x, balanco: e.target.value } : x)))
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Remover fileira"
                          onClick={() => setFileiras((p) => (p.length > 1 ? p.filter((x) => x.id !== f.id) : p))}
                        >
                          <Minus className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button variant="outline" className="gap-2" onClick={() => setFileiras((p) => [...p, novaFileira()])}>
              <Plus className="h-4 w-4" /> Adicionar Fileira
            </Button>
          </Section>
        </>
      )}

      {step === 2 && (
        <>
          <Section title="Detalhes do Faturamento">
            <div className="text-sm space-y-1">
              <div><span className="text-muted-foreground">Cliente:</span> <strong>{cliente}</strong></div>
              <div><span className="text-muted-foreground">Projeto:</span> <strong>{projeto}</strong></div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Tabela de preço">
                <Select value={tabelaPreco} onValueChange={setTabelaPreco}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="01">01</SelectItem>
                    <SelectItem value="02">02</SelectItem>
                    <SelectItem value="03">03</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Tipo de NF">
                <Select value={tipoNF} onValueChange={setTipoNF}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Venda">Venda</SelectItem>
                    <SelectItem value="Remessa">Remessa</SelectItem>
                    <SelectItem value="Bonificação">Bonificação</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={faturarFinal} onCheckedChange={(v) => setFaturarFinal(v === true)} />
              Faturar para o cliente final
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={entregaDiferente} onCheckedChange={(v) => setEntregaDiferente(v === true)} />
              Endereço de entrega diferente do endereço de faturamento
            </label>
          </Section>

          <Section title="Forma de pagamento">
            <div className="max-w-md">
              <Field label="Forma de Pagamento">
                <Select value={formaPagamento} onValueChange={setFormaPagamento}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="boleto-5">Boleto a vista (5 dias)</SelectItem>
                    <SelectItem value="boleto-28">Boleto 28 dias</SelectItem>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="cartao">Cartão</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="flex items-center gap-6 flex-wrap">
              <span className="text-sm">Deseja receber ou retirar seu pedido?</span>
              {([["receber", "Receber"], ["dedicado", "Dedicado"], ["gratis", "Grátis"], ["retirar", "Retirar"]] as const).map(
                ([v, l]) => (
                  <label key={v} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={entrega === v} onCheckedChange={() => setEntrega(v)} />
                    {l}
                  </label>
                ),
              )}
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={areaRural} onCheckedChange={(v) => setAreaRural(v === true)} />
              Área rural
            </label>
          </Section>
        </>
      )}

      {step === 3 && (
        <Section title="Quantificação de estruturas">
          <EmProducao
            title="Em produção"
            description="A quantificação automática das estruturas está em desenvolvimento e será liberada em breve."
          />
        </Section>
      )}

      {step === 4 && (
        <Section title="Finalização do pedido">
          <EmProducao
            title="Em produção"
            description="Frete, cupom e observações do pedido estão em desenvolvimento e serão liberados em breve."
          />
          <div className="opacity-50 pointer-events-none space-y-3">
            <Field label="Observações do pedido">
              <Textarea placeholder="Observações…" />
            </Field>
          </div>
        </Section>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={goBack}>
          {step === 0 ? "Cancelar" : "Voltar"}
        </Button>
        <Button onClick={goNext}>{step === STEPS.length - 1 ? "Salvar proposta" : "Próximo"}</Button>
      </div>
    </div>
  );
}
