/* ============================================================================
   Notificaciones push (Firebase Cloud Messaging)
   ----------------------------------------------------------------------------
   Opcional de principio a fin. Si `js/config.js` no tiene el bloque `firebase`,
   nada de este fichero hace nada: no se descarga la librería de Google, no se
   pide permiso y no se manda nada. La app sigue funcionando igual.

   Lo que hay aquí:
     · activar()   el jugador pulsa "Recibir avisos" y se concede el permiso.
                   El permiso NUNCA se pide al arrancar: un navegador que abre
                   una ventana de permiso sin que nadie la haya pedido es la
                   forma más rápida de que alguien la cierre para siempre.
     · enviar()     cuando la app genera una notificación, esta la replica como
                   push. Se llama desde Data.notify(), no desde cada sitio que
                   avisa, para que una notificación nueva no tenga que acordarse
                   de hacerlo dos veces.

   Lo que NO hay aquí, y es lo importante: ninguna clave privada. La del
   navegador es la clave pública de Firebase, que está pensada para ir en el
   cliente. La cuenta de servicio que permite MANDAR mensajes vive en la Edge
   Function send-push, en el servidor.
   ============================================================================ */

const FCM = {
  /* Versión fijada, igual que supabase-js. Firebase publica versiones nuevas
     con cierta frecuencia y no siempre son compatibles hacia atrás. */
  SDK: '10.12.2',
  CLAVE: 'rcc_fcm_activo',
  cargando: null,     // promesa de carga del SDK
  cola: [],
  temporizador: null,

  /* ---------- ¿está todo en su sitio? ---------- */

  config(){ return ((typeof RCC_CONFIG !== 'undefined' && RCC_CONFIG) || {}).firebase || {}; },

  configurado(){
    const c = this.config();
    return !!(c.apiKey && c.projectId && c.messagingSenderId && c.appId && c.vapidKey);
  },

  soportado(){
    return typeof navigator !== 'undefined'
      && 'serviceWorker' in navigator
      && 'PushManager' in window
      && 'Notification' in window;
  },

  /* iOS es el caso especial: desde iOS 16.4 las web push funcionan, pero solo
     si la PWA está añadida a la pantalla de inicio. En una pestaña de Safari
     el permiso no existe, y es mejor decirlo que dejar un botón que no hace
     nada. */
  esIOS(){
    if(typeof navigator === 'undefined') return false;
    return /iP(hone|ad|od)/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  },

  instaladoComoApp(){
    if(typeof window === 'undefined') return false;
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
      || window.navigator.standalone === true;
  },

  activo(){
    try{ return localStorage.getItem(this.CLAVE) === '1'; }catch(e){ return false; }
  },

  /** Situación actual, en la forma que necesita la pantalla de cuenta. */
  estado(){
    if(!this.configurado()) return 'sin-config';
    if(!this.soportado()) return 'no-soporta';
    if(this.esIOS() && !this.instaladoComoApp()) return 'ios-no-instalada';
    if(typeof Notification === 'undefined') return 'no-soporta';
    if(Notification.permission === 'denied') return 'denegado';
    if(this.activo()) return 'listo';
    return 'sin-permiso';
  },

  /* ---------- dar de alta este dispositivo ---------- */

  async activar(){
    if(!this.configurado())
      return { error: 'Las notificaciones push no están configuradas en este club' };
    if(!this.soportado())
      return { error: 'Este navegador no admite notificaciones' };
    if(this.esIOS() && !this.instaladoComoApp())
      return { error: 'En iPhone, añade antes la app a la pantalla de inicio' };

    try{
      const registro = await navigator.serviceWorker.ready;
      let permiso = Notification.permission;
      if(permiso === 'default') permiso = await Notification.requestPermission();
      if(permiso === 'denied')
        return { error: 'Has bloqueado los avisos en este navegador' };
      if(permiso !== 'granted')
        return { error: 'No se ha concedido permiso para enviar avisos' };

      const token = await this.token(registro);
      if(!token) return { error: 'Firebase no ha devuelto ningún token' };

      await this.registrar(token);
      this.escucharRotacion(token);
      try{ localStorage.setItem(this.CLAVE, '1'); }catch(e){}
      return { ok: true };
    }catch(e){
      return { error: this.mensaje(e) };
    }
  },

  async desactivar(){
    // Se avisa al servidor para que deje de mandar a este móvil. Si falla, el
    // aviso local se quita igualmente: es mejor un push de más que dejar el
    // interruptor en un estado que no corresponde con lo que ve el usuario.
    try{
      if(this.configurado() && this.soportado() && backendListo() && Backend.sb){
        await this.cargarSDK();
        const registro = await navigator.serviceWorker.ready;
        const token = await this.token(registro);
        if(token){
          const { error } = await Backend.sb.rpc('unregister_push_token', { p_token: token });
          if(error) throw error;
        }
      }
    }catch(e){ /* sin icono, pero se limpia igualmente */ }
    try{ localStorage.removeItem(this.CLAVE); }catch(e){}
    return { ok: true };
  },

  /* ---------- envío ---------- */

  /** La llama Data.notify(). No es `async` a proposito: nadie espera a que se
      mande un aviso, y un push perdido no puede romper la accion que lo provoco.
      El aviso ya esta guardado en la app; el push es solo el extra. */
  enviar(userId, datos){
    if(!userId) return;
    if(!this.activo()) return;                 // este dispositivo no los quiere
    if(!this.configurado() || !this.soportado()) return;
    if(typeof backendListo === 'undefined' || !backendListo() || !Backend.sb) return;

    this.cola.push({ userId, ...datos });

    // Una convocatoria genera un notify() por tutor, en bucle y en el mismo
    // instante. Agruparlos evita doce peticiones casi idénticas.
    if(this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = setTimeout(()=>this.vaciar(), 600);
  },

  async vaciar(){
    if(this.temporizador){ clearTimeout(this.temporizador); this.temporizador = null; }
    const lote = this.cola;
    this.cola = [];
    if(!lote.length) return;

    // Se agrupa por contenido. En una convocatoria, los tutores de un mismo
    // niño reciben el mismo texto: una sola llamada para todos, no una cada uno.
    const grupos = new Map();
    for(const a of lote){
      const k = (a.titulo || '') + '|' + (a.cuerpo || '') + '|' + (a.url || '');
      if(!grupos.has(k)){
        grupos.set(k, { titulo:a.titulo, cuerpo:a.cuerpo, url:a.url,
                        tag:a.tag, user_ids:new Set() });
      }
      grupos.get(k).user_ids.add(a.userId);
    }

    for(const g of grupos.values()){
      try{
        await Backend.sb.functions.invoke('send-push', {
          body: {
            user_ids: [...g.user_ids],
            titulo: g.titulo, cuerpo: g.cuerpo, url: g.url, tag: g.tag
          }
        });
      }catch(e){ /* el aviso ya está en la app; que falle el push no se nota */ }
    }
  },

  /* ---------- Firebase ---------- */

  async cargarSDK(){
    if(window.firebase && window.firebase.messaging) return window.firebase;
    if(this.cargando) return this.cargando;

    const base = 'https://www.gstatic.com/firebasejs/' + this.SDK + '/';
    this.cargando = new Promise((res, rej) => {
      let faltan = 2;
      const listo = () => { if(--faltan === 0) res(window.firebase); };
      this.cargarScript(base + 'firebase-app-compat.js', listo, rej);
      this.cargarScript(base + 'firebase-messaging-compat.js', listo, rej);
    });
    return this.cargando;
  },

  cargarScript(src, ok, ko){
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = ok;
    s.onerror = () => ko(new Error('No se ha podido cargar Firebase'));
    document.head.appendChild(s);
  },

  async token(registro){
    await this.cargarSDK();
    const app = window.firebase.apps.length
      ? window.firebase.app()
      : window.firebase.initializeApp(this.config());
    const msg = app.messaging();
    return await msg.getToken({
      vapidKey: this.config().vapidKey,
      serviceWorkerRegistration: registro
    });
  },

  /* Firebase rota el token por su cuenta. Sin esto, el móvil dejaría de
     recibir avisos sin previo aviso semanas después. */
  async escucharRotacion(tokenInicial){
    try{
      await this.cargarSDK();
      const app = window.firebase.app();
      app.messaging().onTokenRefresh(nuevo => {
        if(!nuevo || nuevo === tokenInicial) return;
        this.registrar(nuevo).catch(()=>{});
      });
    }catch(e){}
  },

  /* El alta y la baja van por RPC y no por un insert normal: la función
     comprueba quién llama y, si el token ya era de otra cuenta, lo reasigna.
     Con RLS sola eso no se puede hacer. */
  async registrar(token){
    const { data, error } = await Backend.sb.rpc('register_push_token', {
      p_token: token,
      p_club_id: Backend.clubId || '',
      p_plataforma: this.esIOS() ? 'ios' : 'web'
    });
    if(error) throw error;
    if(data && data.ok === false) throw new Error(data.error || 'No se ha podido registrar');
    return data;
  },

  mensaje(e){
    const m = (e && e.message) || '';
    if(/gstatic|Failed to fetch|NetworkError/i.test(m))
      return 'No se ha podido conectar con Firebase. Revisa la conexión.';
    if(/permission|denied/i.test(m))
      return 'Has bloqueado los avisos en este navegador';
    if(/registration|MISMATCHED|INVALID/i.test(m))
      return 'Firebase ha rechazado este dispositivo. Revisa la VAPID key de js/config.js';
    return m || 'No se han podido activar los avisos';
  }
};
