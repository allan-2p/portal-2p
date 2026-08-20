# Consultores válidos + permissões por objeto (Basic / Manager)

## 1. Quem pode ser consultor

Novo campo **"É consultor"** no cadastro do usuário (aba de dados do usuário, junto de cargo/código SAP).

Regra universal do portal: só entra em qualquer lista de "consultor responsável" (cadastro de clientes, propostas, transferência de carteira, metas) quem for:

- usuário **ativo**, e
- marcado como **É consultor**, e
- com **código SAP** preenchido.

Sem código SAP o usuário não aparece, mesmo marcado. Na tela do usuário isso fica explícito: se marcar "É consultor" sem código SAP, o campo de código SAP passa a ser obrigatório para salvar.

Backfill: todo usuário que hoje tem código SAP preenchido nasce marcado como consultor; os demais ficam desmarcados.

## 2. Permissões por objeto

Novo bloco no perfil de permissão (Admin > Perfis), por **instância** e por **objeto**:

Objetos: Contas (clientes), Contatos, Propostas, Pedidos, Tarefas.

**Basic Access** (por objeto, marcações independentes):
- Ler
- Criar
- Editar
- Excluir

**Manager Access** (por objeto):
- View All Records — vê registros de todos os consultores
- Modify All Records — edita/exclui registros de qualquer consultor (implica View All)
- View All Fields — vê campos sensíveis do registro (custo, margem, comissão, dados de crédito)

Sem Manager Access o usuário só enxerga e altera os registros em que ele é o consultor responsável. Perfil "Administrador do Sistema" continua com tudo liberado por definição.

## 3. Visibilidade passa a ser filtrada

Hoje todo mundo vê todos os clientes e propostas. Depois desta mudança:

- Consultor comum: lista só o que é dele (`created_by` = ele).
- Com View All Records no objeto: lista tudo da instância.
- Editar/excluir registro de outro consultor exige Modify All Records.
- Sem View All Fields, os campos sensíveis vêm mascarados ("—") tanto na tela quanto na resposta do servidor.

A checagem é feita no servidor, não só escondendo botão na tela.

## 4. Criação de cliente

- Consultor comum: o cadastro sai automaticamente no nome dele, sem perguntar nada.
- Quem tem Modify All Records em Contas: aparece o seletor **"Consultor responsável"** (obrigatório), alimentado pela lista válida do item 1.

Mesma regra vale ao reatribuir carteira.

## 5. Detalhes técnicos

- Migração: `profiles.is_consultor boolean not null default false` + backfill por `numero_sap`; nova tabela `permission_profile_object_perms (profile_id, instance_id, object_key, can_read, can_create, can_edit, can_delete, view_all, modify_all, view_all_fields)` com GRANTs e RLS (leitura para staff interno, escrita só admin); seed dos perfis atuais preservando o comportamento de hoje (perfis com `filter_scope = geral` e o Admin recebem Manager Access; consultores recebem Basic completo sem Manager).
- Novo módulo `src/lib/object-perms.server.ts` com `getObjectPerms(supabase, userId, instancia)` e helpers `assertPodeLer/Criar/Editar/Excluir`, usado por `clientes.functions.ts`, `propostas.functions.ts` e `propostas-solar.functions.ts`.
- `listConsultoresFn` passa a filtrar por `ativo + is_consultor + numero_sap`, e vira a fonte única também das telas de proposta.
- Filtro de dono aplicado no servidor em `listClientesFn` / listagens de propostas (por `created_by`).
- UI: matriz de objetos em `admin.perfis.tsx` (reutilizando o padrão de `permission-matrix.tsx`) e toggle "É consultor" em `user-detail-sheet.tsx`.
- `filter_scope` continua existindo para os dashboards de Salesforce; não é tocado.

## Ponto de atenção

Ao ligar isso, qualquer consultor sem Manager Access deixa de ver a carteira dos colegas em Clientes e Propostas. Se algum perfil hoje depende de ver tudo (ex.: Gerente, Diretor, Representante), ele precisa receber View All Records no seed — indique quais e eu já deixo marcados.
