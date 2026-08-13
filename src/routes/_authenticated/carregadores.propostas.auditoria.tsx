import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/app-layout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, ArrowLeft, Calculator, FileDown, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fmtBRL, fmtPct, novoEstado, type CpoFreteMod, type CpoState } from "@/lib/cpo";
import { auditarProposta, type PassoCalculo, REGRAS_VERSAO } from "@/lib/cpo-auditoria";
import {
  baixarCsv,
  buildResumoFiscalCsv,
  buildResumoFiscalHtml,
  textosPadrao,
  type ResumoFiscalMeta,
} from "@/lib/cpo-fiscal-export";
import { useCpoConfig, useCpoNcms, useCpoProducts, useCpoUfs } from "@/hooks/use-cpo";
import { ConclusaoLogCard } from "@/components/cpo/conclusao-log";


export const Route = createFileRoute("/_authenticated/carregadores/propostas/auditoria")({
  head: () => ({
    meta: [
      { title: "Auditoria de cálculo — Portal 2P Carregadores" },
      {
        name: "description",
        content:
          "Memória de cálculo passo a passo por NCM: ICMS, DIFAL, ICMS-ST, impostos, CMV e comissão de cada proposta.",
      },
      { property: "og:title", content: "Auditoria de cálculo — Portal 2P Carregadores" },
      {
        property: "og:description",
        content: "Confira item a item como impostos, CMV e comissão de cada proposta foram apurados.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({ id: typeof s['id'] === "string" ? s['id'] : undefined }),
  component: AuditoriaPage,
});

type Row = {
  id: string;
  numero: string | null;
  cliente_nome: string;
  cliente_doc: string | null;
  cliente_ie: string | null;
  uf: string;
  contribuinte: boolean;
  frete_mod: string;
  frete_valor: number;
  itens: { produtoId?: string; nome?: string; qtd?: number; valor?: number }[];
  status: string;
  created_at: string;
};

function valorPasso(p: PassoCalculo) {
  return p.tipo === "percentual" ? fmtPct(p.valor) : fmtBRL(p.valor);
}

function TabelaPassos({ passos }: { passos: PassoCalculo[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[26%]">Etapa</TableHead>
          <TableHead className="w-[24%]">Fórmula</TableHead>
          <TableHead>Memória de cálculo</TableHead>
          <TableHead className="text-right w-[16%]">Resultado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {passos.map((p, i) => (
          <TableRow key={`${p.rotulo}-${i}`}>
            <TableCell className="font-medium align-top">
              {p.rotulo}
              {p.nota && <p className="mt-1 text-xs font-normal text-muted-foreground">{p.nota}</p>}
            </TableCell>
            <TableCell className="align-top text-sm text-muted-foreground">{p.formula}</TableCell>
            <TableCell className="align-top font-mono text-xs text-muted-foreground">{p.substituicao}</TableCell>
            <TableCell className="align-top text-right font-semibold tabular-nums">{valorPasso(p)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function AuditoriaPage() {
  const search = Route.useSearch();
  const [selecionada, setSelecionada] = useState<string | undefined>(search.id);

  const propostas = useQuery({
    queryKey: ["cpo-proposals"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("cpo_proposals")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        frete_valor: Number(r.frete_valor),
        itens: (r.itens as Row["itens"]) ?? [],
      })) as Row[];
    },
    staleTime: 30_000,
  });

  const produtos = useCpoProducts();
  const ufs = useCpoUfs();
  const config = useCpoConfig();
  const ncms = useCpoNcms();

  const rows = propostas.data ?? [];
  const atualId = selecionada ?? rows[0]?.id;
  const atual = rows.find((r) => r.id === atualId);

  const auditoria = useMemo(() => {
    if (!atual || !produtos.data || !ufs.data || !config.data || !ncms.data) return null;
    const state: CpoState = {
      ...novoEstado(),
      nome: atual.cliente_nome,
      uf: atual.uf,
      contribuinte: atual.contribuinte,
      freteMod: (atual.frete_mod === "CIF" || atual.frete_mod === "DEDICADO" ? atual.frete_mod : "FOB") as CpoFreteMod,
      freteValor: atual.frete_valor,
      itens: atual.itens
        .filter((i) => i.produtoId)
        .map((i, idx) => ({
          key: `${atual.id}-${idx}`,
          produtoId: i.produtoId as string,
          qtd: Number(i.qtd ?? 0),
          valor: Number(i.valor ?? 0),
          valorManual: true,
        })),
    };
    return auditarProposta({
      state,
      produtos: produtos.data,
      ufs: ufs.data,
      config: config.data,
      ncms: ncms.data,
    });
  }, [atual, produtos.data, ufs.data, config.data, ncms.data]);

  const carregando = propostas.isLoading || produtos.isLoading || ufs.isLoading || config.isLoading || ncms.isLoading;

  const meta: ResumoFiscalMeta | null = atual
    ? {
        numero: atual.numero,
        cliente: atual.cliente_nome,
        doc: atual.cliente_doc,
        ie: atual.cliente_ie,
        criadoEm: atual.created_at,
      }
    : null;

  const nomeArquivo = atual
    ? `resumo-fiscal-ncm-${(atual.numero || atual.cliente_nome || "proposta")
        .toString()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .toLowerCase()}`
    : "resumo-fiscal-ncm";

  function exportarPdf() {
    if (!auditoria || !meta) return;
    const w = window.open("", "_blank");
    if (!w) return toast.error("Permita pop-ups para gerar o PDF.");
    w.document.write(buildResumoFiscalHtml(auditoria, meta));
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 600);
  }

  function exportarCsv() {
    if (!auditoria || !meta) return;
    baixarCsv(`${nomeArquivo}.csv`, buildResumoFiscalCsv(auditoria, meta));
    toast.success("CSV do resumo fiscal gerado.");
  }

  const textos = auditoria ? textosPadrao(auditoria) : null;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-semibold tracking-tight">Auditoria de cálculo</h1>
              <Badge variant="outline">Regras v{REGRAS_VERSAO}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Passo a passo por NCM de cada proposta: ICMS, DIFAL, ICMS-ST, impostos, CMV e comissão.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/carregadores/propostas">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Propostas
              </Link>
            </Button>
            <Select value={atualId ?? ""} onValueChange={setSelecionada}>
              <SelectTrigger className="w-[320px]">
                <SelectValue placeholder="Selecione uma proposta" />
              </SelectTrigger>
              <SelectContent>
                {rows.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {(r.numero ? `#${r.numero} — ` : "") + r.cliente_nome} ·{" "}
                    {new Date(r.created_at).toLocaleDateString("pt-BR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportarCsv} disabled={!auditoria}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              CSV
            </Button>
            <Button size="sm" onClick={exportarPdf} disabled={!auditoria}>
              <FileDown className="mr-2 h-4 w-4" />
              Resumo fiscal (PDF)
            </Button>
          </div>
        </div>

        <ConclusaoLogCard />

        {carregando && <p className="text-sm text-muted-foreground">Carregando dados de cálculo…</p>}

        {!carregando && !atual && (
          <p className="text-sm text-muted-foreground">Nenhuma proposta salva para auditar.</p>
        )}

        {auditoria && atual && (
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Contexto da apuração</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Cliente</p>
                  <p className="font-medium">{atual.cliente_nome}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">UF de destino</p>
                  <p className="font-medium">
                    {auditoria.uf.nome} · interna {fmtPct(auditoria.uf.aliqInterna)} · FCP {fmtPct(auditoria.uf.fcp)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Cliente contribuinte</p>
                  <p className="font-medium">{auditoria.contribuinte ? "Sim" : "Não"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Convênio ICMS-ST</p>
                  <p className="font-medium">{auditoria.uf.convenioSt ? "Sim" : "Não"}</p>
                </div>
              </CardContent>
            </Card>

            {auditoria.alertas.length > 0 && (
              <Card className="border-amber-500/40 bg-amber-500/5">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4" /> Pontos de atenção
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {auditoria.alertas.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Cálculo por item / NCM</CardTitle>
              </CardHeader>
              <CardContent>
                <Accordion type="multiple" className="w-full">
                  {auditoria.itens.map((it) => (
                    <AccordionItem key={it.key} value={it.key}>
                      <AccordionTrigger>
                        <div className="flex flex-1 flex-wrap items-center gap-3 pr-4 text-left">
                          <span className="font-medium">{it.produto}</span>
                          <Badge variant="outline">NCM {it.ncm.codigo}</Badge>
                          {it.ncm.origem !== "NCM" && <Badge variant="secondary">fallback</Badge>}
                          {it.ncm.temSt && <Badge variant="secondary">ICMS-ST</Badge>}
                          <span className="ml-auto text-sm tabular-nums text-muted-foreground">
                            {it.qtd} × {fmtBRL(it.valorUnitario)} = {fmtBRL(it.bruto)}
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <p className="mb-3 text-xs text-muted-foreground">
                          {it.ncm.descricao} · IPI {fmtPct(it.ncm.ipi)} · PIS/COFINS {fmtPct(it.ncm.pisCofins)} ·
                          interestadual {fmtPct(it.ncm.inter)} · {it.ncm.geraDifal ? "gera DIFAL" : "sem DIFAL"}
                        </p>
                        <TabelaPassos passos={it.passos} />
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Totais, impostos e CMV</CardTitle>
              </CardHeader>
              <CardContent>
                <TabelaPassos passos={auditoria.totais} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Comissão</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <TabelaPassos passos={auditoria.comissao} />
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Papel</TableHead>
                      <TableHead>Regime</TableHead>
                      <TableHead className="text-right">% sobre a venda</TableHead>
                      <TableHead className="text-right">Custo empresa</TableHead>
                      <TableHead className="text-right">Remuneração</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditoria.rateio.linhas.map((l) => (
                      <TableRow key={l.key}>
                        <TableCell className="font-medium">{l.papel}</TableCell>
                        <TableCell>{l.regime}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtPct(l.pctCusto)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtBRL(l.custo)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtBRL(l.remuneracao)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {textos && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    Texto padrão para o processo · {textos.regime}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="rounded-md border-l-4 border-primary bg-muted/40 p-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">DIFAL</p>
                    <p className="text-justify leading-relaxed">{textos.difal}</p>
                  </div>
                  <div className="rounded-md border-l-4 border-primary bg-muted/40 p-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">ICMS-ST</p>
                    <p className="text-justify leading-relaxed">{textos.st}</p>
                  </div>
                  <div className="rounded-md border-l-4 border-muted-foreground/40 bg-muted/40 p-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ressalva</p>
                    <p className="text-justify leading-relaxed">{textos.ressalva}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(
                        `${textos.difal}\n\n${textos.st}\n\n${textos.ressalva}`,
                      );
                      toast.success("Texto padrão copiado.");
                    }}
                  >
                    Copiar texto padrão
                  </Button>
                </CardContent>
              </Card>
            )}


            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Versão das regras aplicadas</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {auditoria.parametros.map((p) => (
                  <div key={p.rotulo}>
                    <p className="text-xs uppercase text-muted-foreground">{p.rotulo}</p>
                    <p className="font-medium tabular-nums">{p.valor}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
