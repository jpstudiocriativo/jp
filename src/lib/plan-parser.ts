import { formats, monthDates, platforms } from './domain';
import type { EvidenceKey, Format, ParseOptions, ParsedPlan, PlanEntry, Platform } from './domain';

/** Interchange: JSON { project, month, entries: [{ date, platform, format, title, brief, evidence }] },
 * CSV/TSV with those headers (Portuguese aliases accepted), or dated Markdown sections/tables.
 * File contents are data; planned tasks never count as completed assets.
 */
type Fields = Record<string, unknown>;
type Context = { month: string; options: ParseOptions; warnings: Set<string>; entries: PlanEntry[] };
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
const clean = (value: string) => value.replace(/\*\*|__/g, '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/\\\|/g, '|').trim();
const asText = (value: unknown) => value == null ? '' : typeof value === 'string' ? clean(value) : typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
const normalizedFields = (record: Fields): Fields => Object.fromEntries(Object.entries(record).map(([key, value]) => [normalize(clean(key)), value]));
const field = (record: Fields, ...keys: string[]) => {
  for (const key of keys) if (record[normalize(key)] !== undefined) return asText(record[normalize(key)]);
  return '';
};
const has = (record: Fields, ...keys: string[]) => keys.some(key => Object.prototype.hasOwnProperty.call(record, normalize(key)));
const absent = /^(?:[-–—]|n\/?a|nenhum|nenhuma|pendente|pending|a (?:fazer|definir|criar|produzir)|nao|false|nao (?:feito|feita|concluido|concluida|disponivel))$/i;
const isEvidence = (value: unknown) => !!asText(value) && !absent.test(normalize(asText(value)));

function parseDate(value: string, context: Context, location: string): string {
  const raw = value.trim().replace(/^dia\s*/i, '');
  let date = raw;
  if (/^\d{1,2}$/.test(raw)) date = `${context.month}-${raw.padStart(2, '0')}`;
  else if (/^\d{1,2}\/\d{1,2}(?:\/\d{4})?$/.test(raw)) {
    const [day, month, year = context.month.slice(0, 4)] = raw.split('/');
    date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`${location}: data “${value}” inválida. Use dia do mês, DD/MM/AAAA ou AAAA-MM-DD.`);
  if (!monthDates(date.slice(0, 7)).includes(date)) throw new Error(`${location}: a data ${date} não existe.`);
  if (date.slice(0, 7) !== context.month) throw new Error(`${location}: ${date} está fora de ${context.month}. Selecione o mês do arquivo antes de importar.`);
  return date;
}

function resolvePlatform(value: string): Platform | 'unsupported' | undefined {
  const name = normalize(value);
  if (/pinterest|stories|facebook|linkedin|threads|twitter|^x$/.test(name)) return 'unsupported';
  if (/youtube|you tube|\byt\b|^shorts?$/.test(name)) return 'youtube';
  if (/instagram|\binsta\b|\breels?\b/.test(name)) return 'instagram';
  if (/tiktok|tik tok/.test(name)) return 'tiktok';
  if (/spotify|podcast/.test(name)) return 'spotify';
  return undefined;
}

function resolveFormat(value: string): Format | undefined {
  const name = normalize(value);
  if (/youtube long|video longo|videos longos|\blongo\b|long form/.test(name)) return 'youtube_long';
  if (/spotify episode|podcast|episodio de audio/.test(name)) return 'spotify_episode';
  if (/carousel|carrossel/.test(name)) return 'carousel';
  if (/^image$|imagem|\bfoto\b|post estatico|feed estatico/.test(name)) return 'image';
  if (/\bshorts?\b|\breels?\b|video curto|videos curtos/.test(name)) return 'short';
  return undefined;
}

function compatible(platform: Platform, format: Format) {
  return platform === 'youtube' ? ['youtube_long', 'short'].includes(format)
    : platform === 'instagram' ? ['short', 'carousel', 'image'].includes(format)
      : platform === 'tiktok' ? format === 'short' : format === 'spotify_episode';
}

function entryFormat(platform: Platform, explicit: string, hint: string, context: Context, location: string): Format {
  const provided = resolveFormat(explicit);
  if (explicit && !provided) throw new Error(`${location}: formato “${explicit}” não reconhecido. Use ${Object.keys(formats).join(', ')}.`);
  if (provided && !compatible(platform, provided)) throw new Error(`${location}: o formato “${explicit}” não é compatível com ${platforms[platform]}.`);
  if (provided) return provided;
  const guessed = resolveFormat(hint);
  if (guessed && compatible(platform, guessed)) return guessed;
  if (context.options.defaultFormat && compatible(platform, context.options.defaultFormat)) return context.options.defaultFormat;
  if (platform === 'tiktok') return 'short';
  if (platform === 'spotify') return 'spotify_episode';
  const fallback = platform === 'youtube' ? 'youtube_long' : 'image';
  context.warnings.add(`Formato não indicado em algumas entregas de ${platforms[platform]}; usado “${formats[fallback]}”. Confira os formatos na prévia.`);
  return fallback;
}

const evidenceAliases: Record<EvidenceKey, string[]> = {
  idea: ['idea', 'ideia', 'ideia central', 'assunto', 'tema', 'brief', 'briefing'],
  research: ['research', 'pesquisa', 'pesquisa concluida'],
  title: ['title', 'titulo', 'titulo do video', 'titulo do youtube', 'titulo seo'],
  reference: ['reference', 'referencia', 'referencia tecnica', 'referencias', 'autores', 'ideia central e autores'],
  takeaway: ['takeaway', 'aprendizado', 'aprendizado central', 'o que a pessoa leva', 'ideia que a pessoa leva', 'tese central'],
  cta: ['cta', 'acao desejada', 'desired action', 'chamada para acao'],
  script: ['script', 'roteiro', 'roteiro texto', 'script url', 'url do roteiro', 'link do roteiro'],
  audio: ['audio', 'narracao', 'audio url', 'link do audio'],
  images: ['images', 'imagens', 'imagem final', 'imagens prontas', 'link das imagens'],
  edit: ['edit', 'edicao', 'video final', 'video editado', 'link do video final'],
  thumbnail: ['thumbnail', 'thumbnail image', 'imagem da thumbnail', 'thumbnail pronta', 'link da thumbnail'],
  description: ['description', 'descricao', 'descricao do video', 'descricao otimizada', 'legenda'],
};

function collectEvidence(record: Fields, title: string, brief: string, context: Context, location: string): PlanEntry['evidence'] {
  const result: PlanEntry['evidence'] = { idea: brief || title };
  for (const [key, aliases] of Object.entries(evidenceAliases)) {
    const value = field(record, ...aliases);
    if (isEvidence(value)) result[key as EvidenceKey] = value;
  }
  const provided = record.evidence ?? record.evidencias;
  if (provided !== undefined) {
    if (!provided || typeof provided !== 'object' || Array.isArray(provided)) throw new Error(`${location}: “evidence” precisa ser um objeto com os comprovantes de cada etapa.`);
    for (const [key, value] of Object.entries(provided)) {
      const normalized = normalize(key);
      const target = Object.entries(evidenceAliases).find(([key, aliases]) => key === normalized || aliases.includes(normalized))?.[0] as EvidenceKey | undefined;
      if (!target) { context.warnings.add(`Evidência “${key}” não reconhecida em ${location}; não marcou nenhuma etapa.`); continue; }
      if (isEvidence(value)) result[target] = asText(value);
      else delete result[target];
    }
  }
  // Cover wording is planning evidence, never proof that its image exists.
  if (has(record, 'texto de thumbnail', 'texto da thumbnail', 'thumbnail text') && !has(record, 'imagem da thumbnail', 'thumbnail image', 'thumbnail pronta', 'link da thumbnail')) delete result.thumbnail;
  return result;
}

function recordEntry(raw: Fields, context: Context, location: string, hints?: { platform?: Platform; format?: Format }): PlanEntry | null {
  const record = normalizedFields(raw);
  const date = parseDate(field(record, 'date', 'data', 'day', 'dia', 'planned for', '#', 'numero', 'episodio'), context, location);
  const channelName = field(record, 'platform', 'plataforma', 'channel', 'canal', 'rede', 'rede social');
  const explicitPlatform = resolvePlatform(channelName);
  if (explicitPlatform === 'unsupported') { context.warnings.add(`${channelName} não é um canal suportado: entrega de ${date} não foi incluída.`); return null; }
  if (channelName && !explicitPlatform) throw new Error(`${location}: canal “${channelName}” não reconhecido. Use YouTube, Instagram, TikTok ou Spotify.`);
  const platform = explicitPlatform || hints?.platform || context.options.defaultPlatform;
  if (!platform) throw new Error(`${location}: falta o canal. Inclua uma coluna “canal” ou escolha o canal padrão na importação.`);
  const rawTitle = field(record, 'title', 'titulo', 'titulo do video', 'titulo do youtube', 'titulo seo', 'conteudo', 'tema', 'assunto', 'idea', 'ideia', 'ideia central');
  const published = /(?:^|[.\s])publicado\s*$/i.test(rawTitle) || /^(?:publicado|published|true)$/i.test(field(record, 'status', 'published', 'publicado'));
  const title = rawTitle.replace(/(?:\.\s*|\s+)Publicado\s*$/i, '').trim();
  if (!title || absent.test(normalize(title))) throw new Error(`${location}: a entrega de ${date} está sem título ou ideia.`);
  const baseBrief = field(record, 'brief', 'briefing', 'ideia', 'idea', 'ideia central', 'ideia central e autores', 'instrucoes', 'observacoes', 'notes') || title;
  const extras = Object.entries(record).filter(([key]) => /texto (?:da|de) thumbnail|thumbnail text|derivados|pesquisa|referencia|aprendizado|takeaway|roteiro|descricao|legenda|cta/.test(key))
    .map(([key, value]) => `${key}: ${asText(value)}`).filter(line => !line.endsWith(': '));
  const brief = [baseBrief, ...extras].join('\n');
  const format = entryFormat(platform, field(record, 'format', 'formato', 'type', 'tipo') || hints?.format || '', `${channelName} ${baseBrief}`, context, location);
  const evidence = collectEvidence(record, title, baseBrief, context, location);
  const reference = field(record, ...evidenceAliases.reference);
  const takeaway = field(record, ...evidenceAliases.takeaway);
  const cta = field(record, ...evidenceAliases.cta);
  const source = field(record, 'source', 'origem', 'conteudo mae');
  return { date, platform, format, title, brief, evidence, ...(reference ? { reference } : {}), ...(takeaway ? { takeaway } : {}), ...(cta ? { cta } : {}), ...(published ? { published: true } : {}), ...(source ? { source } : {}) };
}

function projectFromText(text: string, names: string[]): string | null {
  const firstHeading = text.split('\n').find(line => /^#\s+/.test(line))?.replace(/^#\s+/, '').trim() || '';
  const explicit = text.match(/^\s*(?:[-*]\s*)?(?:\*\*)?(?:Projeto|Project|Produto|Marca)(?:\*\*)?\s*:(?:\*\*)?\s*([^\n]+)/im)?.[1];
  for (const candidate of [explicit || '', firstHeading]) {
    const match = names.find(name => normalize(candidate).includes(normalize(name)));
    if (match) return match;
  }
  if (explicit) return clean(explicit);
  const segments = firstHeading.split('|').map(clean);
  const named = segments.find(segment => segment && !/^(?:plano|planejamento|sistema|calendario|conteudo|editorial|programacao|cronograma)\b/.test(normalize(segment)) && !/^(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|\d{4}-\d{2})(?:\s+\d{4})?$/i.test(normalize(segment)));
  if (segments.length > 1 && named) return named;
  const suffix = firstHeading.match(/(?:plano|calend[aá]rio|planejamento)(?: editorial| mensal| de conte[uú]do)?\s*[-–—:]\s*(.+)/i)?.[1];
  if (suffix) return clean(suffix);
  return firstHeading && !/plano|editorial|calendario|planejamento|conteudo/.test(normalize(firstHeading)) ? firstHeading : null;
}

function csvRows(text: string): string[][] {
  const header = text.split('\n')[0];
  const delimiter = ['\t', ';', ','].sort((a, b) => header.split(b).length - header.split(a).length)[0];
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index++; }
      else if (!quoted && cell.trim()) throw new Error(`CSV: aspas inesperadas perto da linha ${rows.length + 1}. Coloque o campo inteiro entre aspas.`);
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) { row.push(cell.trim()); cell = ''; }
    else if (char === '\n' && !quoted) { row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  if (quoted) throw new Error('CSV: há um campo com aspas abertas. Feche as aspas antes de importar.');
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
  return rows;
}

function markdownCells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(clean);
}

function tableRecords(rows: string[][], location: string): Fields[] {
  const [headers, ...values] = rows;
  if (!headers || !values.length) throw new Error(`${location}: a tabela precisa de cabeçalho e ao menos uma entrega.`);
  if (new Set(headers.map(normalize)).size !== headers.length) throw new Error(`${location}: há nomes de colunas repetidos.`);
  return values.map((cells, index) => {
    if (cells.length !== headers.length) throw new Error(`${location}, linha ${index + 2}: esperava ${headers.length} colunas e encontrei ${cells.length}. Confira os separadores.`);
    return normalizedFields(Object.fromEntries(headers.map((key, index) => [key, cells[index]])));
  });
}

function channelEntries(record: Fields, context: Context, location: string, dayTitle?: string, weeklyTitle?: string): PlanEntry[] {
  const date = field(record, 'date', 'data', 'day', 'dia', '#');
  const output: PlanEntry[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (!/^(?:youtube|you tube|yt\b|shorts?\b|instagram|insta\b|reels?\b|tiktok|tik tok|spotify|podcast|pinterest|stories|facebook|linkedin|threads|twitter)/.test(normalize(key))) continue;
    const platform = resolvePlatform(key);
    if (!platform || !isEvidence(value)) continue;
    if (platform === 'unsupported') { context.warnings.add(`${clean(key)} aparece no arquivo, mas não é um canal suportado. Essas sugestões permanecem no arquivo e não criam entregas.`); continue; }
    const description = asText(value);
    const isLong = platform === 'youtube' && resolveFormat(key) === 'youtube_long';
    const quotedTitle = description.match(/^[“"](.+?)[”"]\.?$/s)?.[1];
    const headline = isLong && weeklyTitle ? weeklyTitle : quotedTitle || dayTitle || description;
    const entry = recordEntry({ date, platform, title: headline, brief: description, ...(resolveFormat(key) ? { format: resolveFormat(key) } : {}), source: dayTitle ? `Ideia do dia: ${dayTitle}` : '', cta: field(record, 'cta'), reference: field(record, 'referencia', 'referencia tecnica'), research: field(record, 'pesquisa') }, context, `${location}, ${key}`);
    if (entry) output.push(entry);
  }
  return output;
}

function addRecord(record: Fields, context: Context, location: string, hints?: { platform?: Platform; format?: Format }) {
  const channels = channelEntries(record, context, location, field(record, 'title', 'titulo', 'tema', 'ideia'));
  if (channels.length) context.entries.push(...channels);
  else if (Object.keys(record).some(key => /^(?:pinterest|stories|facebook|linkedin|threads|twitter)/.test(normalize(key))) && !has(record, 'platform', 'plataforma', 'canal', 'channel')) return;
  else { const entry = recordEntry(record, context, location, hints); if (entry) context.entries.push(entry); }
}

function parseMarkdown(text: string, context: Context) {
  const lines = text.split('\n');
  const weekly = new Map<string, string>();
  let sectionName = '';
  for (let index = 0; index < lines.length; index++) {
    const line = clean(lines[index]);
    if (/^#{1,6}\s/.test(line)) sectionName = normalize(line.replace(/^#+\s*/, ''));
    if (/longos|videos longos|youtube longo/.test(sectionName)) {
      const listed = line.match(/^\s*[-*+]\s*Dia\s+(\d{1,2})\s*[-–—:]\s*(.+)$/i);
      if (listed) {
        const date = parseDate(listed[1], context, `Vídeo longo, linha ${index + 1}`);
        if (weekly.has(date) && weekly.get(date) !== listed[2]) throw new Error(`Dois títulos diferentes de vídeo longo foram indicados para ${date}.`);
        weekly.set(date, clean(listed[2]));
      }
    }
  }
  for (let index = 0; index < lines.length; index++) {
    const heading = lines[index].match(/^\s*(#{1,6})\s+(?:(?:Dia|Day)\s+)?(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{4})?|\d{1,2})\s*(?:[-–—:|]\s*)?(.*)$/i);
    if (!heading) continue;
    const date = parseDate(heading[2], context, `Linha ${index + 1}`);
    const title = clean(heading[3]);
    const body: string[] = [];
    for (let cursor = index + 1; cursor < lines.length; cursor++) {
      const next = lines[cursor].match(/^\s*(#{1,6})\s+/);
      if (next && next[1].length <= heading[1].length) break;
      body.push(lines[cursor]);
    }
    const fields: Fields = { date, title }; let current = '';
    for (const rawLine of body) {
      const line = clean(rawLine).replace(/^\s*[-*+]\s+/, '').trim();
      const subheading = line.match(/^#{1,6}\s+(.+?)\s*:?.*$/)?.[1];
      const pair = line.match(/^([^:]+):\s*(.*)$/);
      if (subheading && resolvePlatform(subheading)) { current = normalize(subheading); fields[current] = ''; }
      else if (pair && (resolvePlatform(pair[1]) || Object.values(evidenceAliases).flat().includes(normalize(pair[1])) || /^(?:formato|format|tipo|canal|platform|plataforma|status|published|publicado|titulo|title|origem|source)$/.test(normalize(pair[1])))) {
        current = normalize(pair[1]); fields[current] = pair[2];
      } else if (current && line && !/^#{1,6}\s/.test(line)) fields[current] = `${asText(fields[current])}\n${line}`.trim();
    }
    const entries = channelEntries(fields, context, `Dia ${heading[2]}`, title, weekly.get(date));
    if (entries.length) context.entries.push(...entries);
    else if (!Object.keys(fields).some(key => resolvePlatform(key) === 'unsupported')) {
      const entry = recordEntry({ ...fields, brief: field(fields, 'ideia', 'brief') || body.join('\n').trim() || title }, context, `Dia ${heading[2]}`);
      if (entry) context.entries.push(entry);
    }
  }
  sectionName = '';
  const derived = new Map<string, string[]>();
  for (let index = 0; index < lines.length; index++) {
    if (/^#{1,6}\s/.test(lines[index])) sectionName = normalize(lines[index].replace(/^#+\s*/, ''));
    if (!lines[index].includes('|') || !lines[index + 1] || !/^\s*\|?\s*:?-{1,}:?\s*\|/.test(lines[index + 1])) continue;
    const headers = markdownCells(lines[index]);
    if (!headers.some(header => /^(?:date|data|day|dia|#|numero|episodio)$/.test(normalize(header)))) continue;
    const rows = [headers]; let cursor = index + 2;
    for (; cursor < lines.length && lines[cursor].includes('|') && lines[cursor].trim(); cursor++) rows.push(markdownCells(lines[cursor]));
    const records = tableRecords(rows, `Tabela na linha ${index + 1}`);
    const indexIsDate = headers.some(header => normalize(header) === '#');
    if (indexIsDate && /derivad|matriz|recorte/.test(sectionName)) {
      for (const record of records) derived.set(field(record, '#'), Object.entries(record).filter(([key]) => key !== '#').map(([key, value]) => `${key}: ${asText(value)}`));
      context.warnings.add(`A matriz de derivados tem ${records.length} ideias sem data própria. Foram preservadas nas notas dos conteúdos de origem; não geram publicações no mesmo dia automaticamente.`);
    } else {
      if (indexIsDate) context.warnings.add(`A numeração “#” foi interpretada como dias de ${context.month}. Confira as datas na prévia.`);
      const youtubeTitles = headers.some(header => /titulo (?:do )?youtube/.test(normalize(header)));
      const hints = youtubeTitles || /longos|youtube longo/.test(sectionName) ? { platform: 'youtube' as const, format: 'youtube_long' as const } : undefined;
      records.forEach((record, row) => addRecord(record, context, `Tabela na linha ${index + row + 3}`, hints));
    }
    index = cursor - 1;
  }
  for (const [date, title] of weekly) {
    if (!context.entries.some(entry => entry.date === date && entry.platform === 'youtube' && entry.format === 'youtube_long')) {
      const entry = recordEntry({ date, title, platform: 'youtube', format: 'youtube_long', brief: title }, context, `Lista de vídeos longos, ${date}`);
      if (entry) context.entries.push(entry);
    }
  }
  for (const entry of context.entries) {
    const extra = derived.get(String(Number(entry.date.slice(-2))));
    if (entry.platform === 'youtube' && entry.format === 'youtube_long' && extra) entry.brief += `\n\nSugestões de derivados sem data de publicação:\n${extra.join('\n')}`;
  }
}

export function parsePlanFile(sourceName: string, sourceText: string, options: ParseOptions): ParsedPlan {
  monthDates(options.month);
  const text = sourceText.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!text) throw new Error('O arquivo está vazio. Inclua pelo menos uma data, um canal e uma ideia.');
  if (text.length > 2_000_000) throw new Error('O arquivo é muito grande. Importe planos de até 2 MB por vez.');
  const context: Context = { month: options.month, options, warnings: new Set(), entries: [] };
  let projectName: string | null = null;
  if (/\.json$/i.test(sourceName) || /^[\[{]/.test(text)) {
    let data: unknown;
    try { data = JSON.parse(text); } catch { throw new Error('O JSON está inválido. Confira aspas, vírgulas e colchetes.'); }
    if (!data || typeof data !== 'object') throw new Error('O JSON precisa conter uma lista de entregas ou um objeto com “entries”.');
    const document = Array.isArray(data) ? {} : normalizedFields(data as Fields);
    projectName = field(document, 'project', 'projeto', 'project name', 'produto') || null;
    const declaredMonth = field(document, 'month', 'mes');
    if (declaredMonth && declaredMonth !== options.month) throw new Error(`O arquivo é de ${declaredMonth}, mas o mês selecionado é ${options.month}. Selecione o mês do arquivo.`);
    const entries = Array.isArray(data) ? data : document.entries ?? document.publications ?? document.conteudos ?? document.entregas;
    if (!Array.isArray(entries)) throw new Error('O JSON precisa conter “entries”: uma lista com date, platform, format e title.');
    entries.forEach((value, index) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Entrega ${index + 1}: esperava um objeto com data, canal e título.`);
      addRecord(normalizedFields(value as Fields), context, `Entrega ${index + 1}`);
    });
  } else if (/\.(?:csv|tsv)$/i.test(sourceName) || (!/^\s*#/m.test(text) && /^(?:data|date|dia|day|canal|platform|titulo|title)[;,\t]/i.test(text))) {
    const records = tableRecords(csvRows(text), 'CSV');
    const projects = [...new Set(records.map(record => field(record, 'project', 'projeto', 'produto')).filter(Boolean))];
    if (projects.length > 1) throw new Error('O arquivo contém vários projetos. Importe um projeto por arquivo para preservar os vínculos.');
    projectName = projects[0] || null;
    records.forEach((record, index) => addRecord(record, context, `CSV, linha ${index + 2}`));
  } else {
    projectName = projectFromText(text, options.projectNames || []);
    parseMarkdown(text, context);
  }
  if (!context.entries.length) throw new Error('Não encontrei entregas válidas. Use seções “### Dia 1 — Ideia”, tabela com Dia/Canal/Título, CSV ou JSON. Canais aceitos: YouTube, Instagram, TikTok e Spotify.');
  const entries: PlanEntry[] = []; const slots = new Map<string, PlanEntry>();
  for (const entry of context.entries) {
    const slot = `${entry.date}|${entry.platform}|${entry.format}`;
    const previous = slots.get(slot);
    if (previous) {
      if (normalize(previous.title) !== normalize(entry.title) || JSON.stringify(previous.evidence) !== JSON.stringify(entry.evidence) || previous.published !== entry.published) throw new Error(`Há duas entregas diferentes para ${entry.date}, ${platforms[entry.platform]}, ${formats[entry.format]}. Revise a repetição antes de importar.`);
      context.warnings.add(`Entrega repetida removida: ${entry.date}, ${platforms[entry.platform]}, “${entry.title}”.`);
    } else { slots.set(slot, entry); entries.push(entry); }
  }
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.platform.localeCompare(b.platform) || a.format.localeCompare(b.format));
  return { projectName, month: context.month, entries, warnings: [...context.warnings], sourceName };
}
