"use client";
import { useState, type FormEvent } from 'react';
import { platforms, monthDates, type WorkspaceData, type Project, type Platform } from '@/lib/domain';
import { requireSupabase } from '@/lib/supabase/client';
import { archiveProject, createCadence, saveProject } from '@/lib/supabase/workspace';
import { ErrorNotice, Modal, errorMessage } from './ui';

export function ProjectManager({ data, onSaved }: { data: WorkspaceData; onSaved: (message: string) => Promise<void> }) {
  const [editing, setEditing] = useState<Project | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return <><div className="section-heading"><p className="muted">Um projeto pode ser uma marca, um produto, uma empresa ou um canal pessoal.</p><button className="primary" onClick={() => setEditing(null)}>+ Novo projeto</button></div><ErrorNotice message={error} />
    {!data.projects.length && <div className="empty-state"><h2>Comece pelo seu primeiro projeto</h2><p>Escolha o nome e as redes em que ele atua. Depois importe um plano ou crie sua frequência mensal.</p></div>}
    <div className="project-grid">{data.projects.map(project => <article key={project.id} className="panel project-card"><span className="project-dot" style={{ background: project.color || '#6756d9' }} /><h2>{project.name}</h2><p className="muted">{project.description || 'Sem descrição'}</p><div className="tags">{project.channels.filter(c => c.is_active).map(c => <span key={c.platform}>{platforms[c.platform]}</span>)}</div><p className="muted">{data.contents.filter(c => c.project_id === project.id).length} conteúdos · {project.status === 'active' ? 'Ativo' : 'Pausado'}</p><div className="actions"><button onClick={() => setEditing(project)}>Editar projeto</button><button disabled={busy} onClick={async () => { setBusy(true); try { await archiveProject(requireSupabase(), project.id, project.status === 'active'); await onSaved('Projeto atualizado. O histórico foi preservado.'); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }}>{project.status === 'active' ? 'Pausar' : 'Reativar'}</button></div></article>)}</div>
    {editing !== undefined && <ProjectDialog project={editing || undefined} onClose={() => setEditing(undefined)} onSaved={async () => { setEditing(undefined); await onSaved('Projeto salvo. Agora você pode importar o plano ou definir a frequência.'); }} />}
  </>;
}

function ProjectDialog({ project, onClose, onSaved }: { project?: Project; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(project?.name || '');
  const [description, setDescription] = useState(project?.description || '');
  const [color, setColor] = useState(project?.color || '#6756d9');
  const [channels, setChannels] = useState<Platform[]>(project?.channels.filter(c => c.is_active).map(c => c.platform) || []);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); if (!channels.length) { setError('Selecione pelo menos uma rede.'); return; }
    setBusy(true); try { await saveProject(requireSupabase(), { id: project?.id, name: name.trim(), description, color, channels }); await onSaved(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return <Modal title={project ? 'Editar projeto' : 'Novo projeto'} onClose={onClose}><form onSubmit={submit} className="form-grid"><label>Nome do projeto<input required maxLength={120} value={name} onChange={e => setName(e.target.value)} /></label><label>Descrição<textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={1000} /></label><label>Cor<input type="color" value={color} onChange={e => setColor(e.target.value)} /></label><fieldset><legend>Redes ativas</legend><div className="check-options">{(Object.keys(platforms) as Platform[]).map(platform => <label key={platform}><input type="checkbox" checked={channels.includes(platform)} onChange={e => setChannels(e.target.checked ? [...channels, platform] : channels.filter(c => c !== platform))} />{platforms[platform]}</label>)}</div></fieldset><ErrorNotice message={error} /><button className="primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar projeto'}</button></form></Modal>;
}

export function CadenceDialog({ data, month, onClose, onSaved }: { data: WorkspaceData; month: string; onClose: () => void; onSaved: (message: string) => Promise<void> }) {
  const active = data.projects.filter(p => p.status === 'active');
  const [projectId, setProjectId] = useState(active[0]?.id || '');
  const [period, setPeriod] = useState(month);
  const [days, setDays] = useState([0, 1, 2, 3, 4, 5, 6]);
  const project = data.projects.find(p => p.id === projectId);
  const channels = project?.channels.filter(c => c.is_active).map(c => c.platform) || [];
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  return <Modal title="Definir frequência mensal" onClose={onClose}><form className="form-grid" onSubmit={async e => { e.preventDefault(); setBusy(true); try { await createCadence(requireSupabase(), projectId, period, channels, days); await onSaved('Frequência criada. As entregas existentes foram preservadas.'); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }}><p className="muted">Crie os compromissos de publicação. O conteúdo pode ser escolhido depois, na mesa de trabalho.</p><label>Projeto<select required value={projectId} onChange={e => setProjectId(e.target.value)}><option value="">Selecione</option>{active.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Mês<input type="month" required value={period} onChange={e => setPeriod(e.target.value)} /></label><fieldset><legend>Dias de publicação</legend><div className="check-options">{['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d, i) => <label key={d}><input type="checkbox" checked={days.includes(i)} onChange={e => setDays(e.target.checked ? [...days, i] : days.filter(day => day !== i))} />{d}</label>)}</div></fieldset><p>{channels.map(c => platforms[c]).join(' · ') || 'Escolha um projeto com redes ativas.'}</p><p className="muted">{period ? monthDates(period).filter(d => days.includes(new Date(d + 'T12:00:00').getDay())).length * channels.length : 0} compromissos previstos. Shorts e longos extras podem ser acrescentados pela importação ou pelo cadastro de conteúdo.</p><ErrorNotice message={error} /><button className="primary" disabled={busy || !channels.length || !days.length}>{busy ? 'Criando…' : 'Criar frequência'}</button></form></Modal>;
}

