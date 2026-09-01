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

- **Plano Fidelidade removido do portal**: página `/solar/plano-fidelidade`, item de menu, feature `fidelidade` (perfis e grupos de permissão) e os campos de fidelidade do perfil do cliente foram excluídos.
- **Bundle dividido em chunks sob demanda**: chat do Atlas (streamdown/shiki/mermaid) carregado só ao abrir e chunks próprios para planilhas (xlsx), gráficos (recharts/d3), markdown e QR Code — carregamento inicial mais leve.

- Sincronização do SAP (mestre de materiais e varredura de preço) não desativa mais nada no portal: apenas insere materiais novos (inativos) e atualiza dados do SAP. Ativar/desativar continua sendo decisão manual em Administração › Produtos.
- **Proposta Solar não é mais recusada por "Adicione ao menos um produto"**: quando a tela não conseguia casar um item com o catálogo (catálogo ainda carregando ou item vindo da calculadora sem correspondência), o pedido era enviado sem identificação do produto e o salvamento falhava mesmo com a lista preenchida. Agora cada item vai também com o código SAP e o servidor resolve o produto pelo código; se realmente não existir no catálogo, a mensagem diz quais códigos faltam.
- **Catálogo do portal é definitivo**: material enviado manualmente ao catálogo passa a permanecer lá em qualquer sincronização do SAP (só sai por decisão de alguém na Administração) e não é mais desativado quando deixa de vir na lista de liberados do SAP. Ao enviar, a tela já leva para o produto na aba Produtos com os filtros abertos — antes ele entrava inativo e sumia atrás do filtro padrão "Ativos", parecendo que o envio não tinha funcionado.
- **Funil do cliente mais legível**: resumo com valor em aberto, nº de propostas e etapas; cada etapa vira um bloco com barra de participação no funil, e cada oportunidade mostra data, tempo em aberto (com destaque para as paradas há mais de 60/180 dias) e valor.
- **Kit gerador recalcula sempre**: marcar ou desmarcar "Kit fotovoltaico" na proposta Solar às vezes não reprecificava os itens já na lista (o disparo se perdia quando outra precificação estava em curso ou a lista ainda carregava). Agora o kit faz parte da mesma assinatura de preço do faturamento, com reprocessamento pendente, e o aviso indica se os valores saíram com ou sem ICMS/IPI.
- **Faturamento ao cliente final**: a simulação de preço passa a usar o cliente fake da UF de faturamento (o cliente final não existe no cadastro do SAP), mantendo o CNPJ real como consumidor industrial quando contribuinte; em triangulação nada muda.
- Perfil do cliente: tarefas abrem com detalhes e ações (Concluir, Registrar interação, Reagendar), iguais às da home; funil agrupado por etapa com data de criação; coluna "Status do pedido" nas tabelas de propostas.
- Tarefas antigas do usuário de integração reatribuídas ao dono da conta (13 registros).

- Atualização do frontend após salvar pedido: listagem, detalhe e variações são revalidados juntos (`src/lib/propostas-cache.ts`); o detalhe do pedido sempre recarrega ao abrir, então a edição já aparece sem recarregar a página.
- Reprocessamento de tarefas antigas do Salesforce: botão "Reatribuir tarefas do portal" em Admin > Integrações transfere as tarefas presas no usuário de integração para o vendedor dono da conta, fazendo-as aparecer na home e nas Tarefas diárias.

- **Tarefa criada no portal fica com o vendedor**: tarefas e interações criadas pelo perfil do cliente, pela home ou pela tela de Tarefas iam para o usuário de integração do Salesforce, então só apareciam no perfil do cliente (que filtra pela conta) e sumiam da Agenda de hoje e das Tarefas diárias (que filtram pelo dono). Agora o dono é sempre quem criou (vínculo Salesforce do usuário) e, se ele não tiver vínculo, o dono da conta.
- **Estimativa de entrega**: pedido que entra em Coletado passa a gravar a data prometida (coleta + prazo do frete em dias úteis; sem prazo, a própria data da coleta) e a exibi-la no detalhe do pedido em Coletado/Entregue — incluindo as 9.674 estimativas herdadas da plataforma antiga. Quem tem Manager Access em Propostas (ex.: Analista de Fretes) pode ajustar a data manualmente, com registro no Log de Integrações (`estimativa-manual`), e o valor vai ao Salesforce em `Estimativa_de_entrega__c`. Estimativa já existente nunca é sobrescrita.
- **Cliente do vendedor não aparecia na busca da proposta**: cadastros importados da plataforma antiga tinham só o nome do consultor (sem vínculo de usuário) e, em parte deles, um código SAP de outro vendedor, o que escondia o cliente do dono real. A busca de clientes, o perfil do cliente e o escopo de propostas passam a reconhecer também o nome do consultor, e os 6.801 cadastros afetados foram religados ao vendedor correto (`consultor_id`/`consultor_sap`).

- Edição de propostas importadas da plataforma antiga: itens sem `produtoId` agora são reconhecidos pelo código SAP (catálogo ou item avulso), voltando a aparecer no passo 3 e liberando a cotação de frete.

- **Variação de proposta importada**: criar variação de um orçamento vindo da plataforma antiga dava erro de chave duplicada (`projeto_antigo_id`). A variação agora nasce como proposta nativa do portal — não herda o vínculo com o projeto antigo nem as marcas de importação (origem/nº anterior).
- **Tipo de nota fiscal obrigatório**: solar e carregadores passam a exigir seleção de tipo de NF (venda, triangulação ou bonificação) antes de salvar, gerar PDF ou concluir o pedido. Bonificação continua dispensando forma/condição de pagamento.
- **Atlas Radar respeita a carteira do vendedor**: a listagem de alertas (card da home e tela `/atlas-ia/radar`) passa a filtrar pelo escopo do consultor — vendedor vê só os clientes da carteira dele; admin/diretor (View All Records) veem tudo. Antes a varredura era global e a leitura não filtrava.
- Atlas: perguntas abertas em conversa livre (correção do envio pelo campo de texto), título automático da conversa a partir da primeira pergunta, painel "O que o Atlas consulta hoje" no topo e saneamento do histórico com chamadas de ferramenta incompletas.
- **Atlas em tela cheia**: `/solar/atlas` deixou de ser aviso "em breve" e passou a ser o chat completo (perguntas abertas, lista de conversas, painel do que ele consulta). O chat agora mostra em tempo real quais dados está consultando.
- **Atlas Radar na home**: o card "em breve" foi substituído pelos alertas abertos de clientes em piora, com link para o radar.
- **Perfil do cliente**: "Propostas & pedidos" virou "Propostas"; a Visão geral lista as oportunidades em aberto (nome, etapa e valor) e perdeu o bloco "Sinais rápidos"; o bloco "Pedidos em aberto" saiu da aba Financeiro.
- **Viewer de Carregadores enxerga todos os pedidos**: o perfil **Viewer | 2P Carregadores** ganhou leitura total (View All Records, somente leitura) em Propostas, Pedidos e Contas da unidade Carregadores — antes a Visão Geral aparecia vazia porque o escopo de consultor filtrava tudo. O menu também deixa de exibir a **Home** quando o perfil define outra página inicial na unidade.
- **Acesso restrito por perfil Viewer**: o perfil **Viewer | 2P Carregadores** passa a definir a página inicial do usuário — quem tem esse perfil entra direto em Carregadores → Visão Geral. O usuário Rodrigo Sanches teve o acesso direto à unidade Solar removido e fica restrito a Carregadores (apenas a tela Visão Geral liberada).
- **Visão Geral de Carregadores vira tela com permissão própria**: nova feature `carregadores.visao-geral` (somente visualizar) na matriz de permissões — o item do menu e a rota `/carregadores/visao-geral` só aparecem para quem tem a tela liberada. Incluída nos perfis padrão de Carregadores (Vendedor/Gestor/Administrativo) e no perfil **Viewer | 2P Carregadores**.
- **Importação Intersolar com faturamento direto**: quando a linha da carga fatura direto no cliente final (CPF), o hook `/api/public/hooks/importacao-intersolar` cadastra antes o parceiro faturado no SAP (mesma rotina do checkout). Sem esse cadastro o SAP recusava a simulação com "Não existe mestre de clientes para emissor ordem".

- **Correção de zeros à esquerda em CNPJ/CPF**: documentos gravados sem o zero inicial (ex.: `2673975000106` em vez de `02.673.975/0001-06`) faziam o cliente aparecer como inválido/inexistente no checkout. O documento agora é normalizado ao salvar o cadastro (inclusive na importação de clientes de Carregadores) e a base do Grupo 2P foi corrigida: 451 clientes, 546 contatos e 2.640 propostas. Pendente: o cliente RSUL ENERGIA aparece duplicado (Solar e Carregadores com o mesmo CNPJ), então esse registro ficou sem normalizar.
- **Novo estágio do Salesforce (StageName)**: pedido "Salvo" segue a escolha da proposta em "O projeto já foi vendido para o cliente final?" — **Sim** → `Projeto Fechado`, **Não** → `Projeto Não Fechado`, **Estoque** → `Estoque`. De "Aguardando Pagamento" em diante o estágio é sempre `Pedido Concluído`, e "Cancelado" → `Pedido Cancelado`. `Oportunidade Perdida` continua sendo marcada só manualmente no Salesforce: quando o pedido segue "Salvo", o portal não sobrescreve esse estágio (os demais campos continuam atualizando). A escolha também é enviada em **Projeto vendido** (Sim/Não/Estoque).
- **Correção**: a opção **Estoque** da proposta Solar deixa de se perder ao salvar/reabrir (antes virava "Não"); agora fica gravada nos totais da proposta.
- **Salesforce completo em toda mudança de status**: qualquer transição do pedido (inclusive as automáticas do SAP e do Fretefy) passa a reenfileirar a oportunidade — antes só cancelamento e baixa manual reenviavam, e pedidos ficavam congelados em etapas antigas (ex.: 60048 travado em "Estoque" já concluído). O envio agora preenche **Nº SAP**, **Frete**, **Total**, **Tipo de NF**, **Desconto**, **Margem total**, **Tabela de preço**, **Previsão de fechamento**, **Transportadora**, **Vendedor**, **E-mail do cliente**, **Projeto vendido**, **Feito através de**, **quem criou/finalizou**, nota fiscal e os carimbos de data (salvo, processando, separação, faturado, coletado, entregue, cancelamento).
- **Produtos no Salesforce**: os itens da proposta são gravados como linhas da oportunidade (`OpportunityLineItem`), casados pelo código SAP no catálogo de preços; linhas antigas são substituídas a cada envio e produtos sem cadastro no Salesforce viram aviso no painel de integrações.
- **Itens espelhados no Grupo 2P**: toda gravação/conclusão de proposta atualiza a tabela `proposta_itens` (antes só o backfill preenchia), mantendo o histórico de produtos consultável no banco.
- **Cancelamento com descrição obrigatória**: ao cancelar um pedido, além do motivo o vendedor escreve a **Descrição do Cancelamento** (15–500 caracteres), gravada na proposta, enviada ao SAP e incluída no e-mail de aviso aos setores.

- **E-mails de boleto completos**: os avisos de boleto (a vencer/vencido) passam a incluir linha digitável, **código de barras** e botão **Baixar boleto (PDF)**. O e-mail de boletos a prazo (SharePoint) passa a trazer um link de download assinado (válido por 7 dias) para o PDF de cada parcela.
- **Banco de dados (Grupo 2P)**: novo script `supabase/external/proposta-itens.sql` cria a tabela `proposta_itens` (itens das propostas linha a linha, vinculados por nº do portal, nº SAP e nº Salesforce) — **passo manual**: rodar no SQL Editor do projeto Grupo 2P. O script `scripts/backfill-proposta-itens.mjs` faz o backfill em lotes e registra lacunas (item sem código SAP, proposta sem itens) no painel de integrações do administrador.
- **Plano Fidelidade 2P sai da home e vira aba lateral**: o bloco "Em breve" foi removido da home da instância Solar e ganhou página própria em `/solar/fidelidade` (mesmo conteúdo, ainda com selo "Em breve"). O menu lateral passa a exibir o item **Fidelidade** (ícone de presente, com selo "Em breve") logo abaixo de Cupons. Nova feature `fidelidade` (somente visualizar), incluída nos perfis Vendedor/Gestor/Admin da instância Solar e no grupo "Operação" da matriz de permissões.
- **Atlas (IA) no portal**: chat lateral fixo no canto inferior direito, disponível em todas as telas, para pedir insights e planos de ação por cliente e por período. Conversas separadas por tópico com histórico salvo (lista de conversas, nova conversa, excluir) e tela cheia em `/atlas-ia/<conversa>`. O Atlas responde apenas com os dados que o usuário enxerga (carteira do consultor), consultando clientes, pedidos/faturamento por período, metas do vendedor e alertas abertos.
- **Radar do Atlas** (`/atlas-ia/radar`): varredura semanal (segunda-feira, 08h de Brasília) que detecta clientes piorando — queda de faturamento, atraso no ciclo de compra, inatividade e projeção abaixo da meta — e gera alerta com resumo e recomendação de ação. O consultor recebe notificação no portal e um e-mail com o resumo da semana; cada alerta pode ser marcado como tratado, silenciado por 30 dias ou reaberto. Administradores e diretores podem rodar a varredura sob demanda.
- **Banco de dados**: novas tabelas `atlas_threads`, `atlas_mensagens`, `atlas_alertas` e `atlas_alerta_runs` (com RLS: cada usuário vê apenas suas conversas e seus alertas; administrador vê tudo). Novo agendamento `cron.schedule('atlas-radar-semanal', '0 11 * * 1')` chamando o hook público `/api/public/hooks/atlas-radar` (autenticado por `x-cron-secret`). Novo job `cron.atlas-radar` na tela de gatilhos.
- Listas de propostas (Solar e Carregadores): a coluna **Status** passa a ser a primeira da tabela, exibindo apenas a bolinha colorida (tooltip com o nome do status; acessível via teclado/leitor de tela). Status desconhecido cai em bolinha cinza-claro "Sem status". Regras de ação por status nas duas listas: edição só em "Salvo"; cancelamento (ícone X, motivo obrigatório) apenas de "Aguardando Pagamento" até "Coletado"; "Entregue" e "Cancelado" sem ação; ícone de integrações só para administrador.
- **Segurança**: exclusão e cancelamento travados também no servidor. Exclusão física só existe para proposta em "Salvo" (rascunho); cancelamento manual só de "Aguardando Pagamento" até "Coletado" — tentativas via API fora da regra são recusadas com erro explícito.
- **Cancelamento de pedido exige motivo**: ao cancelar um pedido com ordem no SAP (botão excluir nas listas de propostas Solar/Carregadores), o diálogo agora pede obrigatoriamente o motivo (Pedido Incorreto, Problema Com Pagamento, Pedido Duplicado, Erro de Emissão de NF, Erro Interno ou Desistiu da Compra — mesma lista do Salesforce). O motivo fica gravado no pedido (`propostas.motivo_cancelamento`), aparece no rodapé do detalhe ("olhinho") quando o pedido está cancelado e alimenta o campo `Loss_Reason__c` da oportunidade no Salesforce. Cancelamentos sem motivo são recusados também no servidor.
- Cancelamento de pedido: a notificação passa a ser honesta sobre o envio dos e-mails aos setores. O portal aguarda o desfecho real na fila (até ~15 s) e avisa "FALHA no envio dos e-mails de cancelamento" (com o motivo do provedor) quando o envio é recusado — antes a tela dizia "avisados por e-mail" mesmo com o provedor recusando tudo (domínio de envio desverificado). Quando a confirmação não chega a tempo, o aviso diz que os e-mails ficaram enfileirados sem confirmação.
- Catálogo de fotos: a miniatura WebP (320 px, cache de 1 ano) passa a ser gerada **automaticamente no upload** (no navegador, antes de enviar) e removida junto quando a foto é excluída — não é mais preciso rodar rotina manual para fotos novas. O cache de URLs assinadas é limpo no upload/remoção para a nova foto aparecer na hora.
- Fotos de produto muito mais rápidas: geradas miniaturas WebP (320 px) para as 230 fotos do bucket `produtos` (pasta `thumbs/`, cache de 1 ano) — o acervo servido nas telas caiu de ~44 MB em PNG para ~430 KB. Propostas, catálogo e wizards passam a carregar a miniatura (com fallback para o original quando a foto é nova), as URLs assinadas ficam em cache compartilhado entre telas (sem reassinar a cada navegação, permitindo cache do navegador) e o código→foto do catálogo é consultado só uma vez por sessão.
- Proposta Solar: ao marcar "A venda é Kit? = Sim", o item obrigatório do kit fotovoltaico (100000350) passa a aparecer na lista de itens na hora da cotação, com quantidade travada em 1, sem botão de remover, badge "Kit" e preço buscado no SAP — assim o subtotal da tela bate com o da proposta salva. Ao desmarcar, o item sai automaticamente. Se o material não estiver no catálogo, um aviso é exibido em vez de somar errado silenciosamente.
- Fotos de produto: carga única do acervo histórico concluída de fato. A execução anterior enviou os arquivos para o bucket privado `produtos` mas **não gravou** `sap_produtos.imagem_path` (nenhum evento `migracao-imagens` no log e todos os prioritários seguiam sem foto). Nova execução via service role: 84 produtos sem foto verificados → 25 vinculados a arquivos já presentes no bucket, 1 importado da fonte, 58 sem arquivo, 0 erros. Cobertura passou de 62 para 88 produtos com foto e todos os 19 códigos prioritários (incl. 200000651) estão com `imagem_path` preenchido. Fotos manuais preservadas; relatório registrado no log de integrações (`produtos` / `migracao-imagens`). A rotina foi temporária e não ficou no código: a gestão de fotos segue exclusivamente pela tela "Catálogo de fotos".
- E-mails: todo e-mail de negócio do portal (avisos de boleto, boleto a prazo do SharePoint, aviso de Kit Fotovoltaico e templates futuros) passa a gerar uma cópia de registro para `allan@2pgroup.com.br` (configurável pela env `EMAIL_COPIA_REGISTRO`), com assunto `[registro] …` e o destinatário original no topo. A cópia entra na mesma fila (retry/DLQ/log) com label `<label>-registro` e não é enviada quando o destinatário já é o endereço de registro. E-mails de autenticação (reset de senha, convites, magic links) **não** recebem cópia, por segurança.
- Detalhe da proposta ("olhinho") reorganizado: título com Nº da proposta + nome e Nº SAP no canto superior direito; contato do cliente junto às demais informações do topo; blocos separados de **Faturamento e nota fiscal** (endereço de entrega, DANFE e XML) e de **Cobrança** (Pix, boleto à vista/a prazo, cartão, boletos do SharePoint); criação/finalização e autores movidos para o rodapé.
- Lista de propostas (Solar e Carregadores): número da proposta passa a ser exibido **acima** do nome, em destaque; consultor responsável ganha uma coluna própria, separado do cliente. Nos cartões mobile, o número também aparece destacado no topo e o consultor é mostrado como campo próprio.
- Boletos a prazo do SharePoint: fila do cron corrigida para `forma_pagamento = 'boleto_prazo'` (antes usava o código legado `'n'`, deixando a fila sempre vazia); adicionada guarda de recência (`BOLETOS_SP_JANELA_DIAS`, padrão 30 dias) para não disparar e-mails retroativos em massa; busca agora acessa diretamente a pasta da NF (`4- Boletos/1- Filial (9802)/{NF}`), reduzindo de ~584 chamadas Graph para ~1–2 por pedido. Card de boletos passa a aparecer para pedidos com forma de pagamento `boleto_prazo`.
- Fila do Salesforce: o filtro de pendentes passou a ser feito no banco. Antes o job lia só as 5.000 propostas mais antigas e filtrava em memória, então propostas recentes ficavam presas em "Na fila de envio" indefinidamente.

- Carregadores: opção "Frete grátis" no wizard (CIF/Dedicado) — grava `frete_bonificado`, tira o frete do total cobrado, reflete no resumo, na prévia e no PDF. Cupom continua exclusivo do Solar.
- CNPJ/CPF: normalização de zeros à esquerda (`docCanonico`) aplicada nas validações do envio SAP, crédito, condições de pagamento, revalidação de cadastro e na busca por documento.

### Corrigido
- **Frete CIF/Dedicado aparecia como "Frete grátis"**: a modalidade de frete não define mais gratuidade. Agora só é exibido "Frete grátis" quando o frete é bonificado no próprio pedido ou concedido por cupom — na proposta, na prévia e no PDF (Carregadores e Solar). No PDF de Carregadores, CIF/Dedicado passa a mostrar o valor real do frete.
- **Tabela de preço da proposta Solar voltava para a 01**: ao reabrir um orçamento, o padrão do cadastro do cliente sobrescrevia a tabela gravada. Agora a proposta usa a tabela salva (ou a escolhida manualmente) e só cai no padrão do cliente quando não há valor gravado.
- **Preço errado para CNPJ sem zero à esquerda**: a simulação de preços (`sap-precos.server.ts`) descartava documentos com 12–13 dígitos (zero à esquerda perdido na base, ~450 clientes) e o SAP simulava sem o parceiro, devolvendo impostos genéricos. O envelope agora completa com zeros à esquerda, igual à criação da OV. Na proposta Solar, o alerta vermelho de bloqueio não aparece mais durante o carregamento de preços — só após uma tentativa concluída.


### Alterado
- **Salvar e concluir proposta mais rápidos**: o envio ao Salesforce saiu do caminho crítico — a proposta entra numa fila e é espelhada em segundo plano por um novo gatilho (`/api/public/hooks/salesforce-fila`), em vez de o vendedor esperar a integração responder. No Solar, gravação e histórico de cupom passaram a rodar em paralelo. Falhas continuam visíveis no painel de integrações e no status Salesforce do pedido.
- **Diagnóstico de lentidão na finalização**: cada conclusão agora grava o tempo de cada etapa (SAP, cobrança, fila do Salesforce, aviso de kit e total) na execução registrada em Monitoramento.

### Adicionado
- **Ampliar atuação do cliente (Grupo 2P)**: ao tentar cadastrar em uma unidade um CNPJ que já existe na outra, o aviso de duplicidade agora oferece "Ampliar atuação". O cadastro passa a valer para Solar e Carregadores (escopo `grupo`), aparece nas listas das duas unidades e é reenviado ao SAP com equipe de vendas 003 / escritório 0004. Edições posteriores preservam o escopo. Depende da coluna `escopo_org` (script `supabase/external/clientes-equipe-escritorio.sql` no banco do Grupo 2P).

- **Carteira por vendedor**: sem "View All Records", o consultor passa a ver seus clientes (por criador, consultor responsável ou código SAP do consultor) e todas as propostas/pedidos ligados a esses clientes — inclusive registros criados por outra pessoa para um cliente da carteira dele. Sem limite de tamanho de carteira: carteiras grandes são consultadas em lotes e a lista final é unificada e ordenada antes de paginar. Quem tem "View All Records" continua vendo tudo, sem filtro.
- **Baixa manual de entrega**: pedidos "Coletado" com frete fora da Fretefy podem ser marcados como entregues direto no detalhe do pedido (Solar e Carregadores). A ação exige "Modify All Records" em Propostas, passa pela máquina de estados, carimba a data de entrega, registra o autor no Log de Integrações, sincroniza o Salesforce e avisa o dono do pedido.


### Banco de dados
- Novo perfil de permissão **Analista de Fretes**: acesso às telas de propostas/pedidos de Solar e Carregadores e Manager Access apenas no objeto Propostas (ver/editar todos, sem criar nem excluir). Carga idempotente em `permission_profiles`, `permission_profile_instances`, `permission_profile_features` e `permission_profile_object_perms`.

### Corrigido
- **Atualização dos pedidos**: o cron do SAP agora percorre toda a fila em janelas rotativas, sem deixar pedidos novos presos após os 50 mais antigos; checkout, Pix, confirmação manual e cancelamento passam pela mesma máquina de estados, com datas e trava contra concorrência; entregas da Fretefy recebidas antes da coleta no SAP são reaplicadas automaticamente quando o pedido chega a Coletado.
- **Identificação de cliente duplicado**: o aviso de CNPJ já cadastrado agora exibe o consultor responsável gravado no cadastro, sem confundir a origem da importação com o vendedor da conta.
- **Acesso por link direto**: ao abrir uma rota protegida sem sessão, o portal agora apenas direciona para o login, sem exibir o aviso incorreto de que a tela não está disponível na instância selecionada.
- **Pesquisa numérica de clientes**: CNPJ, CPF, código SAP e número legado voltam a retornar resultados; a consulta deixou de aplicar comparação textual sobre o campo numérico de origem, que fazia o banco rejeitar toda busca contendo três ou mais dígitos.
- **Pesquisa de clientes**: cadastros legados vinculados ao vendedor pelo código SAP agora aparecem na lista e na pesquisa da carteira, mesmo quando não possuem o identificador interno `created_by`; a listagem fica consistente com a validação de CNPJ duplicado.
- **Cadastro de clientes**: o aviso de "Tabela de clientes ainda não criada" agora só aparece quando o banco confirma ausência real da tabela, evitando falso bloqueio por cache/erro transitório enquanto a lista está revalidando.

### Removido
- **Pop-ups automáticos de notificação**: nenhum aviso automático (tarefas do Salesforce, Pix/boleto, Atlas) aparece mais no canto da tela. Tudo continua sendo registrado no sino do topo, com contador e histórico. Os avisos de ação do usuário (salvar, concluir, erro em um envio) seguem funcionando normalmente.
- **Avisos de previsão de fechamento (Salesforce)**: os toasts "Previsão vencida/próxima" saíram do portal — reapareciam a cada ciclo de polling. As notificações de tarefas do dia continuam ativas.


### Adicionado
- **Skeletons e transição suave nas listas**: propostas (Solar e Carregadores) e cadastro de clientes mostram linhas "fantasma" no primeiro carregamento e, ao trocar página/filtro, a tabela atual esmaece com um indicador de atualização ao lado do contador — sem piscar tela em branco.
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
- **Menus do portal não voltam mais ao estado inicial**: o recolher da barra lateral, os toggles Propostas/Clientes/Dashboards e a visão Kanban/Lista do Acompanhamento continuam como você deixou ao navegar entre telas (antes reabriam a cada troca de página) e também entre sessões.

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
