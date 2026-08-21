import { buildSolarPropostaPdfHtml } from "@/lib/solar-proposta-pdf";
const itens = [
 ["200000586","2P-TCL2700 Trilho 2P 2,70M",18,54.83],["200000650","2P-J125 Juncao trilho Alum 6005 125mm",12,7.16],
 ["200000653","2P-GI35 Grampo Interm.30mm/35mm anod",24,4.44],["200000651","2P-GF3035 Grampo Final 30-35mm",16,4.65],
 ["200000656","2P-GAT Grampo aterramento",4,4.56],["200000654","2P-SLA Cj. suporte para laje",18,89.23],
].map(([codigo,nome,qtd,valor]:any)=>({codigo,nome,qtd,valor}));
const html = buildSolarPropostaPdfHtml({
  numero:"050020", propostaNome:"16 mod - 720W - Laje", consultor:"Matheus Nunes",
  cliente:{nome:"USOLAR ENERGIA LTDA",doc:"19897314000167",ie:"107329255",email:"contato@usolar.com.br",telefone:"(62) 84476919",cidade:"GOIANIA",uf:"GO"},
  itens, subtotal:2878.20, desconto:0, freteMod:"CIF", freteValor:146.58, transportadora:"KAMER CARGO LTDA (Sem particularidades)",
  total:3024.78, listaPreco:"01", tipoNf:"venda", formaPagamento:"pix",
  enderecoFaturamento:{nome:"USOLAR ENERGIA LTDA",doc:"19897314000167",linhas:["ALAMEDA GILSON ALVES DE SOUZA, 205","QUADRA152 LOTE 30 · LOT FAICALVILLE","GOIANIA / GO — 74350660"]},
  enderecoEntrega:{nome:"Mesmo do faturamento",linhas:["ALAMEDA GILSON ALVES DE SOUZA, 205","QUADRA152 LOTE 30 · LOT FAICALVILLE","GOIANIA / GO — 74350660"]},
  estrutura:{distribuicao:[6,6,2,2],comprimentos:[8000,2710]},
});
await Bun.write("/tmp/pdfqa/out.html", html);
