export type ImportedPlan = {
  project: "Casa de Afeto";
  sourceName: string;
  days: { day: number; title: string; instagram: string; tiktok: string; youtubeShort: string; youtubeLong?: string }[];
};

const line = (section: string, channel: string) => section.match(new RegExp(`- \\*\\*${channel}:\\*\\*([^\\n]+)`, "i"))?.[1]?.trim() ?? "";

export function parsePlanFile(sourceName: string, text: string): ImportedPlan {
  if (!/Casa de Afeto/i.test(text)) throw new Error("Por enquanto este importador reconhece o modelo editorial da Casa de Afeto.");
  const sections = [...text.matchAll(/### Dia (\d+) — ([^\n]+)\n([\s\S]*?)(?=\n### Dia |\n## (?:CTAs|Rotina|Métricas)|$)/g)];
  if (sections.length !== 30) throw new Error(`O arquivo trouxe ${sections.length} dias identificáveis; o plano mensal precisa ter 30.`);
  return {
    project: "Casa de Afeto", sourceName,
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
