/**
 * Catálogo dos e-mails que o portal envia.
 *
 * Documenta cada tipo: quando dispara, quem recebe, o que vai no corpo e como
 * o envio é controlado. A prévia usa o mesmo layout do envio real
 * (`layoutEmail`), com dados de exemplo.
 */
import { layoutEmail } from "./email-layout";

export type EmailCatalogoItem = {
  /** Rótulo gravado em `email_send_log.template_name`. */
  id: string;
  nome: string;
  categoria: "Cobrança" | "Pedido" | "Operação" | "Inteligência" | "Acesso";
  quando: string;
  destinatarios: string;
  assunto: string;
  conteudo: string[];
  funcionamento: string[];
  origem: string;
  /** HTML de exemplo do corpo (sem o layout externo). */
  corpoExemplo: string;
  /** Rótulos usados no log que correspondem a este item. */
  rotulosLog: string[];
};

const rodapeCopia =
  "Uma cópia de registro é enviada em paralelo para o endereço interno de arquivo (EMAIL_COPIA_REGISTRO).";

export const EMAILS_CATALOGO: EmailCatalogoItem[] = [
  {
    id: "boleto-vencendo",
    nome: "Boleto a vencer",
    categoria: "Cobrança",
    quando: "Cron diário, quando um pedido tem boleto com vencimento nos próximos dias.",
    destinatarios: "E-mail de cobrança do cliente do pedido.",
    assunto: "Boleto do pedido 60030 vence em breve",
    conteudo: [
      "Número do pedido e do documento",
      "Valor e data de vencimento",
      "Linha digitável / código de barras",
      "Link para baixar o PDF do boleto",
    ],
    funcionamento: [
      "Varredura diária dos pedidos com pagamento por boleto.",
      "Chave de idempotência por pedido + tipo + vencimento: não duplica no mesmo dia.",
      "Também gera notificação interna de pagamento no portal.",
      rodapeCopia,
    ],
    origem: "src/lib/boleto-avisos.server.ts",
    rotulosLog: ["boleto-vencendo"],
    corpoExemplo: `<p>O boleto do pedido <strong>60030</strong> vence em <strong>12/06/2026</strong>.</p>
      <p><strong>Valor:</strong> R$ 18.430,00</p>
      <p style="margin:16px 0;padding:12px;background:#f5f6f8;border-radius:8px;font-family:monospace;font-size:13px">34191.79001 01043.510047 91020.150008 1 99870000018430</p>
      <p><a href="#" style="display:inline-block;padding:10px 16px;background:#1c1f23;color:#fff;border-radius:8px;text-decoration:none">Baixar boleto (PDF)</a></p>`,
  },
  {
    id: "boleto-vencido",
    nome: "Boleto vencido",
    categoria: "Cobrança",
    quando: "Cron diário, quando o boleto passou da data de vencimento e segue em aberto.",
    destinatarios: "E-mail de cobrança do cliente do pedido.",
    assunto: "Boleto do pedido 60030 está vencido",
    conteudo: [
      "Aviso de vencimento com data",
      "Valor e identificação do pedido",
      "Linha digitável e link do PDF para regularizar",
    ],
    funcionamento: [
      "Mesma varredura do aviso de vencimento, com texto e assunto de cobrança.",
      "Um envio por pedido/tipo/vencimento — reprocessar o cron não reenvia.",
      rodapeCopia,
    ],
    origem: "src/lib/boleto-avisos.server.ts",
    rotulosLog: ["boleto-vencido"],
    corpoExemplo: `<p>O boleto do pedido <strong>60030</strong> venceu em <strong>02/06/2026</strong> e consta em aberto.</p>
      <p><strong>Valor:</strong> R$ 18.430,00</p>
      <p style="margin:16px 0;padding:12px;background:#f5f6f8;border-radius:8px;font-family:monospace;font-size:13px">34191.79001 01043.510047 91020.150008 1 99870000018430</p>
      <p><a href="#" style="display:inline-block;padding:10px 16px;background:#1c1f23;color:#fff;border-radius:8px;text-decoration:none">Baixar boleto (PDF)</a></p>`,
  },
  {
    id: "boletos-sharepoint",
    nome: "Boletos do pedido (a prazo)",
    categoria: "Cobrança",
    quando:
      "Quando a sincronização com o SharePoint encontra os PDFs dos boletos da nota fiscal do pedido.",
    destinatarios: "E-mail de cobrança do cliente do pedido.",
    assunto: "Boletos do pedido 60030 (nota fiscal 123456)",
    conteudo: [
      "Pedido e número da nota fiscal",
      "Lista de parcelas com vencimento e valor",
      "Link assinado (7 dias) para baixar cada PDF",
      "Código de barras / linha digitável quando disponível",
    ],
    funcionamento: [
      "Cron `cron.boletos-sharepoint` varre pedidos com forma de pagamento boleto a prazo.",
      "Os PDFs vêm do SharePoint (Graph API) e são guardados no Storage; o e-mail leva links assinados.",
      "Um envio por pedido/nota — a chave de idempotência evita reenvio na próxima varredura.",
      rodapeCopia,
    ],
    origem: "src/lib/boletos-sharepoint.server.ts",
    rotulosLog: ["boletos-sharepoint"],
    corpoExemplo: `<p>Seguem os boletos do pedido <strong>60030</strong>, nota fiscal <strong>123456</strong>.</p>
      <ul>
        <li>Parcela 1 — vence 12/06/2026 — R$ 9.215,00 — <a href="#">baixar PDF</a></li>
        <li>Parcela 2 — vence 12/07/2026 — R$ 9.215,00 — <a href="#">baixar PDF</a></li>
      </ul>
      <p style="font-size:12px;color:#6b7280">Os links de download ficam válidos por 7 dias.</p>`,
  },
  {
    id: "cancelamento-pedido",
    nome: "Cancelamento de pedido",
    categoria: "Pedido",
    quando: "Assim que um pedido é cancelado no portal (com motivo e descrição obrigatórios).",
    destinatarios:
      "Lista interna de setores envolvidos (faturamento, logística, comercial) definida em configuração.",
    assunto: "Cancelamento do pedido 60030",
    conteudo: [
      "Pedido, projeto e cliente",
      "Motivo de cancelamento escolhido",
      "Descrição escrita pelo vendedor",
      "Quem cancelou e quando",
    ],
    funcionamento: [
      "Disparado junto com os demais efeitos do cancelamento (SAP, Fretefy, Salesforce).",
      "Um e-mail por destinatário, com chave de idempotência por pedido + destinatário.",
      "A notificação na tela só confirma o envio depois do resultado real do provedor.",
      rodapeCopia,
    ],
    origem: "src/lib/proposta-cancelamento.server.ts",
    rotulosLog: ["cancelamento-pedido"],
    corpoExemplo: `<p><strong>Pedido:</strong> 60030</p>
      <p><strong>Projeto:</strong> Usina Fazenda Boa Vista</p>
      <p><strong>Cliente:</strong> Energia Solar LTDA</p>
      <p><strong>Motivo de cancelamento:</strong> Teste Interno</p>
      <p><strong>Descrição do cancelamento:</strong> Cliente desistiu após revisão do projeto elétrico.</p>
      <p style="font-size:12px;color:#6b7280">Cancelado por Allan em 12/06/2026 14:32.</p>`,
  },
  {
    id: "kit-fotovoltaico",
    nome: "Kit fotovoltaico do pedido",
    categoria: "Operação",
    quando: "Quando o kit fotovoltaico do pedido fica disponível para o cliente.",
    destinatarios: "E-mail de contato do cliente do pedido.",
    assunto: "Kit fotovoltaico do pedido 60030",
    conteudo: [
      "Pedido e resumo do kit",
      "Itens que compõem o kit",
      "Orientação de próximos passos",
    ],
    funcionamento: [
      "Enviado pelo fluxo de avisos do Solar; se o pedido não tem e-mail de contato, registra o evento `aviso_sem_destinatario` em vez de enviar.",
      rodapeCopia,
    ],
    origem: "src/lib/kit-aviso.server.ts",
    rotulosLog: ["kit-fotovoltaico"],
    corpoExemplo: `<p>O kit fotovoltaico do pedido <strong>60030</strong> está disponível.</p>
      <ul>
        <li>20x Módulo 585W</li>
        <li>1x Inversor 10kW</li>
        <li>Estrutura e acessórios do kit</li>
      </ul>`,
  },
  {
    id: "atlas-radar-semanal",
    nome: "Atlas • radar de clientes",
    categoria: "Inteligência",
    quando: "Cron semanal do radar, quando o Atlas detecta clientes em deterioração.",
    destinatarios: "Consultor responsável pela carteira / gestores configurados.",
    assunto: "Atlas • 3 cliente(s) precisando de atenção",
    conteudo: [
      "Clientes com sinal de piora e o motivo detectado",
      "Recomendação de ação por cliente",
      "Link para o Atlas dentro do portal",
    ],
    funcionamento: [
      "Varredura semanal comparando compras, propostas e prazos de cada cliente.",
      "Só envia quando existe pelo menos um cliente em risco.",
      rodapeCopia,
    ],
    origem: "src/lib/atlas-radar.server.ts",
    rotulosLog: ["atlas-radar-semanal"],
    corpoExemplo: `<p>3 clientes da sua carteira mudaram de comportamento nesta semana:</p>
      <ul>
        <li><strong>Energia Solar LTDA</strong> — sem pedidos há 68 dias (média histórica: 22). Sugestão: retomar contato com oferta de carga fechada.</li>
        <li><strong>EletroPosto Sul</strong> — ticket médio caiu 41%. Sugestão: revisar tabela de preço aplicada.</li>
      </ul>
      <p><a href="#">Abrir o Atlas no portal</a></p>`,
  },
  {
    id: "auth",
    nome: "E-mails de acesso (login e senha)",
    categoria: "Acesso",
    quando:
      "Cadastro, link mágico, redefinição de senha, convite, troca de e-mail e reautenticação.",
    destinatarios: "O próprio usuário do portal.",
    assunto: "Varia conforme o evento (ex.: Confirme seu acesso ao Portal 2P)",
    conteudo: ["Link ou código de uso único", "Validade do link", "Aviso de segurança"],
    funcionamento: [
      "Disparados pela autenticação do backend, com templates próprios em `src/lib/email-templates/`.",
      "Não passam pelo log de e-mails de negócio; falhas aparecem nos registros de autenticação.",
      "Continuam funcionando mesmo para quem se descadastrou dos avisos de negócio.",
    ],
    origem: "src/lib/email-templates/",
    rotulosLog: [],
    corpoExemplo: `<p>Use o botão abaixo para confirmar seu acesso ao Portal 2P.</p>
      <p><a href="#" style="display:inline-block;padding:10px 16px;background:#1c1f23;color:#fff;border-radius:8px;text-decoration:none">Confirmar acesso</a></p>
      <p style="font-size:12px;color:#6b7280">O link expira em 60 minutos. Se não foi você, ignore esta mensagem.</p>`,
  },
];

export function previewEmail(item: EmailCatalogoItem): string {
  return layoutEmail(item.nome, item.corpoExemplo);
}
