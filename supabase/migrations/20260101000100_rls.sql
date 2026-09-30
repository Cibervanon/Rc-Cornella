-- ============================================================================
--  Rugby Club Cornellà — seguridad por filas (RLS) y reglas de alta
-- ============================================================================
--  Traduce a SQL la tabla de privacidad del README:
--
--    Dato              Entrenador    Familia      Jugador   Junta
--    Plantilla          su equipo     sus hijos    él        todo
--    Datos económicos   no            sus recibos  no        todo
--    Valoraciones       su equipo     compartidas  las suyas todas
--    Notas privadas     solo las suyas nunca      nunca     nunca
--
--  Además hay tres exits que no existían en localStorage y que aquí son
--  obligatorios:
--
--    * Un usuario sin sesión NO ve nada. Ni el club, ni las categorías.
--      Se navega por la API con la clave `anon`, así que sin RLS la base
--      sería pública. Todas las tablas la tienen activada.
--
--    * Un usuario AUTENTICADO pero sin membresía (el que acaba de entrar con
--      Google y todavía no ha gastado un código) no ve ningún dato del club.
--      Solo puede leer la ficha pública de estructura y canjear su código.
--
--    * Nadie se autoproclama junta. El trigger de club_members exige que el
--      rol salga de un código canjeado, salvo que quien lo escribe ya sea
--      junta.
-- ============================================================================

-- ---------------------------------------------------------------------------
--  Guardia de club_members: nadie se concede un rol que no le toque
-- ---------------------------------------------------------------------------
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
      -- ficha que el club ya tenía. Basta con ser su propietario.
      if not exists (
            select 1 from public.players p
             where p.id is not null and p.user_id = public.uid_t()) then
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

drop trigger if exists trg_guard_member on public.club_members;
create trigger trg_guard_member
  before insert or update on public.club_members
  for each row execute function public.guard_member_write();


-- ---------------------------------------------------------------------------
--  club_members: cada uno ve su club, pero solo la junta gestiona la lista
-- ---------------------------------------------------------------------------
alter table public.club_members enable row level security;

create policy club_members_select on public.club_members for select
  using (club_id in (select public.my_club_ids()));

create policy club_members_insert on public.club_members for insert
  with check (user_id = public.uid_t() or public.is_junta(club_id));

create policy club_members_update on public.club_members for update
  using (user_id = public.uid_t() or public.is_junta(club_id));

create policy club_members_delete on public.club_members for delete
  using (user_id = public.uid_t() or public.is_junta(club_id));


-- ---------------------------------------------------------------------------
--  Estructura pública: se puede leer sin sesión porque es lo que se muestra
--  en la pantalla de acceso (nombre del club, categorías y cuota).
-- ---------------------------------------------------------------------------
alter table public.clubs        enable row level security;
alter table public.seasons      enable row level security;
alter table public.categories   enable row level security;
alter table public.teams        enable row level security;
alter table public.documents    enable row level security;

create policy clubs_read on public.clubs for select using (true);
create policy seasons_read on public.seasons for select using (true);
create policy categories_read on public.categories for select using (true);
create policy teams_read on public.teams for select using (true);
create policy documents_read on public.documents for select using (true);

-- Fundar el club: solo mientras la tabla esté vacía. La escritura completa
-- la hace la función found_club().
create policy clubs_insert_first on public.clubs for insert
  with check ((select count(*) from public.clubs) = 0);

create policy seasons_write on public.seasons for all
  using (public.is_junta(club_id)) with check (public.is_junta(club_id));

-- Categorías y equipos: los configura la junta.
create policy categories_write on public.categories for all
  using (public.is_junta(club_id)) with check (public.is_junta(club_id));

create policy teams_write on public.teams for all
  using (public.is_junta(club_id)) with check (public.is_junta(club_id));

-- La documentación del club la puede mantener también el cuerpo técnico.
create policy documents_write on public.documents for all
  using (public.is_staff(club_id)) with check (public.is_staff(club_id));


-- ---------------------------------------------------------------------------
--  Personas
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy profiles_select on public.profiles for select
  using (id = public.uid_t() or public.is_junta(club_id));

-- Alta: cada uno crea su propia ficha al registrarse. La sobreescritura de
-- nombre/teléfono también es suya, pero el email solo lo cambia la junta,
-- porque es la identidad con la que entra.
create policy profiles_insert on public.profiles for insert
  with check (id = public.uid_t());

create policy profiles_update_self on public.profiles for update
  using (id = public.uid_t() or public.is_junta(club_id))
  with check (id = public.uid_t() or public.is_junta(club_id));


alter table public.guardians enable row level security;

create policy guardians_select on public.guardians for select
  using (public.is_junta(club_id) or user_id = public.uid_t());

create policy guardians_insert on public.guardians for insert
  with check (user_id = public.uid_t() or public.is_junta(club_id));

create policy guardians_update on public.guardians for update
  using (user_id = public.uid_t() or public.is_junta(club_id))
  with check (user_id = public.uid_t() or public.is_junta(club_id));

create policy guardians_delete on public.guardians for delete
  using (public.is_junta(club_id));


alter table public.players enable row level security;

create policy players_select on public.players for select
  using (public.can_read_player(club_id, id));

create policy players_insert on public.players for insert
  with check (
    -- El jugador crea su propia ficha (se hace al vincular la cuenta).
    user_id = public.uid_t()
    -- Un tutor da de alta a su hijo.
    or exists (select 1 from public.guardian_links l
                where l.player_id = players.id
                  and l.guardian_id in (select public.my_guardian_ids(players.club_id)))
    -- La junta da de alta a quien quiera.
    or public.is_junta(club_id)
    -- El cuerpo técnico da de alta desde su categoría.
    or public.is_tecnico(club_id));

create policy players_update on public.players for update
  using (public.can_write_player(club_id, id))
  with check (public.can_write_player(club_id, id));

create policy players_delete on public.players for delete
  using (public.is_junta(club_id) or public.can_write_player(club_id, id));


alter table public.guardian_links enable row level security;

create policy links_select on public.guardian_links for select
  using (public.can_read_player(club_id, player_id));

create policy links_insert on public.guardian_links for insert
  with check (
    public.is_junta(club_id)
    or guardian_id in (select public.my_guardian_ids(club_id)));

create policy links_delete on public.guardian_links for delete
  using (
    public.is_junta(club_id)
    or guardian_id in (select public.my_guardian_ids(club_id)));


alter table public.enrollments enable row level security;

create policy enrollments_select on public.enrollments for select
  using (public.can_read_player(club_id, player_id)
         or (public.is_tecnico(club_id)
             and team_id in (select public.my_team_ids(club_id))));

create policy enrollments_insert on public.enrollments for insert
  with check (
    public.is_junta(club_id)
    or public.is_tecnico(club_id)
    or public.can_write_player(club_id, player_id));

create policy enrollments_update on public.enrollments for update
  using (
    public.is_junta(club_id)
    or public.is_tecnico(club_id)
    or public.can_write_player(club_id, player_id))
  with check (
    public.is_junta(club_id)
    or public.is_tecnico(club_id)
    or public.can_write_player(club_id, player_id));

create policy enrollments_delete on public.enrollments for delete
  using (public.is_junta(club_id) or public.can_write_player(club_id, player_id));


alter table public.staff enable row level security;

-- El equipo técnico ve su propio registro; una familia ve al entrenador de
-- la categoría de su hijo, porque la app le enseña quién entrena a su hijo.
create policy staff_select on public.staff for select
  using (
    public.is_junta(staff.club_id)
    or staff.user_id = public.uid_t()
    or staff.team_id in (
      select e.team_id from public.enrollments e
        join public.guardian_links l on l.player_id = e.player_id
       where e.baja is null
         and l.guardian_id in (select public.my_guardian_ids(staff.club_id))));

create policy staff_write on public.staff for all
  using (public.is_junta(club_id)) with check (public.is_junta(club_id));


alter table public.certs enable row level security;

create policy certs_select on public.certs for select
  using (user_id = public.uid_t() or public.is_junta(club_id));
create policy certs_write on public.certs for all
  using (user_id = public.uid_t() or public.is_junta(club_id))
  with check (user_id = public.uid_t() or public.is_junta(club_id));


-- ---------------------------------------------------------------------------
--  Agenda
-- ---------------------------------------------------------------------------
alter table public.events enable row level security;

create policy events_select on public.events for select
  using (club_id in (select public.my_club_ids()));

create policy events_insert on public.events for insert
  with check (public.owns_event(club_id, team_id));
create policy events_update on public.events for update
  using (public.owns_event(club_id, team_id))
  with check (public.owns_event(club_id, team_id));
create policy events_delete on public.events for delete
  using (public.owns_event(club_id, team_id));


alter table public.rsvp enable row level security;

create policy rsvp_select on public.rsvp for select
  using (public.can_read_player(club_id, player_id));

create policy rsvp_insert on public.rsvp for insert
  with check (public.can_write_player(club_id, player_id));
create policy rsvp_update on public.rsvp for update
  using (public.can_write_player(club_id, player_id))
  with check (public.can_write_player(club_id, player_id));
create policy rsvp_delete on public.rsvp for delete
  using (public.is_staff(club_id) or public.can_write_player(club_id, player_id));


alter table public.callups enable row level security;
alter table public.attendance enable row level security;

create policy callups_select on public.callups for select
  using (public.can_read_player(club_id, player_id)
         or public.owns_event(club_id, (select e.team_id from public.events e
                                         where e.id = callups.event_id)));
create policy callups_write on public.callups for all
  using (public.owns_event(club_id, (select e.team_id from public.events e
                                      where e.id = callups.event_id)))
  with check (public.owns_event(club_id, (select e.team_id from public.events e
                                           where e.id = callups.event_id)));

create policy attendance_select on public.attendance for select
  using (public.can_read_player(club_id, player_id)
         or public.owns_event(club_id, (select e.team_id from public.events e
                                         where e.id = attendance.event_id)));
create policy attendance_write on public.attendance for all
  using (public.owns_event(club_id, (select e.team_id from public.events e
                                      where e.id = attendance.event_id)))
  with check (public.owns_event(club_id, (select e.team_id from public.events e
                                           where e.id = attendance.event_id)));


alter table public.matches enable row level security;

create policy matches_select on public.matches for select
  using (
    public.owns_event(club_id, team_id)
    or exists (
      select 1 from public.enrollments e
        join public.players p on p.id = e.player_id
       where e.team_id = matches.team_id and e.baja is null
         and ( p.user_id = public.uid_t()
               or exists (select 1 from public.guardian_links l
                           where l.player_id = e.player_id
                             and l.guardian_id in (
                               select public.my_guardian_ids(matches.club_id))) )));

create policy matches_write on public.matches for all
  using (public.owns_event(club_id, team_id))
  with check (public.owns_event(club_id, team_id));


-- ---------------------------------------------------------------------------
--  Entrenamiento y seguimiento
-- ---------------------------------------------------------------------------
alter table public.drills enable row level security;
alter table public.sessions enable row level security;
alter table public.session_drills enable row level security;
alter table public.pruebas enable row level security;

create policy drills_read on public.drills for select
  using (club_id in (select public.my_club_ids()));
create policy drills_write on public.drills for all
  using (public.is_staff(club_id)) with check (public.is_staff(club_id));

create policy sessions_read on public.sessions for select
  using (club_id in (select public.my_club_ids()));
create policy sessions_write on public.sessions for all
  using (public.owns_event(club_id, team_id))
  with check (public.owns_event(club_id, team_id));

create policy session_drills_read on public.session_drills for select
  using (club_id in (select public.my_club_ids()));
create policy session_drills_write on public.session_drills for all
  using (public.is_staff(club_id)) with check (public.is_staff(club_id));

-- Catálogo de pruebas físicas: lo mantiene la junta y el cuerpo técnico,
-- y todos los miembros lo leen porque aparece en la ficha del jugador.
create policy pruebas_read on public.pruebas for select
  using (club_id in (select public.my_club_ids()));
create policy pruebas_write on public.pruebas for all
  using (public.is_staff(club_id)) with check (public.is_staff(club_id));


alter table public.evaluations enable row level security;

-- El cuerpo técnico ve todas las de su plantilla. La familia y el jugador
-- solo ven las compartidas, y solo de quien les corresponde.
create policy evaluations_select on public.evaluations for select
  using (
    (public.is_staff(club_id)
      and (public.is_junta(club_id) or player_id in (
             select public.my_player_ids(club_id))))
    or (compartida and public.can_read_player(club_id, player_id)));

create policy evaluations_insert on public.evaluations for insert
  with check (public.is_staff(club_id) and autor = public.uid_t());

create policy evaluations_update on public.evaluations for update
  using (autor = public.uid_t() or public.is_junta(club_id))
  with check (autor = public.uid_t() or public.is_junta(club_id));

create policy evaluations_delete on public.evaluations for delete
  using (autor = public.uid_t() or public.is_junta(club_id));


-- Notas privadas: ni la junta las ve. Solo su autor.
alter table public.notes enable row level security;

create policy notes_select on public.notes for select
  using (autor = public.uid_t());
create policy notes_insert on public.notes for insert
  with check (autor = public.uid_t() and public.is_tecnico(club_id));
create policy notes_update on public.notes for update
  using (autor = public.uid_t()) with check (autor = public.uid_t());
create policy notes_delete on public.notes for delete
  using (autor = public.uid_t() or public.is_junta(club_id));


alter table public.injuries enable row level security;
alter table public.goals enable row level security;

create policy injuries_select on public.injuries for select
  using (public.can_read_player(club_id, player_id)
         or (public.is_tecnico(club_id) and player_id in (
               select public.my_player_ids(club_id))));
create policy injuries_write on public.injuries for all
  using (public.is_junta(club_id)
         or (public.is_tecnico(club_id) and player_id in (
               select public.my_player_ids(club_id))))
  with check (public.is_junta(club_id)
         or (public.is_tecnico(club_id) and player_id in (
               select public.my_player_ids(club_id))));

create policy goals_select on public.goals for select
  using (public.can_read_player(club_id, player_id));
create policy goals_insert on public.goals for insert
  with check (public.is_staff(club_id) and por = public.uid_t());
create policy goals_update on public.goals for update
  using (por = public.uid_t() or public.is_junta(club_id))
  with check (por = public.uid_t() or public.is_junta(club_id));
create policy goals_delete on public.goals for delete
  using (por = public.uid_t() or public.is_junta(club_id));


-- ---------------------------------------------------------------------------
--  Comunicación
-- ---------------------------------------------------------------------------
alter table public.posts enable row level security;
alter table public.tasks enable row level security;
alter table public.post_reads enable row level security;
alter table public.notifications enable row level security;

create policy posts_read on public.posts for select
  using (club_id in (select public.my_club_ids()));
create policy posts_write on public.posts for all
  using (public.is_staff(club_id)) with check (public.is_staff(club_id));

create policy tasks_read on public.tasks for select
  using (club_id in (select public.my_club_ids()));
create policy tasks_write on public.tasks for all
  using (public.is_staff(club_id)) with check (public.is_staff(club_id));

create policy post_reads_own on public.post_reads for all
  using (user_id = public.uid_t()) with check (user_id = public.uid_t());

-- Cada quien ve solo las suyas. Cualquier miembro puede avisar a otro
-- (es lo que hace el entrenador al crear un evento o recordar una falta).
create policy notifications_select on public.notifications for select
  using (user_id = public.uid_t());
create policy notifications_insert on public.notifications for insert
  with check (club_id in (select public.my_club_ids()));
create policy notifications_update on public.notifications for update
  using (user_id = public.uid_t()) with check (user_id = public.uid_t());
create policy notifications_delete on public.notifications for delete
  using (user_id = public.uid_t());


-- ---------------------------------------------------------------------------
--  Económico: la parte que el entrenador no puede ver
-- ---------------------------------------------------------------------------
alter table public.invoices enable row level security;
alter table public.mandates enable row level security;

create policy invoices_select on public.invoices for select
  using (public.is_junta(club_id) or public.can_read_player(club_id, player_id));

create policy invoices_write on public.invoices for all
  using (public.is_junta(club_id)) with check (public.is_junta(club_id));

-- El IBAN se guarda ya enmascarado desde la app; aquí además se exige que
-- quien lo escribe sea el propio tutor o la junta.
create policy mandates_select on public.mandates for select
  using (public.is_junta(club_id)
         or guardian_id in (select public.my_guardian_ids(club_id)));

create policy mandates_write on public.mandates for all
  using (public.is_junta(club_id)
         or guardian_id in (select public.my_guardian_ids(club_id)))
  with check (public.is_junta(club_id)
         or guardian_id in (select public.my_guardian_ids(club_id)));


alter table public.signatures enable row level security;

create policy signatures_select on public.signatures for select
  using (public.can_read_player(club_id, player_id));
create policy signatures_insert on public.signatures for insert
  with check (public.can_write_player(club_id, player_id));
create policy signatures_delete on public.signatures for delete
  using (public.is_junta(club_id) or public.can_write_player(club_id, player_id));


-- ---------------------------------------------------------------------------
--  Historial y auditoría
-- ---------------------------------------------------------------------------
alter table public.season_history enable row level security;
alter table public.audit_log enable row level security;

create policy history_read on public.season_history for select
  using (club_id in (select public.my_club_ids()));
create policy history_write on public.season_history for all
  using (public.is_junta(club_id)) with check (public.is_junta(club_id));

-- La bitácora la escribe la app en cada acción y solo la lee la junta.
create policy audit_read on public.audit_log for select
  using (public.is_junta(club_id));
create policy audit_insert on public.audit_log for insert
  with check (club_id in (select public.my_club_ids()));


-- ---------------------------------------------------------------------------
--  invite_redemptions: sin acceso directo. Solo la escriben las funciones.
-- ---------------------------------------------------------------------------
alter table public.invite_redemptions enable row level security;

drop policy if exists invite_redemptions_all on public.invite_redemptions;
create policy invite_redemptions_all on public.invite_redemptions for all
  using (false) with check (false);


-- ---------------------------------------------------------------------------
--  invites: la tabla de códigos es secreta. Solo la junta la ve.
--  Para el resto está la función redeem_invite().
-- ---------------------------------------------------------------------------
alter table public.invites enable row level security;

create policy invites_junta on public.invites for all
  using (public.is_junta(club_id))
  with check (public.is_junta(club_id));


-- ---------------------------------------------------------------------------
--  Comprobación de arranque
-- ---------------------------------------------------------------------------
--  Devuelve 'ok' si se ha aplicado todo. Pégalo en el editor SQL de Supabase
--  para verificar que la instalación está correcta.
create or replace function public.health_check()
returns jsonb language sql stable as $$
select jsonb_build_object(
  'tablas', (
    select count(*) from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'),
  'funciones_seguridad', (
    select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in
       ('has_role','is_junta','is_tecnico','is_staff','my_team_ids',
        'my_guardian_ids','my_player_ids','can_read_player','can_write_player',
        'owns_event','redeem_invite','consume_invite','found_club','health_check')),
  'tablas_sin_rls', (
    select coalesce(array_agg(c.relname), '{}')
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and c.relrowsecurity = false),
  'club_creado', (select count(*) from public.clubs) > 0
);
$$;
