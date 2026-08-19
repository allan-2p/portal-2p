import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppLayout } from "@/components/app-layout";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";
import { ModeracaoPlaceholder } from "@/components/admin/moderacao-placeholder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Ban, Coins, RotateCcw, Save, Truck } from "lucide-react";
import {
  FRETE_REGRAS_PADRAO,
  ORIGEM,
  REGRAS_TRANSPORTADORAS,
  TRILHOS,
  mesclarFreteRegras,
  nomeTrilho,
  type FreteRegrasConfig,
} from "@/lib/fretefy-regras";
import {
  freteRegrasGetFn,
  freteRegrasResetFn,
  freteRegrasSalvarFn,
} from "@/lib/frete-regras.functions";

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

function FreteRegrasEditor() {
  const get = useServerFn(freteRegrasGetFn);
  const salvar = useServerFn(freteRegrasSalvarFn);
  const resetar = useServerFn(freteRegrasResetFn);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["frete-regras-config"],
    queryFn: () => get(),
  });

  const [cfg, setCfg] = useState<FreteRegrasConfig>(FRETE_REGRAS_PADRAO);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (data?.config) setCfg(mesclarFreteRegras(data.config));
  }, [data]);

  const setRegra = (cnpj: string, patch: Partial<FreteRegrasConfig["transportadoras"][string]>) =>
    setCfg((c) => ({
      ...c,
      transportadoras: {
        ...c.transportadoras,
        [cnpj]: { ...(c.transportadoras[cnpj] ?? FRETE_REGRAS_PADRAO.transportadoras[cnpj]!), ...patch },
      },
    }));

  const toggleTrilho = (cnpj: string, codigo: string, on: boolean) => {
    const atual = cfg.transportadoras[cnpj]?.trilhos ?? [];
    setRegra(cnpj, { trilhos: on ? [...new Set([...atual, codigo])] : atual.filter((c) => c !== codigo) });
  };

  async function onSalvar() {
    setSalvando(true);
    try {
      await salvar({ data: { config: cfg } });
      toast.success("Regras de frete atualizadas.");
      void refetch();
    } catch {
      toast.error("Não foi possível salvar. Apenas administradores podem alterar estas regras.");
    } finally {
      setSalvando(false);
    }
  }

  async function onResetar() {
    setSalvando(true);
    try {
      const r = await resetar();
      setCfg(mesclarFreteRegras(r.config));
      toast.success("Regras restauradas para o padrão da 2P.");
      void refetch();
    } catch {
      toast.error("Não foi possível restaurar as regras.");
    } finally {
      setSalvando(false);
    }
  }

  if (isLoading) return <Skeleton className="h-64 w-full rounded-2xl" />;

  return (
    <div className="space-y-5">
      {/* Parâmetros gerais */}
      <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Truck className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-semibold">Parâmetros gerais</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Valem para todas as cotações do portal, em qualquer unidade.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="rural">Adicional de área rural (R$)</Label>
            <Input
              id="rural"
              inputMode="decimal"
              value={String(cfg.adicionalAreaRural)}
              onChange={(e) =>
                setCfg((c) => ({
                  ...c,
                  adicionalAreaRural: Number(e.target.value.replace(",", ".")) || 0,
                }))
              }
            />
            <p className="text-[11px] text-muted-foreground">
              Somado ao valor cotado quando a entrega é marcada como rural.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kw">Potência máxima Braspress (kW)</Label>
            <Input
              id="kw"
              inputMode="decimal"
              value={String(cfg.potenciaMaxBraspressKw)}
              onChange={(e) =>
                setCfg((c) => ({
                  ...c,
                  potenciaMaxBraspressKw: Number(e.target.value.replace(",", ".")) || 0,
                }))
              }
            />
            <p className="text-[11px] text-muted-foreground">
              Acima disso, a Braspress sai da lista de opções.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="despacho">Despacho Braspress (CPF)</Label>
            <div className="flex items-center gap-2 h-9">
              <Switch
                id="despacho"
                checked={cfg.despachoBraspressCpf}
                onCheckedChange={(v) => setCfg((c) => ({ ...c, despachoBraspressCpf: v }))}
              />
              <span className="text-sm text-muted-foreground">
                {cfg.despachoBraspressCpf ? "Somando à cotação" : "Não somar"}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Taxa de despacho cobrada quando o destinatário é pessoa física.
            </p>
          </div>
        </div>

        <div className="border-t border-border pt-3 text-xs text-muted-foreground space-y-1">
          <p>
            <strong className="text-foreground">Origem fixa:</strong> {ORIGEM.cidade}/{ORIGEM.uf} (CEP{" "}
            {ORIGEM.cep}).
          </p>
          <p>
            <strong className="text-foreground">Peso considerado:</strong> soma do peso bruto dos itens do
            pedido (kg), cadastrado em Gestão de Produtos.
          </p>
          <p>
            <strong className="text-foreground">Cotação em duas passadas:</strong> a segunda recota com o
            valor da nota acrescido do frete da opção mais barata.
          </p>
          <p>
            <strong className="text-foreground">Frete dedicado:</strong> não cota no Fretefy — usa o valor
            informado manualmente na proposta.
          </p>
        </div>
      </section>

      {/* Regras por transportadora */}
      {REGRAS_TRANSPORTADORAS.map((r) => {
        const regra = cfg.transportadoras[r.cnpj] ?? FRETE_REGRAS_PADRAO.transportadoras[r.cnpj]!;
        const bloqueio = r.tipo === "bloqueio";
        return (
          <section key={r.cnpj} className="rounded-2xl border border-border bg-card p-6 space-y-4">
            <div className="flex flex-wrap items-start gap-3 justify-between">
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className={
                    bloqueio
                      ? "h-9 w-9 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center shrink-0"
                      : "h-9 w-9 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0"
                  }
                >
                  {bloqueio ? <Ban className="h-4 w-4" /> : <Coins className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-sm">{r.razaoSocial}</h2>
                  <p className="text-xs text-muted-foreground font-mono">
                    Código SAP {r.codigoSap} · CNPJ {r.cnpj}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{r.resumo}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={regra.ativa}
                  onCheckedChange={(v) => setRegra(r.cnpj, { ativa: v })}
                  aria-label={`Regra ${r.razaoSocial}`}
                />
                <span className="text-xs text-muted-foreground">
                  {regra.ativa ? "Regra ativa" : "Regra desativada"}
                </span>
              </div>
            </div>

            {!bloqueio && (
              <div className="space-y-1.5 max-w-[220px]">
                <Label htmlFor={`tde-${r.cnpj}`}>Adicional TDE por envio (R$)</Label>
                <Input
                  id={`tde-${r.cnpj}`}
                  inputMode="decimal"
                  value={String(regra.adicional)}
                  onChange={(e) =>
                    setRegra(r.cnpj, { adicional: Number(e.target.value.replace(",", ".")) || 0 })
                  }
                />
                <p className="text-[11px] text-muted-foreground">Hoje: {fmt(regra.adicional)}.</p>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {bloqueio ? "Trilhos bloqueados" : "Trilhos com adicional"} ({regra.trilhos.length}/
                  {TRILHOS.length})
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRegra(r.cnpj, { trilhos: TRILHOS.map((t) => t.codigo) })}
                  >
                    Marcar todos
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setRegra(r.cnpj, { trilhos: [] })}>
                    Limpar
                  </Button>
                </div>
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                {TRILHOS.map((t) => {
                  const marcado = regra.trilhos.includes(t.codigo);
                  return (
                    <li key={t.codigo} className="flex items-start gap-2">
                      <Checkbox
                        id={`${r.cnpj}-${t.codigo}`}
                        checked={marcado}
                        onCheckedChange={(v) => toggleTrilho(r.cnpj, t.codigo, v === true)}
                        className="mt-0.5"
                      />
                      <label htmlFor={`${r.cnpj}-${t.codigo}`} className="text-xs cursor-pointer min-w-0">
                        <span className="font-mono text-muted-foreground mr-2">{t.codigo}</span>
                        <span>{nomeTrilho(t.codigo)}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>

            {r.extras?.length ? (
              <ul className="border-t border-border pt-3 space-y-1">
                {r.extras.map((e) => (
                  <li key={e} className="text-xs text-muted-foreground flex gap-2">
                    <span className="text-primary">•</span>
                    <span>{e}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}

      <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/95 backdrop-blur p-4">
        <p className="text-xs text-muted-foreground">
          {data?.atualizadoEm
            ? `Última alteração: ${new Date(data.atualizadoEm).toLocaleString("pt-BR")}`
            : "Usando os valores padrão da 2P."}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onResetar} disabled={salvando}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Restaurar padrão
          </Button>
          <Button onClick={onSalvar} disabled={salvando}>
            <Save className="h-4 w-4 mr-2" />
            {salvando ? "Salvando..." : "Salvar regras"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/admin/frete-regras")({
  head: () => ({
    meta: [
      { title: "Regras de Fretes — 2P Solar | Portal 2P" },
      {
        name: "description",
        content:
          "Regras de frete aplicadas nas cotações do Portal 2P: bloqueios por transportadora, adicionais TDE, área rural e limites — com personalização pelo painel.",
      },
      { property: "og:title", content: "Regras de Fretes — 2P Solar | Portal 2P" },
      {
        property: "og:description",
        content: "Controle das restrições e adicionais de frete aplicados nas propostas do Grupo 2P.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminRouteGuard feature="admin.regras" area="moderacao">
      <AppLayout>
        <ModeracaoPlaceholder
          unidade="2P Solar"
          titulo="Regras de Fretes"
          descricao="Restrições por transportadora, adicionais (TDE) e taxas aplicados automaticamente em toda cotação Fretefy — editáveis aqui."
        >
          <p className="text-sm text-muted-foreground">
            O que estiver salvo nesta tela é exatamente o que o portal aplica na cotação da proposta: as
            transportadoras bloqueadas somem da lista de opções e os adicionais entram no valor final, com o
            ajuste registrado ao lado de cada opção.
          </p>
        </ModeracaoPlaceholder>
        <div className="max-w-[1100px] mx-auto mt-5">
          <FreteRegrasEditor />
        </div>
      </AppLayout>
    </AdminRouteGuard>
  ),
});
