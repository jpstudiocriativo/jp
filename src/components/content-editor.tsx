"use client";
import { useMemo, useState } from 'react';
import { formats, platforms, localDate, isPublicationStep, type WorkspaceData, type Content, type Publication, type Format, type Platform, type PlanEntry } from '@/lib/domain';
import { requireSupabase } from '@/lib/supabase/client';
import { completeBatch, createContent, updateContent, setStep } from '@/lib/supabase/workspace';
import { ErrorNotice, Modal, errorMessage } from './ui';

export function ContentEditor({ data, content, publication, onClose, onSaved }: { data: WorkspaceData; content?: Content; publication?: Publication; onClose: () => void; onSaved: (message: string) => Promise<void> }) {
  const [projectId, setProjectId] = useState(content?.project_id || publication?.project_id || data.projects.find(p => p.status === 'active')?.id || '');
  const [title, setTitle] = useState(content?.title || '');
  const [brief, setBrief] = useState(content?.idea || '');
  const [reference, setReference] = useState(content?.technical_reference || '');
  const [cta, setCta] = useState(content?.desired_action || '');
  const [scriptUrl, setScriptUrl] = useState(content?.script_url || '');
  const [assetUrl, setAssetUrl] = useState(content?.asset_url || '');
  const [format, setFormat] = useState<Format>(content?.type || 'youtube_long');
  const [platform, setPlatform] = useState<Platform>(publication?.platform || 'youtube');
  const [date, setDate] = useState(publication?.planned_for || localDate());
  const [extra, setExtra] = useState(!publication);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  return <Modal title={content ? 'Conteúdo e materiais' : 'Cadastrar conteúdo'} onClose={onClose}><form className="form-grid" onSubmit={async e => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      if (content) await updateContent(requireSupabase(), content.id, { title: title.trim(), idea: brief, technical_reference: reference, desired_action: cta, script_url: scriptUrl || null, asset_url: assetUrl || null });
      else {
        const entry: PlanEntry = { date, platform, format, title: title.trim(), brief, reference, cta, evidence: { idea: title, title: title, ...(reference ? { reference } : {}), ...(cta ? { cta } : {}) } };
        const id = await createContent(requireSupabase(), projectId, entry, extra ? undefined : date);
        if (scriptUrl || assetUrl) await updateContent(requireSupabase(), id, { script_url: scriptUrl || null, asset_url: assetUrl || null });
      }
      await onSaved('Conteúdo salvo. Os links não concluem etapas sem sua confirmação.');
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }}><div className="form-columns"><label>Projeto<select value={projectId} disabled={!!content || !!publication} required onChange={e => setProjectId(e.target.value)}><option value="">Selecione</option>{data.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Formato<select disabled={!!content} value={format} onChange={e => setFormat(e.target.value as Format)}>{Object.entries(formats).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div><label>Título / ideia<input value={title} required maxLength={500} onChange={e => setTitle(e.target.value)} /></label><label>Briefing e observações<textarea rows={4} value={brief} onChange={e => setBrief(e.target.value)} /></label><div className="form-columns"><label>Referência técnica<input value={reference} onChange={e => setReference(e.target.value)} /></label><label>Ação desejada / CTA<input value={cta} onChange={e => setCta(e.target.value)} /></label></div><div className="form-columns"><label>Link do roteiro<input type="url" value={scriptUrl} placeholder="https://…" onChange={e => setScriptUrl(e.target.value)} /></label><label>Link do material final<input type="url" value={assetUrl} placeholder="https://…" onChange={e => setAssetUrl(e.target.value)} /></label></div>
    {!content && <><label className="inline-check"><input type="checkbox" disabled={!!publication} checked={extra} onChange={e => setExtra(e.target.checked)} />Guardar como extra no banco, sem data de publicação</label>{!extra && <div className="form-columns"><label>Rede<select value={platform} disabled={!!publication} onChange={e => setPlatform(e.target.value as Platform)}>{Object.entries(platforms).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Publicar em<input type="date" required value={date} disabled={!!publication} onChange={e => setDate(e.target.value)} /></label></div>}</>}
    <ErrorNotice message={error} /><button className="primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar conteúdo'}</button></form>
    {content && <div className="checklist-block"><h3>Etapas de produção</h3>{content.steps.filter(s => !isPublicationStep(s)).map(s => <label className="step" key={s.id}><input type="checkbox" disabled={busy} defaultChecked={s.is_done} onChange={async e => { const checked = e.target.checked; setBusy(true); try { await setStep(requireSupabase(), s.id, checked); } catch (reason) { e.target.checked = !checked; setError(errorMessage(reason)); } finally { setBusy(false); } }} />{s.label}</label>)}<p className="muted">Checks são salvos ao clicar. Salve o conteúdo para atualizar a mesa de trabalho.</p></div>}
  </Modal>;
}
function normalize(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

export function BatchEditor({ data, month, onClose, onSaved }: { data: WorkspaceData; month: string; onClose: () => void; onSaved: (message: string) => Promise<void> }) {
  const [projectId, setProjectId] = useState(data.projects.find(p => p.status === 'active')?.id || '');
  const [period, setPeriod] = useState(month);
  const [stage, setStage] = useState('roteiro');
  const [channel, setChannel] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [evidence, setEvidence] = useState('');
  const [note, setNote] = useState('');
  const [matchMessage, setMatchMessage] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const stageTests: Record<string, RegExp> = { roteiro: /roteiro/, audio: /audio|narracao/, descricao: /descricao|legenda/, imagem: /imagens|material visual|materiais visuais/, thumbnail: /thumbnail/, edicao: /editar|edicao|capcut/, pesquisa: /pesquisa/, todas: /./ };
  const rows = useMemo(() => data.contents.filter(c => c.project_id === projectId).flatMap(c => {
    const deliveries = data.publications.filter(p => p.content_id === c.id);
    const inPeriod = deliveries.some(p => p.planned_for.startsWith(period) && (!channel || p.platform === channel));
    if (!inPeriod && deliveries.length) return [];
    if (!deliveries.length && channel) return [];
    return c.steps.filter(s => !s.is_done && !isPublicationStep(s) && stageTests[stage].test(normalize(s.label))).map(step => ({ content: c, step, date: deliveries.find(p => p.planned_for.startsWith(period))?.planned_for || 'Extra' }));
  }), [data, projectId, period, stage, channel]);
  function reset() { setSelected([]); setMatchMessage(''); }
  return <Modal title="Atualizar várias etapas" onClose={onClose}><form className="form-grid" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { const ids = rows.filter(r => selected.includes(r.step.id)).map(r => r.step.id); if (!ids.length) throw new Error('Selecione as etapas que você concluiu.'); await completeBatch(requireSupabase(), ids, evidence || 'Confirmação manual', note); await onSaved(ids.length + ' etapas concluídas. A atualização ficou registrada no histórico.'); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }}>
    <p className="muted">Escolha a etapa e os conteúdos. Você pode informar que concluiu o trabalho ou enviar um texto para sugerir correspondências pelo título. Revise a seleção antes de aplicar.</p><div className="form-columns"><label>Projeto<select value={projectId} onChange={e => { setProjectId(e.target.value); reset(); }}>{data.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Mês<input type="month" required value={period} onChange={e => { setPeriod(e.target.value); reset(); }} /></label><label>Etapa<select value={stage} onChange={e => { setStage(e.target.value); reset(); }}><option value="roteiro">Roteiro</option><option value="audio">Áudio / narração</option><option value="descricao">Descrição / legenda</option><option value="imagem">Imagens / visuais</option><option value="thumbnail">Thumbnail</option><option value="edicao">Edição</option><option value="pesquisa">Pesquisa</option><option value="todas">Todas as pendentes</option></select></label><label>Rede<select value={channel} onChange={e => { setChannel(e.target.value); reset(); }}><option value="">Todas / inclui extras</option>{Object.entries(platforms).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
    <label>Documento de apoio (.md ou .txt, opcional)<input type="file" accept=".md,.txt" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; try { if (file.size > 2 * 1024 * 1024) throw new Error('Use um arquivo de texto de até 2 MB.'); const text = normalize(await file.text()); const matches = rows.filter(r => { const title = normalize(r.content.title); return title.length > 12 && text.includes(title); }); setSelected(matches.map(r => r.step.id)); setEvidence(file.name); setMatchMessage(matches.length + ' etapas sugeridas por correspondência de título. Confira a seleção. O arquivo não é armazenado; registramos seu nome como evidência.'); } catch (reason) { setError(errorMessage(reason)); } }} /></label>{matchMessage && <p className="notice">{matchMessage}</p>}<label>Identificação da evidência<input value={evidence} onChange={e => setEvidence(e.target.value)} placeholder="Ex.: roteiros-semana-1.md ou áudios gerados" /></label><label>Observação<textarea value={note} onChange={e => setNote(e.target.value)} placeholder="O que foi concluído neste lote?" /></label><div className="section-heading"><strong>{selected.filter(id => rows.some(r => r.step.id === id)).length} de {rows.length} etapas selecionadas</strong><button type="button" onClick={() => setSelected(selected.length ? [] : rows.map(r => r.step.id))}>{selected.length ? 'Limpar seleção' : 'Selecionar todas do filtro'}</button></div><div className="batch-list">{rows.map(r => <label className="step" key={r.step.id}><input type="checkbox" checked={selected.includes(r.step.id)} onChange={e => setSelected(e.target.checked ? [...selected, r.step.id] : selected.filter(id => id !== r.step.id))} /><span><strong>{r.content.title}</strong><small>{r.date} · {r.step.label}</small></span></label>)}{!rows.length && <p className="muted">Nenhuma etapa pendente neste filtro.</p>}</div><ErrorNotice message={error} /><button disabled={busy || !selected.length} className="primary">{busy ? 'Salvando…' : 'Marcar selecionadas como concluídas'}</button></form>
    <details className="history"><summary>Histórico de atualizações</summary>{data.batches.filter(b => b.project_id === projectId).slice(0, 20).map(b => <p key={b.id}><strong>{b.step_label}</strong><br /><small>{b.evidence_name} · {new Date(b.created_at).toLocaleString('pt-BR')}</small><br />{b.note}</p>)}</details>
  </Modal>;
}

