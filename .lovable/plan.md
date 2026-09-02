# Fase (StageName) na proposta + "dar perda" direto pela linha

Vale igualmente para 2P Solar e 2P Carregadores.

## 1. Coluna "Fase" nas listas de propostas

- Nova coluna **Fase** na tabela de propostas (solar e carregadores) e também no cabeçalho do detalhe da proposta.
- Mostra o nome da fase **sem a sigla**: Pedido Concluído, Projeto Não Fechado, Projeto Fechado, Estoque, Em Negociação, Pedido Cancelado, Oportunidade Perdida.
- A fase é derivada do que já existe hoje: status do pedido + a escolha "o projeto já foi vendido?" (Sim → Projeto Fechado, Estoque → Estoque, Não → Projeto Não Fechado). Nada de campo novo digitado pelo vendedor.
- Quando a proposta for marcada como perdida, a fase passa a exibir **Oportunidade Perdida**.

## 2. Botão "dar perda" (polegar para baixo)

- Ícone de polegar para baixo no fim da linha de ações, ao lado dos ícones existentes.
- **Só aparece quando o status é "Salvo"**. Em qualquer outro status (pedido em andamento, cancelado, entregue) o ícone não é exibido — ali vale o fluxo de cancelamento que já existe.
- Também não aparece se a proposta já estiver perdida (nesse caso a linha mostra a fase Oportunidade Perdida e um ícone de desfazer só para administrador, opcional — deixo de fora se você não quiser).
- Todos os vendedores têm essa ação (sem exigir permissão extra).

Ao clicar abre um diálogo curto com:
- **Motivo da perda** (obrigatório, lista abaixo);
- **Descrição da perda** (obrigatória, texto livre, mínimo 8 caracteres, igual ao padrão do cancelamento);
- botão "Confirmar perda".

### Motivos da perda

Prazo de Entrega · Prazo de Pagamento · Preço do Produto · Preço do Frete · Oportunidade filha · Solicitação incorreta do cliente · Cliente Final Desistiu · Cliente ainda com estoque · Cliente fechou com a extrusora · Pedido Excluído · Comprou 2P no Kit · Comprou concorrente no Kit · Sem Retorno · Consulta de Tabela de Preço · Características do nosso produto

**Oportunidade Mecanicamente Perdida** entra na lista **apenas para o Administrador do Sistema**; para os demais usuários fica oculta (e é recusada também no servidor, não só escondida na tela).

## 3. Velocidade — nada de tela travada

- Ao confirmar, o portal grava a perda no banco e responde na hora; a lista já mostra a nova fase imediatamente (atualização otimista) e o diálogo fecha.
- O envio ao Salesforce acontece **depois**, em segundo plano, sem prender o vendedor. Se falhar, fica registrado na auditoria de integrações e o reenvio é feito pela rotina que já existe.

## 4. Salesforce

Na oportunidade vinculada:
- `StageName` = **Oportunidade Perdida**;
- `Loss_Reason__c` = motivo escolhido (valores idênticos à picklist da org);
- `Descri_o_do_Motivo_de_Perda__c` = descrição escrita pelo vendedor.

A regra que já existe (proposta "Salvo" com oportunidade marcada como perdida na org não tem o estágio sobrescrito) continua valendo, agora nos dois sentidos.

## Detalhes técnicos

- **Banco (grupo-2p)**: novas colunas em `public.propostas` — `motivo_perda text`, `motivo_perda_obs text`, `perdida_em timestamptz`, com arquivo de referência `supabase/external/propostas-perda.sql` (mesmo padrão dos demais arquivos externos). Sem essas colunas o PostgREST recusa a gravação.
- **`src/lib/perda-motivos.ts`** (novo, client-safe): lista dos motivos, flag `somenteAdmin` para "Oportunidade Mecanicamente Perdida", validação da observação (reaproveitando o padrão de `cancelamento-motivos.ts`).
- **`src/lib/salesforce-stage.ts`**: `stage()` passa a devolver "Oportunidade Perdida" quando `perdida_em`/`motivo_perda` estiver preenchido; nova função `faseLabel(row)` usada pela UI.
- **`src/lib/propostas.functions.ts`**: nova `marcarPerdaPropostaFn` — exige status "Salvo", valida motivo/observação, bloqueia "Oportunidade Mecanicamente Perdida" para não-admin, grava as três colunas e dispara a sincronização com o Salesforce sem aguardar (fire-and-forget com log).
- **`src/lib/salesforce-pedidos.server.ts`**: quando a proposta tem `motivo_perda`, monta `StageName: "Oportunidade Perdida"`, `Loss_Reason__c` e `Descri_o_do_Motivo_de_Perda__c` (mesmo tratamento tolerante a campo inexistente que já existe para o cancelamento).
- **UI**: novo componente `src/components/propostas/dialogo-perda.tsx` + coluna Fase e botão `ThumbsDown` em `solar.propostas.index.tsx`, `carregadores.propostas.index.tsx` e no cabeçalho de `proposta-detalhe.tsx`. Admin detectado por `useInstance()` (`is_admin`).
- Testes: caso em `tests/proposta-status-fluxo.test.ts` cobrindo a fase derivada e o bloqueio do motivo restrito. CHANGELOG e roadmap atualizados.
