export const platforms = { youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok', spotify: 'Spotify' } as const;
export type Platform = keyof typeof platforms;
export const formats = { youtube_long: 'Vídeo longo', short: 'Vídeo curto / Reel', carousel: 'Carrossel', image: 'Imagem', spotify_episode: 'Podcast' } as const;
export type Format = keyof typeof formats;
export type PublicationStatus = 'empty' | 'in_progress' | 'ready_to_schedule' | 'scheduled' | 'published';
export interface Step { id: string; content_id: string; block: string; label: string; is_required: boolean; is_done: boolean; completed_at: string | null; sort_order: number }
export interface Project { id: string; name: string; description: string | null; color: string | null; status: 'active' | 'incubator'; channels: { platform: Platform; is_active: boolean; daily_cadence: number }[] }
export interface Content { id: string; project_id: string; parent_content_id: string | null; type: Format; title: string; idea: string | null; desired_action: string | null; technical_reference: string | null; script_url: string | null; asset_url: string | null; steps: Step[] }
export interface Publication { id: string; project_id: string; content_id: string | null; platform: Platform; format: string | null; planned_for: string; slot_key: string; status: PublicationStatus; scheduled_for: string | null; published_at: string | null; publication_url: string | null; notes: string | null }
export interface Batch { id: string; project_id: string; step_label: string; evidence_name: string | null; evidence_url: string | null; note: string | null; created_at: string }
export interface WorkspaceData { projects: Project[]; contents: Content[]; publications: Publication[]; batches: Batch[] }
export type EvidenceKey = 'idea' | 'research' | 'title' | 'reference' | 'takeaway' | 'cta' | 'script' | 'audio' | 'images' | 'edit' | 'thumbnail' | 'description';
export interface PlanEntry { date: string; platform: Platform; format: Format; title: string; brief: string; reference?: string; takeaway?: string; cta?: string; source?: string; published?: boolean; evidence: Partial<Record<EvidenceKey, string>> }
export interface ParsedPlan { projectName: string | null; month: string; entries: PlanEntry[]; warnings: string[]; sourceName: string }
export interface ParseOptions { month: string; projectNames?: string[]; defaultPlatform?: Platform; defaultFormat?: Format }
export interface ImportResult { created: number; skipped: number; updated: number }
export interface StepDraft { block: string; label: string; is_required: boolean; is_done: boolean; sort_order: number }

export function localDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function monthDates(month: string): string[] {
  const [year, value] = month.split('-').map(Number);
  if (!/^\d{4}-\d{2}$/.test(month) || value < 1 || value > 12) throw new Error('Selecione um mês válido.');
  return Array.from({ length: new Date(year, value, 0).getDate() }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}
export function requiredProgress(content?: Content) {
  const steps = content?.steps.filter(s => s.is_required) ?? [];
  return { done: steps.filter(s => s.is_done).length, total: steps.length, next: steps.find(s => !s.is_done) };
}
export function isPublicationStep(step: Pick<Step, 'block' | 'label'>) { return /publica|agendar|postar/i.test(step.block + ' ' + step.label); }
export function isContentReady(content: Content) { const steps = content.steps.filter(s => s.is_required && !isPublicationStep(s)); return steps.length > 0 && steps.every(s => s.is_done); }
