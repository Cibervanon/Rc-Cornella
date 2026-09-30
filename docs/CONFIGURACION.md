# Configurar el servidor (Supabase, correo y Google)

Esta guía es el paso a paso para encender la versión con servidor. La aplicación
está preparada para funcionar de las dos formas:

| | Sin configurar nada (por defecto) | Con el servidor encendido |
|---|---|---|
| Dónde se guardan los datos | En el navegador (`localStorage`) | En Supabase, con copia en el navegador |
| Cuántas personas pueden usarlo | Una, en un dispositivo | Todas las del club, cada una con su cuenta |
| Contraseñas | Guardadas en el dispositivo | En Supabase Auth |
| Avisos | Solo dentro de la app | Dentro de la app, **por correo** (Resend) y **push** (Firebase), cada canal opcional |
| Google | No aparece | Botón «Continuar con Google» |

Mientras `js/config.js` tenga los valores vacíos, sigue todo en modo local. Se
puede publicar y probar esta versión antes de tocar nada de lo que ya funciona.

---

## 0. Lo que hace falta tener a mano

Cuatro cosas. Ninguna es cara: todas tienen plan gratuito suficiente para un
club de rugby. La quinta, Firebase, es opcional y está en la sección 9.

| Qué | Para qué | Dónde se pide |
|---|---|---|
| Proyecto de Supabase | Base de datos, usuarios y reglas de acceso | [supabase.com](https://supabase.com) |
| Dominio de Resend | Enviar correos (códigos, recordatorios, avisos) | [resend.com](https://resend.com) |
| Credencial de Google | Entrar con Gmail | [console.cloud.google.com](https://console.cloud.google.com) |
| Sitio web publicado | Dirección pública de la app | Netlify, Vercel o GitHub Pages |

El **paso 4 es el primero de todos**: la dirección pública hace falta para
configurar Google, y Google no se puede configurar sin ella.

---

## 1. Publicar la app y quedarse con la dirección

Vale cualquiera de estas dos, en dos minutos.

### Opción A — Netlify Drop (sin cuenta, para probar)

1. Entra en [app.netlify.com/drop](https://app.netlify.com/drop).
2. Arrastra **la carpeta del proyecto** (la que contiene `index.html`).
3. Te da una dirección tipo `https://aleatoriocosas-123.netlify.app`.

### Opción B — Netlify o Vercel con cuenta (para dejarlo bien)

1. Sube el proyecto a un repositorio de GitHub.
2. En Netlify: *Add new site → Import an existing project*.
3. Build command: **vacío**. Publish directory: **`.`**.
4. Si lo subes a un subdirectorio, en `netlify.toml`:
   ```toml
   [[redirects]]
     from = "/*"
     to = "/index.html"
     status = 200
   ```

**Anota la dirección.** El resto de la guía la necesita. Por ejemplo
`https://rccornella.netlify.app`.

> En pruebas, la dirección de Netlify cambia en cada despliegue si usas Drop.
> Cuando te fijes, cambia a un sitio con dominio propio y repite desde el paso 2.

---

## 2. Supabase: proyecto y dirección de la API

1. Crea un proyecto en [supabase.com](https://supabase.com) —*[New project](https://supabase.com/dashboard)*.
2. Guarda la contraseña de la base de datos que te pide. **Apúntala**: no se
   vuelve a ver.
3. Espera a que termine de crearse (un par de minutos).

### 2.1. Instalar el esquema

Desde el terminal, con la CLI de Supabase instalada:

```bash
cd "C:\ruta\de\tu\proyecto"
npx supabase login
npx supabase link --project-ref EL_REF_DE_TU_PROYECTO
npx supabase db push
```

`EL_REF_DE_TU_PROYECTO` está en *Project Settings → API → Project URL* y es lo
que va entre `https://` y `.supabase.co`.

O, si prefieres hacerlo a mano: abre *SQL Editor → New query*, pega el contenido
de `supabase/migrations/20260101000000_init.sql`, dale a *Run*, y luego repite
con `supabase/migrations/20260101000100_rls.sql`. **En ese orden**: el segundo
fichero presupone las funciones del primero.

### 2.2. Las dos llaves

En *Project Settings → API*:

- **Project URL** → `supabaseUrl`
- **anon / public** key → `supabaseAnonKey`

> La clave `anon` **sí** puede ir en el navegador. No es un fallo de seguridad:
> para eso existe. Lo que decide qué puede ver cada persona son las políticas
> RLS del paso 2.3, y la de `service_role` **nunca** va en el navegador.

### 2.3. Autenticación

*Authentication → Providers*, deja solo dos abiertos:

- **Email**: activado. Deja *Confirm email* **activado** la primera vez, para no
  dejar cuentas falsas; puedes desactivarlo cuando el club esté en marcha.
- **Google**: pulsa *Configure* y rellena **Client ID** y **Client Secret** con
  los del paso 3.

  > **El campo "Client IDs" (en plural) también se rellena.** Acepta una lista
  > de IDs de cliente de Google separados por comas, siendo el **Web el
  > primero**. Como esta app solo tiene cliente Web, se pone el mismo Client ID
  > que en la caja anterior: no hace falta crear clientes iOS/Android.
  >
  > ```
  > Client ID:     600203581855-5649jk9tte2j34caf7291lo9jophoegl.apps.googleusercontent.com
  > Client Secret: (el nuevo, regenerado)
  > Client IDs:    600203581855-5649jk9tte2j34caf7291lo9jophoegl.apps.googleusercontent.com
  > ```
  >
  > Si el panel se niega a guardar el valor y suelta
  > `Invalid characters...`, es un fallo de validación del propio formulario:
  > deja el **Client ID** y el **Client Secret** correctos, que son los que
  > usa de verdad `signInWithOAuth`, y se puede fijar la lista por la API de
  > gestión. No lo esquives deixando la caja vacía: el panel la pide.

  Debajo, en *URL Configuration → Redirect URLs*, añade:
  ```
  https://TU-DIRECCION/
  https://TU-DIRECCION/**      (por si algún día usas subcarpetas)
  http://localhost:8000/**     (solo para pruebas en local)
  ```

  `https://localhost:5500` no sirve: los navegadores exigen seguridad en las
  redirecciones de Google, y `localhost` es la única excepción.

### 2.4. Correo de confirmación

Supabase manda sus correos desde su propio dominio, con una tasa de envío muy
baja. Para una app que se usa a diario no vale: el club se queda sin poder
entrar.

*Authentication → SMTP*, con los datos de Resend del paso 4:
- Host: `smtp.resend.com`
- Port: **465**, o **587** con STARTTLS
- Username: `resend`
- Password: la API key de Resend
- Sender: `Rugby Club Cornellà <noreply@tu-dominio.com>`

Ahora sí: se pueden confirmar correos sin límite.

---

## 3. Google: entrar con Gmail

La consola de Google ha cambiado el sitio donde se configura esto, y ya no
llama «OAuth consent screen». Si no lo ves, ve directo a
`https://console.cloud.google.com/auth/audience?project=ID_DEL_PROYECTO`.

1. Entra en [console.cloud.google.com](https://console.cloud.google.com) y abre
   el proyecto. Si el proyecto ya existe, asegúrate de que el selector de arriba
   a la izquierda muestra el correcto.
2. Abre **Google Auth Platform** (en el menú de la izquierda; en proyectos
   antiguos sigue apareciendo como *APIs y servicios*).
3. En **Audience**, lo primero que pide es rellenar **Branding**: nombre de la
   aplicación, correo de soporte y correo de contacto. Esto es lo que verá la
   familia en la pantalla de consentimiento. Pon el nombre real del club y el
   correo de la junta: si no lo rellenas, Google no deja continuar.
4. Vuelve a **Audience** y elige el tipo de usuario **External**. Es la primera
   opción de las dos, y es la correcta: el club no es una organisation interna
   de Google.
5. Pulsa **Save**. Ahora la aplicación existe.
6. Ve a **Clients** (arriba del todo). Pulsa **Create client → Web**.
7. En **Authorized redirect URIs** añade el callback de **Supabase**, que
   puedes copiar en *Authentication → Providers → Google → Callback URL*:
   ```
   https://yrkqdkwkdwrptctzedzl.supabase.co/auth/v1/callback
   ```
   **No** es la dirección de la web. El flujo va web → Supabase → Google →
   Supabase → web, así que a Google solo le vale la vuelta a `/auth/v1/callback`.
   Poner aquí `https://rccornella.netlify.app/` es el error más típico, y
   después Google responde `Error 400: redirect_uri_mismatch`.
8. En **Authorized JavaScript origins** añade el origen de la web, **sin** barra
   final, que aquí sí es el dominio de la app:
   ```
   https://rccornella.netlify.app
   ```
   Son dos campos distintos y es fácil intercambiarlos.
9. Pulsa **Create**. Te da un **Client ID** que acaba en
   `.apps.googleusercontent.com` y un **Client Secret**.

> **Importante:** la app entra con Google a través de Supabase, no
> directamente contra Google. El flujo completo es: la web llama a
> `signInWithOAuth`, Supabase redirige a Google, y Google devuelve al usuario a
> `https://yrkqdkwkdwrptctzedzl.supabase.co/auth/v1/callback`. Por eso:
>
> - El **Client ID** va en `js/config.js` y también en el panel de Supabase.
> - El **Client Secret** solo se teclea en el panel de Supabase
>   (*Authentication → Providers → Google*). En una PWA no hay forma de
>   guardarlo en secreto, así que la app nunca lo usa; por eso el código no lo
>   lleva.
> - El Client ID que ya estaba en `js/config.js` es el correcto; no hay que
>   tocarlo.
> - Como el secreto antiguo quedó expuesto (se compartió en un chat y quedó en
>   un fichero descargado), hay que ir a **Clients → el cliente Web → Reset
>   secret** y usar el nuevo en Supabase. Borrar el fichero descargado no basta:
>   el valor filtrado sigue siendo válido hasta que se regenere.

> Mientras configuráis, deja el estado en **Testing** y añade en *Test users*
> los correos de la junta. En modo Testing solo entran esos correos y las
> autorizaciones caducan a los 7 días; cuando el club vaya a usarlo de verdad,
> hay que pasarlo a **In production** y, con más de 100 usuarios, enviar la
> verificación de Google. Para un club, esto suele ser lo que más cuesta.

---

## 4. Resend: el correo

1. Crea cuenta en [resend.com](https://resend.com) y verifica tu correo.
2. *Domains → Add Domain*. Pon el dominio del club, por ejemplo
   `rugbycornella.cat`, y añade los registros DNS que te indique (normalmente
   un `TXT` de SPF y dos `MX` o `CNAME` de DKIM).
3. Espera a que el dominio aparezca en verde. Resend solo deja enviar desde
   dominios verificados: por eso `js/config.js` no acepta un Gmail como
   remitente.
4. *API Keys → Create API Key*. Guarda la clave: es un secreto de verdad.
5. Copia el identificador del dominio (lo empieza por `d`) y pon la dirección
   completa en `mailFrom`, con este formato exacto:
   ```
   Rugby Club Cornellà <noreply@rugbycornella.cat>
   ```

---

## 5. La Edge Function que envía el correo

La clave de Resend no puede ir en el navegador, así que el envío ocurre en una
función de Supabase. El código ya está escrito en
`supabase/functions/send-mail/index.ts`.

```bash
npx supabase functions deploy send-mail
npx supabase secrets set RESEND_API_KEY=re_XXXXXXXXXX
npx supabase secrets set MAIL_FROM="Rugby Club Cornellà <noreply@rugbycornella.cat>"
```

Para probar que responde:

```bash
curl -i https://EL_REF.supabase.co/functions/v1/send-mail
```

Debe contestar `200` con `{"ok":true,...}`. Si contesta `401` o `404`, casi
siempre es que la función no se ha desplegado bien.

---

## 6. Rellenar `js/config.js`

Abre `js/config.js` y rellena:

```js
window.RCC_CONFIG = {
  supabaseUrl: 'https://EL_REF.supabase.co',
  supabaseAnonKey: 'eyJhbGciOi...',
  googleClientId: '1234567890-abc.apps.googleusercontent.com',
  mailFrom: 'Rugby Club Cornellà <noreply@rugbycornella.cat>',
  syncDebounceMs: 1500,
  syncEnabled: true
};
```

Vuelve a subir el sitio. Ya está conectado.

Para probarlo en local, una cosa más: si la PWA está abierta en el móvil, el
`localhost` del ordenador no le sirve. O pruebas en el navegador del ordenador, o
sube el cambio a Netlify.

---

## 7. Probar que todo encaja

En este orden, porque si algo falla se ve dónde:

1. **La junta funda el club.** Debe aparecer «Conectando…» y entrar en la app.
2. **Genera un código de entrenador** y anótalo.
3. **Abre una ventana de incógnito** (o el móvil) y regístrate con ese código.
   Si el código no se acepta, el problema está en la Edge Function o en RLS.
4. **Manda el código por correo** desde la junta. Si no llega, el problema es
   Resend o el dominio sin verificar.
5. **Entra con Google.** Si aparece un error de `redirect_uri`, es que la URL de
   redirección no coincide carácter a carácter.
6. **Apaga y enciende** la app: los datos tienen que seguir ahí. Si desaparecen,
   mira la barra de arriba: si dice «Sin guardar en el servidor», el usuario no
   tiene permisos o falla una política.

### Si algo va mal

| Síntoma | Dónde mirar |
|---|---|
| «Conectando…» no se acaba | `js/config.js` mal escrito, o las llaves no son del proyecto |
| Botón de Google que no aparece | `googleClientId` vacío en `js/config.js` |
| `Invalid login credentials` | Email o contraseña. El mensaje en castellano llega tras traducirlo |
| `Unauthorized` o 401 en todo | La sesión no se ha establecido: revisa los redirect URLs de Supabase |
| `function ... does not exist` | Las migraciones no están instaladas: `npx supabase db push` |
| Los datos no se suben | Quien lo ha hecho no es *junta*. Revisa las políticas de `supabase/migrations/20260101000100_rls.sql` |
| El correo no llega | Dominio sin verificar en Resend, o SPF/DKIM mal puestos |

---

## 8. Cosas que conviene saber

- **Los datos se guardan en los dos sitios.** El navegador es una copia de
  trabajo, no la fuente de verdad. Si alguien trabaja sin cobertura, sigue
  adelante y sube los cambios cuando vuelve. No se pierde trabajo, pero tampoco
  se ve lo que ha hecho otra persona hasta que se sincroniza.
- **No hay borrado en cascada.** Si se borra una persona, sus datos
  relacionados se quedan ahí, y las políticas de RLS pueden dar la espalda a lo
  que queda. Es una decisión consciente: el club guarda histórico deportivo y no
  es un registro que se pueda deshacer.
- **Un jugador no tiene cuenta propia por defecto.** Se activa a mano desde su
  ficha. Es lo que evita el correo de cada menor, que no corresponde con el
  tratamiento de datos de un club.
- **Un despliegue = subir la versión en `sw.js`.** Los dispositivos que ya tengan
  la app instalada siguen con la copia cacheada. Sube el número de `CACHE`
  cuando cambies algo.
- **Los avisos van por dos canales a la vez.** El correo (Resend) y el push
  (Firebase) son opcionales e independientes: cada uno se enciende cuando está
  configurado. Con los dos vacíos, los avisos se ven solo dentro de la app, que
  es como funcionaba antes. Ver la sección 9.

---

## 9. Notificaciones push (Firebase Cloud Messaging)

Opcional. Con el bloque `firebase` de `js/config.js` vacío, no se descarga nada
de Google, no se pide permiso y la app funciona igual. La parte difícil ya
está escrita; lo que queda es rellenar cuatro valores y pegar un secreto.

La idea de por qué está repartida en dos sitios: la clave pública de Firebase
puede ir en el navegador, pero la cuenta de servicio que *permite mandar
mensajes* no. Si el móvil firmara el token por su cuenta, la clave privada
estaría en el código que descarga todo el club. Por eso el navegador solo
registra el móvil y el envío lo firma `send-push` en el servidor.

### 9.1. Crear el proyecto en Firebase

1. Entra en [console.firebase.google.com](https://console.firebase.google.com) y
   pulsa **Add project**. Se puede reutilizar el mismo proyecto de Google que
   ya usas para el login, en vez de crear otro.
2. Google Analytics no hace falta: desmarca la casilla.
3. Al terminar, en la pantalla de bienvenida, pulsa el icono **Web** (`</>`)
   para crear una app web. El nombre puede ser `Rugby Club Cornella`. No hace
   falta marcar *Firebase Hosting*.
4. Copia el bloque `firebaseConfig`. Tiene esta forma:

   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     projectId: "rugbycornella-abc12",
     storageBucket: "rugbycornella-abc12.appspot.com",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abc123"
   };
   ```

5. En **Project settings → Cloud Messaging**, busca **Web Push certificate** y
   pulsa **Create certificate**. Copia la clave que empieza por `B...`. Esta es
   la VAPID key, y es pública: va en el navegador.

Pega los cinco valores en el bloque `firebase` de `js/config.js`:

```js
firebase: {
  apiKey: 'AIza...',
  projectId: 'rugbycornella-abc12',
  storageBucket: 'rugbycornella-abc12.appspot.com',
  messagingSenderId: '1234567890',
  appId: '1:1234567890:web:abc123',
  vapidKey: 'BN3...'
}
```

### 9.2. La tabla de móviles

La migración `20260101000200_push.sql` ya está escrita. Súbela con el mismo
comando de siempre:

```bash
npx supabase db push
```

Comprueba que está:

```sql
select * from public.health_check_push();
```

### 9.3. La cuenta de servicio

Es el único secreto de verdad de esta parte.

1. En la consola de Firebase, arriba a la izquierda, pasa al icono de
   engranaje → **Project settings → Service accounts**.
2. Pulsa **Generate new private key**. Se descarga un JSON. **No lo abras en un
   editor de texto que lo pueda subir a la nube, y no lo pegues en ningún chat
   ni en `js/config.js`.**
3. Créalo dentro de un proyecto nuevo si es posible: esta clave puede mandar
   push a cualquier usuario de tu club, y no hay forma de limitarla por
   dispositivo. Es el equivalente a la clave de Resend, pero con más alcance.

### 9.4. La función que envía

```bash
npx supabase functions deploy send-push
```

El JSON tiene saltos de línea y comillas dobles, así que en PowerShell hay que
escaparlos; en `cmd` o en Git Bash va directo:

```bash
# Git Bash / macOS / Linux
npx supabase secrets set FCM_SERVICE_ACCOUNT="$(cat ruta/al/archivo.json)"

# PowerShell
npx supabase secrets set FCM_SERVICE_ACCOUNT="$(Get-Content ruta.json -Raw)"
```

Comprueba que la función ve el secreto:

```bash
curl https://EL_REF.supabase.co/functions/v1/send-push/health
```

```json
{ "ok": true, "cuenta_servicio": true, "proyecto": "rugbycornella-abc12" }
```

Si `cuenta_servicio` sale en `false`, el JSON llegó mal copiado.

### 9.5. Probarlo

1. Publica la app otra vez (con la configuración ya rellena) y **reinicia el
   navegador**: los ficheros están cacheados a propósito.
2. Entra con una cuenta de junta, entrenador o coordinadora. Los roles de
   familia y jugador no ven el interruptor, porque solo el cuerpo técnico
   dispara avisos.
3. En *Tu cuenta* aparece **Activar los avisos**. Púlsalo y acepta el permiso.
4. Comprueba que la tabla se ha llenado:

   ```sql
   select left(token, 12) as token, user_id, plataforma, created_at
     from public.push_tokens;
   ```

5. Con el móvil en el bolsillo, desde la cuenta de un entrenador abre
   *Convocatorias*, convoca a alguien y confirma. Quien estaba en la lista
   recibe el push en su móvil.
6. Repite con la app cerrada del todo: el aviso tiene que llegar igual. Si solo
   suena con la app abierta, el service worker no está controlando la
   notificación.

En iPhone y iPad **no va a funcionar** hasta que alguien añada la app a la
pantalla de inicio. Apple no da web push a las PWA que se abren en el navegador.
Por eso el interruptor explica eso en vez de fallar en silencio.

### Si algo va mal

| Síntoma | Dónde mirar |
|---|---|
| El interruptor no aparece | `firebase` mal pegado, o no se ha republished. `js/config.js` va siempre por red, pero el resto está cacheado |
| «No se ha podido cargar Firebase» | Bloqueador de contenido o sin conexión a `gstatic.com` |
| Llega con la app abierta y no cerrada | El service worker viejo sigue activo. Subir `CACHE` a `rccornella-v7` |
| `Google rechazó la cuenta de servicio` | El JSON del secreto está mal copiado, o le falta el `private_key` |
| `Tu perfil no puede enviar avisos` | Quien manda el aviso es una familia. Solo junta, entrenador y coordinadora |
| En el móvil sale «notificaciones bloqueadas» | El permiso se denegó antes. En Chrome, el candado de la barra de direcciones |
| En iPhone no suena nada | Falta instalarla en la pantalla de inicio. No es un fallo |
