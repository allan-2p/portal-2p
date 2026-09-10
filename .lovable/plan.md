# Centralizar tudo no Catálogo

Hoje a mesma informação é editada em dois lugares: a aba "Produtos do portal" (Solar) / "Produtos" (Carregadores) e a aba "Catálogo SAP". Isso gera conflito — o catálogo tem os controles de visibilidade e de ativo automático/manual, e a outra aba grava o ativo direto, por cima.

A proposta é deixar **apenas o Catálogo** como responsável por ativo, visibilidade, preço e foto, nas duas unidades.

## O que muda na tela

**2P Solar — Gestão de Produtos**
- Sai a aba "Produtos do portal".
- Ficam: **Catálogo** e **Estoque**.

**2P Carregadores — Gestão de Produtos**
- Sai a aba "Produtos".
- Ficam: **Catálogo**, **Fotos do catálogo**, **Estoque** e **Alíquotas por UF**.

**Catálogo (as duas unidades)** passa a ter tudo o que só existia na aba antiga:
- Coluna **Foto** com envio de imagem do produto.
- Coluna **Preço sugerido**, editável na linha.
- Coluna **Custo** (visível/editável só em Carregadores, como é hoje).
- Edição do **nome** do produto.
- Cartões de resumo no topo: total visível na unidade, ativos e inativos.
- Filtro de status (Todos / Ativos / Inativos) e busca, como já existe.

**Ativação** passa a ser só pelo controle do catálogo: *Automático* (segue o preço do SAP), *Forçar ativo* ou *Forçar inativo*. A escolha manual continua sendo respeitada pelas sincronizações e registrada na auditoria. Ao forçar ativo um item de Carregadores, continua valendo a checagem de custo e NCM preenchidos — com aviso claro quando faltar algo.

## Nada se perde

Nenhum dado precisa ser migrado entre tabelas: as duas abas já editam o mesmo cadastro de produtos. O que muda é onde os campos aparecem. Os campos que hoje só existem na aba antiga (preço sugerido, custo, nome, foto) passam a ser editáveis dentro do catálogo, com as mesmas regras de permissão.

Ponto de atenção: hoje o botão "Ativo" da aba antiga grava direto, ignorando o modo automático. Depois da mudança, ativar/desativar manualmente sempre cria uma trava manual — que é o comportamento correto e o que o catálogo já faz.

## Detalhes técnicos

- `src/routes/_authenticated/admin.produtos-solar.tsx`: remover `AtivosSolarTab` e a aba `catalogo`; o padrão passa a ser a aba do catálogo.
- `src/routes/_authenticated/carregadores.produtos.tsx`: remover `ProdutosTab` (e o diálogo de edição, movido para o catálogo); padrão passa a ser o catálogo.
- `src/components/produtos/catalogo-produtos-sap.tsx`: acrescentar colunas Foto, Custo e Preço sugerido, diálogo de edição (nome/custo/preço) e os cartões de resumo, tudo condicionado a `org`.
- `src/lib/sap-produtos.functions.ts`: incluir `preco_sugerido`, `imagem_path` e `custo` no `select` de `listSapProdutos`; adicionar uma server fn de atualização de campos manuais (nome, custo, preço sugerido, foto) com `requireFeature` por unidade e registro em auditoria de moderação.
- `src/lib/carregadores-produtos.functions.ts`: manter `listCarregadoresProductsForProposal` (usada pela proposta) e `setCarregadoresProductAtivo`/`updateCarregadoresProduct` reaproveitadas pelo catálogo; remover `adminListCarregadoresProducts` e o hook `useCarregadoresProductsAdmin` se ficarem sem uso.
- `src/lib/admin-nav.ts` e `src/hooks/use-aba-persistente.ts`: hashes antigos (`=catalogo`, `=produtos`) devem cair na aba de catálogo, para não quebrar links salvos.
- Ajustar `tests/routes-links.test.ts` se os hashes mudarem, rodar typecheck e registrar no `CHANGELOG.md`.
