"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AuthGate } from "@/components/auth-gate";
import { requireSupabase } from "@/lib/supabase/client";
import { ensureSeptember2026Plan, importAuroraSeptemberPlan, loadProduction, loadSeptember2026Plan, setProductionStep, type PlannedPublication, type ProductionContent } from "@/lib/supabase/plan";

type View = "Hoje" | "Plano mensal" | "Produção" | "Banco de conteúdo" | "Atualizações em lote";
const nav: View[] = ["Hoje", "Plano mensal", "Produção", "Banco de conteúdo", "Atualizações em lote"];
const projectOrder = ["Aurora", "Casa de Afeto", "Conhecimento Acessível", "Pense IA"];
const projectColor: Record<string, string> = { Aurora: "#5a4381", "Casa de Afeto": "#ad6849", "Conhecimento Acessível": "#28766e", "Pense IA": "#2765a3" };

export default function Home() { return <AuthGate>{(session) => <Workspace session={session} />}</AuthGate>; }

function Workspace({ session }: { session: Session }) {
  const [view, setView] = useState<View>("Hoje");
  const [plan, setPlan] = useState<PlannedPublication[]>([]);
  const [production, setProduction] = useState<ProductionContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const loadPlan = useCallback(async () => {
    setLoading(true);
    try { const client = requireSupabase(); const [loadedPlan, loadedProduction] = await Promise.all([loadSeptember2026Plan(client), loadProduction(client)]); setPlan(loadedPlan); setProduction(loadedProduction); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível carregar o plano."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadPlan(); }, [loadPlan]);

  async function createPlan() {
    setLoading(true); setMessage("");
    try {
      await ensureSeptember2026Plan(requireSupabase());
      await loadPlan();
      setMessage("Plano de setembro criado: 300 obrigações de publicação, todas inicialmente vazias.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível criar o plano."); setLoading(false); }
  }

  async function importAurora() {
    setLoading(true); setMessage("");
    try {
      const result = await importAuroraSeptemberPlan(requireSupabase());
      await loadPlan();
      setMessage(`Plano da Aurora importado: ${result.created} conteúdos novos vinculados aos 30 dias de YouTube. Os episódios 1 a 3 ficaram como publicados.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível importar o plano da Aurora."); setLoading(false); }
  }

  async function toggleStep(stepId: string, isDone: boolean) {
    try {
      await setProductionStep(requireSupabase(), stepId, isDone);
      setProduction((items) => items.map((item) => ({ ...item, steps: item.steps.map((step) => step.id === stepId ? { ...step, isDone } : step) })));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível atualizar a etapa."); }
  }

  return <main style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "245px 1fr", fontFamily: "Arial, sans-serif", background: "#f8f7f4", color: "#1f2630" }}>
    <aside style={{ borderRight: "1px solid #e8e6e1", background: "#fcfbf9", padding: "28px 16px" }}><div style={{ padding: "0 12px 28px" }}><div style={{ fontSize: 12, letterSpacing: 2.2, fontWeight: 800, color: "#5f4ee5" }}>JP STUDIO</div><div style={{ fontSize: 14, marginTop: 6, color: "#68707d" }}>{session.user.email}</div></div><nav style={{ display: "grid", gap: 5 }}>{nav.map((item) => <button key={item} onClick={() => setView(item)} style={{ textAlign: "left", border: 0, borderRadius: 8, padding: "11px 12px", background: view === item ? "#ece9ff" : "transparent", color: view === item ? "#4535b3" : "#1f2630", cursor: "pointer", fontWeight: view === item ? 700 : 500 }}>{item}</button>)}</nav><p style={{ margin: "auto 12px 0", paddingTop: 50, color: "#68707d", fontSize: 12, lineHeight: 1.5 }}>A plataforma guarda plano, progresso e evidências. Arquivos pesados continuam no seu Drive, CapCut ou outro espaço externo.</p></aside>
    <section style={{ padding: "38px clamp(22px, 4vw, 64px)", maxWidth: 1450, width: "100%", margin: "0 auto" }}><header style={{ marginBottom: 28 }}><p style={{ margin: 0, color: "#68707d", fontSize: 14 }}>Setembro de 2026 · operação editorial</p><h1 style={{ margin: "8px 0 0", fontSize: 31, letterSpacing: -1 }}>{view}</h1></header>{message && <div style={{ padding: 12, borderRadius: 8, background: "#e7f5eb", color: "#227146", fontSize: 13, marginBottom: 18 }}>{message}</div>}{loading ? <p>Carregando plano…</p> : plan.length === 0 ? <EmptyPlan createPlan={createPlan} /> : <LoadedPlan view={view} plan={plan} production={production} importAurora={importAurora} toggleStep={toggleStep} />}</section>
  </main>;
}

function EmptyPlan({ createPlan }: { createPlan: () => void }) { return <section style={{ maxWidth: 650, background: "white", border: "1px solid #e8e6e1", borderRadius: 14, padding: 28 }}><h2 style={{ marginTop: 0 }}>Ainda não há um plano carregado</h2><p style={{ color: "#68707d", lineHeight: 1.55 }}>O primeiro passo não é criar posts isolados: é gerar o plano-base de setembro. Ele cria as 300 obrigações — 10 por dia — sem inventar ideias nem conteúdos.</p><ul style={{ color: "#68707d", lineHeight: 1.7 }}><li>Aurora: 90 slots</li><li>Casa de Afeto: 90 slots</li><li>Conhecimento Acessível: 30 slots</li><li>Pense IA: 90 slots</li></ul><button onClick={createPlan} style={{ border: 0, borderRadius: 8, background: "#5f4ee5", color: "white", padding: "11px 14px", fontWeight: 700, cursor: "pointer" }}>Criar plano de setembro</button></section> }

function LoadedPlan({ view, plan, production, importAurora, toggleStep }: { view: View; plan: PlannedPublication[]; production: ProductionContent[]; importAurora: () => void; toggleStep: (stepId: string, isDone: boolean) => void }) {
  const today = plan.filter((item) => item.date === 4);
  if (view === "Hoje") return <Today rows={today} />;
  if (view === "Plano mensal") return <Month plan={plan} />;
  if (view === "Produção") return <Production plan={plan} production={production} importAurora={importAurora} toggleStep={toggleStep} />;
  if (view === "Banco de conteúdo") return <Bank />;
  return <Batch />;
}

function Today({ rows }: { rows: PlannedPublication[] }) { const stats = { guaranteed: rows.filter((row) => row.status === "Agendada" || row.status === "Publicada").length, empty: rows.filter((row) => row.status === "Sem conteúdo").length, building: rows.filter((row) => row.status === "Em construção").length }; return <><p style={{ color: "#68707d", marginTop: -14, lineHeight: 1.55 }}>Estas são as obrigações reais do plano para hoje. Ao importar uma ideia ou concluir uma etapa, esta tela vai refletir o que está protegido e o que falta.</p><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, margin: "25px 0 30px" }}><Metric value={`${stats.guaranteed}/${rows.length}`} label="garantidas" note="agendadas ou publicadas"/><Metric value={String(stats.empty)} label="sem conteúdo" note="precisam receber uma ideia/ativo"/><Metric value={String(stats.building)} label="em construção" note="com etapas pendentes"/></div><h2 style={{ fontSize: 19 }}>Entregas de 04 de setembro</h2><p style={{ color: "#68707d", fontSize: 13 }}>Cada linha é uma publicação prevista. O plano não inventa títulos: eles entram quando você carregar ou cadastrar as ideias.</p><div style={{ display: "grid", gap: 12 }}>{projectOrder.map((project) => <ProjectRows key={project} project={project} rows={rows.filter((row) => row.project === project)} />)}</div></> }

function ProjectRows({ project, rows }: { project: string; rows: PlannedPublication[] }) { return <section style={{ background: "white", border: "1px solid #e8e6e1", borderRadius: 11, overflow: "hidden" }}><div style={{ padding: "12px 16px", borderLeft: `5px solid ${projectColor[project]}`, display: "flex", justifyContent: "space-between" }}><strong>{project}</strong><span style={{ color: "#68707d", fontSize: 12 }}>{rows.length} obrigação(ões)</span></div>{rows.map((row) => <div key={row.id} style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "center", padding: "13px 16px", borderTop: "1px solid #e8e6e1" }}><div><strong style={{ fontSize: 14 }}>{row.channel}</strong><div style={{ fontSize: 12, color: "#68707d", marginTop: 3 }}>{row.title ?? "Nenhuma ideia ou ativo vinculado ainda"}</div></div><Status value={row.status} /></div>)}</section> }

function Month({ plan }: { plan: PlannedPublication[] }) { return <><p style={{ color: "#68707d", marginTop: -14, lineHeight: 1.55 }}>O plano mensal cria a promessa de publicação antes do trabalho criativo. Cada célula abaixo representa dez obrigações, uma para cada canal ativo.</p><div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(105px,1fr))", gap: 8, marginTop: 25 }}>{Array.from({ length: 30 }, (_, index) => index + 1).map((day) => { const entries = plan.filter((row) => row.date === day); const protectedCount = entries.filter((row) => row.status === "Agendada" || row.status === "Publicada").length; return <div key={day} style={{ minHeight: 105, padding: 11, background: "white", border: "1px solid #e8e6e1", borderRadius: 9 }}><strong>{day} set</strong><div style={{ marginTop: 13, fontSize: 13, fontWeight: 700 }}>{protectedCount}/10 garantidas</div><div style={{ marginTop: 5, fontSize: 11, color: "#68707d" }}>{entries.length}/10 slots criados</div></div> })}</div></> }

function Production({ plan, production, importAurora, toggleStep }: { plan: PlannedPublication[]; production: ProductionContent[]; importAurora: () => void; toggleStep: (stepId: string, isDone: boolean) => void }) {
  const auroraLoaded = plan.filter((row) => row.project === "Aurora" && row.channel === "YouTube" && row.title).length;
  if (!auroraLoaded) return <section style={{ maxWidth: 700 }}><h2 style={{ marginTop: 0 }}>Produção</h2><p style={{ color: "#68707d" }}>O plano foi recebido e está pronto para virar sua área de trabalho.</p><button onClick={importAurora} style={{ border: 0, borderRadius: 8, background: "#5f4ee5", color: "white", padding: "11px 14px", fontWeight: 700, cursor: "pointer" }}>Importar plano da Aurora</button></section>;
  return <section><p style={{ color: "#68707d", marginTop: -14, lineHeight: 1.55 }}>Aqui é onde você trabalha. Marque uma etapa assim que ela estiver feita; o status fica salvo. Quando você enviar um material por aqui, eu aplicarei a mesma marcação nos itens correspondentes.</p><div style={{ display: "grid", gap: 14, marginTop: 24 }}>{production.filter((item) => item.project === "Aurora").map((item) => <ContentChecklist key={item.id} item={item} toggleStep={toggleStep} />)}</div></section>
}

function ContentChecklist({ item, toggleStep }: { item: ProductionContent; toggleStep: (stepId: string, isDone: boolean) => void }) {
  const required = item.steps.filter((step) => step.isRequired); const done = required.filter((step) => step.isDone).length;
  return <details style={{ background: "white", border: "1px solid #e8e6e1", borderRadius: 11, overflow: "hidden" }}><summary style={{ cursor: "pointer", padding: "16px", listStyle: "none", display: "flex", justifyContent: "space-between", gap: 18, alignItems: "center" }}><div><strong>{item.title}</strong><div style={{ color: "#68707d", fontSize: 12, marginTop: 5 }}>{done}/{required.length} etapas obrigatórias concluídas</div></div><span style={{ color: done === required.length ? "#227146" : "#8a5b08", fontSize: 12, fontWeight: 800 }}>{done === required.length ? "CONCLUÍDO" : "ABRIR CHECKLIST"}</span></summary><div style={{ borderTop: "1px solid #e8e6e1", padding: "14px 16px 18px" }}>{item.reference && <p style={{ fontSize: 12, color: "#68707d", marginTop: 0 }}><strong>Referência:</strong> {item.reference}</p>}{["1 · Ideia", "2 · Construção", "3 · Publicação"].map((block) => <div key={block} style={{ marginTop: 16 }}><strong style={{ fontSize: 13 }}>{block}</strong><div style={{ display: "grid", gap: 8, marginTop: 8 }}>{item.steps.filter((step) => step.block === block).map((step) => <label key={step.id} style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", color: step.isDone ? "#227146" : "#303741", fontSize: 13 }}><input type="checkbox" checked={step.isDone} onChange={(event) => toggleStep(step.id, event.target.checked)} /><span style={{ textDecoration: step.isDone ? "line-through" : "none" }}>{step.label}{!step.isRequired ? " · opcional" : ""}</span></label>)}</div></div>)}</div></details>
}

function Bank() { return <section style={{ maxWidth: 700 }}><h2 style={{ marginTop: 0 }}>Banco de conteúdo ainda vazio</h2><p style={{ color: "#68707d", lineHeight: 1.55 }}>Ele será alimentado quando um Short, imagem ou outro ativo for concluído. O banco não é uma pasta: cada item indicará onde já foi usado e em quais canais ele pode ser reaproveitado.</p></section> }

function Batch() { return <section style={{ maxWidth: 700 }}><h2 style={{ marginTop: 0 }}>Atualizações em lote</h2><p style={{ color: "#68707d", lineHeight: 1.55 }}>Quando você enviar, por exemplo, um PDF com 30 descrições ou disser que gerou os áudios dos dias 1–6, esta área registrará uma única atualização e aplicará a conclusão apenas às etapas correspondentes.</p><div style={{ padding: 18, background: "white", border: "1px dashed #d6d2ca", borderRadius: 10, color: "#68707d" }}>Nenhum lote registrado ainda.</div></section> }

function Metric({ value, label, note }: { value: string; label: string; note: string }) { return <div style={{ padding: 16, background: "white", border: "1px solid #e8e6e1", borderRadius: 10 }}><strong style={{ fontSize: 25 }}>{value}</strong><div style={{ fontWeight: 700, fontSize: 13, marginTop: 4 }}>{label}</div><div style={{ color: "#68707d", fontSize: 12, marginTop: 3 }}>{note}</div></div> }
function Status({ value }: { value: PlannedPublication["status"] }) { const tone: Record<PlannedPublication["status"], [string, string]> = { "Sem conteúdo": ["#f1f2f4", "#5f6670"], "Em construção": ["#fff2d8", "#8a5b08"], "Pronta para agendar": ["#e9e7ff", "#5742bf"], "Agendada": ["#e5f4eb", "#237245"], "Publicada": ["#dcefe4", "#17613a"] }; const [background, color] = tone[value]; return <span style={{ background, color, borderRadius: 99, padding: "5px 8px", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" }}>{value.toUpperCase()}</span> }
