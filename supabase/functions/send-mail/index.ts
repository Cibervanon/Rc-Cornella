// ============================================================================
//  send-mail — envío de correo del club con Resend
// ----------------------------------------------------------------------------
//  Por qué esto es una Edge Function y no una llamada desde el navegador:
//  la clave de Resend es un secreto. Si se hiciera fetch() desde la app,
//  cualquiera que abra las herramientas de desarrollo del móvil vería la
//  clave y podría mandar correo en nombre del club.
//
//  Aquí la clave vive en el secreto RESEND_API_KEY del servidor. El
//  navegador llama a esta función, la función comprueba quién llama y qué
//  puede enviar, y solo entonces llama a Resend.
//
//  Hay una segunda barrera: RLS. Esta función no da acceso a los datos, solo
//  envía. El permiso se decide por las políticas de la base de datos.
// ============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2"

// ---------------------------------------------------------------------------
//  Plantillas. Texto plano con marcado sencillo, sin plantillas para no
//  arrastrar ninguna dependencia. Los textos están en español del club:
//  nunca "Hola {{nombre}}", sino lo que le dice la junta a una familia.
// ---------------------------------------------------------------------------

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const PLANTILLAS = {
  // La junta genera un código y se lo envía a la persona concreta.
  codigo: (d) => ({
    asunto: `${d.club}: tu código de acceso es ${d.codigo}`,
    html: `
      <p>Hola ${esc(d.destinatario)},</p>
      <p>La junta directiva del <strong>${esc(d.club)}</strong> te ha creado
         una cuenta en la aplicación del club.</p>
      <p style="font-size:22px;letter-spacing:3px;margin:24px 0">
        <strong>${esc(d.codigo)}</strong></p>
      <p>Este código es de <strong>un solo uso</strong>${
        d.caduca ? ` y caduca el ${esc(d.caduca)}` : ""
      }. Ábrelo en ${esc(d.appUrl)} y créala con ese código.</p>
      ${
        d.nota
          ? `<p style="color:#555">Nota de la junta: ${esc(d.nota)}</p>`
          : ""
      }
      <p style="color:#777;font-size:13px">Si no esperabas este correo, ignóralo.</p>`,
  }),

  // Confirmación de que la cuenta está lista.
  bienvenida: (d) => ({
    asunto: `Ya estás dentro: ${d.club}`,
    html: `
      <p>Hola ${esc(d.destinatario)},</p>
      <p>Tu cuenta en <strong>${esc(d.club)}</strong> está lista y ya eres
         <strong>${esc(d.rol)}</strong>.</p>
      ${
        d.proximo
          ? `<p>${esc(d.proximo)}</p>`
          : "<p>Ya puedes entrar con tu email y contraseña.</p>"
      }
      <p><a href="${esc(d.appUrl)}">Abrir la aplicación</a></p>`,
  }),

  // Recordatorio de que falta confirmar la asistencia.
  recordatorio: (d) => ({
    asunto: `Falta tu confirmación: ${d.club}`,
    html: `
      <p>Hola ${esc(d.destinatario)},</p>
      <p>Dentro de <strong>${esc(d.club)}</strong> hay un
         <strong>${esc(d.tipoEvento)}</strong> ${esc(d.cuando)} en
         ${esc(d.lugar)} y aún no hemos recibido tu respuesta.</p>
      <p>Necesitamos saber si ${esc(d.nombres)} asiste${
        d.nombresPlural ? "n" : ""
      }. Se tarda diez segundos:</p>
      <p><a href="${esc(d.enlace)}">Confirmar asistencia</a></p>
      <p style="color:#777;font-size:13px">Si no puedes ir, responde igualmente
         y lo indicamos al entrenador.</p>`,
  }),

  // Cambio de fecha u hora de un evento.
  cambioHorario: (d) => ({
    asunto: `Cambio de horario: ${esc(d.club)}`,
    html: `
      <p>Hola ${esc(d.destinatario)},</p>
      <p>${esc(d.tipoEvento)} <strong>${esc(d.nombreEvento)}</strong> en
         ${esc(d.club)} ha cambiado de fecha u hora.</p>
      <p style="font-size:17px;margin:16px 0"><strong>${esc(d.cuando)}</strong><br>
         ${esc(d.lugar)}</p>
      <p><a href="${esc(d.enlace)}">Ver la agenda</a></p>`,
  }),

  // Convocatoria.
  convocatoria: (d) => ({
    asunto: `Convocatoria: ${esc(d.club)}`,
    html: `
      <p>Hola ${esc(d.destinatario)},</p>
      <p>${esc(d.nombres)} ${d.textoConvocatoria} en
         <strong>${esc(d.club)}</strong>.</p>
      <p style="font-size:17px;margin:16px 0"><strong>${esc(d.cuando)}</strong><br>
         ${esc(d.lugar)}</p>
      <p><a href="${esc(d.enlace)}">Ver la convocatoria</a></p>`,
  }),

  // Aviso general publicado en la aplicación.
  anuncio: (d) => ({
    asunto: `${d.club}: ${d.titulo}`,
    html: `
      <p>Hola ${esc(d.destinatario)},</p>
      <p style="font-size:17px;margin:0 0 12px"><strong>${esc(d.titulo)}</strong></p>
      <p>${esc(d.cuerpo).replace(/\n/g, "<br>")}</p>
      ${d.urgente ? `<p style="color:#b3261e"><strong>Aviso importante</strong></p>` : ""}
      <p><a href="${esc(d.enlace)}">Abrir la aplicación</a></p>`,
  }),

  // Recibo emitido.
  cuota: (d) => ({
    asunto: `Cuota ${esc(d.periodo)}: ${d.club}`,
    html: `
      <p>Hola ${esc(d.destinatario)},</p>
      <p>Se ha emitido el recibo de <strong>${esc(d.periodo)}</strong> para
         ${esc(d.nombres)} en <strong>${esc(d.club)}</strong>.</p>
      <table style="border-collapse:collapse;margin:16px 0;font-size:15px">
        <tr><td style="padding:4px 16px 4px 0;color:#666">Concepto</td>
            <td style="padding:4px 0">${esc(d.concepto)}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#666">Importe</td>
            <td style="padding:4px 0"><strong>${esc(d.importe)} €</strong></td></tr>
      </table>
      <p><a href="${esc(d.enlace)}">Ver mis recibos</a></p>
      <p style="color:#777;font-size:13px">Se domicilia en el IBAN que
         firmaste. Para cambiarlo, entra en la aplicación.</p>`,
  }),

  // Nueva valoración compartida por el entrenador.
  valoracion: (d) => ({
    asunto: `Valoración de ${esc(d.nombre)}: ${esc(d.club)}`,
    html: `
      <p>Hola ${esc(d.destinatario)},</p>
      <p>El entrenador ha compartido la valoración de
         <strong>${esc(d.nombre)}</strong>.</p>
      <p style="font-size:17px;margin:16px 0"><strong>${esc(d.resumen)}</strong></p>
      <p><a href="${esc(d.enlace)}">Ver el progreso</a></p>`,
  }),
};

// ---------------------------------------------------------------------------
//  Envoltorio visual. Sin colores de plantilla genérica: negro y naranja,
//  los del club.
// ---------------------------------------------------------------------------
function envolver(cuerpo, club) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f4f2ef;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px">
    <div style="background:#121212;padding:16px 20px;border-radius:12px 12px 0 0">
      <span style="color:#fff;font-weight:700">${esc(club || "Rugby Club Cornellà")}</span>
    </div>
    <div style="background:#fff;padding:28px 24px;border-radius:0 0 12px 12px;
                border-left:3px solid #E8590C">
      ${cuerpo}
    </div>
    <p style="color:#8a8a8a;font-size:12px;text-align:center;margin-top:20px">
      Rugby Club Cornellà · Des de 1931</p>
  </div>
</body></html>`;
}

// ---------------------------------------------------------------------------
//  Envío
// ---------------------------------------------------------------------------

/** Envía a una sola persona. Devuelve el id del mensaje o un error. */
async function enviar(datos, { remitente, respuestaA }) {
  const plantilla = PLANTILLAS[datos.plantilla];
  if (!plantilla) {
    return { error: `Plantilla desconocida: ${datos.plantilla}` };
  }

  const clave = Deno.env.get("RESEND_API_KEY");
  if (!clave) {
    return { error: "Falta el secreto RESEND_API_KEY. Configúralo con: npx supabase secrets set RESEND_API_KEY=re_..." };
  }

  // Se comprueba antes de llamar a Resend: una dirección vacía gastaría cuota
  // y devolvería un error de Resend que no dice qué ha ido mal.
  const destino = (datos.datos?.destinatarioEmail || "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(destino)) {
    return { error: `El destinatario no tiene un email válido: "${destino || "vacío"}"` };
  }

  const cuerpo = plantilla(datos.datos || {});

  const respuesta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${clave}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: remitente,
      reply_to: respuestaA,
      to: [destino],
      subject: cuerpo.asunto,
      html: envolver(cuerpo.html, datos.datos?.club),
    }),
  });

  const texto = await respuesta.text();
  if (!respuesta.ok) {
    // 403 y 429 tienen su propio significado y merecen un mensaje claro.
    if (respuesta.status === 403)
      return { error: `Resend rechazó el remitente "${remitente}". Revisa el dominio en resend.com/domains.` };
    if (respuesta.status === 429)
      return { error: "Se ha alcanzado el límite de correos de Resend." };
    return { error: `Resend ${respuesta.status}: ${texto.slice(0, 300)}` };
  }
  return { id: JSON.parse(texto).id };
}

Deno.serve(async (peticion) => {
  const url = new URL(peticion.url);

  // --- Comprobación de vida ----------------------------------------------------
  if (url.pathname.endsWith("/health")) {
    return Response.json({
      ok: true,
      remitente: Deno.env.get("MAIL_FROM") || null,
      clave_presente: !!Deno.env.get("RESEND_API_KEY"),
    });
  }

  if (peticion.method !== "POST") {
    return Response.json({ error: "Solo POST" }, { status: 405 });
  }

  // --- Autenticación ------------------------------------------------------------
  // La misma clave anon que usa el navegador, para que Supabase rechazara la
  // petición si el llamante no está conectado. No se acepta a nadie anónimo.
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const bearer = (peticion.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!anon || !bearer) {
    return Response.json({ error: "Función mal configurada" }, { status: 500 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") || "",
    anon,
    { global: { headers: { Authorization: `Bearer ${bearer}` } } },
  );

  const { data: sesion, error: errorSesion } = await supabase.auth.getUser();
  if (errorSesion || !sesion?.user) {
    return Response.json({ error: "Sesión no válida" }, { status: 401 });
  }
  const uid = sesion.user.id;

  // --- Quién puede enviar -------------------------------------------------------
  // Tener sesión no basta. Sin esto, cualquier cuenta del club —incluida la de
  // una familia— podría usar la función para mandar correos en nombre del club.
  // Solo lo hacen la junta, el cuerpo técnico y la coordinación, que son los
  // únicos que disparan avisos desde la aplicación.
  const { data: clubes } = await supabase
    .from("club_members")
    .select("rol")
    .eq("user_id", uid);
  const puede = (clubes || []).some((m) => ["junta", "entrenador", "coordinador"].includes(m.rol));
  if (!puede) {
    return Response.json({ error: "Tu perfil no puede enviar correos del club." }, { status: 403 });
  }

  // --- Cuerpo -------------------------------------------------------------------
  let cuerpo;
  try {
    cuerpo = await peticion.json();
  } catch {
    return Response.json({ error: "Cuerpo no válido" }, { status: 400 });
  }

  if (typeof cuerpo?.plantilla !== "string" || !(cuerpo.plantilla in PLANTILLAS)) {
    return Response.json({ error: "Plantilla no válida" }, { status: 400 });
  }
  if (cuerpo.datos && typeof cuerpo.datos !== "object") {
    return Response.json({ error: "Datos no válidos" }, { status: 400 });
  }
  // Un lote es para una convocatoria a un equipo, no para miles de correos.
  if (Array.isArray(cuerpo.destinatarios) && cuerpo.destinatarios.length > 500) {
    return Response.json({ error: "Demasiados destinatarios" }, { status: 400 });
  }

  // Sin remitente no se envía nada. Caer en la dirección de pruebas de Resend
  // sería peor que fallar: el correo se perdería en silencio, sin error ni
  // aviso, y alguien esperaría una confirmación que nunca llegó.
  const remitente = Deno.env.get("MAIL_FROM");
  if (!remitente) {
    return Response.json(
      { error: "Falta el secreto MAIL_FROM. Configúralo con: npx supabase secrets set MAIL_FROM=\"Club <noreply@tu-dominio>\"" },
      { status: 500 },
    );
  }
  const respuestaA = Deno.env.get("MAIL_REPLY_TO") || undefined;

  // --- Envío a varias personas ---------------------------------------------------
  // Un solo correo con varias personas en el campo «para» revela sus direcciones
  // unas a otras. Cada una recibe el suyo. Por eso hay "lotes" y no difusión.
  if (Array.isArray(cuerpo.destinatarios) && cuerpo.destinatarios.length) {
    const clubId = cuerpo.clubId;
    const club = await nombreClub(supabase, clubId);

    const resultados = [];
    for (const destino of cuerpo.destinatarios) {
      if (!destino?.email) {
        resultados.push({ email: null, error: "sin email" });
        continue;
      }
      const r = await enviar(
        {
          plantilla: cuerpo.plantilla,
          datos: { ...(cuerpo.datos || {}), ...destino, club },
        },
        { remitente, respuestaA },
      );
      resultados.push({ email: destino.email, ...r });
    }

    const fallidos = resultados.filter((r) => r.error);
    return Response.json({
      enviados: resultados.length - fallidos.length,
      fallidos: fallidos.length,
      detalle: fallidos,
      club_id: clubId,
    });
  }

  // --- Envío suelto: la junta manda un código a una persona -------------------
  const r = await enviar(
    {
      plantilla: cuerpo.plantilla,
      datos: {
        ...(cuerpo.datos || {}),
        club: cuerpo.datos?.club || await nombreClub(supabase, cuerpo.clubId),
      },
    },
    { remitente, respuestaA },
  );

  return Response.json(r.error ? { error: r.error } : { ok: true, id: r.id });
});

async function nombreClub(supabase, clubId) {
  if (!clubId) return "Rugby Club Cornellà";
  const { data } = await supabase.from("clubs").select("nombre").eq("id", clubId).maybeSingle();
  return data?.nombre || "Rugby Club Cornellà";
}
