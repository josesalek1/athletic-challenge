# Athletic Challenge

Personal athletic tracker built with Next.js 15, TypeScript, Supabase and Vercel. The interface is in English.

## Features

- Magic link sign in for the existing owner account.
- Daily activities stored as Supabase rows. `kind` selects the timed, reps, checklist or done interface.
- Personal progress over 7, 14, 30, 60 or 90 days, with trends for activities, strength, swimming and weight.
- Training plan, workout sets, swimming sessions and body measurements.
- Technique library with YouTube, Vimeo and Google Drive links.
- A WhatsApp report composed in the browser and sent manually by the owner.
- IndexedDB queue for offline results and training logs. Some screens still require a connection.

## Database and authorization

Existing databases at v16 need only `migration-v17.sql`. For a new database, apply `supabase/schema.sql` and migrations v2 through v16, create the owner Auth account using the allow-list flow, then apply v17.

Before running v17, verify the quoted owner email on line 10. In SQL, the address must remain inside single quotes, for example `owner_email text := 'jose.salek1@gmail.com';` with no backslash before `@`. **Review this migration carefully:** it deletes every other Auth account and its personal data through foreign key cascades. It assigns the existing shared challenges and video library to the owner, removes campaigns, roles, memberships and shared check-ins, and rejects new account creation. It does not run automatically from this repository.

Postgres RLS limits profiles, challenges, entries, videos, training, swimming and body metrics to the signed in owner. The frontend does not grant access. The offline sync function checks both `auth.uid()` and challenge ownership.

Magic link sign in continues to use the existing account. Keep Supabase Email Auth, the production URL and `/auth/callback` redirect configured. The email hook can remain deployed.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Required public environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL`

## Routes

- `/hoy` — Today
- `/semana` — Progress
- `/training` — Training
- `/videos` — Technique library
- `/settings` — Account settings
- `/login` and `/auth/callback` — Sign in

## Before committing

```bash
npx tsc --noEmit
npm run build
```
