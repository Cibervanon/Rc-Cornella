# Rugby Club Cornellà

Aplicación de gestión del club. Arranca **completamente vacía**: no hay usuarios, jugadores ni eventos de demostración. Todo se crea cuando alguien funda el club y el resto se registra.

Abre `index.html` en el navegador. Funciona sin servidor.

---

## Identidad del club

Los colores no son decorativos: salen del club real. El Rugby Club Cornellà se fundó en **1931** y es uno de los clubes de rugby más antiguos de España; juega en el Estadi Municipal Pilar Pons. Su equipación oficial es **camiseta negra con detalles blancos, pantalón negro y medias blanco y negro**, y su escudo combina el negro con un borde naranja sobre las franjas rojigualdas.

De ahí sale la paleta: negro `#121212` como color dominante, naranja `#E8590C` como único acento, y neutros cálidos. Nada más.

---

## Decisiones tomadas contra el aspecto "generado"

La homogeneidad visual de las apps generadas con IA tiene patrones reconocibles. Estos se han evitado de forma deliberada:

| Patrón típico | Qué se ha hecho aquí |
|---|---|
| Paleta de cinco colores saturados sin jerarquía | Un color dominante, un acento, neutros. Nada más |
| Gradientes morados y glows decorativos | Ninguno. El único gradiente es el fondo de la pantalla de acceso |
| **Emoji como iconos de interfaz** | 45 iconos SVG con trazo uniforme de 1.75 sobre rejilla de 24 |
| Tarjeta dentro de tarjeta dentro de tarjeta | Una sola capa de superficie. Las métricas van separadas por línea, sin caja propia |
| Todo redondeado a 16px | Radios contenidos: 4, 8 y 12 según el peso del elemento |
| Padding excesivo y centrado | Densidad de aplicación real, alineación a la izquierda |
| Copy vago de plantilla | Cada texto dice algo concreto y accionable |

Hay una prueba automática que verifica que no se cuela ningún emoji en la interfaz ni ningún gradiente morado.

---

## Cómo se entra: control de acceso por códigos

Nadie elige su rol. **El rol lo determina el código**, y los códigos los reparte la junta.

| Código | Quién lo genera | Alcance | Caducidad |
|---|---|---|---|
| **Familias** | Se crea solo al fundar el club | Uso ilimitado, solo da rol de familia | No caduca |
| **Entrenador** | Solo la junta | **Un solo uso**, nominal | 30 días |
| **Junta** | Solo otro miembro de la junta | **Un solo uso** | 30 días |

Esto responde directamente a la pregunta de cómo se impide que alguien se registre como entrenador: **no puede**. El código general que circula por el grupo de padres solo abre la puerta como familia. Para ser entrenador hace falta un código nominal, de un solo uso, que caduca, y que solo existe si alguien de la junta lo ha generado para esa persona concreta.

El código se valida **antes** de pedir ningún dato personal, para que nadie rellene un formulario entero y descubra al final que no tiene acceso.

---

## Primer arranque

1. Abre la app. No hay club: te ofrece crearlo.
2. Asistente de 3 pasos: datos del club, categorías con sus cuotas, y tu cuenta de administrador.
3. Quedas como junta directiva y aparece un **checklist de puesta en marcha** con los 6 pasos pendientes y un botón para el siguiente.
4. Generas un código de entrenador, se lo das a esa persona, y él se registra.
5. Compartes el código general con las familias, que se registran e inscriben a sus hijos.
6. El entrenador ya ve su plantilla y puede convocar.

Cada pantalla vacía explica qué falta y ofrece el botón para resolverlo. Ninguna deja un hueco en blanco.

---

## Los cuatro perfiles

### Junta directiva
Panel con checklist de puesta en marcha que se convierte en resumen cuando está todo listo · Personas, con generación y control de códigos · Cuotas con emisión mensual y estados SEPA reales · LOPIVI con semáforo por técnico · Configuración de categorías y cuotas.

### Entrenador
**Hoy**: próximo evento con el desglose de confirmaciones y un botón único para recordar solo a quien no ha respondido · **Agenda** · **Equipo**, ordenable por menor asistencia, que es como se detectan los problemas · **Ficha del jugador** con objetivos, valoración por estrellas y notas privadas · **Sesiones** con biblioteca de ejercicios de rugby.

En el detalle del evento: confirmaciones agrupadas empezando por los que faltan, convocatoria que preselecciona a quien ha confirmado y avisa de lesionados, y pasar lista con cuatro botones por jugador.

### Familia
Lo primero que ve es **lo que falta por responder**, con tres botones grandes. No hace falta abrir el evento para confirmar. Inscripción de hijos con descuento automático del 15% al segundo hermano, firma de documentación y domiciliación de la cuota.

### Jugador
Misma estructura que familia, pero solo se ve a sí mismo, sin la parte económica.

---

## Privacidad

| Dato | Entrenador | Familia | Jugador | Junta |
|---|---|---|---|---|
| Plantilla y asistencia | Solo su equipo | Solo sus hijos | Solo él | Todo |
| Datos económicos | **No** | Solo sus recibos | **No** | Todo |
| Contacto de otras familias | **No** | **No** | **No** | Sí |
| Valoraciones | Todas las de su equipo | **Solo las compartidas** | Solo las compartidas | Todas |
| Notas privadas del técnico | **Solo las suyas** | **Nunca** | **Nunca** | **Nunca** |

Verificado con pruebas: un entrenador no ve las notas de otro, y la familia no ve una valoración hasta que el entrenador decide compartirla explícitamente.

---

## Pruebas

```bash
node test.js        # 498 comprobaciones de los flujos de la app
node test-nube.js   # 66 comprobaciones de la sincronización con el servidor
node test-carga.js  # el orden de los scripts y la caché del service worker
```

Las dos primeras no necesitan red, ni cuentas, ni Docker: `test-nube.js` trabaja
contra un Supabase falso y comprueba que solo se sube lo que ha cambiado, que un
fallo del servidor no pierde nada y que sin sesión no se sube nada.

**498 comprobaciones** en 18 bloques, simulando cada perfil de principio a fin, incluido un partido completo:

1. Arranque en blanco, sin datos precargados
2. Fundación del club y validaciones
3. Control de acceso: códigos inválidos, caducados, ya usados, y **que un código de familia nunca da permisos de entrenador**
4. Alta del entrenador, asignación automática de equipo, y que no puede crear códigos ni emitir cuotas
5. Alta de familia, inscripción de dos hermanos, descuento, documentos y mandato SEPA con validación de IBAN
6. Ciclo completo: crear evento → RSVP automático → recordatorio solo a pendientes → respuesta con motivo → convocatoria → pasar lista
7. Privacidad: valoraciones no compartidas, notas de otro entrenador, alcance de la familia
8. Jugador con cuenta propia
9. Emisión de cuotas, descuento de hermanos, no duplicar periodo, estados SEPA
10. LOPIVI y asignación de técnicos sin equipo
11. Inicio de sesión, credenciales inválidas, cambio de contraseña
12. Interfaz: sin emoji, sin gradientes morados, áreas táctiles de 44px, etiquetas accesibles, colores del club
13. Robustez: escapado de HTML, entidades inexistentes
14. Integridad referencial y borrado en cascada
15. Edición de fichas, eventos, códigos y exportación
16. Día de partido, posiciones oficiales, físico y grupos A/B
17. Cierre de temporada
18. Partido completo: convocatoria, alineación, dos partes, cambios y acta

Las pruebas encontraron un fallo real durante el desarrollo: al dar de baja a un deportista quedaba huérfana su inscripción. Corregido con borrado en cascada.

---

## Archivos

```
index.html
styles.css          sistema visual
sw.js               modo sin conexión
build-icons.py      genera los iconos desde el escudo
icon-*.png          iconos de la aplicación
manifest.json       PWA
test.js             498 comprobaciones de flujo
test-nube.js        66 comprobaciones de la capa de servidor
test-carga.js       comprueba el orden de carga de los scripts
js/
  config.js         lo único que hay que rellenar para encender el servidor
  icons.js          45 iconos SVG + escudo del club
  store.js          datos, roles, códigos y reglas de negocio
  ui.js             helpers de presentación
  gate.js           fundación, registro con código, inicio de sesión
  coach.js          entrenador
  family.js         familia y jugador
  board.js          junta directiva
  match.js          día de partido
  backend.js        Supabase: hidratación, sincronización y correo
  fcm.js            avisos push en el móvil (opcional, vía Firebase)
  shell.js          sesión, navegación y render
supabase/
  migrations/       esquema, políticas RLS y tabla de push
  functions/        Edge Functions: send-mail (Resend) y send-push (Firebase)
docs/
  EJECUTAR.md       cómo ejecutarla y convertirla en APK
  CONFIGURACION.md  cómo encender el servidor, paso a paso
FUNCIONALIDADES.html  catálogo completo de funciones
```

## Los datos

Por defecto viven en `localStorage`, en el navegador. Para empezar de cero:
**Más → Borrar todos los datos**.

Con el servidor encendido dejan de estar solo en el dispositivo: cada persona
tiene su cuenta y las políticas RLS deciden qué ve cada una. El paso a paso está
en [docs/CONFIGURACION.md](docs/CONFIGURACION.md); mientras `js/config.js` esté
vacío, la aplicación se comporta exactamente como hasta ahora.
