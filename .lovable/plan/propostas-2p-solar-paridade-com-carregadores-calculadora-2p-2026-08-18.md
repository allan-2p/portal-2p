# Propostas 2P Solar — paridade com Carregadores + Calculadora 2P

## Objetivo
Trazer a proposta do 2P Solar para o mesmo padrão visual e de fluxo da proposta de 2P Carregadores, com uma calculadora de estruturas própria do Solar, cupons na finalização e uma área de moderação que documenta (e em parte configura) todas as regras.

## 1. Listagem de propostas (Solar)
- Substituir a tela mock atual (`/solar/propostas`) por uma listagem igual à de Carregadores: mesmas colunas (nº, cliente, proposta, nº SAP, valor, data, consultor, status), legenda de status, ações de detalhar/editar, auditoria e visualização em modal grande.
- Dados na tabela universal `propostas` do banco grupo-2p, filtrando `organizacao = 'solar'`.
- Numeração sequencial própria do Solar (definir faixa inicial — ver "Pendências").
- Sem nº SAP até a conclusão, igual Carregadores.

## 2. Wizard em 5 etapas
Identificação → Faturamento → Produtos → Entrega e frete → Finalização.

**Etapa 1 — Identificação**
- Cliente selecionado por busca no Cadastro de Clientes (mesmo seletor do Carregadores), consultor herdado do cadastro (imutável).
- Nome da proposta obrigatório.
- Pergunta "Projeto já vendido ao cliente final?" — se **Sim**, previsão de fechamento vira obrigatória.
- Modo da proposta: **Realizar Proposta** (calculadora) ou **Lista de Produtos** (seleção manual). Sem o modo Carregadores.

**Etapa 2 — Faturamento**: igual Carregadores (tipo de NF, faturar cliente final, endereço de faturamento).

**Etapa 3 — Produtos**
- Seletor de **tabela de preço** (01–05); ao trocar, todo o cálculo/preço é refeito.
- Modo Realizar Proposta: formulário do módulo + gerador + trilho, depois as fileiras; ao calcular, animação de processamento característica (barra/etapas animadas com identidade 2P) enquanto quantifica e busca preços no SAP.
- Modo Lista de Produtos: pula a calculadora e vai direto à seleção de itens do catálogo.
- Preço unitário **não editável** e **nenhuma informação de margem/comissão** exibida.

**Etapa 4 — Entrega e frete**: integração Fretefy nos mesmos moldes do Carregadores, com as regras do Solar (transportadoras, TDE, CIF/FOB) e peso vindo da simulação de preço do SAP.

**Etapa 5 — Finalização**: resumo robusto do pedido (endereço de faturamento e de entrega), forma de pagamento obrigatória para concluir, **aplicação de cupons** validando as condições cadastradas em Cupons (Solar), PDF com o padrão atual.

## 3. Motor da calculadora (Solar)
Função pura em TypeScript, determinística, rodando no servidor:

```text
comprimento da fileira (mm)
nt = (paineis x dim) + ((paineis - 1) x folga) + 2 x balanco
dim = largura (retrato) | altura (paisagem)
```

- Trilhos: família por tipo (reforçado / light / padrão), barras 6650/4800/3600 apenas com "todos os trilhos"; caso contrário 2400 (largura ≤ 1200) ou 2700 (largura > 1200); 2 barras por fileira + resíduo arredondado para cima.
- Grampo intermediário: `(paineis - 1) x 2 x fileiras` (espessura 30–35).
- Grampo final: `4 x fileiras`. Terminal de aterramento: `1 x fileira`.
- Junção: se total de trilhos > 2 → `((teto(trilhos / (2 x fileiras)) x 2) - 2) x fileiras`.
- Fixadores: `teto((nt - 2 x balanco) / distancia + 1) x fileiras x multiplo` (múltiplo 1 ou 2 conforme o suporte).
- Suportes "smart/mini": não usam barra, quantidade = total de grampos.
- Terminais de microinversor conforme gerador/modelo.
- Restrições trilho → suporte validadas no formulário; regras de gerador (microinversores ocultos/zerados) e trava de "todos os trilhos" acima de 50 painéis.
- Preço: RFC `ZNFE_OV_SIMULAR` já integrada, com a tabela de preço escolhida; unitário = (valor líquido + imposto) / quantidade.

## 4. Dados de referência (banco grupo-2p)
Novas tabelas: `solar_modulos`, `solar_geradores`, `solar_trilhos`, `solar_suportes`, `solar_trilho_suporte` (as combinações válidas) e `solar_calc_config` (constantes configuráveis: folga entre painéis, balanço, comprimentos de barra, limites de validação, multiplicadores).
Itens da proposta gravados junto da proposta na tabela universal.

## 5. Gestão de Produtos › Módulos (Solar)
Sub-aba em Gestão de Produtos do Solar para cadastrar/editar módulos: nome, largura, altura, espessura, "personalizado" (libera digitação das dimensões), ativo e ordem. Validações: altura ≥ 1500, largura ≥ 800, espessura 30–35. A calculadora lê apenas os ativos.

## 6. Moderação › 2P Solar › Regras de Propostas › Calculadora 2P
Nova página documentando, em blocos separados e legíveis: os dois modos, campos e validações do formulário, regras de fileiras, fórmulas de quantificação por componente, origem dos preços (SAP), origem dos dados de referência e regras de frete. Os parâmetros de `solar_calc_config` ficam editáveis ali (com registro no log de moderação); as fórmulas em si ficam apenas documentadas.

## Notas técnicas
- Reaproveitar `propostas.functions.ts` / `propostas-db.server.ts` (tabela universal por `organizacao`), `frete.functions.ts`, `sap-precos.server.ts`, `proposta-status`, `proposta-detalhe` e a barra de ações do wizard.
- O wizard do Solar será um arquivo próprio para não inflar o de Carregadores, mas compartilhando componentes comuns extraídos.
- Permissões: novas chaves para Módulos e Calculadora 2P dentro do modelo de perfis existente.

## Pendências para você confirmar
1. Faixa inicial da numeração das propostas Solar (Carregadores começa em 050000).
2. Lista oficial de trilhos, suportes e geradores (nomes/códigos SAP) e as combinações válidas — preciso desses dados para popular as tabelas de referência.
3. Regras de frete específicas do Solar que diferem do Carregadores.
