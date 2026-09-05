import type { SupabaseClient } from '@supabase/supabase-js';
import { buildSteps } from '@/lib/workflow';
import {
  formats, platforms, isContentReady, isPublicationStep, monthDates,
  type Batch, type Content, type ImportResult, type ParsedPlan, type PlanEntry,
  type Platform, type Project, type Publication, type PublicationStatus,
  type Step, type StepDraft, type WorkspaceData,
} from '@/lib/domain';

const PAGE = 500;
const CHUNK = 100;
type Row = Record<string, unknown>;
type Result<T> = { data: T | null; error: unknown };

export function readableError(error: unknown): string {
  const detail = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
  if (/slot_key|planned_for|publications_plan_slot_unique|42P10/.test(detail)) {
    return 'A estrutura de calendário do banco está incompleta. A migração 0003 precisa estar aplicada antes de importar. Nenhuma entrega deve ser substituída para contornar esse problema.';
  }
  return detail || 'Não foi possível concluir a operação. Tente novamente.';
}

function check(error: unknown): asserts error is null | undefined {
  if (error) throw new Error(readableError(error));
}

async function userId(client: SupabaseClient) {
  const { data, error } = await client.auth.getUser();
  check(error);
  if (!data.user) throw new Error('Entre na sua conta para salvar suas alterações.');
  return data.user.id;
}

// A fresh query is required for each range; nested step arrays can otherwise be
// silently truncated by PostgREST's row limit.
async function pages<T>(query: (from: number, to: number) => PromiseLike<Result<T[]>>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    check(error);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

async function ownedProject(client: SupabaseClient, id: string, uid: string) {
  const { data, error } = await client.from('projects').select('id,status').eq('id', id).eq('user_id', uid).maybeSingle();
  check(error);
  if (!data) throw new Error('Projeto não encontrado nesta conta.');
  return data;
}

async function schemaPreflight(client: SupabaseClient, uid: string) {
  const { error } = await client.from('publications').select('id,planned_for,slot_key').eq('user_id', uid).limit(1);
  check(error);
}

async function bulkInsert(client: SupabaseClient, table: string, rows: Row[], conflict = 'id') {
  for (let offset = 0; offset < rows.length; offset += CHUNK) {
    const { error } = await client.from(table).upsert(rows.slice(offset, offset + CHUNK), { onConflict: conflict, ignoreDuplicates: true });
    check(error);
  }
}

function normalized(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

async function stableId(parts: string[]) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(parts))));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes.slice(0, 16), b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function validateDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !monthDates(date.slice(0, 7)).includes(date)) throw new Error(`Data inválida: ${date}.`);
}

function validateEntry(entry: PlanEntry, withDate = true) {
  if (withDate) validateDate(entry.date);
  if (!(entry.platform in platforms) || !(entry.format in formats)) throw new Error('Canal ou formato não suportado.');
  if (!entry.title.trim()) throw new Error('Cada conteúdo precisa de um título.');
  if (entry.platform === 'spotify' && entry.format !== 'spotify_episode') throw new Error('No Spotify, escolha o formato Podcast.');
  if (entry.platform !== 'spotify' && entry.format === 'spotify_episode') throw new Error('O formato Podcast deve ser vinculado ao Spotify.');
  if (entry.platform === 'youtube' && !['youtube_long', 'short'].includes(entry.format)) throw new Error('No YouTube, escolha vídeo longo ou vídeo curto.');
}

export async function loadWorkspace(client: SupabaseClient): Promise<WorkspaceData> {
  const uid = await userId(client);
  const [projectRows, channelRows, contentRows, steps, publications, batches] = await Promise.all([
    pages<Omit<Project, 'channels'>>((a, b) => client.from('projects').select('id,name,description,color,status').eq('user_id', uid).order('id').range(a, b)),
    pages<Project['channels'][number] & { project_id: string }>((a, b) => client.from('project_channels').select('project_id,platform,is_active,daily_cadence').order('id').range(a, b)),
    pages<Omit<Content, 'steps'>>((a, b) => client.from('content_items').select('id,project_id,parent_content_id,type,title,idea,desired_action,technical_reference,script_url,asset_url').eq('user_id', uid).order('id').range(a, b)),
    pages<Step>((a, b) => client.from('production_steps').select('id,content_id,block,label,is_required,is_done,completed_at,sort_order').order('id').range(a, b)),
    pages<Publication>((a, b) => client.from('publications').select('id,project_id,content_id,platform,format,planned_for,slot_key,status,scheduled_for,published_at,publication_url,notes').eq('user_id', uid).order('id').range(a, b)),
    pages<Batch>((a, b) => client.from('batch_updates').select('id,project_id,step_label,evidence_name,evidence_url,note,created_at').eq('user_id', uid).order('created_at', { ascending: false }).order('id').range(a, b)),
  ]);
  const projectIds = new Set(projectRows.map(p => p.id));
  const stepsByContent = new Map<string, Step[]>();
  for (const step of steps) stepsByContent.set(step.content_id, [...(stepsByContent.get(step.content_id) ?? []), step]);
  return {
    projects: projectRows.map(p => ({ ...p, channels: channelRows.filter(c => c.project_id === p.id) })),
    contents: contentRows.filter(c => projectIds.has(c.project_id)).map(c => ({ ...c, steps: (stepsByContent.get(c.id) ?? []).sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id)) })),
    publications: publications.filter(p => projectIds.has(p.project_id)),
    batches: batches.filter(b => projectIds.has(b.project_id)),
  };
}

export async function saveProject(client: SupabaseClient, input: { id?: string; name: string; description: string; color: string; channels: Platform[] }) {
  const uid = await userId(client);
  if (!input.name.trim()) throw new Error('Dê um nome ao projeto.');
  if (!input.channels.length || input.channels.some(c => !(c in platforms))) throw new Error('Selecione pelo menos um canal disponível.');
  if (input.id) await ownedProject(client, input.id, uid);
  const id = input.id ?? crypto.randomUUID();
  const record = { name: input.name.trim(), description: input.description.trim(), color: input.color, user_id: uid };
  const { error } = input.id
    ? await client.from('projects').update(record).eq('id', id).eq('user_id', uid)
    : await client.from('projects').insert({ ...record, id, status: 'active' });
  check(error);
  const rows = Object.keys(platforms).map(platform => ({ project_id: id, platform, is_active: input.channels.includes(platform as Platform), daily_cadence: 1 }));
  const { error: channelsError } = await client.from('project_channels').upsert(rows, { onConflict: 'project_id,platform' });
  check(channelsError);
}

export async function archiveProject(client: SupabaseClient, id: string, archived: boolean) {
  const uid = await userId(client);
  await ownedProject(client, id, uid);
  const { error } = await client.from('projects').update({ status: archived ? 'incubator' : 'active' }).eq('id', id).eq('user_id', uid);
  check(error);
}

function draftContent(id: string, uid: string, projectId: string, entry: PlanEntry): Row {
  const sections = [entry.brief, entry.evidence.script ? `Roteiro:\n${entry.evidence.script}` : '', entry.evidence.description ? `Descrição:\n${entry.evidence.description}` : '', entry.source ? `Origem prevista: ${entry.source}` : ''].filter(Boolean);
  return { id, user_id: uid, project_id: projectId, type: entry.format, title: entry.title.trim(), idea: sections.join('\n\n') || null, desired_action: entry.cta || entry.takeaway || null, technical_reference: entry.reference || null };
}

// Legacy imports used slightly different wording. Matching these concepts avoids
// adding a second "Roteiro" or "Ideia" step when resuming an existing plan.
function stepIdentity(step: Pick<StepDraft, 'block' | 'label'>) {
  const label = normalized(step.label);
  if (isPublicationStep(step)) return 'publication';
  if (/^ideia$|ideia e gancho|ideia e formato/.test(label)) return 'idea';
  if (/^pesquisa/.test(label)) return 'research';
  if (/titulo/.test(label)) return 'title';
  if (/referencia/.test(label)) return 'reference';
  if (/pessoa leva|aprendizado|aprendizagem/.test(label)) return 'takeaway';
  if (/roteiro/.test(label)) return 'script';
  if (/narracao|audio/.test(label)) return 'audio';
  if (/thumbnail|miniatura/.test(label)) return 'thumbnail';
  if (/editar|edicao/.test(label)) return 'edit';
  if (/descricao|legenda/.test(label)) return 'description';
  if (/imagens|imagem/.test(label)) return 'images';
  if (/materiais visuais.*videos/.test(label)) return 'visual_videos';
  return `${normalized(step.block)}:${label}`;
}

async function missingStepRows(uid: string, contentId: string, entry: PlanEntry, previous: Step[] = []): Promise<Row[]> {
  const existing = new Set(previous.map(stepIdentity));
  const now = new Date().toISOString();
  const missing = buildSteps(entry).filter(s => !existing.has(stepIdentity(s)));
  return Promise.all(missing.map(async step => ({ ...step, id: await stableId(['step-v1', uid, contentId, stepIdentity(step)]), content_id: contentId, completed_at: step.is_done ? now : null })));
}

async function recordHistory(client: SupabaseClient, uid: string, projectId: string, sourceName: string, note: string, id?: string): Promise<string | null> {
  try {
    const { error } = await client.from('batch_updates').upsert({ id: id ?? crypto.randomUUID(), user_id: uid, project_id: projectId, step_label: 'Plano importado', evidence_name: sourceName, note }, { onConflict: 'id', ignoreDuplicates: true });
    check(error);
    return null;
  } catch (error) { return `Os conteúdos foram salvos, mas o registro do histórico falhou: ${readableError(error)}`; }
}

export async function importPlan(client: SupabaseClient, projectId: string, plan: ParsedPlan): Promise<ImportResult & { warnings: string[] }> {
  const uid = await userId(client);
  await ownedProject(client, projectId, uid);
  await schemaPreflight(client, uid);
  if (!plan.entries.length) throw new Error('O arquivo não contém entregas para importar.');
  const validDates = new Set(monthDates(plan.month));
  const unique = new Set<string>();
  for (const entry of plan.entries) {
    validateEntry(entry);
    if (!validDates.has(entry.date)) throw new Error(`A entrega de ${entry.date} está fora do mês selecionado.`);
    const key = `${entry.date}/${entry.platform}/${entry.format}`;
    if (unique.has(key)) throw new Error(`Há duas entregas de mesmo formato para ${entry.date} em ${platforms[entry.platform]}. Revise a duplicação no arquivo.`);
    unique.add(key);
  }

  const ws = await loadWorkspace(client);
  const items = new Map(ws.contents.map(c => [c.id, c]));
  const claimed = new Set<string>();
  const prepared: { entry: PlanEntry; id: string; existing?: Content; publication?: Publication; slot: string }[] = [];
  // Preflight all slots before the first mutation. A repeated import never
  // overwrites a different title or an independently edited calendar delivery.
  for (const entry of plan.entries) {
    const sameDay = ws.publications.filter(p => p.project_id === projectId && p.platform === entry.platform && p.planned_for === entry.date && !claimed.has(p.id));
    let pub = sameDay.find(p => p.slot_key === entry.format);
    const compatible = sameDay.filter(p => p.content_id && items.get(p.content_id)?.type === entry.format);
    if (!pub && compatible.length > 1) throw new Error(`Há várias entregas compatíveis em ${entry.date}, ${platforms[entry.platform]}. Escolha a entrega no calendário antes de reimportar.`);
    pub ??= compatible[0];
    pub ??= sameDay.find(p => p.slot_key === 'main' && !p.content_id && p.status === 'empty');
    const id = pub?.content_id ?? await stableId(['content-v1', uid, projectId, entry.date, entry.platform, entry.format]);
    const existing = items.get(id);
    if (pub?.content_id && !existing) throw new Error(`A entrega de ${entry.date} aponta para um conteúdo indisponível nesta conta.`);
    if (existing && (existing.project_id !== projectId || existing.type !== entry.format || normalized(existing.title) !== normalized(entry.title))) {
      throw new Error(`Conflito em ${entry.date}, ${platforms[entry.platform]}: já existe “${existing.title}”. O arquivo traz “${entry.title}”. Nenhum conteúdo deste arquivo foi alterado.`);
    }
    if (pub && !pub.content_id && ['scheduled', 'published'].includes(pub.status)) throw new Error(`A entrega de ${entry.date} já foi agendada ou publicada. Vincule seu conteúdo manualmente.`);
    if (pub) claimed.add(pub.id);
    prepared.push({ entry, id, existing, publication: pub, slot: pub?.slot_key ?? entry.format });
  }

  let changed = false;
  try {
    const newRows = prepared.filter(p => !p.existing).map(p => draftContent(p.id, uid, projectId, p.entry));
    if (newRows.length) { await bulkInsert(client, 'content_items', newRows); changed = true; }
    const persisted = await pages<Pick<Content, 'id' | 'title' | 'type' | 'project_id'>>((a, b) => client.from('content_items').select('id,title,type,project_id').eq('user_id', uid).eq('project_id', projectId).order('id').range(a, b));
    for (const item of prepared) {
      const winner = persisted.find(c => c.id === item.id);
      if (!winner || winner.type !== item.entry.format || normalized(winner.title) !== normalized(item.entry.title)) throw new Error(`Outra sessão alterou o conteúdo de ${item.entry.date}. Atualize a página antes de importar novamente.`);
    }
    const stepRows = (await Promise.all(prepared.map(p => missingStepRows(uid, p.id, p.entry, p.existing?.steps)))).flat();
    if (stepRows.length) { await bulkInsert(client, 'production_steps', stepRows); changed = true; }

    const newPublications: Row[] = [];
    let linked = 0;
    for (const item of prepared) {
      if (item.publication?.content_id === item.id) continue;
      const steps = item.existing?.steps ?? buildSteps(item.entry);
      const required = steps.filter(s => s.is_required && !isPublicationStep(s));
      const status = item.entry.published ? 'published' : required.length && required.every(s => s.is_done) ? 'ready_to_schedule' : 'in_progress';
      const values = { content_id: item.id, format: formats[item.entry.format], status };
      if (item.publication) {
        const { data, error } = await client.from('publications').update(values).eq('id', item.publication.id).eq('user_id', uid).is('content_id', null).in('status', ['empty', 'in_progress', 'ready_to_schedule']).select('id');
        check(error);
        if (!data?.length) throw new Error(`A entrega de ${item.entry.date} foi alterada em outra sessão. Atualize a página antes de continuar.`);
        linked++;
        changed = true;
      } else {
        newPublications.push({ ...values, id: await stableId(['publication-v1', uid, projectId, item.entry.date, item.entry.platform, item.slot]), user_id: uid, project_id: projectId, platform: item.entry.platform, planned_for: item.entry.date, slot_key: item.slot });
      }
    }
    if (newPublications.length) { await bulkInsert(client, 'publications', newPublications, 'project_id,platform,planned_for,slot_key'); changed = true; }
    // Verify the winner of ON CONFLICT; concurrent writes must not be reported as
    // a successful link to this file when a different import won the slot.
    const finalPubs = await pages<Pick<Publication, 'id' | 'content_id' | 'planned_for' | 'platform' | 'slot_key'>>((a, b) => client.from('publications').select('id,content_id,planned_for,platform,slot_key').eq('user_id', uid).eq('project_id', projectId).gte('planned_for', `${plan.month}-01`).lte('planned_for', [...validDates].at(-1)!).order('id').range(a, b));
    for (const item of prepared) {
      const pub = finalPubs.find(p => p.planned_for === item.entry.date && p.platform === item.entry.platform && p.slot_key === item.slot);
      if (pub?.content_id !== item.id) throw new Error(`Conflito de gravação em ${item.entry.date}. A entrega existente foi preservada; atualize a página para revisar.`);
    }
    const channels = [...new Set(plan.entries.map(e => e.platform))].map(platform => ({ project_id: projectId, platform, is_active: true, daily_cadence: 1 }));
    const { error: channelError } = await client.from('project_channels').upsert(channels, { onConflict: 'project_id,platform' });
    check(channelError);
    const historyId = await stableId(['import-v1', uid, projectId, ...prepared.map(p => p.id).sort(), plan.sourceName]);
    const warning = await recordHistory(client, uid, projectId, plan.sourceName, `${prepared.length} entregas verificadas. ${newRows.length} conteúdos criados. Etapas e agendamentos existentes preservados.`, historyId);
    return { created: newRows.length, updated: linked + newPublications.length, skipped: prepared.filter(p => p.publication?.content_id === p.id).length, warnings: warning ? [warning] : [] };
  } catch (error) {
    throw new Error(`${readableError(error)}${changed ? ' Parte do arquivo pode já ter sido salva. Atualize a página e reimporte o mesmo arquivo para retomar sem duplicar conteúdos nem apagar checks.' : ''}`);
  }
}

export async function createContent(client: SupabaseClient, projectId: string, entry: PlanEntry, date?: string): Promise<string> {
  const uid = await userId(client);
  await ownedProject(client, projectId, uid);
  validateEntry(entry, false);
  if (date) {
    validateDate(date);
    await importPlan(client, projectId, { projectName: null, month: date.slice(0, 7), sourceName: 'Cadastro manual', warnings: [], entries: [{ ...entry, date }] });
    const ws = await loadWorkspace(client);
    const found = ws.publications.find(p => p.project_id === projectId && p.platform === entry.platform && p.planned_for === date && p.content_id && ws.contents.some(c => c.id === p.content_id && c.type === entry.format && normalized(c.title) === normalized(entry.title)));
    if (!found?.content_id) throw new Error('Conteúdo salvo, mas não foi possível localizar sua entrega. Atualize a página.');
    return found.content_id;
  }
  const id = crypto.randomUUID();
  const { error } = await client.from('content_items').insert(draftContent(id, uid, projectId, entry));
  check(error);
  try { await bulkInsert(client, 'production_steps', await missingStepRows(uid, id, entry)); }
  catch (error) { throw new Error(`O conteúdo foi criado no banco, mas seu checklist não foi concluído: ${readableError(error)}. Abra o conteúdo para adicionar as etapas pendentes.`); }
  return id;
}

type ContentPatch = Partial<Pick<Content, 'title' | 'idea' | 'desired_action' | 'technical_reference' | 'script_url' | 'asset_url'>>;

export async function updateContent(client: SupabaseClient, id: string, patch: ContentPatch) {
  const uid = await userId(client);
  if (patch.title !== undefined && !patch.title.trim()) throw new Error('O título não pode ficar vazio.');
  for (const key of ['script_url', 'asset_url'] as const) validateUrl(patch[key]);
  const allowed = ['title', 'idea', 'desired_action', 'technical_reference', 'script_url', 'asset_url'];
  const safePatch = Object.fromEntries(Object.entries(patch).filter(([key]) => allowed.includes(key)));
  const { data, error } = await client.from('content_items').update(safePatch).eq('id', id).eq('user_id', uid).select('id');
  check(error);
  if (!data?.length) throw new Error('Conteúdo não encontrado nesta conta.');
}

async function refreshUnscheduled(client: SupabaseClient, uid: string, contentIds: string[]) {
  for (const id of new Set(contentIds)) {
    const steps = await pages<Pick<Step, 'id' | 'block' | 'label' | 'is_required' | 'is_done'>>((a, b) => client.from('production_steps').select('id,block,label,is_required,is_done').eq('content_id', id).order('id').range(a, b));
    const required = steps.filter(s => s.is_required && !isPublicationStep(s));
    const status = required.length && required.every(s => s.is_done) ? 'ready_to_schedule' : 'in_progress';
    const { error } = await client.from('publications').update({ status }).eq('content_id', id).eq('user_id', uid).in('status', ['empty', 'in_progress', 'ready_to_schedule']);
    check(error);
  }
}

export async function setStep(client: SupabaseClient, id: string, done: boolean) {
  const uid = await userId(client);
  const { data: step, error: readError } = await client.from('production_steps').select('id,content_id,block,label').eq('id', id).maybeSingle();
  check(readError);
  if (!step) throw new Error('Etapa não encontrada nesta conta.');
  if (isPublicationStep(step)) throw new Error('Use Agendar ou Publicar na entrega específica do canal.');
  const { data: content, error: contentError } = await client.from('content_items').select('id').eq('id', step.content_id).eq('user_id', uid).maybeSingle();
  check(contentError);
  if (!content) throw new Error('Conteúdo não encontrado nesta conta.');
  const { error } = await client.from('production_steps').update({ is_done: done, completed_at: done ? new Date().toISOString() : null }).eq('id', id).eq('content_id', step.content_id);
  check(error);
  await refreshUnscheduled(client, uid, [step.content_id]);
}

export async function addStep(client: SupabaseClient, contentId: string, label: string, required: boolean) {
  const uid = await userId(client);
  if (!label.trim()) throw new Error('Dê um nome à etapa.');
  if (isPublicationStep({ block: '', label })) throw new Error('Agendar e publicar são ações da entrega de cada canal. Adicione aqui uma etapa de produção.');
  const { data: content, error } = await client.from('content_items').select('id').eq('id', contentId).eq('user_id', uid).maybeSingle();
  check(error);
  if (!content) throw new Error('Conteúdo não encontrado nesta conta.');
  const { data: steps, error: stepError } = await client.from('production_steps').select('sort_order').eq('content_id', contentId).order('sort_order', { ascending: false }).limit(1);
  check(stepError);
  const { error: insertError } = await client.from('production_steps').insert({ content_id: contentId, block: 'Etapas adicionais', label: label.trim(), is_required: required, is_done: false, sort_order: (steps?.[0]?.sort_order ?? 0) + 1 });
  check(insertError);
  await refreshUnscheduled(client, uid, [contentId]);
}

export async function completeBatch(client: SupabaseClient, stepIds: string[], evidenceName: string, note: string) {
  const uid = await userId(client);
  const ids = new Set(stepIds);
  if (!ids.size) throw new Error('Selecione as etapas que deseja concluir.');
  const ws = await loadWorkspace(client);
  const selected = ws.contents.flatMap(c => c.steps.filter(s => ids.has(s.id)).map(s => ({ step: s, content: c })));
  if (selected.length !== ids.size) throw new Error('Alguma etapa não está disponível nesta conta. Atualize a página.');
  if (selected.some(s => isPublicationStep(s.step))) throw new Error('Agendamentos e publicações precisam ser confirmados em cada entrega.');
  let completed = 0;
  try {
    for (const projectId of new Set(selected.map(s => s.content.project_id))) {
      const group = selected.filter(s => s.content.project_id === projectId);
      const batchId = crypto.randomUUID();
      const { error: historyError } = await client.from('batch_updates').insert({ id: batchId, user_id: uid, project_id: projectId, step_label: 'Atualização em lote iniciada', evidence_name: evidenceName || 'Confirmação manual', note });
      check(historyError);
      await bulkInsert(client, 'batch_update_items', group.map(s => ({ batch_update_id: batchId, production_step_id: s.step.id })), 'batch_update_id,production_step_id');
      for (let offset = 0; offset < group.length; offset += CHUNK) {
        const chunk = group.slice(offset, offset + CHUNK);
        const { error } = await client.from('production_steps').update({ is_done: true, completed_at: new Date().toISOString() }).in('id', chunk.map(s => s.step.id));
        check(error);
        completed += chunk.length;
      }
      await refreshUnscheduled(client, uid, group.map(s => s.content.id));
      const { error } = await client.from('batch_updates').update({ step_label: `${group.length} etapas concluídas`, note }).eq('id', batchId).eq('user_id', uid);
      check(error);
    }
  } catch (error) {
    throw new Error(`${readableError(error)} ${completed} etapas foram salvas nesta operação. Atualize a página para conferir antes de tentar novamente.`);
  }
}

function validateUrl(value: string | null | undefined) {
  if (!value) return;
  try { if (!['http:', 'https:'].includes(new URL(value).protocol)) throw new Error(); }
  catch { throw new Error('Use um link completo começando com https:// ou http://.'); }
}

export async function savePublication(client: SupabaseClient, pub: Publication, status: PublicationStatus, scheduledFor?: string, url?: string) {
  const uid = await userId(client);
  validateUrl(url);
  const ws = await loadWorkspace(client);
  const existing = ws.publications.find(p => p.id === pub.id);
  if (!existing) throw new Error('Entrega não encontrada nesta conta.');
  const content = ws.contents.find(c => c.id === existing.content_id);
  if (['scheduled', 'published'].includes(status) && !content) throw new Error('Vincule um conteúdo antes de agendar ou publicar.');
  if (status === 'scheduled' && content && !isContentReady(content)) throw new Error('Conclua as etapas obrigatórias da produção antes de agendar.');
  if (status === 'scheduled' && (!scheduledFor || !Number.isFinite(new Date(scheduledFor).valueOf()))) throw new Error('Informe a data e o horário do agendamento.');
  if (status === 'ready_to_schedule' && (!content || !isContentReady(content))) throw new Error('Ainda existem etapas obrigatórias pendentes.');
  if (status === 'empty' && content) throw new Error('Esta entrega já possui conteúdo vinculado.');
  const values = {
    status,
    scheduled_for: status === 'scheduled' ? new Date(scheduledFor!).toISOString() : status === 'published' ? existing.scheduled_for : null,
    published_at: status === 'published' ? existing.published_at || new Date().toISOString() : null,
    publication_url: url !== undefined ? url.trim() || null : existing.publication_url,
  };
  const { error } = await client.from('publications').update(values).eq('id', existing.id).eq('user_id', uid);
  check(error);
}

export async function reuseContent(client: SupabaseClient, contentId: string, projectId: string, platform: Platform, date: string) {
  const uid = await userId(client);
  validateDate(date);
  if (!(platform in platforms)) throw new Error('Canal não suportado.');
  await ownedProject(client, projectId, uid);
  await schemaPreflight(client, uid);
  const ws = await loadWorkspace(client);
  const content = ws.contents.find(c => c.id === contentId);
  if (!content) throw new Error('Conteúdo não encontrado nesta conta.');
  if (content.project_id !== projectId) throw new Error('Reaproveite o conteúdo dentro do mesmo projeto para manter sua origem e checklist.');
  if (platform === 'spotify' && content.type !== 'spotify_episode') throw new Error('Escolha um episódio de podcast para o Spotify.');
  if (platform === 'youtube' && !['youtube_long', 'short'].includes(content.type)) throw new Error('Escolha um vídeo para o YouTube.');
  if (platform === 'tiktok' && !['short', 'youtube_long'].includes(content.type)) throw new Error('Escolha um vídeo para reaproveitar no TikTok.');
  const candidates = ws.publications.filter(p => p.project_id === projectId && p.platform === platform && p.planned_for === date);
  if (candidates.some(p => p.content_id === contentId)) return;
  const empty = candidates.find(p => p.slot_key === 'main' && !p.content_id && p.status === 'empty');
  const slot = empty?.slot_key ?? content.type;
  if (!empty && candidates.some(p => p.slot_key === slot)) throw new Error('Essa data já tem uma entrega desse formato. Escolha outra data.');
  const values = { content_id: contentId, format: formats[content.type], status: isContentReady(content) ? 'ready_to_schedule' : 'in_progress' };
  if (empty) {
    const { data, error } = await client.from('publications').update(values).eq('id', empty.id).eq('user_id', uid).is('content_id', null).eq('status', 'empty').select('id');
    check(error);
    if (!data?.length) throw new Error('Esta entrega foi alterada em outra sessão. Atualize a página.');
  } else {
    const { error } = await client.from('publications').insert({ ...values, id: await stableId(['publication-v1', uid, projectId, date, platform, slot]), user_id: uid, project_id: projectId, platform, planned_for: date, slot_key: slot });
    check(error);
  }
}

export async function createCadence(client: SupabaseClient, projectId: string, month: string, selectedPlatforms: Platform[], weekdays: number[]) {
  const uid = await userId(client);
  await ownedProject(client, projectId, uid);
  await schemaPreflight(client, uid);
  if (!selectedPlatforms.length || selectedPlatforms.some(p => !(p in platforms))) throw new Error('Selecione os canais da cadência.');
  if (!weekdays.length || weekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error('Selecione os dias da semana.');
  const dates = monthDates(month).filter(date => weekdays.includes(new Date(`${date}T12:00:00Z`).getUTCDay()));
  const ws = await loadWorkspace(client);
  const rows: Row[] = [];
  for (const date of dates) for (const platform of new Set(selectedPlatforms)) {
    // A real delivery already fulfils the cadence. Do not add an empty phantom
    // main slot alongside a format-specific imported publication.
    if (ws.publications.some(p => p.project_id === projectId && p.platform === platform && p.planned_for === date)) continue;
    rows.push({ id: await stableId(['publication-v1', uid, projectId, date, platform, 'main']), user_id: uid, project_id: projectId, platform, planned_for: date, slot_key: 'main', status: 'empty' });
  }
  await bulkInsert(client, 'publications', rows, 'project_id,platform,planned_for,slot_key');
  const { error } = await client.from('project_channels').upsert([...new Set(selectedPlatforms)].map(platform => ({ project_id: projectId, platform, is_active: true, daily_cadence: 1 })), { onConflict: 'project_id,platform' });
  check(error);
}
