-- ============================================================================
--  008 · Código de administración para fundar el club
-- ============================================================================
--  Hasta ahora, CUALQUIER persona que instalara la app podia fundar el club
--  mientras la tabla estuviera vacia: era la unica puerta y no habia ninguna
--  comprobacion de que quien la cruza sea quien dice ser. El club se podia
--  ocupar antes de que lo creara la junta de verdad.
--
--  Ahora fundar exige un codigo de administracion. Es UNO para todo el club y
--  SOLO sirve para poder fundarlo: no da ningun rol, y es distinto de los
--  codigos de junta/entrenador/familia, que los crea la junta desde dentro.
--
--  El valor NO vive en esta migracion ni en la app: vive en la tabla
--  app_config, que solo pueden leer las funciones security definer. El
--  navegador nunca lo ve, y en el APK no hay forma de leerlo.
-- ============================================================================


-- ---------------------------------------------------------------------------
--  1. Tabla de configuracion sensible
-- ---------------------------------------------------------------------------
--  RLS habilitada SIN politicas: nadie la lee ni la escribe por su cuenta.
--  Las funciones security definer (creadas por postgres, sin force row level
--  security) si la leen: es el mismo patron que email_actual.
create table if not exists public.app_config (
  clave      text primary key,
  valor      text not null,
  updated_at timestamptz not null default now()
  );
alter table public.app_config enable row level security;


-- ---------------------------------------------------------------------------
--  2. found_club: exigir el codigo de administracion
-- ---------------------------------------------------------------------------
--  La firma es la de 20260101000300 + el parametro nuevo. Va con valor por
--  defecto a proposito: un cliente viejo que llame sin el parametro recibe un
--  error claro ("el codigo es obligatorio") en lugar de un fallo de firma.
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
  v_c   double precision;
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
  if coalesce(p_codigo_admin, '') = '' then
    return jsonb_build_object('ok', false, 'error',
      'Escribe el código de administración del club. Te lo da la junta '+
      'directiva en persona: es distinto del código de familias.');
  end if;
  if coalesce(p_codigo_admin, '') <> coalesce(
       (select c.valor from public.app_config c
         where c.clave = 'club_admin_code'), '') then
    return jsonb_build_object('ok', false, 'error',
      'El código de administración no es correcto');
  end if;

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
