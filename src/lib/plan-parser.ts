export type ImportedPlan = {
  project: string;
  sourceName: string;
  days: { day: number; title: string; instagram: string; tiktok: string; youtubeShort: string; youtubeLong?: string }[];
};

const line = (section: string, channel: string) => section.match(new RegExp(`- \\*\\*${channel}:\\*\\*([^\\n]+)`, "i"))?.[1]?.trim() ?? "";

export function parsePlanFile(sourceName: string, text: string): ImportedPlan {
  const knownProjects = ["Aurora", "Casa de Afeto", "Conhecimento Acessível", "Pense IA", "Pookies", "Climatização Inteligente"];
  const project = knownProjects.find((name) => new RegExp(`\\b${name}\\b`, "i").test(text));
  if (!project) throw new Error("Não identifiquei o projeto no arquivo. Use o nome do projeto no título ou no começo do plano.");
  const sections = [...text.matchAll(/### Dia (\d+) — ([^\n]+)\n([\s\S]*?)(?=\n### Dia |\n## (?:CTAs|Rotina|Métricas)|$)/g)];
  if (!sections.length) throw new Error("Não encontrei dias no formato ‘### Dia 1 — Título’. Em breve a importação também aceitará planos em tabela.");
  if (sections.length > 31) throw new Error(`Encontrei ${sections.length} dias; revise se há títulos de dia duplicados.`);
  return {
    project, sourceName,
    days: sections.map((match) => {
      const section = match[3];
      return {
        day: Number(match[1]), title: match[2].trim(),
        instagram: line(section, "Instagram"), tiktok: line(section, "TikTok"), youtubeShort: line(section, "YouTube Short"),
        youtubeLong: line(section, "YouTube longo") || undefined,
      };
    }),
  };
}
