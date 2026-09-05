"use client";
import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AuthGate } from '@/components/auth-gate';
import { Dashboard } from '@/components/dashboard';
import { PlanImporter } from '@/components/plan-importer';
import { ProjectManager, CadenceDialog } from '@/components/projects';
import { ContentEditor, BatchEditor } from '@/components/content-editor';
import { downloadText, errorMessage } from '@/components/ui';
import { localDate, type Content, type Publication, type WorkspaceData } from '@/lib/domain';
import { requireSupabase } from '@/lib/supabase/client';
import { loadWorkspace } from '@/lib/supabase/workspace';

export type View = 'Hoje' | 'Plano mensal' | 'Banco de conteúdo' | 'Projetos';
export default function Home() { return <AuthGate>{session => <Workspace key={session.user.id} session={session} />}</AuthGate>; }
function Workspace({ session }: { session: Session }) {
  const [view, setView] = useState<View>('Hoje');
  const [data, setData] = useState<WorkspaceData>({ projects: [], contents: [], publications: [], batches: [] });
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(localDate().slice(0, 7));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<'import' | 'batch' | 'content' | 'cadence' | null>(null);
  const [editing, setEditing] = useState<Content | undefined>();
  const [target, setTarget] = useState<Publication | undefined>();
  const refresh = useCallback(async () => { const next = await loadWorkspace(requireSupabase()); setData(next); setError(''); }, []);
  useEffect(() => { refresh().catch(reason => setError(errorMessage(reason))).finally(() => setLoading(false)); }, [refresh]);
  useEffect(() => {
    const focus = () => { if (document.visibilityState === 'visible') refresh().catch(reason => setError(errorMessage(reason))); };
    window.addEventListener('focus', focus);
    return () => window.removeEventListener('focus', focus);
  }, [refresh]);
  async function saved(note: string) {
    setDialog(null); setEditing(undefined); setTarget(undefined); setMessage(note);
    try { await refresh(); } catch (reason) { setError('A alteração foi enviada, mas a tela não atualizou: ' + errorMessage(reason)); }
  }
  const titles: Record<View, string> = { Hoje: 'Sua mesa de trabalho', 'Plano mensal': 'O mês inteiro, em contexto', 'Banco de conteúdo': 'Conteúdos para reutilizar', Projetos: 'Seus projetos e produtos' };
  function openContent(content?: Content, publication?: Publication) { setEditing(content); setTarget(publication); setDialog('content'); }
  return <main className="workspace"><aside className="sidebar"><a className="brand" href="/">JP STUDIO<span>OPERAÇÕES DE CONTEÚDO</span></a><nav aria-label="Navegação principal">{(['Hoje', 'Plano mensal', 'Banco de conteúdo', 'Projetos'] as View[]).map((item, index) => <button key={item} className={view === item ? 'nav-item active' : 'nav-item'} onClick={() => setView(item)}><span aria-hidden="true">{['◉', '▦', '▱', '◈'][index]}</span>{item}</button>)}</nav><div className="sidebar-bottom"><p>{session.user.email}</p><button className="text-button" onClick={() => downloadText('jp-studio-' + localDate() + '.json', JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), ...data }, null, 2))}>Exportar meus dados</button><button className="text-button" onClick={async () => { const result = await requireSupabase().auth.signOut(); if (result.error) setError(result.error.message); }}>Sair da conta</button></div></aside>
    <section className="main-content"><header className="page-heading"><div><p className="eyebrow">{view} · {new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}</p><h1>{titles[view]}</h1></div><div className="actions"><button onClick={() => setDialog('batch')} disabled={!data.contents.length}>Atualizar etapas</button><button className="primary" onClick={() => setDialog('import')}>↑ Importar plano</button></div></header>
    {message && <div role="status" className="notice success">{message}<button aria-label="Dispensar mensagem" onClick={() => setMessage('')}>×</button></div>}
    {error && <div role="alert" className="notice error">{error}<button onClick={() => refresh().catch(reason => setError(errorMessage(reason)))}>Tentar novamente</button></div>}
    {loading ? <p className="empty-state">Carregando sua operação…</p> : view === 'Projetos' ? <ProjectManager data={data} onSaved={saved} /> : <Dashboard view={view} data={data} month={month} setMonth={setMonth} refresh={refresh} onContent={openContent} onCadence={() => setDialog('cadence')} onProjects={() => setView('Projetos')} onImport={() => setDialog('import')} />}
    <footer className="app-footer">Os checks registram seu trabalho. Agendamentos e publicações nas redes são registrados por você; não há postagem automática.</footer></section>
    {dialog === 'import' && <PlanImporter data={data} month={month} onClose={() => setDialog(null)} onImported={saved} />}
    {dialog === 'cadence' && <CadenceDialog data={data} month={month} onClose={() => setDialog(null)} onSaved={saved} />}
    {dialog === 'content' && <ContentEditor data={data} content={editing} publication={target} onClose={() => setDialog(null)} onSaved={saved} />}
    {dialog === 'batch' && <BatchEditor data={data} month={month} onClose={() => setDialog(null)} onSaved={saved} />}
  </main>;
}

