# Venda para a Zona Franca de Manaus (SUFRAMA) nas propostas

Incluir o SUFRAMA nas propostas de **2P Solar** e **2P Carregadores**: destaque logo na primeira tela da proposta e cálculo fiscal diferenciado quando a inscrição estiver aprovada.

## Como vai funcionar para o vendedor

1. Ao escolher/identificar o cliente, o portal usa o SUFRAMA que já vem da consulta automática do CNPJ (número + situação).
2. Na primeira página da proposta aparece um destaque:
   - **Verde — "Venda para a Zona Franca de Manaus"**: SUFRAMA aprovado. Mostra o número da inscrição e o resumo dos benefícios (sem PIS/COFINS, sem IPI, ICMS 4% em itens importados e isento nos nacionais).
   - **Vermelho/âmbar — "SUFRAMA bloqueado / com impedimento"**: mostra a situação retornada e avisa que a proposta segue como venda normal, com todos os impostos.
   - Sem SUFRAMA: nada aparece (proposta normal).
3. Se o vendedor ligar "faturar para o cliente final" e esse destinatário final não tiver SUFRAMA aprovado, aparece um aviso claro de que **o benefício da Zona Franca será perdido** e os preços voltam ao cálculo normal — com confirmação antes de seguir.
4. O benefício também aparece no resumo, na revisão final, na tela do pedido (olhinho) e nos PDFs de Solar e Carregadores, com a linha "Venda SUFRAMA — Zona Franca de Manaus" e a inscrição usada.

## Regra fiscal aplicada (quando SUFRAMA aprovado)

- PIS e COFINS: não incidem.
- IPI: isento.
- ICMS: 4% em materiais importados; isento nos nacionais.
- Item importado x nacional: identificado pelo ICMS que a simulação oficial do SAP devolve para cada item (4% = importado; demais = nacional). Nenhum cadastro novo de produto é necessário.
- Vale para todos os itens da proposta, inclusive kit fotovoltaico — quando os dois se aplicam, vale a regra mais benéfica por tributo (kit já é isento de ICMS/IPI; SUFRAMA acrescenta a retirada do PIS/COFINS).

## Detalhes técnicos

- **Flag da proposta**: novas colunas em `propostas` (banco externo Grupo 2P, via `supabase/external/propostas-suframa.sql`, e espelho local se necessário): `suframa` (número), `suframa_situacao`, `suframa_aplicado` (boolean gravado no fechamento). Snapshot fiscal por item continua em `aliq_ipi`/`aliq_icms`/`aliq_pis_cofins`.
- **Regra única**: novo `src/lib/suframa.ts` com `suframaAprovado(enrich)` (aprovado = número presente + situação aprovada, mesmo padrão de `src/lib/contribuinte.ts`) e `aplicarSuframa(valores, { importado })`, que recalcula o preço a partir da simulação do SAP: parte de `valorLiquido` e recompõe apenas o ICMS devido (4% importado / 0 nacional), sem IPI e sem PIS/COFINS.
- **Solar**: `precosSolar` (`src/lib/solar-precos.server.ts`) ganha a opção `suframa`, no mesmo ponto onde hoje trata `kitFotovoltaico`, e grava as alíquotas efetivas (ipi 0, pisCofins 0, icms 0,04 ou 0) em `aliquotas`.
- **Carregadores**: `decomporPrecoCarregadores`/`fatorLiquidoCarregadores` (`src/lib/carregadores-impostos.ts`) passam a receber as alíquotas já zeradas pela regra SUFRAMA; a montagem de alíquotas na tela nova de carregadores respeita a flag.
- **Telas**: banner e avisos em `src/routes/_authenticated/solar.propostas.nova.tsx` e `carregadores.propostas.nova.tsx`; exibição em `src/components/proposta-detalhe.tsx`, `src/lib/solar-proposta-pdf.ts` e `src/lib/carregadores-proposta-pdf.ts`.
- **Validação no servidor**: ao salvar/fechar, o servidor reconfirma o SUFRAMA pelo cadastro do cliente antes de aceitar a proposta com benefício, para não gravar preço beneficiado com inscrição bloqueada.
- **Testes**: `tests/suframa-impostos.test.ts` cobrindo aprovado/bloqueado, importado x nacional, combinação com kit e perda do benefício no faturamento ao cliente final.
- `CHANGELOG.md` atualizado no mesmo turno.

## Fora do escopo

- Envio de indicador SUFRAMA ao SAP na criação da ordem (hoje o cálculo é do portal); fica preparado para migrar para a simulação SAP quando existir esse tipo de ordem.
- Edição manual da situação SUFRAMA.
