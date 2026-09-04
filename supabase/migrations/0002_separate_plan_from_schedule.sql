-- Uma obrigação editorial não é o mesmo que um agendamento na plataforma.
alter table public.publications add column planned_for date;
update public.publications set planned_for = scheduled_for::date where planned_for is null;
alter table public.publications alter column planned_for set not null;
alter table public.publications alter column scheduled_for drop not null;

create unique index publications_plan_slot_unique
  on public.publications (project_id, platform, planned_for);
