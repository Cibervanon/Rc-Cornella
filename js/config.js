/* ============================================================================
   Configuración de la aplicación
   ----------------------------------------------------------------------------
   Este es el ÚNICO fichero que hay que rellenar para encender el servidor.
   Lee docs/CONFIGURACION.md: ahí está el paso a paso de dónde sacar cada valor.

   Lo que va aquí es PÚBLICO. Todo lo que hay en este fichero acaba en el código
   que descarga cualquier persona que abra la app. No es un problema: la clave
   pública de Supabase está pensada para ser pública, y lo que cada persona puede
   ver o hacer lo deciden las políticas RLS de supabase/migrations/.

   Lo que NUNCA debe aparecer aquí:
     · la clave de Resend (RESEND_API_KEY)
     · el secreto de servicio de Supabase (service_role)
     · el secreto de OAuth de Google (client_secret)
   Esos van como secretos de la Edge Function, en el servidor. En el navegador
   no hay sitio donde guardarlos en condiciones: cualquiera que abra las
   herramientas de desarrollo los vería.
   ============================================================================ */

window.RCC_CONFIG = {

  /* ---------- Supabase ---------- */
  /* Project Settings → API → Project URL.
     OJO: es la raíz, https://PROYECTO.supabase.co. Si copias la dirección
     terminada en /rest/v1/, la librería remata las rutas y nada funciona. */
  supabaseUrl: 'https://yrkqdkwkdwrptctzedzl.supabase.co',

  /* La clave que empieza por sb_publishable_ es la nueva clave pública.
     Es pública por diseño: el acceso lo controlan las políticas RLS. */
  supabaseAnonKey: 'sb_publishable_32UEqe9q9qGP_LzhWjKCUw_zTQiptNa',

  /* ---------- Google Sign-In ---------- */
  /* Google Cloud → APIs y servicios → Credenciales → ID de cliente OAuth 2.0.
     Solo el ID, que termina en .apps.googleusercontent.com. El client_secret
     NO se pone aquí: no se usa y no se puede guardar en un navegador. */
  googleClientId: '',

  /* ---------- Correo (Resend) ---------- */
  /* Dirección de REMITENTE verificada en resend.com/domains, con este formato:
     Club <noreply@tu-dominio>. Vacío hasta que haya dominio. Sin esto, los
     correos no se envían y la app sigue funcionando igual. */
  mailFrom: '',

  /* ---------- Notificaciones push (Firebase Cloud Messaging) ----------
     Opcional. Vacío = no se carga nada de Firebase y no hay push; todo lo demás
     sigue igual. Para rellenarlo: consola de Firebase → Project Settings →
     General → tus apps web, y Cloud Messaging → Web Push certificate. */
  firebase: {
    apiKey: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
    vapidKey: ''
  },

  /* ---------- Opciones ---------- */

  /* Tiempo que se agrupan los cambios antes de subirlos al servidor.
     Más alto = menos peticiones, pero se pierde más trabajo si alguien cierra
     la pestaña justo después de guardar. 1500 ms es un buen equilibrio. */
  syncDebounceMs: 1500,

  /* Ponerlo en false mientras se prueba, para no subir nada de momento. */
  syncEnabled: true
};
