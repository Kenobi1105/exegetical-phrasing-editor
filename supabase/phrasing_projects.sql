-- Exegetical Phrasing Editor cloud sync schema.
-- Run this in the Supabase SQL editor for the shared Supabase project.
--
-- The table name is intentionally app-scoped. This Supabase project can also
-- hold dashboard tables later without making "projects" ambiguous.

create table if not exists public.phrasing_projects (
  -- Client-side project id. This may be an existing localStorage id.
  -- It only needs to be unique per user, so the primary key is composite.
  id text not null,

  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,

  name text not null,
  verse_reference text,
  language_mode text not null default 'Other'
    check (language_mode in ('Hebrew', 'Greek', 'Other')),

  -- Full editor session JSON. Do not store IndexedDB Bible Module cache here.
  payload jsonb not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id, id)
);

create index if not exists phrasing_projects_user_updated_idx
  on public.phrasing_projects (user_id, updated_at desc);

create index if not exists phrasing_projects_user_name_idx
  on public.phrasing_projects (user_id, lower(name));

create or replace function public.set_phrasing_projects_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_phrasing_projects_updated_at
  on public.phrasing_projects;

create trigger set_phrasing_projects_updated_at
before update on public.phrasing_projects
for each row
execute function public.set_phrasing_projects_updated_at();

alter table public.phrasing_projects enable row level security;

-- Keep access explicit: authenticated users may access only their own rows.
revoke all on public.phrasing_projects from anon;
grant select, insert, update, delete on public.phrasing_projects to authenticated;

drop policy if exists "phrasing_projects_select_own"
  on public.phrasing_projects;
create policy "phrasing_projects_select_own"
on public.phrasing_projects
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "phrasing_projects_insert_own"
  on public.phrasing_projects;
create policy "phrasing_projects_insert_own"
on public.phrasing_projects
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "phrasing_projects_update_own"
  on public.phrasing_projects;
create policy "phrasing_projects_update_own"
on public.phrasing_projects
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "phrasing_projects_delete_own"
  on public.phrasing_projects;
create policy "phrasing_projects_delete_own"
on public.phrasing_projects
for delete
to authenticated
using ((select auth.uid()) = user_id);
