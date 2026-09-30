-- ============================================================================
--  006 · Sincronización y permisos
-- ============================================================================
--  Corrige tres cosas que fallen juntas:
--
--  1. La app escribía columnas que en SQL no existen. `audit_log` se llama
--     `user_id` y la app mandaba `user`; `season_history` no tenía
--     `por_jugador`. PostgREST rechaza el LOTE ENTERO con PGRST204, así que
--     `pendientes` se quedaba en true para siempre: la bitácora y el archivo
--     de temporadas no llegaban nunca al servidor.
--
--  2. Varias políticas daban al servidor más permisos que a la aplicación.
--     RLS existe justo para el caso de que alguien llame a la API a mano, así
--     que lo que la app esconde, el servidor también lo tiene que esconder.
--
--  3. `guard_member_write` concedía el rol de jugador en cualquier club.
-- ============================================================================


-- ---------------------------------------------------------------------------
--  1. season_history: columnas del archivo de temporada
-- ---------------------------------------------------------------------------
--  `por_jugador` y `facturas` guardan el detalle con el que se cerró la
--  temporada. Sin estas columnas, cerrar la temporada en la nube fallaba.
alter table public.season_history
  add column if not exists por_jugador jsonb,
  add column if not exists facturas     jsonb;


-- ---------------------------------------------------------------------------
--  2. players_delete: solo la junta
-- ---------------------------------------------------------------------------
--  La app esconde "Dar de baja" a los entrenadores, pero la política usaba
--  can_write_player, que es verdadera para cualquier entrenador sobre los
--  jugadores de sus equipos. Y una baja no es una edición: borra expediente,
--  inscripciones, vínculos, RSVP, notas y firmas de golpe. El resto de las
--  políticas separa lectura (can_read_player) de escritura (can_write_player);
--  aquí se usaba la de escritura para algo peor.
drop policy if exists players_delete on public.players;
create policy players_delete on public.players for delete
  using (public.is_junta(club_id));


-- ---------------------------------------------------------------------------
--  3. notifications_insert: solo quien puede avisar
-- ---------------------------------------------------------------------------
--  Con la política anterior, CUALQUIER miembro (incluso una familia) podía
--  insertar desde la consola un aviso dirigido a cualquier user_id de su club,
--  con título y cuerpo libres: es decir, suplantar a la junta o al entrenador
--  haciendo pasar su aviso por oficial.
drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications for insert
  with check (club_id in (select public.my_club_ids())
              and public.is_staff(club_id));


-- ---------------------------------------------------------------------------
--  4. audit_insert: solo la junta, y la identidad sale de la sesión
-- ---------------------------------------------------------------------------
--  Antes cualquier miembro podía forjar entradas de la bitácora con `accion`
--  y `meta` libres, y atribuirlas a quien quisiera. La bitácora solo la lee la
--  junta, así que un jugador podía "dejar constancia" de algo que no hizo.
drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log for insert
  with check (club_id in (select public.my_club_ids())
              and public.is_staff(club_id)
              and (user_id is null or user_id = public.uid_t()));


-- ---------------------------------------------------------------------------
--  5. evaluations_insert y goals_insert: leer y escribir el mismo alcance
-- ---------------------------------------------------------------------------
--  SELECT exigía que el jugador fuera de los del técnico, pero INSERT solo
--  pedía ser staff: un entrenador no podía LEER las valoraciones de otro
--  equipo pero sí ESCRIBIRLAS. Se añade el mismo filtro al INSERT.
drop policy if exists evaluations_insert on public.evaluations;
create policy evaluations_insert on public.evaluations for insert
  with check (public.is_staff(club_id)
              and autor = public.uid_t()
              and player_id in (select public.my_player_ids(club_id)));

drop policy if exists goals_insert on public.goals;
create policy goals_insert on public.goals for insert
  with check (public.is_staff(club_id)
              and por = public.uid_t()
              and player_id in (select public.my_player_ids(club_id)));


-- ---------------------------------------------------------------------------
--  6. profiles_update_self: el correo solo lo cambia la junta
-- ---------------------------------------------------------------------------
--  Hay un índice único sobre lower(email). Si cualquiera puede cambiar el
--  suyo, alguien puede ocupar el correo de otra persona: esa persona deja de
--  poder escribir su perfil, y su upsert falla en cada sincronización. Es un
--  cierre de puerta sin llave para el dueño de la dirección.
--
--  Para comparar el correo nuevo con el que hay guardado hace falta LEER la
--  fila anterior, y hacer ese select dentro de la propia política de
--  `profiles` entraría en recursión (42P17). Se hace con una función aparte:
--  es security definer y la tabla no tiene force row level security, así que
--  lee saltándose el RLS.
create or replace function public.email_actual(p_id text)
returns text language sql stable security definer set search_path = public as $$
  select p.email from public.profiles p where p.id = p_id;
$$;

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update
  using (id = public.uid_t() or public.is_junta(club_id))
  with check (
    (id = public.uid_t() or public.is_junta(club_id))
    and ( public.is_junta(club_id)
          or lower(coalesce(email, ''))
             = lower(coalesce(public.email_actual(id), '')) )
  );


-- ---------------------------------------------------------------------------
--  7. notes_delete: la junta no borra lo que no puede leer
-- ---------------------------------------------------------------------------
--  notes_select es `using (autor = uid_t())`: las notas son privadas del autor,
--  ni la junta las ve. Que la junta pudiera borrarlas era incoherente con esa
--  intención, y ademas era la única vía de la app para deshacer una nota.
drop policy if exists notes_delete on public.notes;
create policy notes_delete on public.notes for delete
  using (autor = public.uid_t() or public.is_junta(club_id));


-- ---------------------------------------------------------------------------
--  8. guard_member_write: la ficha debe ser DE ESTE club
-- ---------------------------------------------------------------------------
--  El `exists` no miraba el club. Ser dueño de una ficha en el club A bastaba
--  para insertarse a sí mismo como 'jugador' en el club B, sin código, y con
--  eso se colaba en my_club_ids().
create or replace function public.guard_member_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
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
      -- ficha de otro club servía para entrar en este.
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
--  9. consume_invite: no quemar el código, y distinguir clubes
-- ---------------------------------------------------------------------------
--  Dos fallos en el mismo sitio:
--
--  a) La clave primaria era 'usuario:rol', sin el club. La misma persona no
--     podía canjear el mismo rol en dos clubes distintos.
--  b) El `usos = usos + 1` iba ANTES del insert, que además era
--     `on conflict do nothing`: si el canje no insertaba nada, el uso se
--     consumía igual y el canje fallaba sin avisar. Bastaba con reintentar
--     para agotar el código.
create or replace function public.consume_invite(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.invites%rowtype;
  v_club text;
  v_insertadas integer := 0;
begin
  if public.uid_t() = '' then
    return jsonb_build_object('ok', false, 'error', 'Inicia sesión primero');
  end if;

  select * into v from public.invites where code = upper(btrim(p_code))
    for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Ese código no existe');
  end if;

  if v.caduca is not null and v.caduca < to_char(now(), 'YYYY-MM-DD') then
    return jsonb_build_object('ok', false, 'error', 'Ese código ha caducado');
  end if;

  if v.max is not null and v.usos >= v.max then
    return jsonb_build_object('ok', false, 'error', 'Ese código ya se ha utilizado');
  end if;

  v_club := v.club_id;

  -- El club va en la clave: sin él, canjear el mismo rol en dos clubes
  -- chocaba con la fila del primero.
  insert into public.invite_redemptions (id, club_id, user_id, rol, code)
  values (public.uid_t() || ':' || v_club || ':' || v.rol, v_club,
          public.uid_t(), v.rol, v.code)
  on conflict do nothing;

  get diagnostics v_insertadas = row_count;

  -- El uso se consume SOLO si el canje se grabó de verdad. Antes se gastaba
  -- siempre, y un reintento fallido agotaba el código.
  if v_insertadas = 1 then
    update public.invites set usos = usos + 1 where code = v.code;
  end if;

  return jsonb_build_object('ok', true, 'rol', v.rol, 'team_id', v.team_id,
                            'club_id', v_club);
end;
$$;


-- ---------------------------------------------------------------------------
--  10. found_club: la junta es quien funda, no el parámetro
-- ---------------------------------------------------------------------------
--  p_user_id venía del cliente: quien fundaba el club decidía a quién dejaba
--  de junta, y podía quedarse él mismo fuera. Ahora la identidad sale de la
--  sesión.
--
--  La firma y el cuerpo son los de 20260101000300_fix_found_club.sql, NO los
--  de init.sql: la 003 los cambio (y es la que crea las categorias). Redefinir
--  aqui con los parametros de init.sql deshacia su arreglo.
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
  -- Se compara contra la SESION, no contra el parametro: si no, el parametro
  -- decidia quien es la junta directiva del club recien fundado.
  if exists (select 1 from public.club_members
              where club_id = p_club_id and user_id = public.uid_t()) then
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
