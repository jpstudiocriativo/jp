-- Um canal pode ter mais de uma entrega no mesmo dia.
-- Ex.: Casa de Afeto tem um Short diário e um vídeo longo às quartas.
alter table public.publications add column if not exists slot_key text not null default 'main';

drop index if exists public.publications_plan_slot_unique;
create unique index if not exists publications_plan_slot_unique
  on public.publications (project_id, platform, planned_for, slot_key);
