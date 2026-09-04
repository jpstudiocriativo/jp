import type { SupabaseClient } from "@supabase/supabase-js";
import { auroraSeptemberIdeas } from "@/data/aurora-september";

const definitions = [
  { name: "Aurora", color: "#5a4381", description: "Entretenimento educativo", channels: ["youtube", "instagram", "tiktok"] },
  { name: "Casa de Afeto", color: "#ad6849", description: "Decoração afetiva", channels: ["youtube", "instagram", "tiktok"] },
  { name: "Conhecimento Acessível", color: "#28766e", description: "Curadoria de conhecimento", channels: ["youtube"] },
  { name: "Pense IA", color: "#2765a3", description: "IA facilitada", channels: ["youtube", "instagram", "spotify"] },
];

export type PlannedPublication = {
  id: string;
  project: string;
  channel: string;
  date: number;
  time: string;
  status: "Sem conteúdo" | "Em construção" | "Pronta para agendar" | "Agendada" | "Publicada";
  title?: string;
};

const presentationStatus: Record<string, PlannedPublication["status"]> = {
  empty: "Sem conteúdo",
  in_progress: "Em construção",
  ready_to_schedule: "Pronta para agendar",
  scheduled: "Agendada",
  published: "Publicada",
};

export async function ensureSeptember2026Plan(client: SupabaseClient) {
  const { data: existing, error: lookupError } = await client.from("projects").select("id,name");
  if (lookupError) throw lookupError;
  let projectRows = existing ?? [];
  const existingNames = new Set(projectRows.map((project) => project.name));
  const missingProjects = definitions.filter((definition) => !existingNames.has(definition.name));
  if (missingProjects.length) {
    const { data, error } = await client.from("projects").insert(
      missingProjects.map(({ name, color, description }) => ({ name, color, description, status: "active" }))
    ).select("id,name");
    if (error) throw error;
    projectRows = [...projectRows, ...(data ?? [])];
  }

  const projectByName = new Map(projectRows.map((project) => [project.name, project.id]));
  const channelRows = definitions.flatMap((definition) => definition.channels.map((platform) => ({ project_id: projectByName.get(definition.name), platform, is_active: true, daily_cadence: 1 })));
  const { error: channelsError } = await client.from("project_channels").upsert(channelRows, { onConflict: "project_id,platform" });
  if (channelsError) throw channelsError;

  const planned = definitions.flatMap((definition) => Array.from({ length: 30 }, (_, index) => {
    const plannedFor = `2026-09-${String(index + 1).padStart(2, "0")}`;
    return definition.channels.map((platform) => ({ project_id: projectByName.get(definition.name), platform, planned_for: plannedFor, status: "empty" }));
  })).flat();
  for (let index = 0; index < planned.length; index += 100) {
    const { error: publicationsError } = await client.from("publications").upsert(planned.slice(index, index + 100), { onConflict: "project_id,platform,planned_for", ignoreDuplicates: true });
    if (publicationsError) throw publicationsError;
  }
}

export async function loadSeptember2026Plan(client: SupabaseClient): Promise<PlannedPublication[]> {
  const { data, error } = await client.from("publications")
    .select("id,platform,planned_for,status,content:content_items(title),project:projects(name)")
    .gte("planned_for", "2026-09-01")
    .lte("planned_for", "2026-09-30")
    .order("planned_for");
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    project: row.project?.name ?? "Projeto",
    channel: ({ youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", spotify: "Spotify" } as Record<string, string>)[row.platform] ?? row.platform,
    date: Number(String(row.planned_for).slice(-2)),
    time: "—",
    status: presentationStatus[row.status] ?? "Sem conteúdo",
    title: row.content?.title ?? undefined,
  }));
}

const longVideoSteps = [
  ["1 · Ideia", "Ideia", true],
  ["1 · Ideia", "Pesquisa", true],
  ["1 · Ideia", "Título do vídeo (SEO e IA)", true],
  ["1 · Ideia", "Referência técnica", true],
  ["1 · Ideia", "Ideia que a pessoa leva", true],
  ["2 · Construção", "Roteiro (texto)", true],
  ["2 · Construção", "Criação do áudio (narração)", true],
  ["2 · Construção", "Materiais visuais (imagens)", true],
  ["2 · Construção", "Materiais visuais (vídeos)", false],
  ["2 · Construção", "Editar vídeo no CapCut", true],
  ["2 · Construção", "Imagem da thumbnail", true],
  ["2 · Construção", "Descrição otimizada para conversão", true],
  ["3 · Publicação", "Agendar ou postar", true],
] as const;

export async function importAuroraSeptemberPlan(client: SupabaseClient) {
  const { data: project, error: projectError } = await client.from("projects").select("id").eq("name", "Aurora").single();
  if (projectError) throw projectError;

  const { data: existing, error: existingError } = await client.from("content_items")
    .select("id,title")
    .eq("project_id", project.id)
    .eq("type", "youtube_long");
  if (existingError) throw existingError;
  const existingByTitle = new Map((existing ?? []).map((item) => [item.title, item.id]));

  const newIdeas = auroraSeptemberIdeas.filter((idea) => !existingByTitle.has(idea.title));
  if (newIdeas.length) {
    const { data: created, error: createError } = await client.from("content_items").insert(newIdeas.map((idea) => ({
      project_id: project.id, type: "youtube_long", title: idea.title,
      idea: `Thumbnail: ${idea.thumbnail}\n\nLeitura central: ${idea.takeaway}`,
      desired_action: idea.takeaway, technical_reference: idea.reference,
    }))).select("id,title");
    if (createError) throw createError;
    for (const item of created ?? []) existingByTitle.set(item.title, item.id);
  }

  const allIds = auroraSeptemberIdeas.map((idea) => existingByTitle.get(idea.title)).filter(Boolean) as string[];
  const { data: stepCounts, error: stepsLookupError } = await client.from("production_steps").select("content_id").in("content_id", allIds);
  if (stepsLookupError) throw stepsLookupError;
  const idsWithSteps = new Set((stepCounts ?? []).map((step) => step.content_id));
  const doneAt = new Date().toISOString();
  const steps = auroraSeptemberIdeas.flatMap((idea) => {
    const contentId = existingByTitle.get(idea.title);
    if (!contentId || idsWithSteps.has(contentId)) return [];
    return longVideoSteps.map(([block, label, isRequired], index) => ({ content_id: contentId, block, label, is_required: isRequired, is_done: Boolean(idea.published), completed_at: idea.published ? doneAt : null, sort_order: index + 1 }));
  });
  if (steps.length) {
    const { error } = await client.from("production_steps").insert(steps);
    if (error) throw error;
  }

  for (const idea of auroraSeptemberIdeas) {
    const contentId = existingByTitle.get(idea.title);
    const plannedFor = `2026-09-${String(idea.day).padStart(2, "0")}`;
    const { error } = await client.from("publications").update({
      content_id: contentId,
      format: "Vídeo longo",
      status: idea.published ? "published" : "in_progress",
      published_at: idea.published ? `${plannedFor}T12:00:00-03:00` : null,
    }).eq("project_id", project.id).eq("platform", "youtube").eq("planned_for", plannedFor);
    if (error) throw error;
  }
  return { created: newIdeas.length };
}
