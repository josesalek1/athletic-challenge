# Lane 5

El parte diario de un grupo de cinco. Registras el reto del día en la app,
lo mandas al grupo de WhatsApp con un toque, y la natación queda solo para ti.

Next.js 15 + Supabase + Vercel. Todo en capa gratuita.

---

## Orden de montaje (~5 h)

Despliega vacío en los primeros 30 minutos. El fallo clásico es dejar el deploy
para el final y descubrir que las variables de entorno no estaban puestas.

### 1 · Supabase (30 min)

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Abre **SQL Editor** y pega entero `supabase/schema.sql`.
   **Antes de ejecutar, cambia los 5 correos** del bloque `allowed_emails`.
3. **Authentication → Providers**: deja solo *Email* activo y marca
   *Confirm email*. Desactiva el registro con contraseña.
4. **Authentication → URL Configuration**: añade a *Redirect URLs*
   `http://localhost:3000/auth/callback` y, cuando tengas el dominio de Vercel,
   `https://tu-app.vercel.app/auth/callback`.
5. Comprueba que RLS quedó activo: descomenta y ejecuta el `select` del final
   del esquema. Las 6 tablas deben salir con `rls = true`.

### 2 · Local (20 min)

```bash
npm install
cp .env.example .env.local   # y rellena las tres claves
npm run dev
```

### 3 · Vercel (20 min)

Sube el repo a GitHub, importa en Vercel, pega las mismas variables de entorno
(con `NEXT_PUBLIC_SITE_URL` apuntando ya al dominio de Vercel) y despliega.
Vuelve al paso 1.4 a añadir la URL de producción.

### 4 · Instalar en los móviles (30 min)

Cada uno abre el enlace en el navegador del teléfono:

- **iPhone**: Safari → Compartir → *Añadir a pantalla de inicio*.
  Tiene que ser Safari; en Chrome de iOS no aparece la opción.
- **Android**: Chrome → menú → *Instalar aplicación*.

Queda con icono y a pantalla completa. No hace falta App Store ni cuenta de
desarrollador.

---

## Cómo funciona cada cosa

### Los retos son datos, no código

La tabla `challenges` tiene una fila por reto y una columna `kind` que decide
qué interfaz se pinta:

| `kind` | Interfaz | `payload` guardado |
|---|---|---|
| `timed` | Reloj circular | `{"seconds": 187}` |
| `reps` | Contador ± | `{"reps": 25}` |
| `checklist` | Los 7 componentes | `{"done": ["pranayama","surya"]}` |

Para el challenge 6 insertas una fila y pones `active = true`. Sin migración y
sin tocar el código. Los cuatro anteriores están cargados con `active = false`,
así que el historial se conserva y el tablero no se ensucia.

Para cambiar la meta diaria del reto yóguico (Marco propuso 3 de 7), edita
`config.daily_goal` en esa fila.

### La natación es privada de verdad

`swim_sessions` tiene una sola política de RLS:

```sql
using (user_id = auth.uid()) with check (user_id = auth.uid())
```

Postgres devuelve cero filas a cualquier otro, aunque manipulen el cliente. La
garantía vive en la base de datos, no en un `if` del frontend. Por eso la
consulta de `app/(app)/natacion/page.tsx` no filtra por usuario: no le hace falta.

### WhatsApp: un toque, no cero

No hay envío automático. La API oficial de WhatsApp Business exige cuenta de
empresa y verificación de Meta — días, no horas. Las librerías no oficiales
(Baileys, whatsapp-web.js) necesitan un dispositivo siempre encendido, violan
los términos y el número puede acabar baneado.

En su lugar, el botón abre WhatsApp con el mensaje ya escrito
(`Día 27 ✅ Reto yóguico 1,2,5 (3/7)`). Eliges el grupo y pulsas enviar.

El formato del mensaje se decide en un solo sitio: `lib/share.ts`, función
`dayLine`. Si el grupo escribe en inglés, cámbialo ahí y cambia en toda la app.

### Vídeos

No alojamos nada. El entrenador sube a YouTube en modo **no listado** o a Drive,
y pegas el enlace en la tabla `videos`. La app lo reproduce embebido. Le cuesta
30 segundos por vídeo y para vosotros cinco es indistinguible de tenerlo dentro.

---

## Lo que falta a propósito

Un MVP de medio día. Si sobrevive a la semana tres, esto es lo siguiente:

- **Recordatorio diario.** Una función programada de Supabase a las 20:00 que
  avise a quien no haya registrado. Requiere notificaciones push.
- **Importar el historial.** WhatsApp exporta el chat en `.txt`
  (info del grupo → *Exportar chat*, sin multimedia). Un script que parsee los
  `Day N ✅` y rellene `entries` recupera los cuatro retos desde diciembre.
- **Modo sin conexión.** Ahora mismo guardar necesita red. Una cola en
  IndexedDB lo arregla.
- **Gráficas de natación.** Ritmo por 100 m a lo largo del tiempo.

## Notas

- `today()` en `lib/format.ts` usa fecha local a propósito. Con UTC, un registro
  a las 23:30 caería en el día siguiente.
- Los correos de `allowed_emails` no son legibles desde el cliente: la tabla
  tiene RLS activado y ninguna política. El trigger la consulta con
  `security definer`, así que sigue funcionando.
- La vista `week_board` usa `security_invoker = on`. Sin eso, una vista puede
  saltarse las políticas del que consulta y filtrar datos privados.
