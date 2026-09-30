# Rc-Cornella → app Android con Android Studio

## 0. Subir los cambios a GitHub (tú, en 2 minutos)
Yo no puedo subir nada a tu cuenta: no tengo acceso con tu usuario. Los cambios son solo dos archivos (`README.md` y `docs/EJECUTAR.md`), ya corregidos en el ZIP.

```bash
git clone https://github.com/Cibervanon/Rc-Cornella.git
cd Rc-Cornella
# descomprime Rc-Cornella-corregido.zip y copia estos dos archivos encima:
#   README.md  y  docs/EJECUTAR.md
printf "node_modules/\n*.keystore\n*.jks\nkeystore.properties\n" >> .gitignore
git add .
git commit -m "Corrige guía de Capacitor y README; añade .gitignore"
git push
```
Si `git push` te pide contraseña, GitHub ya no admite la de tu cuenta: usa un *Personal Access Token* (Settings → Developer settings → Tokens) o GitHub Desktop, que inicia sesión solo.

## 1. Requisitos
- Android Studio (última versión estable). Incluye el JDK, no instales otro.
- Node.js 20 o superior (nodejs.org).
- Móvil Android con *Opciones de desarrollador → Depuración USB* activada, o un emulador desde Android Studio.

## 2. Preparar el proyecto (una sola vez)
En la carpeta del repo:

```bash
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/android
```

Abre `package.json` y sustituye el bloque `"scripts"` por este, para no copiar archivos a mano:

```json
"scripts": {
  "web": "rm -rf www && mkdir www && cp -r index.html styles.css sw.js manifest.json js icon-*.png apple-touch-icon.png favicon.png www/",
  "sync": "npm run web && npx cap sync android",
  "test": "node test.js"
}
```
(En Windows usa Git Bash o WSL para que `rm` y `cp` funcionen.)

```bash
npm run web
npx cap init "RC Cornellà" com.rccornella.app --web-dir=www
npx cap add android
npm run sync
npx cap open android
```

## 3. Probar en Android Studio
1. Espera a que termine *Gradle sync* (barra inferior, la primera vez tarda).
2. Arriba elige tu móvil o emulador y pulsa el triángulo verde **Run**.
3. Comprueba: abre a pantalla completa, funciona sin cobertura y crea un club de prueba.

## 4. Icono del escudo
Capacitor trae un icono genérico. Para poner el del club:
1. En Android Studio, clic derecho en `app/src/main/res` → *New → Image Asset*.
2. Foreground layer → *Path*: elige `icon-maskable-512.png`. Background layer → color `#121212`.
3. *Next → Finish*.

## 5. Generar el APK firmado
1. Menú *Build → Generate Signed App Bundle / APK*.
2. Elige **APK** para repartir por WhatsApp o **Android App Bundle** para Google Play.
3. *Create new…* para crear el keystore. Pon una contraseña fuerte y anota alias y contraseñas.
4. Marca *release* y pulsa *Create*. El APK sale en `android/app/release/`.
5. **Guarda el archivo `.jks` fuera del repo, en dos sitios** (nube privada + USB). Si lo pierdes, no podrás actualizar la app en Google Play.

## 6. Actualizar la app
1. Cambia el código y sube `rccornella-v4` → `v5` en `sw.js`.
2. `npm test` (deben salir 498 correctas).
3. `npm run sync`.
4. En `android/app/build.gradle` sube `versionCode` (+1) y `versionName`.
5. Vuelve a generar el APK firmado (paso 5) con el mismo keystore.

## 7. Aviso sobre los datos
Ahora cada móvil guarda sus datos en `localStorage` de la app: nadie ve lo de los demás y desinstalar borra todo. Vale para enseñarla o que un entrenador lleve su equipo, no para repartirla a familias. Para eso falta la fase servidor (Supabase), que necesita: Project URL y clave `anon` (región UE). Nunca la clave `service_role`.
