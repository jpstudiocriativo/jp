"use client";
import { useEffect, useState, type ReactNode, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { ErrorNotice, errorMessage } from './ui';

export function AuthGate({ children }: { children: (session: Session) => ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset' | 'newpassword'>('signin');
  const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    const recovery = window.location.hash.includes('type=recovery');
    if (recovery) setMode('newpassword');
    supabase.auth.getSession().then(({ data, error }) => { setSession(data.session); if (error) setError(error.message); }).catch(e => setError(errorMessage(e))).finally(() => setLoading(false));
    const { data } = supabase.auth.onAuthStateChange((event, next) => { setSession(next); if (event === 'PASSWORD_RECOVERY') setMode('newpassword'); });
    return () => data.subscription.unsubscribe();
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!supabase) return;
    setBusy(true); setError(''); setMessage('');
    try {
      if (mode === 'reset') { const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin }); if (error) throw error; setMessage('Se este e-mail estiver cadastrado, você receberá um link para recuperar o acesso.'); }
      else if (mode === 'newpassword') { const { error } = await supabase.auth.updateUser({ password }); if (error) throw error; setMode('signin'); setPassword(''); setMessage('Senha atualizada.'); }
      else {
        const result = mode === 'signin' ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        if (result.error) throw result.error;
        if (mode === 'signup' && !result.data.session) setMessage('Confira seu e-mail para confirmar o acesso.');
      }
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  if (!supabase) return <main className="auth-page"><section className="panel auth-card"><h1>Conexão indisponível</h1><p>A conexão da plataforma ainda não está configurada. O administrador precisa concluir a configuração.</p></section></main>;
  if (loading) return <main className="auth-page"><p>Carregando sua conta…</p></main>;
  if (session && mode !== 'newpassword') return <>{children(session)}</>;
  return <main className="auth-page"><section className="panel auth-card"><div className="brand">JP STUDIO<span>OPERAÇÕES DE CONTEÚDO</span></div><h1>{{ signin: 'Entre na sua operação', signup: 'Crie sua conta', reset: 'Recuperar acesso', newpassword: 'Escolha uma nova senha' }[mode]}</h1><p className="muted">Projetos, planos e checklists de todas as suas redes em um só lugar.</p><form onSubmit={submit} className="form-grid">{mode !== 'newpassword' && <label>E-mail<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>}{mode !== 'reset' && <label>Senha<input type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={mode === 'signin' ? 6 : 8} required value={password} onChange={e => setPassword(e.target.value)} /></label>}<ErrorNotice message={error} />{message && <p className="notice success" role="status">{message}</p>}<button className="primary" disabled={busy}>{busy ? 'Aguarde…' : { signin: 'Entrar', signup: 'Criar conta', reset: 'Enviar link', newpassword: 'Salvar nova senha' }[mode]}</button></form><div className="actions">{mode === 'signin' ? <><button className="text-button" onClick={() => { setMode('signup'); setError(''); }}>Criar minha conta</button><button className="text-button" onClick={() => { setMode('reset'); setError(''); }}>Esqueci a senha</button></> : <button className="text-button" onClick={() => { setMode('signin'); setError(''); }}>Voltar para entrar</button>}</div></section></main>;
}
