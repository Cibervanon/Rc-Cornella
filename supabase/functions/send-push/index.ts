// ============================================================================
//  send-push — notificaciones push del club con Firebase Cloud Messaging
// ----------------------------------------------------------------------------
//  Misma idea que send-mail, y por el mismo motivo: la cuenta de servicio de
//  Firebase es un secreto. Si el navegador firmara el JWT para hablar con
//  Google, la clave privada estaría en el código que descarga todo el mundo.
//
//  El flujo completo es:
//
//    app → esta función → (busca los móviles de esa persona) → Google → móvil
//
//  La app nunca habla con Google directamente. Aquí solo se usa la clave
//  pública de Firebase (que ya va en js/config.js) para registrar el móvil;
//  el envío lo firma esta función con la cuenta de servicio.
//
//  Secretos que necesita:
//    FCM_SERVICE_ACCOUNT  el JSON que descarga Firebase → Configuración →
//                         Cuentas de servicio → "Generar nueva clave privada".
//                         Se pega entero, con los saltos de línea.
// ============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2"

// ---------------------------------------------------------------------------
//  Utilidades de base64url y firma. Se hace a mano con Web Crypto para no
//  arrastrar una biblioteca de JWT solo por firmar cuatro líneas.
// ---------------------------------------------------------------------------

const b64u = (bytes: Uint8Array): string => {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const b64uJson = (o: unknown): string =>
  b64u(new TextEncoder().encode(JSON.stringify(o)));

function pemAVer(pem: string): Uint8Array {
  const limpio = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(limpio);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Firma el JWT de cuenta de servicio que exige Google. */
async function firmarJWT(cuenta: { client_email: string; private_key: string }) {
  const clave = await crypto.subtle.importKey(
    "pkcs8",
    pemAVer(cuenta.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const ahora = Math.floor(Date.now() / 1000);
  const cabecera = b64uJson({ alg: "RS256", typ: "JWT" });
  const carga = b64uJson({
    iss: cuenta.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: ahora,
    exp: ahora + 3600,
  });
  const firma = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      clave,
      new TextEncoder().encode(`${cabecera}.${carga}`),
    ),
  );
  return `${cabecera}.${carga}.${b64u(firma)}`;
}

/* El token de acceso dura una hora. Se guarda en memoria para no pedir uno
   nuevo por cada móvil de una convocatoria, pero se reintenta si Google lo dice. */
let accesoCache: { token: string; hasta: number } | null = null;

async function tokenDeAcceso(cuenta: { client_email: string; private_key: string }) {
  if (accesoCache && accesoCache.hasta > Date.now() + 60_000) return accesoCache.token;

  const jwt = await firmarJWT(cuenta);
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const texto = await r.text();
  if (!r.ok) {
    accesoCache = null;
    throw new Error(
      `Google rechazó la cuenta de servicio (${r.status}). ` +
        `Revisa que FCM_SERVICE_ACCOUNT sea el JSON completo. Detalle: ${texto.slice(0, 200)}`,
    );
  }

  const { access_token } = JSON.parse(texto);
  accesoCache = { token: access_token, hasta: Date.now() + 50 * 60_000 };
  return accesoCache.token;
}

// ---------------------------------------------------------------------------
//  Envío
// ---------------------------------------------------------------------------

interface Destino {
  token: string;
}

interface Aviso {
  titulo: string;
  cuerpo: string;
  url?: string;
  tag?: string;
}

async function enviarUno(
  destino: Destino,
  aviso: Aviso,
  cuenta: { client_email: string; private_key: string },
  proyecto: string,
) {
  const token = await tokenDeAcceso(cuenta);

  const mensaje: Record<string, unknown> = {
    token: destino.token,
    notification: { title: aviso.titulo, body: aviso.cuerpo },
    // `data` solo admite cadenas: es lo que lee el service worker al pulsar.
    data: { url: aviso.url || "/", tag: aviso.tag || "rcc" },
    webpush: {
      notification: {
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: aviso.tag || "rcc",
      },
    },
  };

  // Si la app se puede abrir en una pestaña, se indica. FCM lo respeta tanto en
  // Android como en escritorio.
  if (aviso.url) {
    (mensaje.webpush as Record<string, unknown>).fcmOptions = {
      link: aviso.url,
    };
  }

  const r = await fetch(
    `https://fcm.googleapis.com/v1/projects/${proyecto}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: mensaje }),
    },
  );

  if (r.ok) return { ok: true };

  const texto = await r.text();
  return { ok: false, status: r.status, texto };
}

/** Un token caducado se limpia, o la app seguiría intentando escribir a un
    móvil que ya no existe y acumularía fallos sin avisar. */
function tokenMuerto(status: number, texto: string) {
  return (
    status === 404 ||
    status === 400 ||
    /UNREGISTERED|registration-token-not-registered|invalid-registration/i.test(texto)
  );
}

// ---------------------------------------------------------------------------
//  Endpoint
// ---------------------------------------------------------------------------

Deno.serve(async (peticion) => {
  const url = new URL(peticion.url);

  // --- Comprobación de vida ----------------------------------------------------
  if (url.pathname.endsWith("/health")) {
    const cruda = Deno.env.get("FCM_SERVICE_ACCOUNT");
    let cuentaOk = false;
    let proyecto = Deno.env.get("FCM_PROJECT_ID") || null;
    if (cruda) {
      try {
        const cuenta = JSON.parse(cruda);
        cuentaOk = !!(cuenta.client_email && cuenta.private_key);
        proyecto = proyecto || cuenta.project_id || null;
      } catch {
        cuentaOk = false;
      }
    }
    return Response.json({
      ok: true,
      cuenta_servicio: cuentaOk,
      proyecto,
    });
  }

  if (peticion.method !== "POST") {
    return Response.json({ error: "Solo POST" }, { status: 405 });
  }

  // --- La cuenta de servicio, una vez ------------------------------------------
  const cruda = Deno.env.get("FCM_SERVICE_ACCOUNT");
  if (!cruda) {
    return Response.json(
      {
        error:
          "Falta el secreto FCM_SERVICE_ACCOUNT. Configúralo con: " +
          "npx supabase secrets set FCM_SERVICE_ACCOUNT='{...json de la cuenta de servicio...}'",
      },
      { status: 500 },
    );
  }
  let cuenta: { client_email: string; private_key: string; project_id?: string };
  try {
    cuenta = JSON.parse(cruda);
  } catch {
    return Response.json(
      { error: "FCM_SERVICE_ACCOUNT no es un JSON válido. Copia el archivo entero, con las llaves." },
      { status: 500 },
    );
  }
  if (!cuenta.client_email || !cuenta.private_key) {
    return Response.json(
      { error: "FCM_SERVICE_ACCOUNT no tiene client_email ni private_key." },
      { status: 500 },
    );
  }
  const proyecto = Deno.env.get("FCM_PROJECT_ID") || cuenta.project_id;
  if (!proyecto) {
    return Response.json(
      { error: "No se sabe el proyecto de Firebase. Añade el secreto FCM_PROJECT_ID." },
      { status: 500 },
    );
  }

  // --- Autenticación, igual que en send-mail ------------------------------------
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const bearer = (peticion.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!anon || !bearer) {
    return Response.json({ error: "Función mal configurada" }, { status: 500 });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL") || "", anon, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });

  const { data: sesion, error: errorSesion } = await supabase.auth.getUser();
  if (errorSesion || !sesion?.user) {
    return Response.json({ error: "Sesión no válida" }, { status: 401 });
  }
  const uid = sesion.user.id;

  // --- Quién puede enviar -------------------------------------------------------
  // Tener sesión no basta: sin esto, cualquier cuenta del club usaría la función
  // para bombardear a los demás con avisos en nombre del club. Solo avisa el
  // cuerpo técnico y la junta, que son los que disparan notificaciones.
  const { data: clubes } = await supabase
    .from("club_members")
    .select("rol")
    .eq("user_id", uid);
  const puede = (clubes || []).some((m) =>
    ["junta", "entrenador", "coordinador"].includes(m.rol)
  );
  if (!puede) {
    return Response.json(
      { error: "Tu perfil no puede enviar avisos del club." },
      { status: 403 },
    );
  }

  // --- Cuerpo -------------------------------------------------------------------
  let cuerpo: {
    user_ids?: string[];
    titulo?: string;
    cuerpo?: string;
    url?: string;
    tag?: string;
  };
  try {
    cuerpo = await peticion.json();
  } catch {
    return Response.json({ error: "Cuerpo no válido" }, { status: 400 });
  }

  const destinatarios = Array.isArray(cuerpo.user_ids) ? cuerpo.user_ids : [];
  if (!destinatarios.length) {
    return Response.json({ error: "No hay a quién avisar" }, { status: 400 });
  }
  if (destinatarios.length > 500) {
    return Response.json({ error: "Demasiados destinatarios" }, { status: 400 });
  }
  const titulo = String(cuerpo.titulo ?? "").trim();
  const texto = String(cuerpo.cuerpo ?? "").trim();
  if (!titulo) {
    return Response.json({ error: "El aviso no tiene título" }, { status: 400 });
  }
  // Google corta los cuerpos largos. Recortar aquí evita gastar la cuota
  // enviando un mensaje que se vería cortado sin explicación.
  const aviso: Aviso = {
    titulo: titulo.slice(0, 120),
    cuerpo: texto.slice(0, 300),
    url: cuerpo.url ? String(cuerpo.url).slice(0, 500) : undefined,
    tag: cuerpo.tag ? String(cuerpo.tag).slice(0, 50) : "rcc",
  };

  // --- Lectura de los móviles ---------------------------------------------------
  // Con la clave anon, RLS no deja leer los tokens de otra persona, y está bien
  // que sea así. Para esto hace falta la clave de servicio, que es la que lleva
  // la Edge Function por dentro y no sale de aquí.
  const admin = createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  );

  const { data: tokens, error: errorTokens } = await admin
    .from("push_tokens")
    .select("token")
    .in("user_id", destinatarios.map(String));
  if (errorTokens) {
    return Response.json(
      { error: `No se han podido leer los móviles: ${errorTokens.message}` },
      { status: 500 },
    );
  }

  const lista = (tokens || []) as Destino[];
  if (!lista.length) {
    // No es un error: casi todo el mundo aún no ha activado los avisos. La app
    // no debe enseñar un aviso rojo por esto.
    return Response.json({ enviados: 0, sin_moviles: 1 });
  }

  // --- Envío --------------------------------------------------------------------
  const muertos: string[] = [];
  let enviados = 0;
  const errores: string[] = [];

  // De uno en uno y sin Promise.all: una convocatoria son unas decenas de
  // móviles, y pedirlos todos a la vez a Google suele acabar en 429.
  for (const destino of lista) {
    try {
      const r = await enviarUno(destino, aviso, cuenta, proyecto);
      if (r.ok) {
        enviados++;
      } else {
        if (tokenMuerto(r.status as number, r.texto as string)) muertos.push(destino.token);
        else errores.push(`${r.status}: ${String(r.texto).slice(0, 120)}`);
      }
    } catch (e) {
      errores.push(e instanceof Error ? e.message : String(e));
    }
  }

  if (muertos.length) {
    await admin.from("push_tokens").delete().in("token", muertos);
  }

  return Response.json({
    enviados,
    fallidos: errores.length,
    moviles_borrados: muertos.length,
    detalle: errores.slice(0, 5),
  });
});
