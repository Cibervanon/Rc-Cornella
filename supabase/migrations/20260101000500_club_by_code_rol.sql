/* ============================================================================
   club_by_code devuelve tambien el rol y el equipo.
   ----------------------------------------------------------------------------
   Que pasaba:
   Al entrar con un codigo, Gate.checkCode() llamaba a redeem_invite(), que es
   una funcion de seguridad y exige sesion:

       Inicia sesion para comprobar el codigo

   Pero quien llega con un codigo todavia no tiene cuenta: se da de alta en el
   paso siguiente (Gate.datos -> Data.register()). O sea, la comprobacion se
   hacia antes de poder pasar, y en la nube un invitado nuevo nunca llevaba su
   codigo a ninguna parte. En el movil ya installed el club si estaba en local y
   por eso no se notaba, pero en uno nuevo (el caso normal al invitar a una
   familia) la puerta estaba cerrada.

   Que hace:
   Cuando el movil no tiene el club descargado, se pregunta con club_by_code(),
   que es la unica de este camino que no necesita sesion. Ademas de validar el
   codigo dice de que rol se trata y de que equipo, que es justo lo que el paso
   de datos necesita para crear la membresia.

   El rol y el equipo son los del propio codigo que el usuario ya tiene en la
   mano: no se revela nada que no tuviera ya. El club tampoco: se limita a la
   identidad (id, nombre, ciudad, temporada), que es lo que el movil necesita
   para no inventarse ids y escribir luego sobre un club que no existe.
   ========================================================================== */

create or replace function public.club_by_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv  public.invites%rowtype;
  v_club public.clubs%rowtype;
  v_seas public.seasons%rowtype;
begin
  select * into v_inv from public.invites where upper(code) = upper(p_code);

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Ese codigo no existe');
  end if;

  if v_inv.caduca is not null and v_inv.caduca < to_char(now(), 'YYYY-MM-DD') then
    return jsonb_build_object('ok', false, 'error', 'Ese codigo ya ha caducado');
  end if;

  if v_inv.max is not null and coalesce(v_inv.usos, 0) >= v_inv.max then
    return jsonb_build_object('ok', false, 'error', 'Ese codigo ya no vale');
  end if;

  select * into v_club from public.clubs where id = v_inv.club_id;
  if not found then
    return jsonb_build_object('ok', false, 'error',
      'El club de ese codigo ya no esta disponible');
  end if;

  select * into v_seas from public.seasons
   where club_id = v_inv.club_id and activa limit 1;

  return jsonb_build_object(
    'ok',        true,
    'club_id',   v_club.id,
    'nombre',    v_club.nombre,
    'ciudad',    v_club.ciudad,
    'fundado',   v_club.fundado,
    'deporte',   v_club.deporte,
    'season_id', v_seas.id,
    'temporada', v_seas.nombre,
    'rol',       v_inv.rol,
    'team_id',   v_inv.team_id);
end;
$$;

grant execute on function public.club_by_code(text) to anon, authenticated;