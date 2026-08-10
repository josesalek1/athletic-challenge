# Athletic Challenge

Aplicación web instalable para un grupo privado que registra retos diarios,
entrenamiento, natación, hábitos y métricas corporales. Está construida con
Next.js 15, TypeScript, Supabase y Vercel.

## Funciones actuales

- Acceso sin contraseña mediante invitación y magic link.
- Campaña grupal con fecha oficial de inicio y fin; el inicio siempre es
  `Day 1` para todos.
- Actividades configurables por datos: `timed`, `reps`, `checklist` y
  `done`.
- Resultados exactos privados. El grupo solo recibe el booleano de objetivo
  cumplido almacenado en `group_checkins`.
- Hábitos privados creados por cada miembro.
- Progress con periodos de 7, 14, 30, 60 y 90 días, tendencias de hábitos,
  fuerza, natación y peso.
- Plan personal de entrenamiento, registro de series, sesiones y natación.
- Métricas corporales privadas.
- Biblioteca de técnica con enlaces permitidos de YouTube, Vimeo y Google
  Drive.
- Panel de administración para miembros, campañas, actividades, vídeos,
  invitaciones, fechas oficiales y reinicios.
- Cola offline en IndexedDB para resultados, series, sesiones y natación.
  Algunas pantallas y operaciones todavía requieren conexión.

## Privacidad y autorización

La autorización vive en Postgres:

- RLS limita `entries`, `training_sets`, `training_sessions`,
  `swim_sessions` y `body_metrics` a su propietario.
- Los clientes no necesitan filtrar esas tablas por `user_id`; una consulta
  ajena obtiene cero filas.
- `group_checkins` contiene únicamente el estado compartido del objetivo.
- Los hábitos con `visibility = 'private'` no generan check-ins ni aparecen
  en el mensaje de WhatsApp.
- Los GRANT por columna impiden modificar campos sensibles de los retos desde
  un cliente manipulado.
- Las acciones administrativas usan funciones `security definer` que
  comprueban `is_admin()`.

## Preparación local

Requisitos: Node.js compatible con Next.js 15 y un proyecto de Supabase.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Variables públicas:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_WHATSAPP_GROUP` (opcional)

La integración de correo y la función de asistencia con Claude usan secretos
configurados en Supabase, nunca variables públicas del navegador.

## Base de datos

En un proyecto nuevo, ejecuta en orden:

1. `supabase/schema.sql`
2. `supabase/migration-v2.sql` hasta `supabase/migration-v16.sql`

Las migraciones se aplican manualmente en el SQL Editor de Supabase. No edites
una migración que ya fue ejecutada; crea la siguiente versión.

`migration-v16.sql`:

- valida en el servidor las confirmaciones de Campaign control;
- evita que una cola offline anterior vuelva a crear actividad reiniciada;
- corrige los permisos por columna de `challenges`;
- restringe nuevos vídeos a YouTube, Vimeo y Google Drive.

Después de ejecutar las migraciones, configura en Supabase:

- Authentication con Email y magic links.
- La URL de producción y `/auth/callback` entre las redirect URLs.
- El hook de correo transaccional y sus secretos.
- Los secretos de la función que interpreta actividades con Claude.

## Rutas

La navegación principal tiene cuatro pestañas:

- `/hoy` — Today
- `/semana` — Progress
- `/training` — Training
- `/settings` — More

Rutas adicionales:

- `/videos` — biblioteca de técnica, enlazada desde Training
- `/admin` — administración, solo para administradores
- `/login` y `/auth/callback` — acceso
- `/offline` — estado sin conexión

## Verificación antes de un commit

```bash
npx tsc --noEmit
npm run build
```

Ambos comandos deben terminar sin errores. El build debe seguir generando
`/videos`, aunque esa ruta no aparezca en la barra principal.

## Límites conocidos

- No hay notificaciones push automáticas.
- No hay chat, comentarios ni reacciones.
- El modo offline es parcial y no cubre todas las operaciones.
- No existe una aplicación nativa en App Store o Google Play; es una PWA.
- La sesión debe verificarse una vez en cada dispositivo o navegador nuevo.
