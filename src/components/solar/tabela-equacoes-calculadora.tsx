/**
 * Tabela de equações da Calculadora 2P Solar — documentação técnica, fiel a
 * `src/lib/solar-quantificador.ts`. Serve de referência para a engenharia
 * conferir, item a item, como cada quantidade é obtida.
 *
 * Qualquer alteração no quantificador deve ser refletida aqui.
 */

import { useSolarCalcConfig } from "@/hooks/use-solar-catalogo";
import { SOLAR_CALC_CONFIG_FALLBACK } from "@/lib/solar-calculadora";

type Linha = {
  item: string;
  condicao: string;
  formula: string;
  obs?: string;
};

function Tabela({ titulo, descricao, linhas }: { titulo: string; descricao?: string; linhas: Linha[] }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2 overflow-hidden">
      <div className="p-3 border-b border-border">
        <div className="font-semibold text-sm">{titulo}</div>
        {descricao && <p className="text-xs text-muted-foreground mt-0.5">{descricao}</p>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="p-2 font-medium w-[22%]">Item / variável</th>
              <th className="p-2 font-medium w-[26%]">Quando se aplica</th>
              <th className="p-2 font-medium w-[30%]">Equação</th>
              <th className="p-2 font-medium w-[22%]">Detalhe</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.item + l.formula} className="border-b border-border/60 last:border-0 align-top">
                <td className="p-2 font-medium">{l.item}</td>
                <td className="p-2 text-muted-foreground">{l.condicao}</td>
                <td className="p-2">
                  <code className="text-[11px] leading-relaxed">{l.formula}</code>
                </td>
                <td className="p-2 text-muted-foreground">{l.obs ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TabelaEquacoesCalculadora() {
  const cfg = useSolarCalcConfig().data ?? SOLAR_CALC_CONFIG_FALLBACK;
  const n = (v: number | undefined) => (v ?? 0).toLocaleString("pt-BR");

  return (
    <section className="glass rounded-2xl p-5 space-y-4">
      <div>
        <h3 className="text-lg font-bold">Tabela de equações (referência de engenharia)</h3>
        <p className="text-sm text-muted-foreground">
          Todas as fórmulas efetivamente executadas pelo motor de quantificação, com os valores de
          parâmetro ativos hoje. Quantidades são sempre por <b>grupo de fileiras</b> e depois somadas
          por componente no projeto.
        </p>
      </div>

      <Tabela
        titulo="1. Entradas e símbolos"
        descricao="Nomenclatura usada nas equações abaixo."
        linhas={[
          { item: "L", condicao: "Módulo selecionado", formula: "L = largura do módulo (mm)", obs: "Cadastro de Módulos ou medidas digitadas na proposta" },
          { item: "A", condicao: "Módulo selecionado", formula: "A = altura do módulo (mm)", obs: "Idem" },
          { item: "E", condicao: "Módulo selecionado", formula: "E = espessura do módulo (mm)", obs: "Controla a saída dos grampos" },
          { item: "P", condicao: "Por grupo de fileiras", formula: "P = módulos por fileira", obs: "Informado na proposta" },
          { item: "F", condicao: "Por grupo de fileiras", formula: "F = quantidade de fileiras idênticas", obs: "Multiplicador de todas as quantidades" },
          { item: "D", condicao: "Telhado com trilho", formula: "D = distância entre apoios (m)", obs: "0 para trilhos legado 4 e 5 (solo/paisagem)" },
          { item: "B", condicao: "Telhado com trilho", formula: "B = balanço nas pontas (m)", obs: "0 para trilhos legado 4 e 5" },
          { item: "M", condicao: "Gerador micro/otimizador", formula: "M = quantidade de microinversores/otimizadores", obs: "tipo 1 = micro, 2 = otimizador, 3 = string" },
          { item: "Orientação", condicao: "Por grupo de fileiras", formula: "lado = (R → L) | (P → A)", obs: "R = retrato usa largura; P = paisagem usa altura" },
        ]}
      />

      <Tabela
        titulo="2. Comprimento linear da fileira (Nt)"
        descricao="Base de todo o dimensionamento de barras e fixadores."
        linhas={[
          {
            item: "Nt (mm)",
            condicao: "Sempre",
            formula: `Nt = P × lado + (P − 1) × ${n(cfg.folga_paineis)} + 2 × ${n(cfg.balanco_ponta)}`,
            obs: `Folga entre painéis = ${n(cfg.folga_paineis)} mm; balanço de ponta = ${n(cfg.balanco_ponta)} mm`,
          },
          {
            item: "Módulo estreito?",
            condicao: "Sempre",
            formula: `estreito = L ≤ ${n(cfg.largura_limite)}`,
            obs: "Define qual barra curta é usada",
          },
          {
            item: "Barra curta (Bc)",
            condicao: "Telhado com trilho",
            formula: `Bc = estreito ? ${n(cfg.barra_curta_padrao)} : ${n(cfg.barra_curta_larga)} mm`,
            obs: "Módulo largo usa a barra curta reforçada",
          },
        ]}
      />

      <Tabela
        titulo="3. Telhado com trilho (barras 2P-TC)"
        descricao="Duas linhas de trilho por fileira (topo e base) — daí os fatores × 2."
        linhas={[
          {
            item: "Barras 4.800 (módulo estreito)",
            condicao: "Escolha “Até 4,80 m” e de/para 4.800 cadastrado",
            formula: "Q4800 = arredondar(Nt / 4800) × 2 × F",
            obs: "Arredondamento comercial (0,5 sobe)",
          },
          {
            item: "Barras 4.800 (módulo largo)",
            condicao: "Escolha “Até 4,80 m” e de/para 4.800 cadastrado",
            formula: "Q4800 = teto((Nt × 2) / 4800) × F",
          },
          {
            item: "Barras 4.800",
            condicao: "Escolha “Até 2,40 m / 2,70 m”",
            formula: "Q4800 = 0",
            obs: "A escolha do vendedor nunca é sobreposta pelo cálculo",
          },
          {
            item: "Resíduo por linha (ult)",
            condicao: "Sempre que houver trilho",
            formula: "ult = Nt − (Q4800 × 4800) / (2 × F)",
          },
          {
            item: "Barras curtas",
            condicao: "ult < 1.200 mm",
            formula: "Qc = teto(ult / Bc) × F",
          },
          {
            item: "Barras curtas",
            condicao: "ult ≥ 1.200 mm",
            formula: "Qc = teto((ult × 2) / Bc) × F",
            obs: "ult ≤ 0 → Qc = 0",
          },
          {
            item: "Junção de trilho",
            condicao: "Q4800 + Qc > 2",
            formula: "Qj = (teto((Q4800 + Qc) / (2 × F)) × 2 − 2) × F",
            obs: "Uma emenda a cada encontro de barras na mesma linha",
          },
          {
            item: "Grampo intermediário",
            condicao: `${n(cfg.espessura_min)} ≤ E ≤ ${n(cfg.espessura_max)}`,
            formula: "Qgi = (P − 1) × 2 × F",
          },
          {
            item: "Grampo final",
            condicao: `${n(cfg.espessura_min)} ≤ E ≤ ${n(cfg.espessura_max)}`,
            formula: "Qgf = 4 × F",
            obs: "2 por linha de trilho",
          },
          {
            item: "Terminal de aterramento",
            condicao: "Sempre",
            formula: "Qta = F",
          },
          {
            item: "Base de fixadores",
            condicao: "D > 0",
            formula: "base = teto( ((Nt − 2 × B × 1000) / (D × 1000) + 1) × F )",
            obs: "B e D em metros → convertidos para mm",
          },
          {
            item: "Base de fixadores",
            condicao: "D = 0 (solo/paisagem, legado 4 e 5)",
            formula: "base = 2 × F",
          },
          {
            item: "Fixadores do suporte",
            condicao: "Sempre",
            formula: "Qfix = base × múltiplo do suporte",
            obs: "Se Qfix ≤ 4 e múltiplo ≠ 1 → Qfix = 4 (piso). Múltiplo padrão = 2",
          },
          {
            item: "Complemento do suporte",
            condicao: "Suporte com código complemento cadastrado",
            formula: "Qcompl = base × 2",
            obs: "Ex.: LPM10 e PSI250",
          },
        ]}
      />

      <Tabela
        titulo="4. Telhado Smart / mini-trilho"
        descricao="Não consome barras 2P-TC. Tudo é derivado da soma de grampos da fileira."
        linhas={[
          {
            item: "Total de grampos (Tg)",
            condicao: `${n(cfg.espessura_min)} ≤ E ≤ ${n(cfg.espessura_max)}`,
            formula: "Tg = (P − 1) × 2 × F + 4 × F",
            obs: "Intermediários + finais. Fora da faixa de espessura, Tg = 0",
          },
          {
            item: "Micro da 1ª fileira (M1)",
            condicao: "1ª fileira, gerador micro, modelo 1 a 4",
            formula: "M1 = M (senão 0)",
            obs: "Aplicado uma única vez, na primeira fileira do projeto",
          },
          {
            item: "Mini-trilho",
            condicao: "Suportes Smart, exceto legado 13 e 14",
            formula: "Qmini = Tg + (família SMART10 ? M1 : 0)",
            obs: "SMART10 = código 2P-MTL*/2P-MINI* ou suporte legado 9, 10 ou 20",
          },
          {
            item: "Kit parafuso Smart",
            condicao: "Suportes legado 9, 10, 15, 16, 17 e 20",
            formula: "Qkit = Tg + M1",
          },
          {
            item: "Terminal de aterramento",
            condicao: "Suportes Smart",
            formula: "Qta = F + (legado 9 ? M1 : 0)",
          },
          {
            item: "LAJE 10 — item A / item B",
            condicao: "Suporte legado 13",
            formula: "Qa = Qb = Tg / 2",
            obs: "A = código SAP do suporte; B = código complemento",
          },
          {
            item: "Zipado",
            condicao: "Suporte legado 14",
            formula: "Qzip = Tg + (gerador 1, 2 ou 4 ? M : 0)",
          },
        ]}
      />

      <Tabela
        titulo="5. Terminais de microinversor (uma vez por projeto)"
        descricao="Calculados uma única vez, mesmo com várias fileiras."
        linhas={[
          {
            item: "Terminal ZMIL",
            condicao: "Suporte LAJE 10 (legado 13) e gerador ≠ string",
            formula: "Q = (micro modelo 1–3) ? M × 2 : M",
            obs: "LAJE 10 nunca recebe ZMI nem M8",
          },
          {
            item: "Terminal M8",
            condicao: "Otimizador (tipo 2) ou micro modelo 5",
            formula: "Q = M",
          },
          {
            item: "Terminal ZMI",
            condicao: "Demais casos com microinversor (tipo ≠ 2 e ≠ 3)",
            formula: "Q = (modelo 1–3) ? M × 2 : M",
          },
          {
            item: "Sem terminal",
            condicao: "Gerador string (tipo 3)",
            formula: "Q = 0",
          },
        ]}
      />

      <Tabela
        titulo="6. Consolidação, validações e preço"
        linhas={[
          {
            item: "Soma do projeto",
            condicao: "Sempre",
            formula: "Qtotal(componente) = Σ Q(componente) de todos os grupos de fileiras",
            obs: "Itens com quantidade 0 são descartados",
          },
          {
            item: "Bloqueios",
            condicao: "Entrada inválida",
            formula: `L ≥ ${n(cfg.largura_min)} mm; A ≥ ${n(cfg.altura_min)} mm; P ≥ 1; F ≥ 1`,
            obs: "Impedem o cálculo",
          },
          {
            item: "Aviso de espessura",
            condicao: `E < ${n(cfg.espessura_min)} ou E > ${n(cfg.espessura_max)}`,
            formula: "grampos não quantificados",
            obs: "O cálculo continua, sem grampos",
          },
          {
            item: "Aviso de barras curtas",
            condicao: `Σ (P × F) > ${n(cfg.limite_paineis_todos_trilhos)} com escolha “Até 2,40 / 2,70 m”`,
            formula: "mantém apenas barras curtas + aviso",
            obs: "Nada é trocado automaticamente",
          },
          {
            item: "Pendência de de/para",
            condicao: "Componente calculado sem código de produto",
            formula: "lista item + cadastro + campo a preencher",
            obs: "Trilhos, Suportes ou Configuração da calculadora",
          },
          {
            item: "Preço unitário",
            condicao: "Após a quantificação",
            formula: "preço = simulação SAP (ZNFE_OV_SIMULAR) por tabela de preço",
            obs: "A calculadora não define preço; trocar a tabela recalcula tudo",
          },
          {
            item: "Frete",
            condicao: "Após a simulação",
            formula: "frete = Fretefy(peso da simulação SAP, regras do Solar)",
          },
        ]}
      />
    </section>
  );
}
