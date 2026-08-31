import { enviarEmail, layoutEmail } from "@/lib/email.server";

const DESTINATARIO = "allan@2pgroup.com.br";
const LOTE = 5;

async function main() {
  console.log(`Disparando ${LOTE} e-mails de boleto para ${DESTINATARIO}...`);
  for (let i = 1; i <= LOTE; i++) {
    const numero = `TESTE-${Date.now()}-${i}`;
    const nf = `NF-${Date.now()}-${i}`;
    const html = layoutEmail(
      `Boletos do pedido ${numero}`,
      `<p>Este é um e-mail de teste para acelerar a reputação do domínio.</p>
       <p>Seguem os boletos referentes à nota fiscal <strong>${nf}</strong> do pedido <strong>${numero}</strong>.</p>
       <ul style="padding-left:18px;margin:12px 0"><li style="margin:4px 0">Boleto_Teste_${i}.pdf</li></ul>
       <p>Os arquivos também ficam disponíveis no portal, no detalhe do pedido.</p>
       <p style="margin-top:16px">Contas a Receber · 2P Group</p>`,
      `Boleto de teste ${i} - Portal 2P`
    );
    const ok = await enviarEmail({
      to: DESTINATARIO,
      subject: `Boletos do pedido ${numero} (nota fiscal ${nf})`,
      html,
      label: "boletos-sharepoint-teste",
      idempotencyKey: `boletos-teste:${Date.now()}:${i}:${DESTINATARIO}`,
    });
    console.log(`  E-mail ${i}/${LOTE}: ${ok ? "OK" : "FALHA"}`);
  }
  console.log("Concluído.");
}

main().catch((e) => {
  console.error("Erro ao disparar e-mails:", e);
  process.exit(1);
});
