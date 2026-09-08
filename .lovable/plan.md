# Regra de trilhos por transportadora — correção

## O que aconteceu no pedido 17790

Sim, o pedido subiu com uma transportadora que não deveria aparecer.

O pedido tem dois trilhos:

- 200000383 — Trilho 2P 2,40M (permitido pela Expresso São Miguel)
- 200000384 — Trilho 2P 4,80M (proibido pela Expresso São Miguel)

A regra hoje olha **apenas o primeiro trilho encontrado** na lista de itens. Como o 2,40M vem antes do 4,80M, o sistema concluiu "não tem trilho proibido" e manteve a São Miguel entre as opções de frete. Se a ordem dos itens fosse inversa, a transportadora teria sido bloqueada — ou seja, o resultado hoje depende da ordem em que os produtos foram adicionados.

O mesmo problema atinge o adicional (TDE) da Schreiber e da Transcarapia: só o primeiro trilho é considerado, então um pedido com dois trilhos pode deixar de cobrar o adicional.

## Correção

1. Passar a avaliar **todos os trilhos** do carrinho, e não só o primeiro:
   - bloqueio (Braspress / São Miguel): basta **um** trilho proibido para a transportadora sair da lista;
   - adicional (Schreiber / Transcarapia): cobra o adicional se **qualquer** trilho do carrinho estiver na lista, uma única vez por envio.
2. Cobrir com teste: carrinho com 2,40M + 4,80M deve bloquear a São Miguel e aplicar o adicional, em qualquer ordem dos itens.
3. Deixar registrado na proposta, junto do valor do frete, quais regras foram aplicadas (bloqueios/adicionais), para auditoria.

## Transportadora visível no resumo e no PDF

Hoje a transportadora escolhida fica salva no pedido, mas:

- no resumo/detalhe do pedido aparece só "modalidade do frete · valor" — sem o nome da transportadora;
- no PDF da 2P Solar o nome aparece só numa linha discreta do rodapé da tabela;
- no PDF da 2P Carregadores o nome **não aparece em lugar nenhum**.

Proposta:

- no detalhe do pedido, mostrar "Frete: CIF · Expresso São Miguel · R$ x · prazo N dias úteis";
- nos dois PDFs, incluir transportadora e prazo no bloco de entrega, no mesmo padrão;
- na revisão final antes de fechar o pedido, mostrar a transportadora escolhida.

## Conferência do que já é exibido

Revisar resumo, detalhe (olhinho) e os dois PDFs para garantir que nada some com essa mudança: modalidade, valor, frete grátis/bonificado, prazo, endereço de entrega, lote/mês de chegada (Carregadores) e adicionais aplicados.

## Detalhes técnicos

- `src/lib/fretefy-regras.ts` / `fretefy-rules.server.ts`: substituir `detectarTrilho` (primeiro match) por `detectarTrilhos` (todos os matches) e ajustar `filtraFretes` e `aplicarRegras`; manter `detectarTrilho` apenas se algum outro ponto depender dele.
- Teste novo em `tests/` cobrindo bloqueio e TDE com múltiplos trilhos.
- Exibição: `src/components/proposta-detalhe.tsx`, `src/lib/solar-proposta-pdf.ts`, `src/lib/carregadores-proposta-pdf.ts` (campo `transportadora` ainda não existe no tipo do PDF de carregadores) e a revisão final da proposta.
- Pedidos já criados não são recotados automaticamente; o 17790 precisa ser corrigido manualmente no SAP.

## Pergunta

A correção muda só a cotação nova. Quer que eu também gere um levantamento dos pedidos já fechados que caíram nessa situação (transportadora bloqueada com mais de um trilho), para o time revisar?
