-- ============================================================================
--  009 · Quitar las sobrecargas antiguas de found_club
-- ============================================================================
--  Al crear la version con el codigo de administracion (008), Postgres no
--  sustituyo la anterior: anadio UNA FUNCION MAS. Convivian tres:
--
--    · 9 parametros  (la primera, de la tabla inicial)
--    · 10 parametros (la de 003/006, sin codigo)
--    · 11 parametros (la de 008, con p_codigo_admin)
--
--  Las dos primeras seguian siendo ejecutables por anon y authenticated, y
--  hacen lo mismo que la nueva MENOS la comprobacion del codigo. Es decir:
--  el codigo de administracion se podia esquivar llamando por la API a la
--  version vieja. Puerta trasera en el proprio sitio donde se_instalo el
--  cerrojo, que es justo lo que 008 pretendia cerrar.
--
--  Se dejan solo los 11 parametros. found_club no la usa ninguna otra funcion
--  ni vista, asi que se pueden borrar sin mas.
-- ============================================================================

drop function if exists public.found_club(text, text, text, text, text,
  text, text, text, text);
drop function if exists public.found_club(text, text, text, text, text,
  text, text, text, jsonb, text);

comment on function public.found_club(text, text, text, text, text, text,
  text, text, jsonb, text, text) is
  'Funde el club. Exige p_codigo_admin: sin el codigo de administracion nadie '
  'puede crear el club. El valor se compara contra app_config en el servidor; '
  'el navegador nunca lo ve. Unica version: no reintroducir copias sin codigo.';