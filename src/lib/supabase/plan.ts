import type { SupabaseClient } from "@supabase/supabase-js";

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
  if (projectRows.length === 0) {
    const { data, error } = await client.from("projects").insert(
      definitions.map(({ name, color, description }) => ({ name, color, description, status: "active" }))
    ).select("id,name");
    if (error) throw error;
    projectRows = data ?? [];
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
    .select("id,platform,planned_for,status,project:projects(name)")
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
  }));
}
