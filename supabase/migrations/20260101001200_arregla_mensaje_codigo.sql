-- ============================================================================
--  012 · Corregir la concatenacion con + en el mensaje del codigo
-- ============================================================================
--  Al fundar sin codigo, found_cluc devolvia este error en vez del mensaje:
--
--    operator is not unique: unknown + unknown
--
--  No era un fallo del codigo de administracion ni del club: el mensaje
--  estaba escrito con el operador +, y en PostgreSQL + NO existe para texto
--  (para unir cadenas es ||). Al evaluarlo, los dosoperandos son literales
--  "unknown" y PostgreScript no sabe cual operador escolher: de ahi el error,
--  que ademas no dice nada util para quien lo ve.
--
--  Por eso aparecia justo cuando el parametro llegaba vacio, que es lo que
--  hace un cliente antiguo que todavia no manda p_codigo_admin (la app cacheada
--  de antes de este cambio).
-- ============================================================================

create or replace function public.found_club(
  p_club_id         text,
  p_season_id       text,
  p_nombre          text,
  p_ciudad          text,
  p_temporada       text,
  p_user_id         text,
  p_nombre_usuario  text,
  p_email           text,
  p_categorias      jsonb,
  p_family_code     text,
  p_codigo_admin    text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cat jsonb;
  v_i   integer := 0;
  v_n   text;
begin
  if public.uid_t() = '' then
    return jsonb_build_object('ok', false, 'error', 'Inicia sesión primero');
  end if;

  -- Quien organiza el club se queda como junta. Este es el punto que hacia
  -- fallar lo del acceso: el fundador tiene que entrar sin codigo.
  -- Se compara contra la SESION, no contra el parametro.
  if exists (select 1 from public.club_members
              where club_id = p_club_id and user_id = public.uid_t()) then
    return jsonb_build_object('ok', true, 'club_id', p_club_id, 'rol', 'junta',
                              'ya_existia', true);
  end if;

  if not public.club_is_empty() then
    return jsonb_build_object('ok', false, 'error',
      'Este club ya está creado. Pide tu código de acceso a la junta.');
  end if;

  -- EL CODIGO DE ADMINISTRACION. Sin el, cualquiera podia fundar el club.
  -- Se comprueba ANTES de crear nada. El valor vive en app_config: el
  -- navegador no lo ve y en el APK no hay forma de leerlo.
  -- El mensaje se une con ||: con + PostgreSQL responde "operator is not
  -- unique" y no dice nada de que falte el codigo.
  if coalesce(p_codigo_admin, '') = '' then
    return jsonb_build_object('ok', false, 'error',
      'Escribe el código de administración del club. Te lo da la junta '
      || 'directiva en persona: es distinto del código de familias.');
  end if;
  if coalesce(p_codigo_admin, '') <> coalesce(
       (select c.valor from public.app_config c
         where c.clave = 'club_admin_code'), '') then
    return jsonb_build_object('ok', false, 'error',
      'El código de administración no es correcto');
  end if;

  -- Todo comprobado. A partir de aqui se puede crear la ficha del fundador
  -- como junta: es lo unico que hace falta para que el trigger la acepte.
  perform set_config('app.fundando_club', p_club_id, true);

  insert into public.clubs (id, nombre, deporte, ciudad, fundado, creado)
  values (p_club_id, p_nombre, 'Rugby', p_ciudad, 1931,
          to_char(now(), 'YYYY-MM-DD'));

  insert into public.seasons (id, club_id, nombre, activa)
  values (p_season_id, p_club_id, coalesce(nullif(p_temporada, ''), '2026-27'), true);

  -- La identidad es la de la sesion. `p_nombre_usuario` y `p_email` si son
  -- datos que escribe la persona, y son legitimos: no es lo mismo decidir
  -- QUIEN eres que decidir COMO te llamas.
  insert into public.profiles (id, club_id, nombre, email, creado)
  values (public.uid_t(), p_club_id, p_nombre_usuario, lower(p_email),
          to_char(now(), 'YYYY-MM-DD'));

  insert into public.club_members (id, club_id, user_id, rol)
  values (p_club_id || ':' || public.uid_t() || ':junta',
          p_club_id, public.uid_t(), 'junta');

  /* Las categorias, sin columna cuota: se retiro con los pagos. Sin esto el
     club quedaba vacio en la nube. */
  if p_categorias is not null and jsonb_typeof(p_categorias) = 'array'
     and jsonb_array_length(p_categorias) > 0 then
    for v_cat in select * from jsonb_array_elements(p_categorias)
    loop
      v_n := coalesce(nullif(v_cat->>'n', ''), 'Categoria');
      v_i := v_i + 1;
      insert into public.categories (id, club_id, nombre, orden)
      values (p_club_id || ':cat:' || v_i, p_club_id, v_n, v_i);
    end loop;
  else
    insert into public.categories (id, club_id, nombre, orden)
    values (p_club_id || ':cat:1', p_club_id, 'General', 1);
  end if;

  insert into public.invites (code, club_id, rol, usos, max, caduca, nota, creado)
  values (upper(p_family_code), p_club_id, 'familia', 0, null, null,
          'Código general para familias', to_char(now(), 'YYYY-MM-DD'));

  return jsonb_build_object('ok', true, 'club_id', p_club_id, 'rol', 'junta');
end;
$$;

grant execute on function public.found_club(text, text, text, text, text, text,
  text, text, jsonb, text, text) to authenticated;