-- ============================================================================
--  Rugby Club Cornellà — notificaciones push (Firebase Cloud Messaging)
-- ============================================================================
--  Qué guarda esta tabla: los dispositivos que han pedido recibir avisos. Un
--  token es una dirección de un navegador concreto, no de una persona. Por eso
--  una persona puede tener varias filas (móvil, portátil, casa, trabajo) y un
--  token puede cambiar de dueño si alguien entra con otra cuenta en el mismo
--  dispositivo.
--
--  Qué NO se guarda: el texto de los avisos. Eso se envía en el momento y no
--  se queda almacenado en el servidor de Firebase más que lo necesario. Un
--  "ha visto" se registra con la marca de tiempo de la notificación en la app,
--  que ya está en la tabla `notifications`.
--
--  Por qué hay funciones y no acceso directo: el navegador no debe poder leer
--  los tokens de los demás ni escribir un token a nombre de otro. Eso lo
--  garantizan las políticas de abajo y, sobre todo, que las funciones usen
--  public.uid_t() y no un identificador recibido del cliente.
-- ============================================================================

-- ---------------------------------------------------------------------------
--  Tabla
-- ---------------------------------------------------------------------------
create table if not exists public.push_tokens (
  -- El token es la clave primaria: es lo único que hay que poder borrar
  -- cuando Firebase dice que ya no sirve.
  token       text primary key,
  club_id     text not null default '',
  user_id     text not null,
  plataforma  text not null default 'web',
  creado      text,
  updated_at  timestamptz not null default now()
);

create index if not exists push_tokens_user on public.push_tokens (user_id);
create index if not exists push_tokens_club on public.push_tokens (club_id);


-- ---------------------------------------------------------------------------
--  Alta y baja de un dispositivo
-- ---------------------------------------------------------------------------

-- Da de alta el dispositivo que está usando ahora mismo quien llama.
-- Se separa en dos pasos a propósito: primero se borra el token si estaba en
-- manos de otra cuenta y luego se inserta. Sin esto, cambiar de usuario en el
-- mismo móvil dejaría los avisos del anterior llegando al nuevo.
create or replace function public.register_push_token(
  p_token      text,
  p_club_id    text default '',
  p_plataforma text default 'web'
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid text;
begin
  v_uid := public.uid_t();
  if v_uid = '' then
    return jsonb_build_object('ok', false, 'error', 'Inicia sesión primero');
  end if;

  if p_token is null or btrim(p_token) = '' then
    return jsonb_build_object('ok', false, 'error', 'Token vacío');
  end if;

  delete from public.push_tokens
   where token = p_token and user_id <> v_uid;

  insert into public.push_tokens (token, club_id, user_id, plataforma, creado)
  values (p_token, coalesce(p_club_id, ''), v_uid,
          coalesce(nullif(btrim(p_plataforma), ''), 'web'), to_char(now(), 'YYYY-MM-DD'))
  on conflict (token) do update
        set user_id    = excluded.user_id,
            club_id    = excluded.club_id,
            plataforma = excluded.plataforma,
            updated_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

-- El jugador pulsa "no quiero avisos" en su dispositivo.
create or replace function public.unregister_push_token(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_borrados integer;
begin
  if public.uid_t() = '' then
    return jsonb_build_object('ok', false, 'error', 'Inicia sesión primero');
  end if;

  delete from public.push_tokens
   where token = p_token and user_id = public.uid_t();
  get diagnostics v_borrados = row_count;

  return jsonb_build_object('ok', true, 'borrados', v_borrados);
end;
$$;


-- ---------------------------------------------------------------------------
--  RLS
-- ---------------------------------------------------------------------------
--  Aquí no hay nada que la junta pueda ver ni hacer: los tokens son direcciones
--  técnicas, no datos del club. Nadie lee los tokens de nadie, ni siquiera la
--  junta. Los envía la Edge Function con la clave de servicio, que no pasa por
--  estas políticas.
-- ---------------------------------------------------------------------------
alter table public.push_tokens enable row level security;

drop policy if exists push_own on public.push_tokens;
create policy push_own on public.push_tokens for all
  using (user_id = public.uid_t())
  with check (user_id = public.uid_t());

-- La escritura real pasa por register_push_token() y unregister_push_token(),
-- que son security definer. Esta política cubre la lectura, que es lo único que
-- la app hace directamente (para saber si este dispositivo ya está dado de
-- alta) y para que nadie pueda insertar un token a nombre de otra persona.


-- ---------------------------------------------------------------------------
--  Comprobación de arranque (añade lo de push a la del RLS)
-- ---------------------------------------------------------------------------
create or replace function public.health_check_push()
returns jsonb language sql stable as $$
select jsonb_build_object(
  'tabla_push', to_regclass('public.push_tokens') is not null,
  'funciones_push', (
    select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in
       ('register_push_token', 'unregister_push_token')),
  'rls_push', (
    select c.relrowsecurity from pg_class c
     where c.oid = to_regclass('public.push_tokens'))
);
$$;
