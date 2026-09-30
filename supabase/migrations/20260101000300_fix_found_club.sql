/* ============================================================================
   found_club: la firma no coincidia con la que llama la aplicacion.
   ----------------------------------------------------------------------------
   Que pasaba:
   La funcion se creo con los parametros
       p_club_nombre, p_user_nombre, p_season_nombre
   pero el navegador llama con
       p_nombre,      p_nombre_usuario, p_temporada, p_categorias
   Al no encajar ningun nombre, PostgREST contestaba
       "could not find the function public.found_club(p_categorias, p_ciudad,
        p_club_id, p_email, p_family_code, p_nombre, p_nombre_usuario,
        p_season_id, p_temporada, p_user_id) in the schema cache"
   y el club se quedaba a medias: la cuenta de Supabase Auth ya estaba creada,
   pero sin club ni rol de junta. Luego al entrar ponia "no tienes acceso a
   este club".

   Ademas la funcion anterior no creaba las categorias, que en local si se
   guardan. Un club fundado en la nube se quedaba sin categorias.

   Esta migracion va aparte a proposito: si 20260101000000_init.sql ya esta
   aplicada en el servidor, editarlo no vuelve a ejecutar nada.
   ========================================================================== */

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
  p_family_code     text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cat jsonb;
  v_i   integer := 0;
  v_n   text;
  v_c   double precision;
begin
  if public.uid_t() = '' then
    return jsonb_build_object('ok', false, 'error', 'Inicia sesión primero');
  end if;

  -- Quien organiza el club se queda como junta. Este es el punto que hacia
  -- fallar lo del acceso: el fundador tiene que entrar sin codigo.
  if exists (select 1 from public.club_members
              where club_id = p_club_id and user_id = p_user_id) then
    return jsonb_build_object('ok', true, 'club_id', p_club_id, 'rol', 'junta',
                              'ya_existia', true);
  end if;

  if not public.club_is_empty() then
    return jsonb_build_object('ok', false, 'error',
      'Este club ya está creado. Pide tu código de acceso a la junta.');
  end if;

  insert into public.clubs (id, nombre, deporte, ciudad, fundado, creado)
  values (p_club_id, p_nombre, 'Rugby', p_ciudad, 1931,
          to_char(now(), 'YYYY-MM-DD'));

  insert into public.seasons (id, club_id, nombre, activa)
  values (p_season_id, p_club_id, coalesce(nullif(p_temporada, ''), '2026-27'), true);

  insert into public.profiles (id, club_id, nombre, email, creado)
  values (p_user_id, p_club_id, p_nombre_usuario, lower(p_email),
          to_char(now(), 'YYYY-MM-DD'));

  insert into public.club_members (id, club_id, user_id, rol)
  values (p_club_id || ':' || p_user_id || ':junta', p_club_id, p_user_id, 'junta');

  /* Las categorias. Sin esto el club quedaba vacio en la nube. */
  if p_categorias is not null and jsonb_typeof(p_categorias) = 'array'
     and jsonb_array_length(p_categorias) > 0 then
    for v_cat in select * from jsonb_array_elements(p_categorias)
    loop
      v_n := coalesce(nullif(v_cat->>'n', ''), 'Categoria');
      v_c := coalesce((v_cat->>'cuota')::double precision, 0);
      v_i := v_i + 1;
      insert into public.categories (id, club_id, nombre, orden, cuota)
      values (p_club_id || ':cat:' || v_i, p_club_id, v_n, v_i, v_c);
    end loop;
  else
    insert into public.categories (id, club_id, nombre, orden, cuota)
    values (p_club_id || ':cat:1', p_club_id, 'General', 1, 0);
  end if;

  insert into public.invites (code, club_id, rol, usos, max, caduca, nota, creado)
  values (upper(p_family_code), p_club_id, 'familia', 0, null, null,
          'Código general para familias', to_char(now(), 'YYYY-MM-DD'));

  return jsonb_build_object('ok', true, 'club_id', p_club_id, 'rol', 'junta');
end;
$$;

grant execute on function public.found_club(text, text, text, text, text,
  text, text, text, jsonb, text) to authenticated;