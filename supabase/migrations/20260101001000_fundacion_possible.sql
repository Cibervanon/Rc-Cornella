-- ============================================================================
--  010 · Que se pueda fundar el club (el bloqueo que lo hacia imposible)
-- ============================================================================
--  EL PROBLEMA QUE REPORTABA LA APP: al darle a "Crear el club" salia
--  "Ese rol requiere un código de acceso válido".
--
--  Loyun trigger, trg_guard_member, protege la tabla club_members:
--
--    1. Si quien inserta YA es junta del club, puede dar de alta a quien quiera.
--    2. Si no, cada uno inserta su propia ficha y su rol tiene que tener un
--       codigo canjeado antes (invite_redemptions).
--
--  Al fundar, el fundador hace justo el caso 2: inserta su propia ficha con
--  rol 'junta'. Pero todavia no hay junta, asi que el caso 1 no aplica, y en el
--  2 le exigia un codigo de junta que NADIE le habia podido dar: no existia
--  junta que lo generara. Bucle cerrado: fundar era imposible. El codigo de
--  administracion (008) no lo desbloquea porque el bloqueo es de ROL, no de
--  fundacion.
--
--  LA SOLUCION: una excepcion minima y verificable. found_cluc deja una
--  bandera de transaccion (set_config, de ambito transaccion) con el id del
--  club que esta fundando, y el trigger la acepta SOLO para esa fila. Nadie
--  mas puede encenderla: poner un GUC propio no es algo que se pueda hacer
--  desde la API (no hay ninguna funcion que exponga set_config). Y se exige
--  ademas que la fila sea la primera del club, que el rol sea 'junta' y que
--  la ficha sea la del propio usuario. El resto de protecciones sigue igual.
--
--  No se afloja nada mas: el resto de inserts (jugador, familia, entrenador,
--  cambios de rol) siguen pasando por el codigo canjeado.
-- ============================================================================


-- ---------------------------------------------------------------------------
--  1. El trigger, con la excepcion de fundacion
-- ---------------------------------------------------------------------------
create or replace function public.guard_member_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- LA FUNDACION. Solo found_club enciende esta bandera, y solo para el club
  -- que esta creando en esa misma transaccion. Es el unico caso en el que el
  -- primer miembro nace como junta sin codigo canjeado, porque es el que esta
  -- creando el club: no hay nadie todavia a quien pedirselo.
  if new.rol = 'junta'
     and new.user_id = public.uid_t()
     and coalesce(current_setting('app.fundando_club', true), '') = new.club_id
     and not exists (select 1 from public.club_members m
                      where m.club_id = new.club_id) then
    return new;
  end if;

  -- La junta puede dar de alta a quien quiera.
  if public.is_junta(new.club_id) then
    return new;
  end if;

  -- Cada uno puede insertar su propia ficha, pero solo con un rol que le
  -- corresponda por un código que ya ha canjeado.
  if new.user_id = public.uid_t() then
    if new.rol = 'jugador' then
      -- El rol de jugador no se consigue con código: nace al vincular una
      -- ficha que ESTE club ya tenía. El club se compara porque sin esto una
      -- ficha de otro club serviría para entrar en este.
      if not exists (
            select 1 from public.players p
             where p.id is not null
               and p.user_id = public.uid_t()
               and p.club_id = new.club_id) then
        raise exception 'No tienes una ficha de jugador en este club';
      end if;
      return new;
    end if;

    if not exists (
          select 1 from public.invite_redemptions r
           where r.club_id = new.club_id
             and r.user_id = public.uid_t()
             and r.rol = new.rol) then
      raise exception 'Ese rol requiere un código de acceso válido';
    end if;
    return new;
  end if;

  raise exception 'No puedes modificar los permisos de otra persona';
end;
$$;


-- ---------------------------------------------------------------------------
--  2. found_club: encender la bandera al fundar
-- ---------------------------------------------------------------------------
--  Se enciende DESPUES de las comprobaciones (sesion, club vacio y codigo de
--  administracion) y ANTES de insertar nada, con ambito de transaccion: si la
--  fundacion falla, la bandera se cae con ella.
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

grant execute on function public.found_club(text, text, text, text, text, text,
  text, text, jsonb, text, text) to authenticated;