import { criarOrdemVendaSap } from "@/lib/sap-ov.server";
const r = await criarOrdemVendaSap("ac842561-beeb-4a24-a47c-94378cc90069", { forcar: true });
console.log(JSON.stringify(r).slice(0, 2000));
