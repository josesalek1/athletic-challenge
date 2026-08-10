-- ============================================================
-- ATHLETIC CHALLENGE — v12
-- Community video feed, limited reactions, short comments and moderation.
-- Run after migration-v11.sql.
-- ============================================================

alter table public.videos
  add column if not exists description text not null default '',
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists status text not null default 'published',
  add column if not exists moderated_by uuid references public.profiles(id) on delete set null,
  add column if not exists moderated_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.videos drop constraint if exists videos_title_length_check;
alter table public.videos add constraint videos_title_length_check
  check (length(trim(title)) between 2 and 80);
alter table public.videos drop constraint if exists videos_description_length_check;
alter table public.videos add constraint videos_description_length_check
  check (length(description) <= 500);
alter table public.videos drop constraint if exists videos_url_protocol_check;
alter table public.videos add constraint videos_url_protocol_check
  check (url ~* '^https?://');
alter table public.videos drop constraint if exists videos_status_check;
alter table public.videos add constraint videos_status_check
  check (status in ('published', 'hidden'));

create index if not exists videos_feed_order
  on public.videos (status, created_at desc);

create table if not exists public.video_reactions (
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null check (reaction in ('strong', 'fire', 'clap')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (video_id, user_id)
);

create index if not exists video_reactions_video_idx
  on public.video_reactions (video_id);

create table if not exists public.video_comments (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 100),
  hidden boolean not null default false,
  moderated_by uuid references public.profiles(id) on delete set null,
  moderated_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists video_comments_video_order
  on public.video_comments (video_id, created_at);

alter table public.video_reactions enable row level security;
alter table public.video_comments enable row level security;

-- Feed posts: members read published posts, authors manage their own posts,
-- and administrators can manage or moderate every post.
drop policy if exists "active members read videos" on public.videos;
drop policy if exists "admins create videos" on public.videos;
drop policy if exists "admins update videos" on public.videos;
drop policy if exists "admins delete videos" on public.videos;
drop policy if exists "active members read feed videos" on public.videos;
drop policy if exists "active members create feed videos" on public.videos;
drop policy if exists "authors or admins update feed videos" on public.videos;
drop policy if exists "authors or admins delete feed videos" on public.videos;

create policy "active members read feed videos" on public.videos
  for select to authenticated
  using (
    (select public.is_active_member())
    and (status = 'published' or (select public.is_admin()))
  );

create policy "active members create feed videos" on public.videos
  for insert to authenticated
  with check (
    (select public.is_active_member())
    and created_by = (select auth.uid())
    and status = 'published'
  );

create policy "authors or admins update feed videos" on public.videos
  for update to authenticated
  using (
    (created_by = (select auth.uid()) and (select public.is_active_member()))
    or (select public.is_admin())
  )
  with check (
    (created_by = (select auth.uid()) and status = 'published' and (select public.is_active_member()))
    or (select public.is_admin())
  );

create policy "authors or admins delete feed videos" on public.videos
  for delete to authenticated
  using (
    (created_by = (select auth.uid()) and (select public.is_active_member()))
    or (select public.is_admin())
  );

-- Reactions are deliberately limited to one of three choices and one reaction
-- per member per post. A second choice replaces the first.
drop policy if exists "active members read video reactions" on public.video_reactions;
drop policy if exists "members create own video reaction" on public.video_reactions;
drop policy if exists "members update own video reaction" on public.video_reactions;
drop policy if exists "members delete own video reaction" on public.video_reactions;
drop policy if exists "admins delete video reactions" on public.video_reactions;

create policy "active members read video reactions" on public.video_reactions
  for select to authenticated
  using (
    (select public.is_active_member())
    and exists (
      select 1 from public.videos
      where videos.id = video_reactions.video_id
        and (videos.status = 'published' or (select public.is_admin()))
    )
  );

create policy "members create own video reaction" on public.video_reactions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.is_active_member())
    and exists (
      select 1 from public.videos
      where videos.id = video_reactions.video_id and videos.status = 'published'
    )
  );

create policy "members update own video reaction" on public.video_reactions
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_member()))
  with check (
    user_id = (select auth.uid())
    and (select public.is_active_member())
    and exists (
      select 1 from public.videos
      where videos.id = video_reactions.video_id and videos.status = 'published'
    )
  );

create policy "members delete own video reaction" on public.video_reactions
  for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_member()));

create policy "admins delete video reactions" on public.video_reactions
  for delete to authenticated
  using ((select public.is_admin()));

-- Comments are visible to the group unless an administrator hides them.
-- Authors may delete their own comments; only admins may change moderation.
drop policy if exists "active members read video comments" on public.video_comments;
drop policy if exists "members create own video comments" on public.video_comments;
drop policy if exists "admins moderate video comments" on public.video_comments;
drop policy if exists "authors or admins delete video comments" on public.video_comments;

create policy "active members read video comments" on public.video_comments
  for select to authenticated
  using (
    (select public.is_active_member())
    and (
      ((not hidden) and exists (
        select 1 from public.videos
        where videos.id = video_comments.video_id and videos.status = 'published'
      ))
      or (select public.is_admin())
    )
  );

create policy "members create own video comments" on public.video_comments
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and hidden = false
    and (select public.is_active_member())
    and exists (
      select 1 from public.videos
      where videos.id = video_comments.video_id and videos.status = 'published'
    )
  );

create policy "admins moderate video comments" on public.video_comments
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "authors or admins delete video comments" on public.video_comments
  for delete to authenticated
  using (
    (user_id = (select auth.uid()) and (select public.is_active_member()))
    or (select public.is_admin())
  );

grant select, delete on public.videos to authenticated;
revoke insert, update on public.videos from authenticated;
grant insert (title, url, description, challenge_id, created_by, status, sort_order) on public.videos to authenticated;
grant update (title, url, description, challenge_id, sort_order, updated_at) on public.videos to authenticated;
grant select, insert, update, delete on public.video_reactions to authenticated;
grant select, delete on public.video_comments to authenticated;
revoke insert, update on public.video_comments from authenticated;
grant insert (video_id, user_id, body) on public.video_comments to authenticated;

create or replace function public.admin_moderate_video(target_video_id uuid, should_hide boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  update public.videos
  set status = case when should_hide then 'hidden' else 'published' end,
      moderated_by = case when should_hide then (select auth.uid()) else null end,
      moderated_at = case when should_hide then now() else null end,
      updated_at = now()
  where id = target_video_id;

  if not found then raise exception 'Video post not found.'; end if;
end;
$$;

create or replace function public.admin_moderate_video_comment(target_comment_id uuid, should_hide boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  update public.video_comments
  set hidden = should_hide,
      moderated_by = case when should_hide then (select auth.uid()) else null end,
      moderated_at = case when should_hide then now() else null end
  where id = target_comment_id;

  if not found then raise exception 'Comment not found.'; end if;
end;
$$;

revoke all on function public.admin_moderate_video(uuid, boolean) from public, anon;
revoke all on function public.admin_moderate_video_comment(uuid, boolean) from public, anon;
grant execute on function public.admin_moderate_video(uuid, boolean) to authenticated;
grant execute on function public.admin_moderate_video_comment(uuid, boolean) to authenticated;

comment on table public.video_reactions is
  'One limited emoji reaction per active member and community video.';
comment on table public.video_comments is
  'Community video comments, limited to 100 characters and subject to admin moderation.';
