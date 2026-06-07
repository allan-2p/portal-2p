export type Segment = "A" | "B" | "C" | "D";

export interface Client {
  id: string;
  name: string;
  segment: Segment;
  projection: number;
  generation: number;
  sales: number;
  trend: "up" | "down" | "stable";
  lastInteraction: string;
  health: number; // 0-100
}

export const clients: Client[] = [
  { id: "1", name: "GTC Engenharia LTDA", segment: "A", projection: 34874, generation: 10777, sales: 8200, trend: "up", lastInteraction: "2d", health: 78 },
  { id: "2", name: "Ecolatto Energia Gestão", segment: "B", projection: 7058, generation: 7741, sales: 6900, trend: "up", lastInteraction: "1d", health: 92 },
  { id: "3", name: "ALC Solar - Renováveis", segment: "A", projection: 27205, generation: 14200, sales: 9800, trend: "down", lastInteraction: "12d", health: 38 },
  { id: "4", name: "Antonia Tania Pereira", segment: "A", projection: 31035, generation: 22100, sales: 18500, trend: "up", lastInteraction: "3d", health: 71 },
  { id: "5", name: "Cipriani Engenharia Solar", segment: "A", projection: 55662, generation: 31200, sales: 24800, trend: "stable", lastInteraction: "5d", health: 65 },
  { id: "6", name: "Economy Solar LTDA", segment: "A", projection: 17729, generation: 4200, sales: 2100, trend: "down", lastInteraction: "18d", health: 22 },
  { id: "7", name: "Elo Solar LTDA", segment: "A", projection: 10916, generation: 9800, sales: 9100, trend: "up", lastInteraction: "1d", health: 88 },
  { id: "8", name: "Enertrend Equipamentos", segment: "A", projection: 14248, generation: 6100, sales: 4200, trend: "down", lastInteraction: "9d", health: 44 },
  { id: "9", name: "Gualberto & Lazarotto", segment: "A", projection: 22475, generation: 18200, sales: 15600, trend: "up", lastInteraction: "2d", health: 81 },
  { id: "10", name: "Hoger Soluções em Energia", segment: "B", projection: 5533, generation: 3200, sales: 2800, trend: "stable", lastInteraction: "6d", health: 58 },
  { id: "11", name: "Jislaine Farias dos Anjos", segment: "A", projection: 26381, generation: 19200, sales: 16800, trend: "up", lastInteraction: "1d", health: 84 },
  { id: "12", name: "JN Construções Ecoeficientes", segment: "B", projection: 9235, generation: 2100, sales: 980, trend: "down", lastInteraction: "21d", health: 18 },
  { id: "13", name: "Maxpower Comércio Placas", segment: "B", projection: 9700, generation: 8200, sales: 7600, trend: "up", lastInteraction: "3d", health: 79 },
  { id: "14", name: "NG Solar LTDA", segment: "B", projection: 8768, generation: 5100, sales: 4200, trend: "stable", lastInteraction: "7d", health: 62 },
  { id: "15", name: "Palmas Energia Solar", segment: "B", projection: 9023, generation: 4800, sales: 3900, trend: "down", lastInteraction: "11d", health: 41 },
  { id: "16", name: "Retrofit Elétrica Industrial", segment: "C", projection: 10813, generation: 6200, sales: 5100, trend: "up", lastInteraction: "4d", health: 68 },
  { id: "17", name: "Rodotech Energia Solar", segment: "C", projection: 10215, generation: 7800, sales: 6900, trend: "up", lastInteraction: "2d", health: 75 },
  { id: "18", name: "Sol Engenharia Energéticas", segment: "A", projection: 37657, generation: 28200, sales: 24100, trend: "up", lastInteraction: "1d", health: 86 },
  { id: "19", name: "Solaron Franquias LTDA", segment: "C", projection: 8633, generation: 1200, sales: 600, trend: "down", lastInteraction: "25d", health: 12 },
  { id: "20", name: "Solarwave Energia", segment: "D", projection: 5993, generation: 4100, sales: 3800, trend: "stable", lastInteraction: "8d", health: 55 },
  { id: "21", name: "Vertice Construtora Solar", segment: "A", projection: 79215, generation: 62100, sales: 54200, trend: "up", lastInteraction: "1d", health: 91 },
];

export interface Order {
  id: string;
  code: string;
  title: string;
  client: string;
  closing: string;
  value: number;
  status: "Aguard. Pagamento" | "Processando" | "Separação" | "Faturado" | "Coletado";
}

export const orders: Order[] = [
  { id: "1", code: "40982", title: "Reposição junção", client: "AOLE Comercio e Serviços LTDA", closing: "05/06/2026", value: 1995, status: "Aguard. Pagamento" },
  { id: "2", code: "40313", title: "Glaucia", client: "Euler Daniel Oliveira Santana", closing: "01/06/2026", value: 2512, status: "Aguard. Pagamento" },
  { id: "3", code: "40779", title: "17 Módulos Gancho cerâmica", client: "Ricardo Veiga da Silva", closing: "29/05/2026", value: 8400, status: "Aguard. Pagamento" },
  { id: "4", code: "31808", title: "Pedido reposição", client: "Greenflex Soluções em Energia LTDA", closing: "26/08/2025", value: 1370, status: "Processando" },
  { id: "5", code: "24260", title: "GFA - 031224 rapha", client: "Sostenes de Barros e Silva", closing: "04/12/2024", value: 1269, status: "Processando" },
  { id: "6", code: "8382", title: "Amplifica", client: "Amplifica Solar LTDA", closing: "18/09/2023", value: 980, status: "Processando" },
  { id: "7", code: "41000", title: "Limpador 2P", client: "Fake Industria Interestadual", closing: "04/06/2026", value: 5900, status: "Separação" },
  { id: "8", code: "40897", title: "Limpador 2P", client: "Loctek Energia Solar LTDA", closing: "03/06/2026", value: 5900, status: "Separação" },
  { id: "9", code: "40925", title: "Limpador 2P", client: "Domingos Pereira de Araujo", closing: "03/06/2026", value: 5900, status: "Separação" },
  { id: "10", code: "40980", title: "Lista", client: "Engsis Engenharia Sistemas", closing: "05/06/2026", value: 1795, status: "Faturado" },
  { id: "11", code: "41003", title: "Motor", client: "Paulo Elisson de Abreu Fonseca", closing: "05/06/2026", value: 1370, status: "Faturado" },
  { id: "12", code: "41009", title: "Lista de produtos", client: "Petronio da Silva Leal", closing: "04/06/2026", value: 3200, status: "Faturado" },
  { id: "13", code: "40837", title: "40 módulos / Smat10", client: "Sunday Energia Solar LTDA", closing: "03/06/2026", value: 2497, status: "Coletado" },
  { id: "14", code: "40883", title: "REEVISA - MAIO (Cópia)", client: "R.V. Energia Comercio LTDA", closing: "03/06/2026", value: 63389, status: "Coletado" },
  { id: "15", code: "40926", title: "Reevisa - tc e laje", client: "R.V. Energia Comercio LTDA", closing: "03/06/2026", value: 4200, status: "Coletado" },
];

export const kanbanColumns = ["Aguard. Pagamento", "Processando", "Separação", "Faturado", "Coletado"] as const;

export const monthSeries = Array.from({ length: 30 }, (_, i) => {
  const day = i + 1;
  const projected = Math.round(100000 + (day / 30) * 1400000 + Math.random() * 30000);
  const generated = day < 10 ? Math.round(projected * 0.5) : Math.round(projected * (0.9 + Math.random() * 0.1));
  const sold = day < 10 ? Math.round(projected * 0.25) : Math.round(projected * (0.4 + Math.random() * 0.05));
  return { day: `${day < 10 ? "0" : ""}${day} jun`, projected, generated, sold };
});

export const portfolio = {
  projected: 972045,
  sold: 639294,
  ticketAvg: 18270,
  conversionValue: 25.63,
  conversionQty: 21.21,
  generationMonth: 1495252,
  generationWeek: 1508913,
  withoutQuote: 1628,
  withoutOrder: 1778,
  goal: 4550000,
  achieved: 423883,
};

export interface AtlasInsight {
  id: string;
  type: "opportunity" | "risk" | "action" | "trend";
  title: string;
  description: string;
  client?: string;
  impact?: string;
}

export const atlasInsights: AtlasInsight[] = [
  {
    id: "i1",
    type: "risk",
    title: "Vertice Construtora desacelerou geração",
    description: "Queda de 18% nas últimas 2 semanas. Cliente A — risco de churn na carteira top.",
    client: "Vertice Construtora Solar",
    impact: "R$ 79.2k em risco",
  },
  {
    id: "i2",
    type: "opportunity",
    title: "Cipriani está pronto para upgrade",
    description: "Compra recorrente há 4 meses + ticket subindo. Sugiro apresentar linha premium de limpadores.",
    client: "Cipriani Engenharia Solar",
    impact: "+R$ 12k potenciais",
  },
  {
    id: "i3",
    type: "action",
    title: "3 clientes A sem interação há +10 dias",
    description: "Economy Solar, ALC Solar e Enertrend. Recomendo follow-up esta semana.",
    impact: "Carteira saudável",
  },
  {
    id: "i4",
    type: "trend",
    title: "Conversão R$ abaixo da média 3M",
    description: "25,63% vs 31,44%. Tendência: clientes pedindo prazos maiores. Considere revisar política comercial.",
    impact: "-5,8 p.p.",
  },
  {
    id: "i5",
    type: "opportunity",
    title: "Sol Engenharia em ritmo de fechamento",
    description: "Geração 86% da projeção. Próximo follow-up pode converter R$ 13k já em junho.",
    client: "Sol Engenharia Energéticas",
    impact: "+R$ 13k em junho",
  },
];

export const tasks = [
  { id: "t1", title: "Ligar para ALC Solar", due: "Hoje 14h", priority: "high" as const, client: "ALC Solar - Renováveis" },
  { id: "t2", title: "Enviar proposta limpador premium", due: "Hoje 17h", priority: "high" as const, client: "Cipriani Engenharia Solar" },
  { id: "t3", title: "Visita técnica agendada", due: "Amanhã 09h", priority: "medium" as const, client: "Vertice Construtora Solar" },
  { id: "t4", title: "Treinamento — Linha Smat10", due: "Quinta 15h", priority: "low" as const, client: "Equipe" },
  { id: "t5", title: "Revisar pedido 40982", due: "Hoje", priority: "medium" as const, client: "AOLE Comércio" },
];
