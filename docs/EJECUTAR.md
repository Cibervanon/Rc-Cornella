# Cómo ejecutar la app y convertirla en APK

## 1. Abrirla en el ordenador

Descomprime la carpeta y abre `index.html` con el navegador. Ya funciona: no hace falta instalar nada ni tener conexión.

> **Aviso:** abriéndola con doble clic (protocolo `file://`) el modo sin conexión no se activa, porque los navegadores no permiten registrar un *service worker* desde el sistema de archivos. Todo lo demás funciona igual. Para probar el modo sin conexión, sirve la carpeta por HTTP (paso 2).

## 2. Servirla por HTTP en local

Desde la carpeta del proyecto:

```bash
# Con Python (ya instalado en Mac y Linux)
python3 -m http.server 8080

# O con Node
npx serve .
```

Abre `http://localhost:8080`. Ahora sí se registra el modo sin conexión: desconecta el wifi, recarga y comprobarás que sigue abriendo.

Para probarlo desde el móvil en la misma red, usa la IP del ordenador: `http://192.168.1.X:8080`.

## 3. Publicarla en internet

Cualquier alojamiento de archivos estáticos sirve. El más rápido:

1. Entra en [app.netlify.com/drop](https://app.netlify.com/drop)
2. Arrastra la carpeta entera
3. Te da una URL con HTTPS

También valen Vercel, GitHub Pages o Cloudflare Pages. **Hace falta HTTPS** para que funcione el modo sin conexión y para poder instalarla como aplicación.

## 4. Instalarla como aplicación

Una vez publicada con HTTPS:

- **Android (Chrome):** menú ⋮ → *Añadir a la pantalla de inicio*
- **iPhone (Safari):** botón compartir → *Añadir a pantalla de inicio*

Se abre a pantalla completa, sin barra del navegador, con el escudo del club como icono.

---

## 5. Convertirla en APK

La app es una PWA, así que se empaqueta sin tocar el código.

### Opción A — PWABuilder (la más sencilla)

1. Publica la app con HTTPS (paso 3).
2. Entra en [pwabuilder.com](https://www.pwabuilder.com) y pega la URL.
3. Pulsa **Package for stores** → **Android**.
4. Descarga el paquete. Dentro vienen el `.apk` para probar y el `.aab` para Google Play.

PWABuilder genera una *Trusted Web Activity*: la app se instala como nativa y abre tu web a pantalla completa. Te pedirá subir un archivo `assetlinks.json` a `/.well-known/` de tu dominio para que no aparezca la barra del navegador.

### Opción B — Bubblewrap (línea de comandos)

```bash
npm install -g @bubblewrap/cli
bubblewrap init --manifest https://TU-DOMINIO/manifest.json
bubblewrap build
```

Genera `app-release-signed.apk`. Requiere tener instalado el JDK y el SDK de Android.

### Opción C — Capacitor (si quieres funciones nativas)

Solo si más adelante necesitas cámara, notificaciones push nativas o biometría:

```bash
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init "RC Cornellà" com.rccornella.app --web-dir=.
npx cap add android
npx cap sync
npx cap open android
```

Se abre Android Studio y desde ahí se compila el APK. Esta opción empaqueta los archivos dentro de la app, así que **funciona sin dominio ni conexión desde el primer arranque**.

### Qué opción elegir

| Situación | Opción |
|---|---|
| Solo quieres el APK para repartirlo por WhatsApp | **A — PWABuilder** |
| Vas a publicar en Google Play | **A o B** (necesitas el `.aab`) |
| Quieres que funcione sin dominio propio | **C — Capacitor** |
| Necesitarás cámara o push nativas | **C — Capacitor** |

---

## 6. Antes de generar el APK

Revisa estos cuatro puntos:

- [x] **Iconos.** Ya están generados y declarados en el manifiesto:

| Archivo | Tamaño | Para qué |
|---|---|---|
| `icon-192.png` | 192×192 | Pantalla de inicio de Android |
| `icon-512.png` | 512×512 | Splash y listados |
| `icon-maskable-512.png` | 512×512 | Android adaptativo (zona segura del 62%) |
| `icon-1024.png` | 1024×1024 | Google Play y App Store |
| `apple-touch-icon.png` | 180×180 | iPhone y iPad |
| `favicon.png` | 64×64 | Pestaña del navegador |

Todos salen del escudo del club: fondo negro, borde naranja, franjas rojigualdas, balón y el lema **des de 1931**. La versión maskable encoge el contenido para que Android pueda recortarlo en círculo sin cortar el escudo.

Si quieres regenerarlos tras cambiar algo:

```bash
python3 build-icons.py
```

- [ ] **Versión del caché.** Si cambias algún archivo, sube el número en `sw.js` (`const CACHE = 'rccornella-v4'` → `v5`). Si no, los dispositivos que ya la tengan seguirán con la versión vieja.

- [ ] **Nombre del paquete.** El manifiesto ya declara `com.rccornella.app` como identificador. Usa ese mismo en PWABuilder o Bubblewrap: una vez publicado en Play no se puede cambiar.

- [ ] **Copia de seguridad.** Los datos viven en el dispositivo. Antes de repartir el APK, explica a la junta que deben exportar la copia periódicamente desde **Club → Copia de seguridad**.

---

## 7. Limitación importante

Los datos se guardan en el navegador de cada dispositivo (`localStorage`). Eso significa que **cada persona tiene su propia copia aislada**: lo que registra el entrenador no lo ve la familia.

Para uso real compartido hace falta un servidor. Mientras tanto, la app es perfectamente válida para:

- Que un entrenador lleve su equipo, sus alineaciones y sus actas de partido
- Enseñarla a clubes para validar si el producto les interesa
- Que la junta lleve el registro LOPIVI y las cuotas

Si decides dar el paso al servidor, la capa de datos está centralizada en `js/store.js` dentro del objeto `Data`, y todas las vistas hablan solo con ella. Sustituir el almacenamiento local por llamadas a un servidor no obliga a tocar ninguna pantalla.

---

## 8. Estructura de archivos

```
index.html              punto de entrada
styles.css              sistema visual completo
manifest.json           datos de la PWA, con los iconos declarados
sw.js                   modo sin conexión
build-icons.py          genera los PNG a partir del escudo
icon-*.png              iconos de la aplicación
apple-touch-icon.png    icono de iOS
favicon.png             icono del navegador
test.js                 498 comprobaciones (node test.js)
js/
  icons.js              45 iconos SVG y el escudo
  store.js              datos, roles, posiciones y reglas
  ui.js                 utilidades de presentación
  gate.js               acceso y registro
  coach.js              entrenador
  family.js             familia y jugador
  match.js              día de partido
  board.js              junta directiva
  shell.js              navegación y sesión
docs/
  EJECUTAR.md           este documento
FUNCIONALIDADES.html    catálogo de funciones y estado
README.md               resumen del proyecto
```

## 9. Comprobar que todo sigue bien

```bash
node test.js
```

Debe terminar con **498 comprobaciones correctas**. Si tocas el código y algo se rompe, el test te dice exactamente qué.
