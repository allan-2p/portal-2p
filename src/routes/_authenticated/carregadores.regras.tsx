import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { useCpoConfig } from "@/hooks/use-cpo";
import { CPO_CONFIG_FALLBACK, fmtPct } from "@/lib/cpo";
import { REGRAS_PADRAO, FATOR_CLT } from "@/lib/cpo-comissao";

export const Route = createFileRoute("/_authenticated/carregadores/regras")({
  head: () => ({
    meta: [
      { title: "Regras de Propostas — Portal 2P Carregadores" },
      { name: "description", content: "Como as propostas de carregadores são calculadas: impostos, DIFAL, margem bruta e comissões." },
      { property: "og:title", content: "Regras de Propostas — Portal 2P Carregadores" },
      { property: "og:description", content: "Documentação completa do motor de cálculo das propostas CPO." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RegrasPage,
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
                <Campo nome="Frete" origem="Preenchido na proposta (FOB ou CIF). Entra no total da proposta, mas não na base de impostos nem na margem." />
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
          <Formula>{`Valor Itens        = Σ (valor unitário × quantidade)
Valor Item (base)  = Σ (valor unitário ÷ (1 + IPI)) × quantidade      IPI = ${fmtPct(cfg.ipi)}
Valor Total        = Valor Itens + Frete
Custo Total        = Σ (custo do produto × quantidade)`}</Formula>
          <p className="text-muted-foreground">
            O frete <strong>não</strong> compõe a base de impostos nem a margem: é repasse. A base fiscal é
            sempre o <em>Valor Item</em> (sem IPI).
          </p>
        </Section>

        <Section title="4. ICMS, DIFAL e demais impostos" subtitle="Operação interestadual a partir de SP.">
          <Formula>{`Alíquota interna destino = alíquota da UF + FCP da UF
ICMS origem              = Valor Item × ${fmtPct(cfg.aliq_inter)}   (alíquota interestadual)
Fator "por dentro"       = (alíquota interna − ${fmtPct(cfg.aliq_inter)}) ÷ (1 − alíquota interna)

Cliente CONTRIBUINTE      → ICMS = ICMS origem
                            DIFAL é recolhido pelo destinatário (mostrado apenas como estimativa)

Cliente NÃO CONTRIBUINTE  → DIFAL absorvido = Valor Item × Fator "por dentro"
                            ICMS = ICMS origem + DIFAL absorvido

IPI          = Valor Item × ${fmtPct(cfg.ipi)}
PIS/COFINS   = (Valor Item − ICMS) × ${fmtPct(cfg.pis_cofins)}`}</Formula>
          <p className="text-muted-foreground">
            A alíquota efetiva de ICMS é arredondada em 4 casas decimais antes de gerar o valor final, para
            bater com a apuração fiscal.
          </p>
        </Section>

        <Section title="5. Receita líquida e margem bruta" subtitle="Indicador que governa a aprovação da proposta.">
          <Formula>{`Receita Líquida = Valor Item − ICMS − PIS/COFINS
Margem Bruta    = Receita Líquida − Custo Total
MB %            = Margem Bruta ÷ Valor Itens`}</Formula>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li>
              <strong className="text-destructive">Abaixo de {fmtPct(cfg.politica_mb_min)}</strong> — fora da política mínima; a proposta precisa ser ajustada.
            </li>
            <li>
              <strong className="text-amber-500">Entre {fmtPct(cfg.politica_mb_min)} e {fmtPct(cfg.mb_atencao)}</strong> — dentro da política, mas em faixa de atenção.
            </li>
            <li>
              <strong className="text-emerald-500">Acima de {fmtPct(cfg.mb_atencao)}</strong> — margem saudável.
            </li>
          </ul>
        </Section>

        <Section title="6. Comissão" subtitle="Percentual variável em função do CMV, aplicado sobre a margem bruta.">
          <Formula>{`CMV               = Custo ÷ Venda
% Comissão total  = (2361 × CMV² − 2896,4 × CMV + 892,41) ÷ 100 (em %)
Comissão total    = Margem Bruta × % Comissão total`}</Formula>
          <p className="text-muted-foreground">
            Quanto menor o CMV (venda mais rentável), maior o percentual de comissão. O rateio entre os
            beneficiários segue as regras abaixo, calculadas sobre o valor da venda:
          </p>
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase text-muted-foreground border-b border-border">
                  <th className="text-left px-3 py-2">Papel</th>
                  <th className="text-left px-3 py-2">Regime</th>
                  <th className="text-right px-3 py-2">% sobre a venda</th>
                  <th className="text-right px-3 py-2">Custo empresa</th>
                </tr>
              </thead>
              <tbody>
                {REGRAS_PADRAO.map((r) => (
                  <tr key={r.key} className="border-b border-border/50 last:border-0">
                    <td className="px-3 py-2 font-medium">{r.papel}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.regime}</td>
                    <td className="px-3 py-2 text-right">{fmtPct(r.pctRemuneracao)}</td>
                    <td className="px-3 py-2 text-right">{fmtPct(r.pctRemuneracao * r.fatorEncargos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-muted-foreground">
            No regime CLT a remuneração é multiplicada pelo fator de encargos <strong>{FATOR_CLT}</strong> para
            chegar ao custo da empresa. No PJ o custo é igual à remuneração, por isso os percentuais PJ já são
            equivalentes ao custo CLT.
          </p>
        </Section>

        <Section title="7. Fluxo e status da proposta" subtitle="Do rascunho ao pedido.">
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
