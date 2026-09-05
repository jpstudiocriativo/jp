"use client";

import { useState } from "react";
import { parsePlanFile } from "@/lib/plan-parser";
import { importCasaPlan } from "@/lib/supabase/plan";
import { requireSupabase } from "@/lib/supabase/client";

export function PlanImporter({ onImported }: { onImported: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function receive(file: File) {
    setBusy(true); setError("");
    try {
      const plan = parsePlanFile(file.name, await file.text());
      const result = await importCasaPlan(requireSupabase(), plan);
      onImported(`${file.name} importado: ${result.created} entregas criadas, incluindo ${result.longVideos} vídeos longos. O planejamento comprovado já foi marcado.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível ler este plano."); }
    finally { setBusy(false); }
  }
  return <div style={{ display: "inline-grid", gap: 6 }}><label style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 8, background: busy ? "#a7a0d8" : "#5f4ee5", color: "white", padding: "10px 13px", fontWeight: 700, cursor: busy ? "wait" : "pointer", fontSize: 13 }}><input type="file" accept=".md,.txt,text/markdown,text/plain" hidden disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) receive(file); event.currentTarget.value = ""; }} />{busy ? "Lendo e organizando…" : "Importar plano"}</label>{error && <span style={{ color: "#b43a32", fontSize: 12, maxWidth: 360 }}>{error}</span>}<span style={{ color: "#68707d", fontSize: 11 }}>Aceita .md e .txt. O arquivo vira entregas e checklists automaticamente.</span></div>;
}
