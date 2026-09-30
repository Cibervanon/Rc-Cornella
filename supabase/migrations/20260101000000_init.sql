-- ============================================================================
--  Rugby Club Cornellà — esquema, seguridad y códigos de acceso
-- ============================================================================
--  CÓMO PIENSA ESTE ESQUEMA
--
--  La aplicación (js/store.js) es la dueña del modelo de negocio: calcula
--  assistance, clasificaciones, descuentos y minutos. PostgreSQL aquí es un
--  almacén de documentos sincronizado, y la frontera de seguridad son las
--  políticas RLS.
--
--  Dos decisiones deliberadas que conviene no "arreglar" sin pensarlo:
--
--  1. Las fechas y horas son TEXT, no timestamptz. La app produce cadenas
--     naive desde <input type="datetime-local"> y las interpreta con
--     new Date(...) en la zona del navegador. Si las guardáramos como
--     timestamptz, Postgres las leería en UTC y desplazaría todos los
--     horarios del club. Guardar el texto tal cual mantiene el
--     comportamiento idéntico en cualquierhuso horario.
--
--  2. Los identificadores son TEXT y conservan el prefijo que genera la app
--     ('u_...', 'cat_...', 'p_...'). No hay conversiones de ida y vuelta, así
--     que una fila nunca puede quedar descolgada de su versión en memoria.
--
--  3. Las estructuras anidadas (marcas, titulares, acciones, metadatos de
--     auditoría) son JSONB. La app las lee y escribe como objetos sueltos;
--     normalizarlas obligaría a reescribir la lógica de partido.
--
--  4. `updated_at` sí es timestamptz real: lo usa el servidor para detectar
--     cambios, nunca la app.
-- ============================================================================

-- ---------------------------------------------------------------------------
--  Utilidades comunes a todas las políticas
-- ---------------------------------------------------------------------------

-- Identidad del llamante, como texto, para poder compararla con columnas text.
create or replace function public.uid_t()
returns text language sql stable as $$
  select coalesce(auth.uid()::text, '');
$$;

-- Marca temporal que gestiona el servidor.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- ===========================================================================
--  1. CLUB, TEMPORADA Y PERSONAS
-- ===========================================================================

create table if not exists public.clubs (
  id          text primary key,
  nombre      text not null,
  deporte     text,
  ciudad      text,
  fundado     integer,
  creado      text,
  updated_at  timestamptz not null default now()
);

create table if not exists public.seasons (
  id          text primary key,
  club_id     text not null default '',
  nombre      text,
  activa      boolean default true,
  updated_at  timestamptz not null default now()
);

-- Sustituye a la colección `users`. El identificador es el UUID de Supabase
-- Auth (en modo local sigue siendo el 'u_...' que genera la app).
create table if not exists public.profiles (
  id          text primary key,
  club_id     text not null default '',
  nombre      text,
  email       text,
  tel         text,
  creado      text,
  updated_at  timestamptz not null default now()
);
create unique index if not exists profiles_email_key
  on public.profiles (lower(email)) where email is not null and email <> '';

-- Sustituye a la colección `members`. Una fila por (club, persona, rol).
create table if not exists public.club_members (
  id          text primary key,
  club_id     text not null default '',
  user_id     text not null,
  rol         text not null check (rol in ('junta','entrenador','coordinador','familia','jugador')),
  updated_at  timestamptz not null default now()
);
create index if not exists club_members_user on public.club_members (user_id);
create index if not exists club_members_club on public.club_members (club_id);

-- Registro de canjes: prueba de que un código se gastó legítimamente.
-- Solo escribe la función consume_invite(); RLS no permite acceso directo.
create table if not exists public.invite_redemptions (
  id          text primary key,
  club_id     text not null,
  user_id     text not null,
  rol         text not null,
  code        text not null,
  redimido   timestamptz not null default now()
);
create index if not exists invite_redemptions_user
  on public.invite_redemptions (club_id, user_id, rol);


-- ===========================================================================
--  2. ESTRUCTURA DEL CLUB
-- ===========================================================================

create table if not exists public.invites (
  code        text primary key,
  club_id     text not null default '',
  rol         text not null check (rol in ('entrenador','coordinador','familia')),
  usos        integer not null default 0,
  max         integer,                 -- null = ilimitado
  caduca      text,                    -- null = no caduca
  creado_por  text,
  nota        text,
  team_id     text,
  creado      text,
  email       text,                    -- a quién se envía el código
  updated_at  timestamptz not null default now()
);

create table if not exists public.categories (
  id          text primary key,
  club_id     text not null default '',
  nombre      text,
  orden       integer,
  cuota       double precision,
  updated_at  timestamptz not null default now()
);

create table if not exists public.teams (
  id          text primary key,
  club_id     text not null default '',
  cat_id      text,
  nombre      text,
  nivel       text,
  updated_at  timestamptz not null default now()
);

create table if not exists public.staff (
  id          text primary key,
  club_id     text not null default '',
  team_id     text,
  user_id     text,
  cargo       text,
  updated_at  timestamptz not null default now()
);


-- ===========================================================================
--  3. PERSONAS
-- ===========================================================================

create table if not exists public.players (
  id            text primary key,
  club_id       text not null default '',
  nombre        text,
  fecha_nac     text,
  talla         text,
  posicion      text,
  posiciones    text[],
  alergias      text,
  notas_medicas text,
  peso          double precision,
  altura        double precision,
  pie           text,
  dorsal        text,
  marcas        jsonb not null default '{}'::jsonb,
  activo        boolean default true,
  alta          text,
  user_id       text,               -- cuenta propia del jugador
  updated_at    timestamptz not null default now()
);

create table if not exists public.guardians (
  id          text primary key,
  club_id     text not null default '',
  user_id     text,
  nombre      text,
  email       text,
  tel         text,
  updated_at  timestamptz not null default now()
);

create table if not exists public.guardian_links (
  id          text primary key,      -- player_id || ':' || guardian_id
  club_id     text not null default '',
  player_id   text not null,
  guardian_id text not null,
  principal   boolean default false,
  updated_at  timestamptz not null default now()
);

create table if not exists public.enrollments (
  id          text primary key,
  club_id     text not null default '',
  player_id   text,
  team_id     text,
  cuota       double precision,
  descuento   double precision,
  alta        text,
  baja        text,
  updated_at  timestamptz not null default now()
);

create table if not exists public.certs (
  id          text primary key,
  club_id     text not null default '',
  user_id     text,
  nombre      text,
  tipo        text,
  estado      text,
  formacion   boolean default false,
  revisar     boolean default false,
  updated_at  timestamptz not null default now()
);


-- ===========================================================================
--  4. AGENDA: EVENTOS, RSVP, CONVOCATORIA, ASISTENCIA, PARTIDO
-- ===========================================================================

create table if not exists public.events (
  id             text primary key,
  club_id        text not null default '',
  team_id        text,
  tipo           text,
  titulo         text,
  rival          text,
  local          text,
  lugar          text,
  inicio         text,
  convocatoria   text,
  notas          text,
  rsvp_abierto   boolean default true,
  creado_por     text,
  updated_at     timestamptz not null default now()
);

create table if not exists public.rsvp (
  id            text primary key,
  club_id       text not null default '',
  event_id      text,
  player_id     text,
  estado        text,               -- si | no | duda | sin_responder
  recordatorios integer default 0,
  motivo        text,
  at            text,
  by            text,
  updated_at    timestamptz not null default now()
);

create table if not exists public.callups (
  id          text primary key,
  club_id     text not null default '',
  event_id    text,
  player_id   text,
  updated_at  timestamptz not null default now()
);

create table if not exists public.attendance (
  id          text primary key,
  club_id     text not null default '',
  event_id    text,
  player_id   text,
  estado      text,                 -- presente | tarde | justificado | ausente
  by          text,
  at          text,
  updated_at  timestamptz not null default now()
);

create table if not exists public.matches (
  id             text primary key,
  club_id        text not null default '',
  event_id       text,
  team_id        text,
  formacion      integer,
  titulares      jsonb not null default '{}'::jsonb,   -- { posId: playerId }
  banquillo      jsonb not null default '[]'::jsonb,   -- [ playerId ]
  acciones       jsonb not null default '[]'::jsonb,
  estado         text,                -- previo | jugando | descanso | pausa | final
  parte          integer default 1,
  minuto         integer default 0,
  arrancado      bigint,
  puntos_favor   integer default 0,
  puntos_contra  integer default 0,
  duracion_parte integer,
  updated_at     timestamptz not null default now()
);


-- ===========================================================================
--  5. ENTRENAMIENTO Y SEGUIMIENTO DEL DEPORTISTA
-- ===========================================================================

create table if not exists public.drills (
  id          text primary key,
  club_id     text not null default '',
  nombre      text,
  tipo        text,
  min         integer,
  objetivo    text,
  descripcion text,                 -- la app lo llama `desc`, que es palabra
  material    text,                 -- reservada en SQL: se traduce al sincronizar
  base        boolean default false,
  updated_at  timestamptz not null default now()
);

create table if not exists public.sessions (
  id          text primary key,
  club_id     text not null default '',
  team_id     text,
  titulo      text,
  objetivo    text,
  fecha       text,
  creado_por  text,
  updated_at  timestamptz not null default now()
);

create table if not exists public.session_drills (
  id          text primary key,
  club_id     text not null default '',
  session_id  text,
  drill_id    text,
  orden       integer,
  updated_at  timestamptz not null default now()
);

-- Catálogo de pruebas físicas, editable por el club.
create table if not exists public.pruebas (
  id           text primary key,
  club_id      text not null default '',
  t            text,
  u            text,
  menorMejor   boolean default false,
  orden        integer,
  propia       boolean default false,
  updated_at   timestamptz not null default now()
);

create table if not exists public.evaluations (
  id          text primary key,
  club_id     text not null default '',
  player_id   text,
  periodo     text,
  fecha       text,
  autor       text,
  tecnica     integer,
  fisico      integer,
  tactica     integer,
  actitud     integer,
  fuerte      text,
  mejora      text,
  compartida  boolean default false,
  updated_at  timestamptz not null default now()
);

-- Notas privadas del técnico: solo las ve quien las escribió.
create table if not exists public.notes (
  id          text primary key,
  club_id     text not null default '',
  player_id   text,
  autor       text not null,
  texto       text,
  at          text,
  updated_at  timestamptz not null default now()
);

create table if not exists public.injuries (
  id          text primary key,
  club_id     text not null default '',
  player_id   text,
  tipo        text,
  zona        text,
  estado      text,                 -- activa | alta
  desde       text,
  hasta       text,
  alta_prev   boolean default false,
  notas       text,
  updated_at  timestamptz not null default now()
);

create table if not exists public.goals (
  id          text primary key,
  club_id     text not null default '',
  player_id   text,
  texto       text,
  hecho       boolean default false,
  por         text,
  at          text,
  updated_at  timestamptz not null default now()
);


-- ===========================================================================
--  6. COMUNICACIÓN
-- ===========================================================================

create table if not exists public.posts (
  id          text primary key,
  club_id     text not null default '',
  team_id     text,
  autor       text,
  titulo      text,
  cuerpo      text,
  urgente     boolean default false,
  at          text,
  updated_at  timestamptz not null default now()
);

create table if not exists public.post_reads (
  id          text primary key,      -- post_id || ':' || user_id
  club_id     text not null default '',
  post_id     text,
  user_id     text,
  at          text,
  updated_at  timestamptz not null default now()
);

create table if not exists public.tasks (
  id          text primary key,
  club_id     text not null default '',
  team_id     text,
  titulo      text,
  hecho       boolean default false,
  updated_at  timestamptz not null default now()
);

create table if not exists public.notifications (
  id          text primary key,
  club_id     text not null default '',
  user_id     text not null,
  titulo      text,
  cuerpo      text,
  leido       boolean default false,
  at          text,
  updated_at  timestamptz not null default now()
);
create index if not exists notifications_user
  on public.notifications (user_id, at desc);


-- ===========================================================================
--  7. ECONÓMICO Y DOCUMENTACIÓN
-- ===========================================================================

create table if not exists public.invoices (
  id           text primary key,
  club_id      text not null default '',
  player_id    text,
  guardian_id  text,
  periodo      text,
  concepto     text,
  base         double precision,
  descuento    double precision,
  importe      double precision,
  estado       text,
  emitido      text,
  metodo       text,
  avisos       integer default 0,
  updated_at   timestamptz not null default now()
);

create table if not exists public.mandates (
  id           text primary key,
  club_id      text not null default '',
  guardian_id  text,
  iban         text,                -- siempre enmascarado por la app
  titular      text,
  firmado      boolean default false,
  at           text,
  updated_at   timestamptz not null default now()
);

create table if not exists public.documents (
  id           text primary key,
  club_id      text not null default '',
  nombre       text,
  tipo         text,
  v            text,
  obligatorio  boolean default true,
  updated_at   timestamptz not null default now()
);

create table if not exists public.signatures (
  id          text primary key,
  club_id     text not null default '',
  player_id   text,
  doc_id      text,
  at          text,
  by          text,
  updated_at  timestamptz not null default now()
);


-- ===========================================================================
--  8. TEMPORADAS CERRADAS Y AUDITORÍA
-- ===========================================================================

create table if not exists public.season_history (
  id          text primary key,      -- temporada || ':' || cerrada
  club_id     text not null default '',
  temporada   text,
  cerrada     text,
  jugadores   integer,
  partidos    integer,
  updated_at  timestamptz not null default now()
);

create table if not exists public.audit_log (
  id          text primary key,
  club_id     text not null default '',
  user_id     text,
  accion      text,
  meta        jsonb,
  at          text,
  updated_at  timestamptz not null default now()
);


-- ===========================================================================
--  9. ÍNDICES
-- ===========================================================================

create index if not exists players_club        on public.players (club_id);
create index if not exists players_user        on public.players (club_id, user_id);
create index if not exists enrollments_player  on public.enrollments (player_id) where baja is null;
create index if not exists enrollments_team    on public.enrollments (team_id);
create index if not exists guardians_user      on public.guardians (club_id, user_id);
create index if not exists links_guardian      on public.guardian_links (guardian_id);
create index if not exists links_player        on public.guardian_links (player_id);
create index if not exists staff_user          on public.staff (club_id, user_id);
create index if not exists events_team         on public.events (club_id, team_id, inicio);
create index if not exists rsvp_event          on public.rsvp (event_id);
create index if not exists rsvp_player         on public.rsvp (player_id);
create index if not exists attendance_player   on public.attendance (player_id);
create index if not exists evaluations_player  on public.evaluations (player_id, fecha desc);
create index if not exists notes_player        on public.notes (player_id);
create index if not exists injuries_player     on public.injuries (player_id);
create index if not exists matches_event       on public.matches (event_id);
create index if not exists invoices_player     on public.invoices (player_id, periodo);
create index if not exists signatures_player   on public.signatures (player_id);
create index if not exists audit_club          on public.audit_log (club_id, at desc);


-- ===========================================================================
-- 10. FUNCIONES DE AUTORIZACIÓN
-- ===========================================================================
--  Estas funciones son el corazón de la seguridad. Son SECURITY DEFINER
--  porque las políticas se ejecutan con los permisos del usuario conectado y
--  necesitan leer club_members (que tiene RLS activa y, por tanto, no sería
--  legible desde dentro de una política).
-- ===========================================================================

-- Clubes a los que pertenece el llamante.
--
-- OJO: esta función existe por un motivo concreto. Una política que consulta
-- `club_members` desde una política sobre `club_members` provoca recursión
-- infinita (error 42P17) en Postgres, porque el RLS del nivel inferior vuelve
-- a evaluarse. Al ser SECURITY DEFINER se ejecuta con permisos del
-- propietario y la RLS de la tabla no se le aplica, así que no hay bucle.
create or replace function public.my_club_ids()
returns setof text language sql stable security definer set search_path = public as $$
  select distinct m.club_id from public.club_members m
   where m.user_id = public.uid_t();
$$;

-- ¿Es miembro de este club?
create or replace function public.is_member(p_club text)
returns boolean language sql stable as $$
  select p_club in (select public.my_club_ids());
$$;

-- ¿Tiene el llamante alguno de estos roles en este club?
create or replace function public.has_role(p_club text, p_roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.club_members m
    where m.club_id = p_club
      and m.user_id = public.uid_t()
      and m.rol = any(p_roles)
  );
$$;

create or replace function public.is_junta(p_club text)
returns boolean language sql stable as $$
  select public.has_role(p_club, array['junta']);
$$;

-- Cuerpo técnico: puede gestionar la plantilla de SUS equipos.
create or replace function public.is_tecnico(p_club text)
returns boolean language sql stable as $$
  select public.has_role(p_club, array['entrenador','coordinador']);
$$;

-- Quien puede gestionar datos que no son de un jugador concreto.
create or replace function public.is_staff(p_club text)
returns boolean language sql stable as $$
  select public.has_role(p_club, array['junta','entrenador','coordinador']);
$$;

-- Equipos sobre los que el técnico tiene competencia.
create or replace function public.my_team_ids(p_club text)
returns setof text language sql stable security definer set search_path = public as $$
  select s.team_id from public.staff s
   where s.club_id = p_club and s.user_id = public.uid_t()
$$;

-- Equipos en los que el jugador está inscrito (para el jugador con cuenta).
create or replace function public.teams_of_player(p_player text)
returns setof text language sql stable security definer set search_path = public as $$
  select e.team_id from public.enrollments e where e.player_id = p_player and e.baja is null;
$$;

-- Fichas de tutor del llamante.
create or replace function public.my_guardian_ids(p_club text)
returns setof text language sql stable security definer set search_path = public as $$
  select g.id from public.guardians g
   where g.club_id = p_club and g.user_id = public.uid_t();
$$;

-- Deportistas que el llamante puede VER. Es la traducción literal de la tabla
-- de privacidad del README:
--   junta       -> todos
--   entrenador  -> los de sus equipos
--   familia     -> solo sus hijos
--   jugador     -> solo él mismo
create or replace function public.my_player_ids(p_club text)
returns setof text language sql stable security definer set search_path = public as $$
  select p.id from public.players p where p.club_id = p_club
    and (
      public.is_junta(p_club)
      or p.user_id = public.uid_t()
      or (public.is_tecnico(p_club) and exists (
            select 1 from public.enrollments e
             where e.player_id = p.id and e.baja is null
               and e.team_id in (select public.my_team_ids(p_club))))
      or exists (
            select 1 from public.guardian_links l
             where l.player_id = p.id
               and l.guardian_id in (select public.my_guardian_ids(p_club)))
    );
$$;

-- ¿Puede el llamante ver esta ficha?
create or replace function public.can_read_player(p_club text, p_player text)
returns boolean language sql stable as $$
  select p_player in (select public.my_player_ids(p_club));
$$;

-- ¿Puede el llamante MODIFICAR esta ficha?
--   junta      -> sí, cualquiera
--   entrenador -> sí, la de sus equipos (fichas, notas,-convocatorias)
--   familia    -> sí, la de sus hijos (alta e inscripción)
--   jugador    -> solo la suya, y solo campos de perfil
create or replace function public.can_write_player(p_club text, p_player text)
returns boolean language sql stable as $$
  select public.is_junta(p_club)
      or (public.is_tecnico(p_club) and p_player in (
            select e.player_id from public.enrollments e
             where e.baja is null and e.team_id in (select public.my_team_ids(p_club))))
      or (p_player in (select public.my_player_ids(p_club))
          and exists (select 1 from public.players p2
                       where p2.id = p_player
                         and (p2.user_id = public.uid_t()
                              or exists (
                                select 1 from public.guardian_links l
                                 where l.player_id = p_player
                                   and l.guardian_id in (
                                     select public.my_guardian_ids(p_club))))));
$$;

-- ¿Es este evento de un equipo del llamante? (cuerpo técnico)
create or replace function public.owns_event(p_club text, p_team text)
returns boolean language sql stable as $$
  select public.is_junta(p_club)
      or (public.is_tecnico(p_club) and p_team in (select public.my_team_ids(p_club)));
$$;

-- Visible desde el cliente sin ser miembro: ¿existe ya algún club?
create or replace function public.club_is_empty()
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.clubs);
$$;


-- ===========================================================================
-- 11. CÓDIGOS DE ACCESO
-- ===========================================================================
--  Los códigos son secretos que hay que poder comprobar SIN ser miembro.
--  Por eso la tabla `invites` queda cerrada a la junta y la comprobación se
--  hace por RPC. Así un entrenador no puede listar los códigos del club ni
--  leer el código general de familias.
-- ===========================================================================

-- Comprobación sin efectos: la usa la pantalla "tengo un código" antes de
-- pedir ningún dato personal.
create or replace function public.redeem_invite(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v public.invites%rowtype;
begin
  if public.uid_t() = '' then
    return jsonb_build_object('ok', false, 'error',
      'Inicia sesión para comprobar el código');
  end if;

  select * into v from public.invites where code = upper(btrim(p_code));
  if not found then
    return jsonb_build_object('ok', false, 'error',
      'Ese código no existe. Revísalo con el club.');
  end if;

  if v.caduca is not null and v.caduca < to_char(now(), 'YYYY-MM-DD') then
    return jsonb_build_object('ok', false, 'error',
      'Ese código ha caducado. Pide uno nuevo a la junta.');
  end if;

  if v.max is not null and v.usos >= v.max then
    return jsonb_build_object('ok', false, 'error',
      'Ese código ya se ha utilizado. Pide uno nuevo a la junta.');
  end if;

  return jsonb_build_object('ok', true, 'rol', v.rol, 'team_id', v.team_id,
                            'nota', v.nota);
exception when no_data_found then
  return jsonb_build_object('ok', false, 'error',
    'Ese código no existe. Revísalo con el club.');
end;
$$;

-- Gasto del código: valida y anota el canje. Solo el propio usuario lo llama.
create or replace function public.consume_invite(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.invites%rowtype;
  v_club text;
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

  update public.invites set usos = usos + 1 where code = v.code;

  insert into public.invite_redemptions (id, club_id, user_id, rol, code)
  values (public.uid_t() || ':' || v.rol, v_club, public.uid_t(), v.rol, v.code)
  on conflict do nothing;

  return jsonb_build_object('ok', true, 'rol', v.rol, 'team_id', v.team_id,
                            'club_id', v_club);
end;
$$;

-- Alta de la cuenta de la junta directiva que funda el club.
create or replace function public.found_club(
  p_club_id text, p_club_nombre text, p_ciudad text,
  p_user_id text, p_user_nombre text, p_email text,
  p_season_id text, p_season_nombre text,
  p_family_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if public.uid_t() = '' then
    return jsonb_build_object('ok', false, 'error', 'Inicia sesión primero');
  end if;
  if not public.club_is_empty() then
    return jsonb_build_object('ok', false, 'error',
      'Este club ya está creado. Pide tu código de acceso a la junta.');
  end if;

  insert into public.clubs (id, nombre, deporte, ciudad, fundado, creado)
  values (p_club_id, p_club_nombre, 'Rugby', p_ciudad, 1931,
          to_char(now(), 'YYYY-MM-DD'));

  insert into public.seasons (id, club_id, nombre, activa)
  values (p_season_id, p_club_id, p_season_nombre, true);

  insert into public.profiles (id, club_id, nombre, email, creado)
  values (p_user_id, p_club_id, p_user_nombre, lower(p_email),
          to_char(now(), 'YYYY-MM-DD'));

  insert into public.club_members (id, club_id, user_id, rol)
  values (p_club_id || ':' || p_user_id || ':junta', p_club_id, p_user_id, 'junta');

  insert into public.invites (code, club_id, rol, usos, max, caduca, nota, creado)
  values (upper(p_family_code), p_club_id, 'familia', 0, null, null,
          'Código general para familias', to_char(now(), 'YYYY-MM-DD'));

  return jsonb_build_object('ok', true, 'club_id', p_club_id);
end;
$$;
