-- JP Studio: operação editorial, sem armazenamento obrigatório de mídia.
create extension if not exists pgcrypto;

create type public.project_status as enum ('active', 'incubator');
create type public.publication_status as enum ('empty', 'in_progress', 'ready_to_schedule', 'scheduled', 'published');
create type public.content_type as enum ('youtube_long', 'short', 'carousel', 'image', 'spotify_episode');

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  description text,
  status public.project_status not null default 'active',
  color text,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.project_channels (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  platform text not null check (platform in ('youtube', 'instagram', 'tiktok', 'spotify')),
  is_active boolean not null default true,
  daily_cadence integer not null default 1 check (daily_cadence >= 0),
  unique (project_id, platform)
);

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  parent_content_id uuid references public.content_items(id) on delete set null,
  type public.content_type not null,
  title text not null,
  idea text,
  desired_action text,
  technical_reference text,
  script_url text,
  asset_url text,
  created_at timestamptz not null default now()
);

create table public.production_steps (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content_items(id) on delete cascade,
  block text not null,
  label text not null,
  is_required boolean not null default true,
  is_done boolean not null default false,
  completed_at timestamptz,
  sort_order integer not null default 0
);

create table public.publications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  content_id uuid references public.content_items(id) on delete set null,
  platform text not null check (platform in ('youtube', 'instagram', 'tiktok', 'spotify')),
  format text,
  scheduled_for timestamptz not null,
  status public.publication_status not null default 'empty',
  published_at timestamptz,
  publication_url text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.batch_updates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  step_label text not null,
  evidence_name text,
  evidence_url text,
  note text,
  created_at timestamptz not null default now()
);

create table public.batch_update_items (
  batch_update_id uuid not null references public.batch_updates(id) on delete cascade,
  production_step_id uuid not null references public.production_steps(id) on delete cascade,
  primary key (batch_update_id, production_step_id)
);

alter table public.projects enable row level security;
alter table public.project_channels enable row level security;
alter table public.content_items enable row level security;
alter table public.production_steps enable row level security;
alter table public.publications enable row level security;
alter table public.batch_updates enable row level security;
alter table public.batch_update_items enable row level security;

create policy "own projects" on public.projects for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own project channels" on public.project_channels for all using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())) with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));
create policy "own content" on public.content_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own steps" on public.production_steps for all using (exists (select 1 from public.content_items c where c.id = content_id and c.user_id = auth.uid())) with check (exists (select 1 from public.content_items c where c.id = content_id and c.user_id = auth.uid()));
create policy "own publications" on public.publications for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own batches" on public.batch_updates for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own batch items" on public.batch_update_items for all using (exists (select 1 from public.batch_updates b where b.id = batch_update_id and b.user_id = auth.uid())) with check (exists (select 1 from public.batch_updates b where b.id = batch_update_id and b.user_id = auth.uid()));

create index publications_schedule_index on public.publications (project_id, scheduled_for);
create index production_steps_content_index on public.production_steps (content_id, is_done);
