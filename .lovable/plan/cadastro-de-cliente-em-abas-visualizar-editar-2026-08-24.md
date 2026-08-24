# Cadastro de cliente em abas (visualizar + editar)

Reorganiza os dois modais do cadastro de clientes com a mesma linguagem visual, em 4 abas, e cria o cadastro de endereços de entrega com favorito para uso nas propostas.

## Cabeçalho comum aos dois modais

Acima de tudo, no topo do modal (tanto no "olhinho" quanto na edição):
- Nome do cliente (razão social) + nome fantasia
- Consultor responsável em destaque
- Código SAP, CNPJ e selos (unidade, contribuinte, ativo/inativo)

O olhinho passa a usar largura cheia (sem duas colunas) e ganha as mesmas abas da edição, então visualizar e editar viram a mesma experiência — muda só o fato de um ser leitura e o outro edição.

## Abas (mesma ordem nos dois modais)

1. **Contatos** (aba inicial)
   - Contato geral da empresa (e-mail / telefone / site — puxados da consulta do CNPJ)
   - Contato principal
   - Contato financeiro
   - Contatos adicionais
2. **Endereços**
   - Endereço de faturamento (vem do CNPJ, somente leitura)
   - Endereços de entrega: adicionar/editar/remover vários, com apelido ("Obra Campinas"), contato/telefone do local, e marcação de **favorito** (um só por cliente)
3. **Dados cadastrais**
   - Dados gerais da empresa, situação fiscal (IE, Suframa, CNAE, regime, contribuinte)
   - Abaixo: dados comerciais (consultor, finalidade de uso, tabela de preço, condição de pagamento, observações, ativo) e origem do cadastro
4. **Financeiro**
   - Análises de crédito do portal + histórico, botão "Solicitar análise"
   - Condição de pagamento aprovada em destaque (limite, validade)

Histórico do cliente sai do modal do olhinho (fica só em Perfil do Cliente).

## Endereços de entrega nas propostas

Nas propostas (Solar e Carregadores), ao marcar "endereço de entrega diferente do cadastro", aparece um seletor com os endereços cadastrados do cliente; o favorito já vem pré-selecionado. Continua sendo possível digitar um endereço avulso.

## Detalhes técnicos

- Novo arquivo `supabase/external/cliente-enderecos.sql` criando `public.cliente_enderecos` no projeto grupo-2p (cliente_id, cliente_doc, instancia, apelido, cep, logradouro, numero, complemento, bairro, cidade, uf, contato, telefone, favorito, ativo) + índice único parcial garantindo um favorito por cliente.
- Novo `src/lib/cliente-enderecos.server.ts` (REST via `grupo2pRest`) e `src/lib/cliente-enderecos.functions.ts` (listar/salvar/excluir/definir favorito) com `requireSupabaseAuth`.
- `clientes-cadastro-page.tsx` refatorado: cabeçalho compartilhado (`ClienteModalHeader`), abas via `@/components/ui/tabs`, blocos de leitura em largura cheia. As validações, o autosave e o bloqueio de saída atuais continuam iguais.
- Propostas: seletor de endereço alimentado pela nova função, preenchendo o objeto `entrega` já existente — sem mudança no payload salvo nem no SAP.

## Dependência que preciso de você

A tabela `cliente_enderecos` vive no banco do grupo-2p, onde eu **não** aplico migração automática. Vou gerar o script SQL e você roda no grupo-2p (como fizemos com `contatos.sql`). Enquanto não rodar, a aba Endereços mostra aviso de "tabela não criada" e o restante funciona normal.
