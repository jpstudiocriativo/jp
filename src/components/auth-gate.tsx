"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";

export function AuthGate({ children }: { children: (session: Session) => ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => listener.subscription.unsubscribe();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setMessage("");
    const result = mode === "signin"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    if (result.error) setMessage(result.error.message);
    else if (mode === "signup") setMessage("Conta criada. Confirme seu e-mail se o Supabase solicitar.");
  }

  if (!supabase) return <main style={{ padding: 48, fontFamily: "Arial, sans-serif" }}><h1>Conexão Supabase pendente</h1><p>Configure as variáveis públicas do Supabase para abrir a operação.</p></main>;
  if (session) return <>{children(session)}</>;

  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "Arial, sans-serif", background: "#f8f7f4" }}><form onSubmit={submit} style={{ width: "min(420px, 100%)", background: "white", border: "1px solid #e8e6e1", borderRadius: 14, padding: 28 }}><div style={{ color: "#5f4ee5", fontWeight: 800, letterSpacing: 2, fontSize: 12 }}>JP STUDIO</div><h1 style={{ margin: "10px 0 8px" }}>{mode === "signin" ? "Entrar na operação" : "Criar acesso"}</h1><p style={{ color: "#68707d", lineHeight: 1.5 }}>Seu plano, checklists e atualizações em lote ficam vinculados à sua conta.</p><label style={{ display: "grid", gap: 6, marginTop: 18 }}>E-mail<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required style={{ padding: 11, border: "1px solid #d9d7d2", borderRadius: 8 }} /></label><label style={{ display: "grid", gap: 6, marginTop: 12 }}>Senha<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={6} required style={{ padding: 11, border: "1px solid #d9d7d2", borderRadius: 8 }} /></label>{message && <p style={{ color: "#9e2f2b", fontSize: 13 }}>{message}</p>}<button type="submit" style={{ width: "100%", marginTop: 20, padding: 11, border: 0, borderRadius: 8, background: "#5f4ee5", color: "white", fontWeight: 700, cursor: "pointer" }}>{mode === "signin" ? "Entrar" : "Criar conta"}</button><button type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(""); }} style={{ width: "100%", marginTop: 10, padding: 8, border: 0, background: "transparent", color: "#5f4ee5", cursor: "pointer" }}>{mode === "signin" ? "Ainda não tenho acesso" : "Já tenho acesso"}</button></form></main>;
}
