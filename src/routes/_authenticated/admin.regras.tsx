import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/app-layout";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";
import { PlaceholderLink } from "@/components/admin/moderacao-placeholder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSolarCalcConfig } from "@/hooks/use-solar-catalogo";
import { SOLAR_CALC_CONFIG_FALLBACK } from "@/lib/solar-calculadora";

export const Route = createFileRoute("/_authenticated/admin/regras")({
  head: () => ({
    meta: [
      { title: "Regras de Propostas — 2P Solar | Portal 2P" },
      { name: "description", content: "Regras de propostas da unidade 2P Solar e parâmetros da Calculadora 2P." },
      { property: "og:title", content: "Regras de Propostas — 2P Solar | Portal 2P" },
      { property: "og:description", content: "Moderação das regras de propostas e da Calculadora 2P." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminRouteGuard feature="admin.regras" area="moderacao">
      <AppLayout>
        <div className="max-w-[1100px] mx-auto space-y-5">
          <div>
            <div className="text-xs uppercase tracking-wider text-primary font-semibold">
              Moderação • 2P Solar
            </div>
            <h1 className="text-3xl font-bold mt-1">Regras de Propostas</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Regras ativas do cálculo das propostas da unidade 2P Solar. Os parâmetros abaixo são
              aplicados na Calculadora 2P em “Realizar Proposta”.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Complementos: tabelas de preço em{" "}
              <PlaceholderLink to="/admin/tabelas">Configurações › Tabelas</PlaceholderLink>, metas em{" "}
              <PlaceholderLink to="/admin/metas">Regras de Metas</PlaceholderLink> e transportadoras em{" "}
              <PlaceholderLink to="/admin/frete-regras">Regras de Fretes</PlaceholderLink>.
            </p>
          </div>
          <Calculadora2P />
        </div>
      </AppLayout>

    </AdminRouteGuard>
  ),
});

/** Documentação + parâmetros configuráveis da Calculadora 2P. */
function Calculadora2P() {
  const qc = useQueryClient();
  const cfgQ = useSolarCalcConfig();
  const [form, setForm] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const c = cfgQ.data ?? SOLAR_CALC_CONFIG_FALLBACK;
    setForm({
      folga_paineis: String(c.folga_paineis),
      balanco_ponta: String(c.balanco_ponta),
      barras_longas: c.barras_longas.join(", "),
      barra_curta_padrao: String(c.barra_curta_padrao),
      barra_curta_larga: String(c.barra_curta_larga),
      largura_limite: String(c.largura_limite),
      altura_min: String(c.altura_min),
      largura_min: String(c.largura_min),
      espessura_min: String(c.espessura_min),
      espessura_max: String(c.espessura_max),
      limite_paineis_todos_trilhos: String(c.limite_paineis_todos_trilhos),
      cod_grampo_intermediario: c.cod_grampo_intermediario,
      cod_grampo_final: c.cod_grampo_final,
      cod_terminal_aterramento: c.cod_terminal_aterramento,
      cod_juncao: c.cod_juncao,
      cod_kit_parafuso_smart: (c as any).cod_kit_parafuso_smart ?? "",
      cod_terminal_m8: (c as any).cod_terminal_m8 ?? "",
      cod_terminal_zmi: (c as any).cod_terminal_zmi ?? "",
    });

  }, [cfgQ.data]);

  async function salvar() {
    setSalvando(true);
    const payload = {
      folga_paineis: Number(form['folga_paineis']) || 0,
      balanco_ponta: Number(form['balanco_ponta']) || 0,
      barras_longas: String(form['barras_longas'] ?? "")
        .split(",")
        .map((v) => Number(v.trim()))
        .filter((n) => n > 0),
      barra_curta_padrao: Number(form['barra_curta_padrao']) || 0,
      barra_curta_larga: Number(form['barra_curta_larga']) || 0,
      largura_limite: Number(form['largura_limite']) || 0,
      altura_min: Number(form['altura_min']) || 0,
      largura_min: Number(form['largura_min']) || 0,
      espessura_min: Number(form['espessura_min']) || 0,
      espessura_max: Number(form['espessura_max']) || 0,
      limite_paineis_todos_trilhos: Number(form['limite_paineis_todos_trilhos']) || 0,
      cod_grampo_intermediario: form['cod_grampo_intermediario'] ?? "",
      cod_grampo_final: form['cod_grampo_final'] ?? "",
      cod_terminal_aterramento: form['cod_terminal_aterramento'] ?? "",
      cod_juncao: form['cod_juncao'] ?? "",
    };
    const { error } = await supabase.from("solar_calc_config").update(payload).eq("id", 1);
    setSalvando(false);
    if (error) return toast.error(error.message);
    void qc.invalidateQueries({ queryKey: ["solar-calc-config"] });
    toast.success("Parâmetros da Calculadora 2P atualizados.");
  }

  const campo = (k: string, label: string) => (
    <div className="space-y-1.5" key={k}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input value={form[k] ?? ""} onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))} />
    </div>
  );

  return (
    <>
      <section className="glass rounded-2xl p-5 space-y-4">
        <div>
          <h2 className="text-xl font-bold">Calculadora 2P</h2>
          <p className="text-sm text-muted-foreground">
            Motor de quantificação das estruturas usado em “Realizar Proposta” (somente 2P Solar).
          </p>
        </div>

        <Bloco titulo="De onde vêm as informações">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <b>Módulos</b>: Moderação › 2P Solar › Gestão de Produtos › <b>Módulos</b> (largura,
              altura e espessura em mm). A opção “Personalizado” pede as medidas na própria proposta.
            </li>
            <li>
              <b>Geradores, trilhos e suportes</b>: cadastros de referência do Solar; cada trilho tem
              a lista de suportes compatíveis.
            </li>
            <li>
              <b>Produtos e preços</b>: catálogo do SAP (<code>sap_produtos</code>). O preço unitário
              vem da simulação de preços do SAP conforme a <b>tabela de preço</b> escolhida na
              proposta — trocar a tabela recalcula todos os itens.
            </li>
            <li>
              <b>Frete</b>: Fretefy, com o peso vindo da simulação do SAP (mesma regra dos
              Carregadores, com as transportadoras e regras do Solar).
            </li>
          </ul>
        </Bloco>

        <Bloco titulo="Como a estrutura é quantificada">
          <ol className="list-decimal pl-5 space-y-1">
            <li>
              Os painéis são distribuídos entre as fileiras de forma equilibrada
              (ex.: 22 painéis em 4 fileiras → 6, 6, 5 e 5).
            </li>
            <li>
              Comprimento de cada fileira ={" "}
              <code>nº painéis × lado + (nº painéis − 1) × folga + 2 × balanço</code>, onde o lado é
              a largura do módulo em retrato e a altura em paisagem.
            </li>
            <li>
              As barras de trilho são combinadas a partir das barras longas disponíveis, completando
              com a barra curta. São <b>duas linhas de trilho por fileira</b>.
            </li>
            <li>
              Junções = (barras por linha − 1) × 2 linhas. Grampos intermediários = (painéis − 1) × 2
              por fileira. Grampos finais = 4 por fileira. Terminal de aterramento = 1 por fileira.
            </li>
            <li>
              Fixadores = 1 a cada intervalo configurado de trilho (mínimo 2 por linha), sempre
              arredondados para o múltiplo definido no suporte, × 2 linhas.
            </li>
            <li>
              Suportes de laje/solo não consomem barra de trilho; nesses casos apenas os fixadores e
              acessórios entram na proposta.
            </li>
          </ol>
        </Bloco>

        <Bloco titulo="Validações">
          <ul className="list-disc pl-5 space-y-1">
            <li>Altura, largura e espessura do módulo dentro dos limites configurados abaixo.</li>
            <li>Módulos mais largos que o limite passam a usar a barra curta reforçada.</li>
            <li>Acima do limite de painéis, o portal alerta sobre a disponibilidade do trilho.</li>
          </ul>
        </Bloco>
      </section>

      <section className="glass rounded-2xl p-5 space-y-4">
        <h3 className="font-semibold">Parâmetros configuráveis</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {campo("folga_paineis", "Folga entre painéis (mm)")}
          {campo("balanco_ponta", "Balanço nas pontas (mm)")}
          {campo("barras_longas", "Barras longas (mm, separadas por vírgula)")}
          {campo("barra_curta_padrao", "Barra curta padrão (mm)")}
          {campo("barra_curta_larga", "Barra curta p/ módulo largo (mm)")}
          {campo("largura_limite", "Largura limite do módulo (mm)")}
          {campo("altura_min", "Altura mínima do módulo (mm)")}
          {campo("largura_min", "Largura mínima do módulo (mm)")}
          {campo("espessura_min", "Espessura mínima (mm)")}
          {campo("espessura_max", "Espessura máxima (mm)")}
          {campo("limite_paineis_todos_trilhos", "Limite de painéis por proposta")}
          {campo("cod_grampo_intermediario", "Código — grampo intermediário")}
          {campo("cod_grampo_final", "Código — grampo final")}
          {campo("cod_terminal_aterramento", "Código — terminal de aterramento")}
          {campo("cod_juncao", "Código — junção de trilho")}
        </div>
        <Button onClick={() => void salvar()} disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar parâmetros"}
        </Button>
      </section>
    </>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2 p-4">
      <div className="font-semibold mb-2">{titulo}</div>
      <div className="text-sm text-muted-foreground space-y-1">{children}</div>
    </div>
  );
}
