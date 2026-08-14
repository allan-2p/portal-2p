# Liberar os produtos 200000694 e 200000684

## O que está acontecendo

A sincronização com o SAP não grava tudo o que a RFC devolve: existe uma lista fixa de códigos liberados dentro do código do portal, e a sincronização descarta qualquer material fora dela. Os códigos **200000694** e **200000684** não estão nessa lista, por isso nunca chegam ao banco — a consulta na tabela de produtos confirma que não existe nenhum registro com esses códigos.

## O que será feito

- Incluir 200000694 e 200000684 na lista de códigos liberados da sincronização.
- Marcar os dois como visíveis para **todos** os usuários (não apenas admin), para que apareçam na seleção de produtos das propostas.
- Rodar a sincronização com o SAP e conferir se os dois vieram com descrição e lista de preço; se o SAP não devolver algum deles, aviso qual é e o motivo (código inexistente na RFC ou fora das listas 2P-0001/2P-0002).

## Detalhes técnicos

- `src/lib/sap-produtos.server.ts`: adicionar os dois códigos ao conjunto `LIBERADOS` e ao conjunto `EXTRAS_CLI` (permissão "Todos").
- Nenhuma alteração de banco é necessária; após a sincronização eles entram em `sap_produtos` com custo/preço zerados, prontos para ajuste na Gestão de Produtos.
- Verificação final: consulta em `sap_produtos` pelos dois códigos após o sync.
