-- Complementa as políticas existentes: relações também devem pertencer à conta.
-- Compatível com as migrações 0001–0003; não altera nem apaga dados.
begin;

-- Consulta restrita à identidade autenticada. A função evita uma política
-- recursiva quando um conteúdo aponta para outro conteúdo (reaproveitamento).
create or replace function public.jp_owns_content_in_project(
  target_content_id uuid,
  target_project_id uuid
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.content_items c
    join public.projects p on p.id = c.project_id
    where c.id = target_content_id
      and c.project_id = target_project_id
      and c.user_id = (select auth.uid())
      and p.user_id = (select auth.uid())
  );
$$;

revoke all on function public.jp_owns_content_in_project(uuid, uuid) from public;
revoke all on function public.jp_owns_content_in_project(uuid, uuid) from anon;
grant execute on function public.jp_owns_content_in_project(uuid, uuid) to authenticated;

-- RESTRICTIVE combina estas verificações com as políticas de propriedade
-- existentes; não concede permissões adicionais.
drop policy if exists "content relation integrity" on public.content_items;
create policy "content relation integrity" on public.content_items
  as restrictive for all to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.projects p
      where p.id = content_items.project_id and p.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.projects p
      where p.id = content_items.project_id and p.user_id = (select auth.uid())
    )
    and (parent_content_id is null or (
      parent_content_id <> id
      and public.jp_owns_content_in_project(parent_content_id, project_id)
    ))
  );

drop policy if exists "publication relation integrity" on public.publications;
create policy "publication relation integrity" on public.publications
  as restrictive for all to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.projects p
      where p.id = publications.project_id and p.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.projects p
      where p.id = publications.project_id and p.user_id = (select auth.uid())
    )
    and (content_id is null or public.jp_owns_content_in_project(content_id, project_id))
  );

drop policy if exists "batch relation integrity" on public.batch_updates;
create policy "batch relation integrity" on public.batch_updates
  as restrictive for all to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.projects p
      where p.id = batch_updates.project_id and p.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.projects p
      where p.id = batch_updates.project_id and p.user_id = (select auth.uid())
    )
  );

drop policy if exists "batch item relation integrity" on public.batch_update_items;
create policy "batch item relation integrity" on public.batch_update_items
  as restrictive for all to authenticated
  using (
    exists (
      select 1
      from public.batch_updates b
      join public.production_steps s on s.id = batch_update_items.production_step_id
      join public.content_items c on c.id = s.content_id
      where b.id = batch_update_items.batch_update_id
        and b.user_id = (select auth.uid())
        and c.user_id = (select auth.uid())
        and c.project_id = b.project_id
    )
  )
  with check (
    exists (
      select 1
      from public.batch_updates b
      join public.production_steps s on s.id = batch_update_items.production_step_id
      join public.content_items c on c.id = s.content_id
      where b.id = batch_update_items.batch_update_id
        and b.user_id = (select auth.uid())
        and c.user_id = (select auth.uid())
        and c.project_id = b.project_id
    )
  );

create index if not exists content_items_project_index on public.content_items (project_id);
create index if not exists content_items_user_index on public.content_items (user_id);
create index if not exists publications_user_date_index on public.publications (user_id, planned_for);
create index if not exists batch_updates_project_index on public.batch_updates (project_id);

commit;
