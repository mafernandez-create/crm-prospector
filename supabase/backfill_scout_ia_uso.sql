-- Carga en ia_uso las 10 ejecuciones del scout del 5-sep-2026 (coste real informado por Claude).
-- Ejecutar una sola vez en el editor SQL de Supabase (proyecto del CRM).
insert into public.ia_uso (creado_en,origen,funcion,modelo,input_tokens,output_tokens,cache_creation,cache_read,web_search,coste_usd,duracion_ms,ok) values
('2026-09-05 10:41:00+02','scout','scout:teruel','claude-sonnet-4-6',0,0,0,0,0,1.2537,515007,true),
('2026-09-05 10:41:00+02','scout','scout:teruel','claude-haiku-4-5-20251001',0,0,0,0,23,0.6193,0,true),
('2026-09-05 11:24:00+02','scout','scout:teruel','claude-sonnet-4-6',23,26141,92893,1282682,0,1.3343,615489,true),
('2026-09-05 11:24:00+02','scout','scout:teruel','claude-haiku-4-5-20251001',404020,15774,0,0,28,0.7629,0,true),
('2026-09-05 12:49:58+02','scout','scout:zaragoza','claude-sonnet-4-6',26,26457,84675,1428359,0,1.3335,658031,true),
('2026-09-05 12:49:58+02','scout','scout:zaragoza','claude-haiku-4-5-20251001',287083,11205,0,0,17,0.5131,0,true),
('2026-09-05 13:05:13+02','scout','scout:zaragoza','claude-sonnet-4-6',28,41689,116872,1731857,0,1.8462,913065,true),
('2026-09-05 13:05:13+02','scout','scout:zaragoza','claude-haiku-4-5-20251001',344122,16076,0,0,22,0.6445,0,true),
('2026-09-05 13:18:21+02','scout','scout:zaragoza','claude-sonnet-4-6',26,35533,103722,1600797,0,1.6356,786344,true),
('2026-09-05 13:18:21+02','scout','scout:zaragoza','claude-haiku-4-5-20251001',392001,16097,0,0,28,0.7525,0,true),
('2026-09-05 16:45:56+02','scout','scout:zaragoza','claude-sonnet-4-6',24,26839,113426,1419524,0,1.5091,582611,true),
('2026-09-05 16:45:56+02','scout','scout:zaragoza','claude-haiku-4-5-20251001',275803,11818,0,0,26,0.5949,0,true),
('2026-09-05 19:00:50+02','scout','scout:granada','claude-sonnet-4-6',22,32555,128632,1408161,0,1.6826,716979,true),
('2026-09-05 19:00:50+02','scout','scout:granada','claude-haiku-4-5-20251001',165940,6558,0,0,16,0.3587,0,true),
('2026-09-05 19:15:52+02','scout','scout:granada','claude-sonnet-4-6',3640,44587,169784,1904190,0,2.2680,900388,true),
('2026-09-05 19:15:52+02','scout','scout:granada','claude-haiku-4-5-20251001',181099,7136,0,0,16,0.3768,0,true),
('2026-09-05 19:28:59+02','scout','scout:granada','claude-sonnet-4-6',2449,38450,182240,1684755,0,2.1810,784718,true),
('2026-09-05 19:28:59+02','scout','scout:granada','claude-haiku-4-5-20251001',78327,3065,0,0,7,0.1637,0,true),
('2026-09-05 19:43:48+02','scout','scout:granada','claude-sonnet-4-6',1504,41797,184294,2461574,0,2.4680,886818,true),
('2026-09-05 19:43:48+02','scout','scout:granada','claude-haiku-4-5-20251001',257283,7999,0,0,14,0.4373,0,true);
