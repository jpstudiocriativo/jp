begin;

alter table public.project_channels drop constraint if exists project_channels_platform_check;
alter table public.project_channels add constraint project_channels_platform_check
  check (platform in ('youtube', 'instagram', 'tiktok', 'spotify', 'pinterest'));

alter table public.publications drop constraint if exists publications_platform_check;
alter table public.publications add constraint publications_platform_check
  check (platform in ('youtube', 'instagram', 'tiktok', 'spotify', 'pinterest'));

commit;
