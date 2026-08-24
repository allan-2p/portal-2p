# Changelog

Todas as mudanças relevantes do **Portal 2P** são registradas aqui.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e
versionamento em [Semantic Versioning](https://semver.org/lang/pt-BR/).

## Como versionar

| Parte | Quando incrementar |
| --- | --- |
| **MAJOR** (`2.0.0`) | Quebra de compatibilidade: troca de backend/integração, remoção de área ou rota, mudança de contrato de webhook/API pública, migração destrutiva de banco |
| **MINOR** (`1.1.0`) | Nova funcionalidade compatível: nova área/tela, nova integração, novo job/cron, novos campos e tabelas |
| **PATCH** (`1.0.1`) | Correção de bug, ajuste de cálculo/layout/PDF, ajuste de payload de integração, performance |

Seções permitidas em cada versão: `Adicionado`, `Alterado`, `Corrigido`, `Removido`,
`Banco de dados`, `Integrações`, `Segurança`.

## Como atualizar este arquivo

1. Toda mudança relevante entra em **`[Não publicado]`** no mesmo commit da alteração —
   uma linha por mudança, em linguagem de negócio (o que muda para quem usa), não em
   nomes de arquivo.
2. Mudança de banco entra em **`Banco de dados`** citando a migração
   (`supabase/migrations/<timestamp>_*.sql`), a tabela/coluna afetada e se exige
   backfill, novo `GRANT`/RLS ou passo manual (Vault, `cron.schedule`, bucket).
3. Mudança de variável de ambiente, script, rota ou gatilho: registre aqui **e** rode
   `npm run readme:sync` (o README tem essas seções geradas do código).
4. Ao publicar, renomeie `[Não publicado]` para `[X.Y.Z] - AAAA-MM-DD`, atualize
   `version` no `package.json` e abra um novo `[Não publicado]` vazio no topo.
5. Nada de segredo, token, certificado, URL interna com credencial ou dado de cliente
   neste arquivo.

---

## [Não publicado]
### Removido
- **Pop-ups automáticos de notificação**: nenhum aviso automático (tarefas do Salesforce, Pix/boleto, Atlas) aparece mais no canto da tela. Tudo continua sendo registrado no sino do topo, com contador e histórico. Os avisos de ação do usuário (salvar, concluir, erro em um envio) seguem funcionando normalmente.
- **Avisos de previsão de fechamento (Salesforce)**: os toasts "Previsão vencida/próxima" saíram do portal — reapareciam a cada ciclo de polling. As notificações de tarefas do dia continuam ativas.


### Adicionado
- **Cadastro de consultores (`consultores_sap`)**: de-para oficial código SAP → nome com os 39 vendedores ativos. O seletor de consultor do cadastro de clientes une os usuários do portal com código SAP e esse de-para (dedupe pelo código, preferindo o usuário do portal). Leitura liberada para usuários logados; manutenção só para administradores.

### Alterado
- **Consultor dos clientes 2P Carregadores**: os 10 cadastros da unidade que estavam sem consultor passaram a ter **Bruno Amaral (1000000417)** como responsável. A coluna Consultor da lista mostra só o nome, em tamanho normal (o código SAP continua visível no detalhe do cliente).
- **Campo `organizacao` padronizado em toda a base**: passa a valer apenas o código da unidade (`solar`, `carregadores`, `grupo`, `station`) — os rótulos antigos ("2P Solar", "2P Carregadores", "Acessórios 2P", "Grupo 2P") foram convertidos nos dois bancos (Grupo 2P: clientes, clientes_sap, contatos, leads; portal: clientes, clientes_sap, contatos, propostas, profiles, consultores_sap, user_invites). O portal agora grava sempre o código e usa um rótulo separado só para exibição.


- **"Pedidos" agora é "Acompanhamento", dentro de Propostas**: no menu, Propostas virou um grupo recolhível (toggle) com os itens "Propostas" e "Acompanhamento", tanto no 2P Solar quanto no 2P Carregadores. O Acompanhamento do Solar passa a ler os pedidos das propostas do banco do Grupo 2P (status, cliente, UF, data e valor), com filtro por vendedor pelos consultores da unidade — a consulta ao Salesforce foi eliminada.
- **Paginação padrão de 10 registros** em Propostas (Solar e Carregadores) e no cadastro de clientes, mantendo as opções 25/50/100.

- **Consultor do cliente — campo canônico único**: o par `clientes.consultor_sap` + `clientes.consultor_nome` passa a ser a única fonte do consultor. A lista exibe esse par, o formulário edita esse par (select com os consultores do portal e seus códigos SAP, pré-selecionado por código e, na falta, por nome; código só do legado aparece como "«nome» (importado)" e não exige re-seleção), o cadastro no SAP (campo VENDEDOR) e a OV (`sap_vendedor_codigo`) usam esse par, e o vendedor devolvido pelo SAP volta a gravar nele. Propostas novas (Solar e Carregadores) herdam o consultor do cadastro do cliente.
- **Dossiê 360 do cliente**: o histórico (propostas, pedidos, faturamento por trimestre, ticket médio, em aberto, taxa de conversão) passa a ser lido das propostas/pedidos do banco do Grupo 2P — inclusive as oportunidades importadas do Salesforce — em vez de consultar a API do Salesforce. Cliente sem vínculo com o Salesforce agora abre o dossiê com o histórico completo; só casos, visitas, treinamentos, contatos e atividades (que não têm espelho no banco) continuam vindo do Salesforce.
- **Perfil de Cliente / Segmentação**: a tela deixa de consultar a API do Salesforce. A base agora é a tabela de clientes do Grupo 2P (separada por unidade e pelo consultor responsável), e projeção, geração, vendas e pedidos em andamento saem do espelho de oportunidades no mesmo banco — carregamento muito mais rápido e sem depender do Salesforce.
- **Correção na base de clientes**: as listas voltaram a considerar todos os cadastros da unidade — o filtro por `organizacao` escondia a maioria dos registros importados (valores mistos "solar" e "2P Solar").
 - **Perfil do Cliente**: a lista de clientes passa a vir exclusivamente da base de clientes do Grupo 2P (a consulta ao Salesforce foi eliminada), separada por unidade (Solar/Carregadores) e, para quem não vê todos os registros, pelo consultor responsável. Busca e paginação rodam no banco (toda a base), com colunas CNPJ/CPF, nº SAP, cidade/UF, consultor e "Cliente desde". O dossiê 360 continua trazendo histórico e atividades do Salesforce quando o cadastro já está vinculado; sem vínculo, o portal avisa em vez de falhar.

### Banco de dados
- Padronização do campo `organizacao` (`supabase/migrations/20260824164701_*.sql`): backfill dos rótulos para os códigos `solar`/`carregadores`/`grupo`/`station`, `DEFAULT` de `contatos.organizacao` alterado para `solar` e novos `CHECK` em `organizacao` (clientes, clientes_sap, contatos, propostas, profiles, consultores_sap, user_invites) e em `instancia` (clientes, clientes_sap, contatos, client_notes). O backfill do banco do Grupo 2P (clientes, clientes_sap, contatos, leads) foi executado via API — 393 registros convertidos. Os 68 leads de "Station" foram mantidos como estão.



- **Carregadores — preço de venda → valor enviado ao SAP, calibrado**: o vendedor digita o preço final do item (com todos os impostos) e o portal converte com a conta fechada nos testes de homologação do SAP: tira o IPI do cadastro do produto (NCM) e aplica o fator calibrado de ICMS 4% (produto importado). Cálculo em 6 casas decimais nos intermediários e arredondamento apenas no valor final. O detalhamento por item na proposta (líquido, ICMS, PIS/COFINS, IPI) vem dessa mesma conta.
- **Guarda-corpo fiscal (Carregadores)**: quando a operação não é de ICMS 4% (ex.: venda dentro de SC, alíquota interna), o envio do pedido ao SAP é bloqueado com o aviso "alíquota fora da calibração — validar com fiscal" até calibrarmos o fator dessa faixa.
- Cada item da proposta de Carregadores passa a guardar as alíquotas usadas (IPI, ICMS, PIS/COFINS) no fechamento, para o valor enviado ao SAP não depender de recálculo posterior.
- **Lista de clientes**: nova coluna "Cliente desde" (data de criação do cadastro) e cabeçalhos de todas as colunas clicáveis para ordenar/inverter. Ordenação padrão continua sendo a mais recente primeiro (`created_at` descendente).
- Filtros de status, UF, com/sem nº SAP e vendedor nas listas de propostas passam a ser aplicados no banco, junto da busca.

- **Numeração de proposta definitiva**: o nº é inteiro puro, sem zeros à esquerda, e é o próprio nº de pedido (NROPED) enviado ao SAP. Faixas: 10001–53059 = importadas da plataforma antiga; 60001+ = propostas novas do portal (próximo = 60027). Todo preenchimento com zeros foi removido de geração, exibição, busca e comparação.
- Propostas renumeradas mostram o **nº anterior** nos detalhes, e ele também é aceito na busca das listas (Solar e Carregadores).
- Detalhes da proposta ganham a seção **Dados da plataforma antiga** (projeto de origem, nº anterior, histórico de cobranças importado e dados técnicos); observações internas aparecem só para o time interno, nunca para o cliente.
- Cadastro de clientes: a coluna **Consultor** passa a mostrar o consultor da conta (e o código no SAP) em vez de "criado por" — este vira apenas origem do cadastro. Detalhes ganham as seções de origem e de plataforma antiga, e os contatos importados (inclusive o financeiro) são lidos mesmo quando vieram como texto simples.
- Listas de propostas ordenam sempre por data, nunca pelo texto do número (faixas diferentes embaralhavam a ordem).

### Integrações
- Consultas ao SAP (cron de NFs, atualização manual, DANFE/XML/boleto) passam a usar **ordem de venda + filial 9802** como chave, nunca o nº de pedido — números da plataforma antiga ocupam faixa já usada no SAP e contaminavam NF/status.
- Retorno do SAP é validado antes de gravar: se a ordem devolvida não for a da proposta, o dado é descartado e a divergência aparece no painel Integrações.
- Proposta importada que já tem ordem de venda fica somente leitura: não reenvia OV, não recalcula preço e não emite cobrança nova (pedido antigo já faturado). Orçamento importado sem ordem de venda continua sendo retomável, mantendo o número que já tem.
- Nº do boleto (nosso número) usa sempre o número atual da proposta; cobranças antigas emitidas com o número anterior seguem válidas.

### Adicionado
- **Análise de Crédito no Financeiro**: fila em `/financeiro/credito` (acesso `financeiro.credito`) para receber, assumir e concluir solicitações — limite aprovado, condição a prazo, Serasa, restrição e validade.
- Solicitação de crédito a partir do cadastro do cliente, com histórico do portal e leitura do objeto de Análise de Crédito do Salesforce no mesmo bloco.
- Bloqueio de condições de pagamento a prazo no checkout (Solar e Carregadores) quando o cliente não tem crédito liberado ou o limite não cobre o pedido.
- Overlay bloqueante ao concluir pedido (Solar e Carregadores) com passos animados das integrações e aviso para não fechar a janela.
- Botão "Ver proposta concluída" no resultado da conclusão, abrindo o detalhe via `/{solar|carregadores}/propostas?ver=<id>`.

### Alterado
- "Salvar proposta" passa a aparecer somente na etapa de Finalização, ao lado de "Concluir pedido" (Solar e Carregadores).
- Gerar prévia ou PDF da proposta agora salva a proposta antes de montar o documento.
- Sair de uma proposta com alterações pendentes pede confirmação, com opção de salvar e sair.
- Fechar o cadastro de cliente (botão ou clique fora) pede confirmação quando há informações não salvas.
- Salvamento de proposta mais rápido: leituras de perfil/proposta em paralelo no servidor e atualização da lista em segundo plano.
- Número da proposta passa a ser exibido sem os zeros à esquerda (listas, detalhe, prévia, PDF, avisos e nome do arquivo); o valor armazenado segue com o padding.

### Corrigido
- Campo "Valor do frete (manual)" duplicado no frete dedicado de Carregadores.



### Adicionado

- Verificação de saúde da cobrança Itaú: novo gatilho de diagnóstico que confere, sem
  criar nenhuma cobrança, se o serviço de certificado (mTLS) do Itaú está no ar e se as
  credenciais Pix continuam válidas. Protegido pelo mesmo segredo dos demais gatilhos.
- Preço manual da proposta na ordem de venda do SAP (**somente 2P Carregadores**): o valor
  unitário do vendedor passa a ser enviado no campo `VALOR_PROD` como **valor líquido, sem
  IPI, ICMS e PIS/COFINS** (o SAP aplica os impostos por cima). Fica atrás da chave
  `SAP_VALOR_PROD_CARREGADORES` (desligada até o SAP transportar o ajuste para produção).
  Propostas Solar continuam sempre com o preço da tabela do SAP. Pedido de Carregadores com
  item sem valor — ou sem os totais de imposto da proposta — é bloqueado antes do envio, e o
  painel de auditoria mostra o preço da proposta e o líquido enviado, item a item.



### Alterado


- Portal mais leve: logos do cabeçalho servidos em versões otimizadas (de ~270 KB para
  ~10 KB somados) e imagem de fundo de login sem uso removida.
- Limpeza de código morto: 24 arquivos de componentes/utilitários sem uso e 15
  bibliotecas de interface não utilizadas removidos do projeto, reduzindo o pacote
  entregue ao navegador. Nenhuma tela em uso foi afetada.

### Corrigido

- Mensagens de aviso (sucesso, erro, sessão expirada) voltaram a aparecer na tela: o
  container de notificações não estava montado, então todo aviso do portal era
  silencioso.

- Conferência automática de preços no SAP voltou a gravar o resultado: a atualização
  do catálogo falhava quando a descrição do material não era enviada junto.

### Banco de dados

- Agendamento `portal-sap-catalogo-vendaveis` criado no banco (4x/dia, 250 materiais por
  rodada), conforme `docs/migracao/setup-novo-projeto.sql`. Passo manual já executado.

---

## [1.0.0] - 2026-08-24

Primeira versão consolidada do portal em produção (`portal.2pgroup.app`).

### Adicionado

- **Solar:** calculadora de proposta (módulos, microinversores, trilhos, suportes, kit
  parafuso), quantificador, precificação por tabela, prévia em tempo real, PDF com
  cabeçalho premium e checkout completo com cadastro automático de cliente no SAP.
- **Carregadores:** catálogo, propostas, metas, comissões, auditoria de recálculo e tarefas.
- **Clientes:** cadastro com enriquecimento por CNPJ/CPF, consultor obrigatório,
  finalidade de uso e modal de visualização completa.
- **Pedidos:** ordem de venda no SAP (simular/criar/consultar) com claim atômico e
  auto-recuperação, evolução de status e abertura de NF (DANFE, XML e boleto sob demanda).
- **Pagamentos:** Pix e Boleto Itaú via proxy mTLS, QR Code e copia e cola na proposta,
  reenvio manual, PDF do boleto e opção de financiamento.
- **Logística:** cotação de frete por peso SAP, regras de frete (área rural, frete grátis),
  oferta de carga automática e rastreio Fretefy.
- **Salesforce:** sincronização de Account e Opportunity com mapeamento de campos
  configurável e máquina de estágios.
- **Admin:** perfis e permissões, produtos e tabelas, estoque, moderação, logs
  (SAP, integrações, gatilhos, retenção) e painéis de integração com diagnóstico.
- **Atlas:** assistente de IA do consultor (insights de carteira, projeção vs. realizado).
- **Automação:** jobs e webhooks registrados em `job_runs`, reprocessáveis pelo mesmo
  executor, agendados por `pg_cron` via `public.portal_cron_post`.
- **Documentação:** README com seções geradas do próprio código
  (`npm run readme:sync` / `readme:check`).

### Banco de dados

- 164 migrações em `supabase/migrations/` com RLS habilitada, políticas explícitas e
  `GRANT` por papel em todas as tabelas de `public`.
- Papéis e permissões em tabela separada, consultados por função `security definer`.
- Segredos operacionais no Vault (`cron_hook_secret`, `site_url`) e buckets de Storage
  criados pelo SQL de setup (`docs/migracao/setup-novo-projeto.sql`).

### Integrações

- SAP (ordem de venda, clientes, NFs, estoque, catálogo vendável por preço VK12),
  Itaú (Pix/Boleto), Salesforce, Fretefy, SharePoint/Graph, consulta CNPJ/CPF.
