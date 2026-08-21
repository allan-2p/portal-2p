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
import { resolverProduto } from "@/lib/solar-sku";
import { sugerirMaterial, useSapCatalogoCodigos } from "@/components/solar/sap-codigo";
import { RegrasSuportes } from "@/components/solar/regras-suportes";


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
  const catalogo = useSapCatalogoCodigos().data ?? [];
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
      cod_terminal_zmil: (c as any).cod_terminal_zmil ?? "",
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
      cod_kit_parafuso_smart: form['cod_kit_parafuso_smart'] ?? "",
      cod_terminal_m8: form['cod_terminal_m8'] ?? "",
      cod_terminal_zmi: form['cod_terminal_zmi'] ?? "",
      cod_terminal_zmil: form['cod_terminal_zmil'] ?? "",
    };
    const { error } = await supabase.from("solar_calc_config").update(payload).eq("id", 1);
    setSalvando(false);
    if (error) return toast.error(error.message);
    void qc.invalidateQueries({ queryKey: ["solar-calc-config"] });
    toast.success("Parâmetros da Calculadora 2P atualizados.");
  }

  const campo = (k: string, label: string) => {
    const codigo = k.startsWith("cod_");
    const valor = form[k] ?? "";
    const invalido = codigo && !!valor.trim() && !resolverProduto(catalogo, valor);
    const sugestao = invalido ? sugerirMaterial(catalogo, valor, label) : undefined;
    return (
      <div className="space-y-1.5" key={k}>
        <Label className={`text-xs ${invalido ? "text-destructive" : "text-muted-foreground"}`}>
          {label}
        </Label>
        <Input
          value={valor}
          className={invalido ? "border-destructive focus-visible:ring-destructive" : ""}
          onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))}
        />
        {invalido && (
          <p className="text-[11px] text-destructive">
            {sugestao
              ? `Sem material no SAP. Sugestão: ${sugestao.codigo} — ${sugestao.descricao}`
              : "Sem material correspondente no catálogo SAP."}
          </p>
        )}
      </div>
    );
  };

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
              Cada fileira informa módulos por fileira, nº de fileiras, orientação, distância entre
              apoios e balanço. Comprimento ={" "}
              <code>nº painéis × lado + (nº painéis − 1) × 20 mm + 2 × 40 mm</code>, com o lado sendo
              a largura em retrato e a altura em paisagem.
            </li>
            <li>
              <b>Telhado com trilho</b>: as barras usam o de/para por comprimento do trilho (4.800 e
              a barra curta configurada abaixo, conforme a largura do módulo). Junção ={" "}
              <code>(barras por linha − 1) × 2</code>. Grampo intermediário ={" "}
              <code>(painéis − 1) × 2</code>, grampo final = 4 e terminal de aterramento = 1, por
              fileira. Fixadores saem da distância entre apoios × múltiplo do suporte (piso de 4).
              Se o suporte tiver <b>complemento</b>, ele sai junto na proporção 2×.
            </li>
            <li>
              <b>Telhado Smart / mini-trilho</b>: não consome barras 2P-TC. A quantidade do
              mini-trilho é a soma dos grampos (intermediários + finais) do projeto; os minis das
              famílias <code>2P-MTL*</code> e <code>2P-MINI*</code> ainda somam os microinversores da
              1ª fileira (geradores micro modelo 1–4).
            </li>
            <li>
              <b>Kit parafuso Smart</b> sai nos suportes legado 9, 10, 15, 16, 17 e 20 (grampos +
              microinversores da 1ª fileira). No suporte 9 o terminal de aterramento também soma os
              microinversores.
            </li>
            <li>
              <b>LAJE 10 (legado 13)</b> emite dois itens próprios (código SAP e complemento), cada
              um com metade dos grampos, e usa o terminal <b>ZMIL</b> — nunca ZMI ou M8.{" "}
              <b>Zipado (legado 14)</b> emite produto próprio somando microinversores nos geradores
              1, 2 e 4, com terminal <b>ZMI</b>.
            </li>
            <li>
              Terminais de microinversor entram uma única vez por projeto: <b>M8</b> para otimizador
              ou micro modelo 5, <b>ZMI</b> nos demais casos com microinversor (dobrado nos modelos
              1–3) e nada quando o gerador é string.
            </li>
          </ol>
        </Bloco>

        <Bloco titulo="Validações">
          <ul className="list-disc pl-5 space-y-1">
            <li>Altura, largura e espessura do módulo dentro dos limites configurados abaixo.</li>
            <li>
              Espessura fora da faixa não impede o cálculo, mas os grampos deixam de ser
              quantificados.
            </li>
            <li>Módulos mais largos que o limite passam a usar a barra curta reforçada.</li>
            <li>
              Acima do limite de painéis, as barras longas são liberadas automaticamente.
            </li>
            <li>
              Componentes sem código no cadastro viram <b>pendência de de/para</b> apontando o campo
              exato a preencher.
            </li>
          </ul>
        </Bloco>
      </section>

      <RegrasSuportes />


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
          {campo("cod_kit_parafuso_smart", "Código — kit parafuso Smart")}
          {campo("cod_terminal_m8", "Código — terminal M8")}
          {campo("cod_terminal_zmi", "Código — terminal ZMI")}
          {campo("cod_terminal_zmil", "Código — terminal ZMIL (LAJE 10)")}

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
