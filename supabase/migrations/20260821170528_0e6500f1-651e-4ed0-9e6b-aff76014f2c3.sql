update public.solar_suportes set codigo_sap='200000025' where legado_id=1;
update public.solar_suportes set codigo_sap='200000655' where legado_id=2;
update public.solar_suportes set codigo_sap='200000587' where legado_id=3;
update public.solar_suportes set codigo_sap='200000690' where legado_id=7;
update public.solar_suportes set cod_mini_trilho='100000203' where legado_id=9;
update public.solar_suportes set cod_mini_trilho='100000250' where legado_id=10;
update public.solar_suportes set codigo_sap='200000654' where legado_id=11;
update public.solar_suportes set codigo_sap='200000516' where legado_id=12;
update public.solar_suportes set codigo_sap='200000076', cod_extra='200000077' where legado_id=13;
update public.solar_suportes set codigo_sap='200000072' where legado_id=14;
update public.solar_suportes set codigo_sap='200000391' where legado_id=18;
update public.solar_suportes set codigo_sap='200000585', cod_extra='200000111' where legado_id=19;
update public.solar_suportes set cod_mini_trilho='100000316' where legado_id=20;

update public.solar_calc_config
set cod_terminal_m8='200000527',
    cod_terminal_zmi='200000100',
    cod_terminal_zmil='200000120'
where id=1;

update public.solar_trilhos set cod_4800='200000051' where familia='reforcado';

update public.produtos set ativo=true where codigo='200000391';