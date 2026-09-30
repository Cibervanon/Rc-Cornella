/* ============================================================================
   club_by_code: poder darse de alta desde un dispositivo que aun no tiene el
   club descargado.
   ----------------------------------------------------------------------------
   Que pasaba:
   El alta con codigo (familias, jugadores, cuerpo tecnico) llamaba a
   Data.register(), que empieza con
       if(!d.club) throw new Error('Todavia no hay ningun club creado')
   En un movil o navegador nuevo no hay club en local, y la app no dejaba
   escribir el codigo en ningun sitio: la pantalla de bienvenida solo ofrecia
   "Crear el club" o "Ya tengo cuenta". Resultado: una familia con el codigo
   correcto no podia entrar, y si hacia "Crear el club" se creaba un club
   duplicado.

   Que hace:
   Con un codigo de invitacion valido devuelve SOLO la identidad del club (id,
   nombre, ciudad) y su temporada. No devuelve miembros, ni correos, ni nada
   mas: el codigo es el secreto y quien lo tiene ya esta dentro del club. Con
   un codigo malo responde ok:false y no dice nada del club.

   Los ids se copian tal cual del servidor. Es lo importante: si el movil se
   inventase un id distinto, al subir sus datos los escribiria sobre un club que
   no existe.
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
    'ok', true,
    'club_id',   v_club.id,
    'nombre',    v_club.nombre,
    'ciudad',    v_club.ciudad,
    'fundado',   v_club.fundado,
    'deporte',   v_club.deporte,
    'season_id', v_seas.id,
    'temporada', v_seas.nombre);
end;
$$;

grant execute on function public.club_by_code(text) to anon, authenticated;