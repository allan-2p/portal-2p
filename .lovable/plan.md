# Painel único de integrações e auditoria por pedido

## Objetivo
- Substituir os ícones separados por um único indicador de saúde nas listas de propostas Solar e Carregadores.
- Abrir um painel grande com duas abas: **Integrações** e **Auditoria**.
- Exibir por tentativa do SAP: data/hora, resultado, mensagem de erro e resumo seguro do payload, sem credenciais.
- Usar verde quando as integrações estiverem concluídas e laranja quando houver erro, pendência ou correção necessária.
- Diagnosticar e corrigir o salvamento/listagem das propostas Solar.

## Implementação
1. Reaproveitar o painel existente de SAP/Salesforce e reorganizá-lo em abas.
2. Enriquecer a aba Auditoria com os detalhes já gravados em `integration_logs`, incluindo payload/resposta resumidos e seções expansíveis.
3. Criar um indicador único e acessível na linha da proposta, usado nos dois módulos; remover o atalho separado de auditoria de cálculo da linha de Carregadores, mantendo o conteúdo acessível pelo painel.
4. Ajustar permissões para que usuários com acesso à proposta possam consultar o painel, sem depender de permissão de exclusão.
5. Corrigir a causa do desaparecimento/falha de salvamento das propostas Solar e atualizar a lista imediatamente após salvar.
6. Validar build e os fluxos Solar/Carregadores no preview.

## Detalhes técnicos
- Nenhuma credencial, cabeçalho de autorização ou XML completo será mostrado; o payload será resumido e campos sensíveis serão omitidos.
- A saúde será derivada do status SAP/Salesforce e dos logs recentes do pedido.
- A auditoria fiscal detalhada de Carregadores continuará disponível, integrada como acesso contextual dentro da aba Auditoria.
