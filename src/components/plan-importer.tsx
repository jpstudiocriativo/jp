"use client";
import { useState } from 'react';
import { parsePlanFile } from '@/lib/plan-parser';
import { buildSteps } from '@/lib/workflow';
import { importPlan, loadWorkspace, saveProject } from '@/lib/supabase/workspace';
import { requireSupabase } from '@/lib/supabase/client';
import { formats, platforms, type Format, type ParsedPlan, type Platform, type WorkspaceData } from '@/lib/domain';
import { downloadText, ErrorNotice, Modal, errorMessage } from './ui';

export function PlanImporter({ data, month, onClose, onImported }: { data: WorkspaceData; month: string; onClose: () => void; onImported: (message: string) => Promise<void> }) {
  const [period, setPeriod] = useState(month);
  const [projectId, setProjectId] = useState('');
  const [newName, setNewName] = useState('');
  const [defaultPlatform, setDefaultPlatform] = useState<Platform>('youtube');
  const [defaultFormat, setDefaultFormat] = useState<Format>('youtube_long');
  const [text, setText] = useState('');
  const [sourceName, setSourceName] = useState('Plano colado');
  const [plan, setPlan] = useState<ParsedPlan | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  function analyze(input: string, source: string) {
    setError(''); setPlan(null);
    try {
      const parsed = parsePlanFile(source, input, { month: period, projectNames: data.projects.map(p => p.name), defaultPlatform, defaultFormat });
      setPlan(parsed);
      if (!projectId && parsed.projectName) {
        const found = data.projects.find(p => p.name.toLocaleLowerCase() === parsed.projectName?.toLocaleLowerCase());
        setProjectId(found?.id || 'new'); setNewName(parsed.projectName);
      }
    } catch (reason) { setError(errorMessage(reason)); }
  }
  async function commit() {
    if (!plan) return;
    setBusy(true); setError('');
    try {
      let id = projectId;
      if (id === 'new') {
        if (!newName.trim()) throw new Error('Informe o nome do projeto.');
        const before = await loadWorkspace(requireSupabase());
        if (!before.projects.some(p => p.name.toLocaleLowerCase() === newName.trim().toLocaleLowerCase())) await saveProject(requireSupabase(), { name: newName.trim(), description: '', color: '#6756d9', channels: [...new Set(plan.entries.map(e => e.platform))] });
        const next = await loadWorkspace(requireSupabase()); id = next.projects.find(p => p.name.toLocaleLowerCase() === newName.trim().toLocaleLowerCase())?.id || '';
        if (!id) throw new Error('Não foi possível localizar o projeto criado. Tente novamente.');
      }
      if (!id) throw new Error('Escolha o projeto que vai receber o plano.');
      const result = await importPlan(requireSupabase(), id, plan);
      await onImported('Plano importado: ' + result.created + ' conteúdos criados, ' + result.updated + ' vínculos atualizados e ' + result.skipped + ' já existentes preservados. ' + result.warnings.join(' '));
    } catch (reason) { setError(errorMessage(reason)); } finally { setBusy(false); }
  }
  function sample() {
    downloadText('modelo-plano.csv', 'data;canal;formato;titulo;ideia;referencia;cta\n' + period + '-01;youtube;youtube_long;Meu primeiro vídeo;A ideia central;;Comente sua experiência\n' + period + '-02;instagram;carousel;Meu carrossel;Uma ideia por card;;Salve para depois\n', 'text/csv;charset=utf-8');
  }
  return <Modal title="Importar e organizar um plano" onClose={onClose}><div className="form-grid"><p className="muted">Envie Markdown, texto, CSV ou JSON. O sistema identifica entregas e evidências, monta os checklists e mostra o resultado antes de gravar. Planos em tabela e por dia são aceitos.</p><div className="form-columns"><label>Mês de referência<input type="month" required value={period} onChange={e => { setPeriod(e.target.value); setPlan(null); }} /></label><label>Projeto de destino<select value={projectId} onChange={e => setProjectId(e.target.value)}><option value="">Identificar pelo arquivo</option>{data.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}<option value="new">+ Criar outro projeto</option></select></label></div>{projectId === 'new' && <label>Nome do novo projeto<input required value={newName} maxLength={120} onChange={e => setNewName(e.target.value)} /></label>}
      <details><summary>Quando o arquivo não indicar a rede ou o formato</summary><div className="form-columns"><label>Rede padrão<select value={defaultPlatform} onChange={e => { setDefaultPlatform(e.target.value as Platform); setPlan(null); }}>{Object.entries(platforms).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Formato padrão<select value={defaultFormat} onChange={e => { setDefaultFormat(e.target.value as Format); setPlan(null); }}>{Object.entries(formats).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div></details>
      <label className="file-drop">Selecionar arquivo<input type="file" accept=".md,.txt,.csv,.json,text/plain,text/markdown,text/csv,application/json" disabled={busy} onChange={async e => { const file = e.target.files?.[0]; if (!file) return; try { if (file.size > 2 * 1024 * 1024) throw new Error('O arquivo pode ter até 2 MB. Para mídia, use os links dos materiais.'); const input = await file.text(); setSourceName(file.name); setText(input); analyze(input, file.name); } catch (reason) { setError(errorMessage(reason)); } }} /></label><details><summary>Ou colar o plano aqui</summary><textarea aria-label="Texto do plano" rows={7} value={text} onChange={e => { setText(e.target.value); setSourceName('Plano colado'); setPlan(null); }} /></details><div className="actions"><button disabled={busy || !text.trim() || !period} onClick={() => analyze(text, sourceName)}>Analisar conteúdo</button><button onClick={sample}>Baixar modelo CSV</button></div>
      {plan && <section className="import-review"><h3>O que será organizado</h3><p><strong>{plan.entries.length} entregas</strong> · {new Set(plan.entries.map(e => e.date)).size} dias · {[...new Set(plan.entries.map(e => platforms[e.platform]))].join(', ')}</p><p className="muted">{plan.sourceName} · Projeto detectado: {plan.projectName || 'selecione acima'}</p>{plan.warnings.length > 0 && <div className="notice warning"><strong>Pontos para revisar</strong><ul>{plan.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}<div className="table-scroll"><table><thead><tr><th>Data</th><th>Rede / formato</th><th>Título e próximo passo</th><th>Checks comprovados</th></tr></thead><tbody>{plan.entries.map((entry, i) => { const steps = buildSteps(entry); return <tr key={i}><td><input aria-label={'Data da entrega ' + (i + 1)} type="date" value={entry.date} onChange={e => setPlan({ ...plan, entries: plan.entries.map((v, j) => j === i ? { ...v, date: e.target.value } : v) })} /></td><td>{platforms[entry.platform]}<small>{formats[entry.format]}</small></td><td><input aria-label={'Título da entrega ' + (i + 1)} value={entry.title} onChange={e => setPlan({ ...plan, entries: plan.entries.map((v, j) => j === i ? { ...v, title: e.target.value } : v) })} /><small>{steps.find(s => !s.is_done)?.label || 'Revisar publicação'}</small></td><td>{steps.filter(s => s.is_done).map(s => s.label).join(', ') || 'Nenhum'}</td></tr>; })}</tbody></table></div><p className="muted">A reimportação preserva os checks existentes e os agendamentos. Se uma entrega já estiver ocupada por outro título, o sistema informa o conflito antes de importar.</p><button className="primary" disabled={busy || !projectId || (projectId === 'new' && !newName.trim()) || !plan.entries.length} onClick={commit}>{busy ? 'Organizando e salvando…' : 'Importar ' + plan.entries.length + ' entregas'}</button></section>}
      <ErrorNotice message={error} />
    </div></Modal>;
}
