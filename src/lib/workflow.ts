import type { EvidenceKey, PlanEntry, StepDraft } from './domain';

/** Only explicit evidence concludes production tasks. Published status does not fabricate previous work. */
export function buildSteps(entry: PlanEntry, reuse = entry.platform === 'tiktok' || (entry.platform === 'instagram' && entry.format === 'short')): StepDraft[] {
  const steps: StepDraft[] = [];
  const add = (block: string, label: string, evidence?: EvidenceKey, required = true, done = false) => {
    steps.push({ block, label, is_required: required, is_done: done || !!(evidence && entry.evidence[evidence]), sort_order: steps.length });
  };
  const publish = () => add('3 · Publicação', 'Agendar ou postar', undefined, true, !!entry.published);
  if (reuse) {
    add('1 · Reaproveitamento', 'Selecionar conteúdo pronto no banco', 'edit');
    if (entry.platform !== 'tiktok') add('2 · Preparação', 'Legenda da publicação', 'description');
    publish();
    return steps;
  }
  if (entry.format === 'youtube_long') {
    add('1 · Ideia', 'Ideia', 'idea');
    add('1 · Ideia', 'Pesquisa', 'research');
    add('1 · Ideia', 'Título do vídeo (SEO e IA)', 'title');
    add('1 · Ideia', 'Referência técnica', 'reference');
    add('1 · Ideia', 'Ideia que a pessoa leva', 'takeaway');
    add('2 · Construção', 'Roteiro (texto)', 'script');
    add('2 · Construção', 'Criação do áudio (narração)', 'audio');
    add('2 · Construção', 'Materiais visuais (imagens)', 'images');
    add('2 · Construção', 'Materiais visuais (vídeos)', undefined, false);
    add('2 · Construção', 'Editar vídeo no CapCut', 'edit');
    add('2 · Construção', 'Imagem da thumbnail', 'thumbnail');
    add('2 · Construção', 'Descrição otimizada para conversão', 'description');
  } else if (entry.format === 'short') {
    add('1 · Mineração', 'Identificar conteúdo de origem e possíveis cortes');
    add('1 · Mineração', 'Estruturar cortes e definir os trechos', 'script');
    add('2 · Construção', 'Gerar imagens verticais', 'images');
    add('2 · Construção', 'Gerar áudio a partir do corte', 'audio');
    add('2 · Construção', 'Editar vídeo no CapCut', 'edit');
    add('2 · Construção', 'Criar thumbnail vertical', 'thumbnail');
    add('2 · Construção', 'Descrição otimizada para o trecho', 'description');
  } else if (entry.format === 'spotify_episode') {
    add('1 · Ideia', 'Ideia', 'idea');
    add('1 · Ideia', 'Título do episódio', 'title');
    add('2 · Construção', 'Roteiro do episódio', 'script');
    add('2 · Construção', 'Gravar ou gerar áudio', 'audio');
    add('2 · Construção', 'Editar áudio', 'edit');
    add('2 · Construção', 'Capa do episódio', 'thumbnail');
    add('2 · Construção', 'Descrição do episódio', 'description');
  } else {
    add('1 · Ideia', 'Ideia e propósito', 'idea');
    add('1 · Ideia', 'Ação desejada (CTA)', 'cta');
    if (entry.format === 'carousel') add('2 · Construção', 'Roteiro dos cards', 'script');
    add('2 · Construção', entry.format === 'carousel' ? 'Criar imagens do carrossel' : 'Criar ou selecionar imagem', 'images');
    add('2 · Construção', 'Legenda da publicação', 'description');
  }
  publish();
  return steps;
}
