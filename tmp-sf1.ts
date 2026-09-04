import { sincronizarClienteSalesforce } from "./src/lib/salesforce-clientes.server";
const url="https://npzlinbglznnnwxxcawh.supabase.co";
const key=process.env.GRUPO2P_SUPABASE_SERVICE_ROLE_KEY||process.env.GRUPO2P_SUPABASE_KEY!;
const c=(await (await fetch(`${url}/rest/v1/clientes?doc=eq.06013419000164&select=*`,{headers:{apikey:key,Authorization:`Bearer ${key}`}})).json())[0];
const r=await sincronizarClienteSalesforce(c as any);
console.log(r);
