import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { useCpoConfig } from "@/hooks/use-cpo";
import { CPO_CONFIG_FALLBACK, fmtPct } from "@/lib/cpo";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";


export const Route = createFileRoute("/_authenticated/carregadores/regras")({
  head: () => ({
    meta: [
      { title: "Regras de Propostas — Portal 2P Carregadores" },
      { name: "description", content: "Como as propostas de carregadores são calculadas: impostos, DIFAL, margem bruta e comissões." },
      { property: "og:title", content: "Regras de Propostas — Portal 2P Carregadores" },
      { property: "og:description", content: "Documentação completa do motor de cálculo das propostas de carregadores." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminRouteGuard feature="cpo.regras" area="moderacao">
      <RegrasPage />
    </AdminRouteGuard>
  ),
});

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="glass rounded-2xl p-5 space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      <div className="space-y-3 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <pre className="rounded-lg bg-surface-2 border border-border px-3 py-2 text-xs overflow-x-auto font-mono whitespace-pre-wrap">
      {children}
    </pre>
  );
}

function Campo({ nome, origem }: { nome: string; origem: string }) {
  return (
    <tr className="border-b border-border/50 last:border-0">
      <td className="px-3 py-2 font-medium align-top w-[38%]">{nome}</td>
      <td className="px-3 py-2 text-muted-foreground">{origem}</td>
    </tr>
  );
}

function RegrasPage() {
  const { data: cfgData } = useCpoConfig();
  const cfg = cfgData ?? CPO_CONFIG_FALLBACK;

  return (
    <AppLayout>
      <div className="max-w-[1100px] mx-auto space-y-5">
        <div>
          <div className="text-xs uppercase tracking-wider text-primary font-semibold">Moderação</div>
          <h1 className="text-3xl font-bold mt-1">Regras de Propostas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Documentação do motor de cálculo usado em toda proposta de carregadores: de onde vem cada valor,
            como os impostos são apurados e como a margem e a comissão são formadas.
          </p>
        </div>

        <Section
          title="1. Origem dos dados"
          subtitle="Nenhum valor da proposta é digitado duas vezes — cada campo tem uma fonte única."
        >
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase text-muted-foreground border-b border-border">
                  <th className="text-left px-3 py-2">Campo</th>
                  <th className="text-left px-3 py-2">De onde é tirado</th>
                </tr>
              </thead>
              <tbody>
                <Campo nome="Cliente (nome, CNPJ/CPF, contato, endereço)" origem="Clientes › Cadastros. Ao selecionar o cliente, os dados são apenas exibidos — não são editáveis na proposta." />
                <Campo nome="UF de destino" origem="Cadastro do cliente. Define a alíquota interna e o FCP usados no DIFAL." />
                <Campo nome="Contribuinte de ICMS" origem="Cadastro do cliente (Inscrição Estadual). Define quem absorve o DIFAL ." />
                <Campo nome="Produto e custo" origem="Moderação › Produtos e Alíquotas (tabela de produtos)." />
                <Campo nome="Alíquota interna e FCP por Estado" origem="Moderação › Produtos e Alíquotas (tabela de UFs)." />
                <Campo nome="IPI, PIS/COFINS, alíquota interestadual, MB mínima" origem="Moderação › Comissões › Parâmetros tributários." />
                <Campo nome="Valor unitário de venda" origem="Preenchido pelo vendedor em cada proposta. Não há preço de tabela sugerido — o valor é sempre negociado." />
                <Campo nome="Frete" origem="Preenchido na proposta (FOB, CIF ou Dedicado). Entra no total da proposta, mas não na base de impostos nem na margem." />
                <Campo nome="Regras de comissão (CLT/PJ)" origem="Moderação › Comissões. O regime do beneficiário vem do cadastro do usuário (Usuários › Regime de contratação)." />
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="2. Valor unitário de venda" subtitle="O preço é sempre definido pelo consultor na proposta.">
          <p className="text-muted-foreground">
            Não existe preço de tabela ou preço sugerido: cada item recebe o valor unitário negociado
            (com IPI). Todo o cálculo fiscal, de margem e de comissão usa exclusivamente o valor digitado.
          </p>
        </Section>

        <Section title="3. Base de cálculo dos itens" subtitle="O IPI está embutido no valor de venda e é removido para formar a base.">
          <Formula>{`Valor Itens (venda)  = Σ (valor unitário × quantidade)          — já com IPI
Valor NF (sem IPI)   = Valor Itens ÷ (1 + IPI)                  IPI = ${fmtPct(cfg.ipi)}
IPI                  = Valor Itens − Valor NF
Valor Total          = Valor Itens + Frete
Custo Total          = Σ (custo do produto × quantidade)`}</Formula>
          <p className="text-muted-foreground">
            O frete <strong>não</strong> compõe a base de impostos nem a margem: é repasse.
          </p>
        </Section>

        <Section title="4. Bases fiscais por NCM" subtitle="As regras são cadastradas por NCM, não por produto.">
          <p className="text-muted-foreground">
            Cada produto aponta para um NCM em <strong>Moderação › Produtos e Alíquotas › NCM</strong>, e é o NCM que
            define IPI, PIS/COFINS, alíquota interestadual e se há ICMS-ST ou DIFAL. O carregador de 7,4 kW é
            importado com NCM próprio e, por isso, tem alíquotas e regras de DIFAL/ICMS-ST distintas do carregador DC.
          </p>
          <Formula>{`IE informada?
  Não  → DIFAL (comprador não contribuinte) embutido no cálculo da venda
  Sim  → UF com convênio ST?
           Não → venda normal
           Sim → Industrialização  → venda normal
                 Revenda           → cobrança de ICMS-ST
                 Uso/consumo/ativo → cobrança de DIFAL-ST

UFs com convênio ST: AC · AL · AP · MT · MG · PR · PE · RJ · SP`}</Formula>
        </Section>

        <Section title="5. ICMS e DIFAL" subtitle="Na NF o ICMS é sempre 4%. O DIFAL é um custo adicional no cabeçalho.">
          <Formula>{`ICMS na NF   = Valor NF (sem IPI) × ${fmtPct(cfg.aliq_inter)}       ← nunca somado ao DIFAL
PIS/COFINS   = (Valor NF − ICMS) × ${fmtPct(cfg.pis_cofins)}

Base DIFAL   = Valor Itens ÷ (1 − (alíquota interna + FCP))
DIFAL        = Base DIFAL × (alíquota interna + FCP − ${fmtPct(cfg.aliq_inter)})

Cliente NÃO CONTRIBUINTE          → o DIFAL é custo da 2P e entra no cabeçalho da NF
Cliente CONTRIBUINTE (com IE)     → o DIFAL é apenas informativo: quem recolhe é o
                                    destinatário, por guia no Estado dele — sem
                                    impacto na margem da 2P

Exceção — vendas para dentro de SC:
  Não contribuinte                 → ICMS 17%
  Contribuinte Simples Nacional    → ICMS 12%
  Demais contribuintes             → Revenda 4% · Industrialização 10%`}</Formula>
          <p className="text-muted-foreground">
            A alíquota de ICMS destacada na nota permanece em {fmtPct(cfg.aliq_inter)} em qualquer UF (exceto SC, acima).
            Somar ICMS + DIFAL numa única alíquota — como era feito antes — distorce tanto a nota quanto a margem.
          </p>
          <p className="text-muted-foreground">
            Mesmo em UF sem convênio de ICMS-ST, o cliente que compra para <strong>uso e consumo</strong> pode receber
            guia de DIFAL no Estado dele. Nesse caso basta o aviso nas observações da proposta — não há custo para a 2P.
          </p>
        </Section>


        <Section title="6. Receita líquida, CMV e margem bruta" subtitle="Indicadores que governam a aprovação da proposta.">
          <Formula>{`Receita Líquida = Venda − IPI − ICMS − PIS/COFINS − DIFAL (quando custo da 2P)
CMV             = Custo Total ÷ Receita Líquida
Margem Bruta    = Receita Líquida − Custo Total
MB %            = Margem Bruta ÷ Venda`}</Formula>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li>
              <strong className="text-destructive">CMV acima de {fmtPct(cfg.cmv_max)}</strong> — o vendedor não
              consegue orçar; exige aprovação especial da diretoria.
            </li>
            <li>
              <strong className="text-destructive">MB% abaixo de {fmtPct(cfg.politica_mb_min)}</strong> — fora da
              política mínima; a proposta precisa ser ajustada.
            </li>
            <li>
              <strong className="text-emerald-500">MB% a partir de {fmtPct(cfg.politica_mb_min)}</strong> — dentro da política.
            </li>
          </ul>
        </Section>

        <Section title="7. Comissão" subtitle="A fórmula devolve o custo total para a empresa; o vendedor fica com o saldo.">
          <Formula>{`% Comissão total = (4 + 7,4 ÷ (1 + e^(2,05 × (CMV% − 57,8)))) ÷ 100
Comissão total   = Margem Bruta × % Comissão total     ← CUSTO TOTAL DA EMPRESA

Custo Gerente    = Venda × ${fmtPct(cfg.pct_gerente)}      (fixo, CLT e PJ)
Custo Indicação  = R$ 250,00 fixo por venda      (fixo, CLT e PJ)
Custo Vendedor   = Comissão total − Custo Gerente − Custo Indicação

Remuneração      = custo (PJ)   ou   custo ÷ ${cfg.fator_clt} (CLT)`}</Formula>
          <p className="text-muted-foreground">
            Quanto menor o CMV (venda mais rentável), maior o percentual de comissão. Como gerente e indicação são
            percentuais fixos sobre a venda, a comissão do vendedor é o saldo — e portanto extremamente variável.
            Com CMV acima de {fmtPct(cfg.cmv_max)} a comissão é zerada e a proposta fica bloqueada.
          </p>
          <p className="text-muted-foreground">
            No regime CLT o custo da empresa é a remuneração acrescida dos encargos (fator{" "}
            <strong>{cfg.fator_clt}</strong>). No PJ o custo é igual à remuneração.
          </p>
        </Section>


        <Section title="8. Fluxo e status da proposta" subtitle="Do rascunho ao pedido.">
          <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
            <li>Selecionar o cliente já cadastrado — dados fiscais e de contato vêm prontos.</li>
            <li>Adicionar itens e informar o valor unitário negociado de cada um.</li>
            <li>Conferir o DRE lateral (impostos, receita líquida, margem e comissão) em tempo real.</li>
            <li>Salvar: a proposta nasce como <strong>Salvo</strong> e vai para o histórico em Propostas.</li>
            <li>O status evolui em Propostas/Pedidos conforme a negociação (Enviada, Aprovada, Perdida e etapas do pedido).</li>
          </ol>
          <p className="text-muted-foreground">
            Alterações em produtos, alíquotas ou parâmetros tributários valem para propostas <em>novas</em>;
            propostas já salvas mantêm os valores registrados no momento do salvamento.
          </p>
        </Section>
      </div>
    </AppLayout>
  );
}
