CREATE TABLE public.frete_transportadoras_dedicadas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL,
  fretefy_transportadora_id text NOT NULL,
  cnpj text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fretefy_transportadora_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.frete_transportadoras_dedicadas TO authenticated;
GRANT ALL ON public.frete_transportadoras_dedicadas TO service_role;

ALTER TABLE public.frete_transportadoras_dedicadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dedicadas_select_auth" ON public.frete_transportadoras_dedicadas
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "dedicadas_admin_write" ON public.frete_transportadoras_dedicadas
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE TRIGGER trg_dedicadas_updated_at
  BEFORE UPDATE ON public.frete_transportadoras_dedicadas
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.frete_transportadoras_dedicadas (nome, fretefy_transportadora_id, cnpj, ordem) VALUES
('JORGE VOLMIR PIMENTEL','c2f03eda-1ea4-410e-b52a-319b51c40178','50140654000199',1),
('EXPRESSO MANUELA LTDA','95c90de8-74dd-4567-9b1b-b8f1b80f57eb','46369425000173',2),
('BASE TRANSPORTES RODOVIARIOS LTDA','acf9bd4e-2ad9-4fa9-8f77-1e76abaf2049','46199917000168',3),
('J B TRANSPORTES EIRELI','f86cb759-32e4-4485-95ab-bb1bfd027022','33856262000101',4),
('EMPRESA BRASILEIRA DE CORREIOS','2d1a27d7-26b5-403e-b899-ea485ae4e290','34028316002823',5),
('DEDEX EXPRESS LTDA','11ae4582-93e4-474c-891e-194bb9a15ec9','15297410000113',6),
('RODONAVES TRANSPORTES E ENCOMENDAS LTDA','a917718f-7794-4085-9825-6f6fb206a37e','44914992003668',7),
('MODULAR TRANSPORTES LTDA','c54398e2-6d7e-49ef-b2d3-e08568681603','88009030000886',8),
('TRANSPORTES TRANSLOVATO LTDA','2086336a-b6ba-4b41-b0c4-053fc1ff6b91','89823918000659',9),
('TECMAR TRANSPORTES LTDA','377b66a9-1115-446e-9ea9-cf9e932a1be6','01610798003252',10),
('KAMER CARGO LTDA','aba6a795-4617-409a-8076-439514885389','04035148000112',11),
('TRANSPORTES BERTOLINI LTDA','6843f3f5-3b6f-445c-9b6c-e0110583c7e6','04503660004214',12),
('TRANSCARAPIA TRANSPORTES LTDA','0d0ecd8d-747a-48b6-8ec6-32f020e6a928','00904848000307',13),
('SCHREIBER LOGÍSTICA LTDA','1d97bcd0-a220-4bb3-830d-1f0f8aab8b75','10349430000339',14),
('EXPRESSO SÃO MIGUEL S/A','02d8db8e-801d-4482-9347-75f67fcb2b6b','00428307001593',15),
('BRASPRESS TRANSPORTES URGENTES LTDA','6f7f371a-ffd2-4ea2-b321-f02e4ecbe6cb','48740351012767',16),
('VENDEMMIA TRANSPORTES LTDA','d8a2c15e-cab6-4c2e-921b-08de1d44d292','13631538000731',17),
('SC TRANSPORTES LTDA','bf2c0d9b-f3be-49a3-921c-08de1d44d292','41565244000107',18),
('Samar Log','30e5c8ab-8a5c-404a-a03f-1f1d82f58ab3','26263334000141',19);