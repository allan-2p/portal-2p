/**
 * Quem pode mexer no catálogo (produtos, estoque e sincronizações com o SAP).
 *
 * O catálogo deixou de ser uma tela única do "Grupo 2P": agora ele vive dentro
 * da Gestão de Produtos de cada unidade. Por isso a permissão aceita tanto o
 * moderador de produtos do 2P Solar quanto o do 2P Carregadores.
 */
import type { CapabilityId } from "@/lib/feature-capabilities";
import type { FeatureKey, InstanceId } from "@/lib/instances";

export const FEATURES_CATALOGO: {
  instance: InstanceId;
  feature: FeatureKey;
  action: CapabilityId;
}[] = [
  { instance: "solar", feature: "admin.produtos", action: "moderar" },
  { instance: "solar", feature: "admin.objetos.produtos", action: "moderar" },
  { instance: "carregadores", feature: "carregadores.produtos", action: "moderar" },
  { instance: "carregadores", feature: "admin.objetos.produtos", action: "moderar" },
];
