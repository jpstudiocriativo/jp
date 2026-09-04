"use client";

import { useMemo, useState } from "react";

type PublicationState = "Em produção" | "Pronto para agendar" | "Agendado" | "Postar hoje";
type Delivery = { id: number; project: string; channel: string; title: string; date: string; state: PublicationState; progress: string; origin?: string };

const projects = [
  { name: "Aurora", tag: "Entretenimento educativo", color: "#4d3c85", channels: "YouTube · Instagram · TikTok" },
  { name: "Casa de Afeto", tag: "Decoração afetiva", color: "#b66d4b", channels: "YouTube · Instagram · TikTok" },
  { name: "Conhecimento Acessível", tag: "Curadoria de conhecimento", color: "#2d7a72", channels: "YouTube" },
  { name: "Pense IA", tag: "IA facilitada", color: "#2464a8", channels: "YouTube · Instagram · Spotify" },
];

const deliveries: Delivery[] = [
  { id: 1, project: "Aurora", channel: "YouTube longo", title: "A verdade incômoda sobre esperar motivação", date: "Hoje · 18:00", state: "Postar hoje", progress: "10/11" },
  { id: 2, project: "Casa de Afeto", channel: "Instagram · Carrossel", title: "5 cantos que contam a história da sua casa", date: "Hoje · 12:00", state: "Postar hoje", progress: "6/7", origin: "Ideia isolada" },
  { id: 3, project: "Pense IA", channel: "YouTube longo", title: "IA não substitui quem sabe fazer boas perguntas", date: "Amanhã · 10:00", state: "Pronto para agendar", progress: "11/11" },
  { id: 4, project: "Conhecimento Acessível", channel: "YouTube longo", title: "Como transformar excesso de informação em repertório", date: "Amanhã · 18:00", state: "Em produção", progress: "7/11" },
  { id: 5, project: "Aurora", channel: "TikTok", title: "Corte: disciplina não é estética", date: "Sex · 11:00", state: "Agendado", progress: "3/3", origin: "Short #02" },
];

const bank = [
  { title: "Corte: disciplina não é estética", project: "Aurora", available: "Reel · TikTok", source: "Vídeo longo · A verdade incômoda" },
  { title: "Imagem ambientada: canto de leitura", project: "Casa de Afeto", available: "Feed Instagram", source: "Vídeo longo · Casa que acolhe" },
  { title: "Corte: o prompt não é magia", project: "Pense IA", available: "Reel · TikTok", source: "Vídeo longo · Perguntas para IA" },
];

const nav = ["Hoje", "Calendário", "Produção", "Banco de conteúdo", "Projetos"] as const;
type View = typeof nav[number];

const statusStyle: Record<PublicationState, { background: string; color: string }> = {
  "Em produção": { background: "#eef2ff", color: "#3e4fb7" },
  "Pronto para agendar": { background: "#eeeafd", color: "#5944cc" },
  "Agendado": { background: "#e6f5ec", color: "#227247" },
  "Postar hoje": { background: "#fde9e7", color: "#ad3030" },
};

function Status({ state }: { state: PublicationState }) {
  return <span style={{ ...statusStyle[state], borderRadius: 999, padding: "5px 9px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{state.toUpperCase()}</span>;
}

export default function Home() {
  const [view, setView] = useState<View>("Hoje");
  const [items, setItems] = useState(deliveries);
  const [projectFilter, setProjectFilter] = useState("Todos");
  const filtered = useMemo(() => projectFilter === "Todos" ? items : items.filter((item) => item.project === projectFilter), [items, projectFilter]);
  const postToday = filtered.filter((item) => item.state === "Postar hoje");

  function markScheduled(id: number) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, state: "Agendado" as const } : item));
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "244px 1fr" }}>
      <aside style={{ borderRight: "1px solid var(--line)", background: "#fcfbf9", padding: "28px 16px", position: "sticky", top: 0, height: "100vh" }}>
        <div style={{ padding: "0 12px 28px" }}><div style={{ fontSize: 12, letterSpacing: 2.2, fontWeight: 800, color: "var(--accent)" }}>JP STUDIO</div><div style={{ fontSize: 15, marginTop: 6, color: "var(--muted)" }}>Operações de conteúdo</div></div>
        <nav style={{ display: "grid", gap: 5 }}>
          {nav.map((item) => <button key={item} onClick={() => setView(item)} style={{ textAlign: "left", padding: "11px 12px", border: 0, borderRadius: 8, cursor: "pointer", background: view === item ? "#ece9ff" : "transparent", color: view === item ? "#4535b3" : "var(--ink)", fontWeight: view === item ? 700 : 500 }}>{item}{item === "Hoje" && postToday.length > 0 ? <span style={{ float: "right", background: "var(--danger)", color: "white", borderRadius: 9, padding: "1px 6px", fontSize: 11 }}>{postToday.length}</span> : null}</button>)}
        </nav>
        <div style={{ position: "absolute", bottom: 28, padding: "0 12px", color: "var(--muted)", fontSize: 12, lineHeight: 1.55 }}>A plataforma controla a operação. Seus roteiros e arquivos continuam onde você cria.</div>
      </aside>
      <section style={{ padding: "38px clamp(22px, 4vw, 64px)", maxWidth: 1480, width: "100%", margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 24, flexWrap: "wrap", marginBottom: 34 }}>
          <div><p style={{ color: "var(--muted)", margin: 0, fontSize: 14 }}>Quarta-feira, 3 de setembro</p><h1 style={{ margin: "8px 0 0", fontSize: 32, letterSpacing: -1.1 }}>{view === "Hoje" ? "Sua torre de controle" : view}</h1></div>
          <button style={{ background: "var(--accent)", border: 0, borderRadius: 8, padding: "11px 15px", color: "white", cursor: "pointer", fontWeight: 700 }}>+ Nova publicação</button>
        </header>
        {view === "Hoje" && <Dashboard deliveries={filtered} postToday={postToday} onSchedule={markScheduled} filter={projectFilter} setFilter={setProjectFilter} />}
        {view === "Calendário" && <Calendar deliveries={filtered} />}
        {view === "Produção" && <Production deliveries={filtered} />}
        {view === "Banco de conteúdo" && <Bank />}
        {view === "Projetos" && <Projects />}
      </section>
      <style jsx global>{`@media (max-width: 760px) { main { grid-template-columns: 1fr !important; } aside { position: static !important; height:auto !important; border-right:0 !important; border-bottom:1px solid var(--line); } nav { grid-template-columns: repeat(2, minmax(0,1fr)); } aside > div:last-child { display:none; } }`}</style>
    </main>
  );
}

function Dashboard({ deliveries, postToday, onSchedule, filter, setFilter }: { deliveries: Delivery[]; postToday: Delivery[]; onSchedule: (id: number) => void; filter: string; setFilter: (value: string) => void }) {
  return <>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
      {["Todos", ...projects.map((project) => project.name)].map((name) => <button onClick={() => setFilter(name)} key={name} style={{ border: "1px solid var(--line)", background: filter === name ? "var(--ink)" : "var(--surface)", color: filter === name ? "white" : "var(--ink)", borderRadius: 99, padding: "8px 12px", cursor: "pointer", fontSize: 13 }}>{name}</button>)}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 34 }}>
      <Metric value={String(postToday.length)} label="Postar hoje" color="var(--danger)" />
      <Metric value={String(deliveries.filter((item) => item.state === "Pronto para agendar").length)} label="Prontos para agendar" color="var(--accent)" />
      <Metric value={String(deliveries.filter((item) => item.state === "Em produção").length)} label="Em produção" color="#3e4fb7" />
      <Metric value="3" label="Ativos no banco" color="#227247" />
    </div>
    <section style={{ marginBottom: 40 }}><SectionTitle title="Ação imediata" subtitle="Publicações vencidas ou previstas para hoje e ainda sem agendamento." />
      <div style={{ display: "grid", gap: 12 }}>{postToday.length ? postToday.map((item) => <DeliveryCard key={item.id} item={item} action={() => onSchedule(item.id)} />) : <Empty text="Nada precisa ser postado hoje. Sua operação está em dia." />}</div>
    </section>
    <section><SectionTitle title="Próximas entregas" subtitle="O que protege os próximos dias de publicação." /><div style={{ display: "grid", gap: 11 }}>{deliveries.filter((item) => item.state !== "Postar hoje").map((item) => <DeliveryCard key={item.id} item={item} />)}</div></section>
  </>;
}

function Metric({ value, label, color }: { value: string; label: string; color: string }) { return <div style={{ padding: 18, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12 }}><div style={{ fontSize: 29, fontWeight: 800, color }}>{value}</div><div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>{label}</div></div>; }
function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) { return <div style={{ marginBottom: 14 }}><h2 style={{ margin: 0, fontSize: 19 }}>{title}</h2><p style={{ margin: "5px 0 0", fontSize: 13, color: "var(--muted)" }}>{subtitle}</p></div>; }
function Empty({ text }: { text: string }) { return <div style={{ padding: 20, border: "1px dashed var(--line)", borderRadius: 10, color: "var(--muted)", fontSize: 14 }}>{text}</div>; }
function DeliveryCard({ item, action }: { item: Delivery; action?: () => void }) { return <article style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 18, alignItems: "center", padding: 16, background: "var(--surface)", border: item.state === "Postar hoje" ? "1px solid #f0b7b1" : "1px solid var(--line)", borderRadius: 11 }}><div><div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 7 }}><strong>{item.title}</strong><Status state={item.state} /></div><div style={{ fontSize: 13, color: "var(--muted)" }}>{item.project} · {item.channel} · {item.date} · Checklist {item.progress}{item.origin ? ` · ${item.origin}` : ""}</div></div>{action ? <button onClick={action} style={{ border: "1px solid #df8580", color: "#9e2f2b", background: "#fff7f6", borderRadius: 8, padding: "9px 11px", cursor: "pointer", fontWeight: 700 }}>Marcar agendado</button> : <button style={{ border: "1px solid var(--line)", background: "white", borderRadius: 8, padding: "9px 11px", cursor: "pointer" }}>Abrir</button>}</article>; }

function Calendar({ deliveries }: { deliveries: Delivery[] }) { return <section><SectionTitle title="Setembro · calendário editorial" subtitle="Cada bloco é uma publicação, não uma tarefa solta." /><div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(120px, 1fr))", gap: 8, overflowX: "auto" }}>{[1,2,3,4,5,6,7].map((day) => <div key={day} style={{ minHeight: 170, padding: 10, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 9 }}><strong style={{ fontSize: 14 }}>{day} set</strong>{deliveries.filter((_, index) => index % 5 === day % 5).slice(0, 2).map((item) => <div key={item.id} style={{ marginTop: 10, padding: 7, background: statusStyle[item.state].background, color: statusStyle[item.state].color, borderRadius: 6, fontSize: 11, lineHeight: 1.35 }}>{item.project}<br />{item.channel}</div>)}</div>)}</div></section>; }
function Production({ deliveries }: { deliveries: Delivery[] }) { const columns = ["Em produção", "Pronto para agendar", "Agendado"] as const; return <section><SectionTitle title="Pipeline de produção" subtitle="O checklist detalhado vive dentro de cada conteúdo." /><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(235px, 1fr))", gap: 15 }}>{columns.map((state) => <div key={state}><h3 style={{ fontSize: 14, marginBottom: 10 }}>{state}</h3>{deliveries.filter((item) => item.state === state).map((item) => <div key={item.id} style={{ background: "white", padding: 14, border: "1px solid var(--line)", borderRadius: 10, marginBottom: 9 }}><strong style={{ fontSize: 14 }}>{item.title}</strong><p style={{ color: "var(--muted)", fontSize: 12, marginBottom: 0 }}>{item.project} · {item.progress}</p></div>)}</div>)}</div></section>; }
function Bank() { return <section><SectionTitle title="Banco de conteúdo" subtitle="Ativos prontos para distribuição — não é uma pasta de arquivos." /><div style={{ display: "grid", gap: 11 }}>{bank.map((item) => <article key={item.title} style={{ background: "white", padding: 17, border: "1px solid var(--line)", borderRadius: 10 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><strong>{item.title}</strong><span style={{ color: "#227247", fontSize: 12, fontWeight: 700 }}>{item.available}</span></div><p style={{ color: "var(--muted)", fontSize: 13, margin: "8px 0 0" }}>{item.project} · Origem: {item.source}</p></article>)}</div></section>; }
function Projects() { return <section><SectionTitle title="Projetos em operação" subtitle="Projetos incubados não entram em riscos ou obrigações de publicação." /><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(235px, 1fr))", gap: 14 }}>{projects.map((project) => <article key={project.name} style={{ padding: 18, background: "white", border: "1px solid var(--line)", borderRadius: 11, borderTop: `4px solid ${project.color}` }}><h3 style={{ margin: 0 }}>{project.name}</h3><p style={{ color: "var(--muted)", fontSize: 13 }}>{project.tag}</p><p style={{ fontSize: 13, marginBottom: 0 }}>{project.channels}</p></article>)}</div><h3 style={{ marginTop: 34, fontSize: 15, color: "var(--muted)" }}>Incubadora: Pookies · Climatização Inteligente</h3></section>; }
