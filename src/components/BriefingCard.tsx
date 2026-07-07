import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function BriefingCard({ scope = "day" as "day" | "week" }) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Sessão expirada");
      const r = await fetch("/api/public/maya?action=briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ scope }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? `Erro ${r.status}`);
      setContent(data.content);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar briefing");
    } finally {
      setLoading(false);
    }
  }

  if (!content) {
    return (
      <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-primary/10 via-card/40 to-circumstantial/10 p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-prestige">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">Resumo do {scope === "day" ? "dia" : "semana"}</p>
            <p className="text-xs text-muted-foreground">Maya analisa sua agenda e tarefas.</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={generate} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Gerar"}
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-primary/10 via-card/40 to-circumstantial/10 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Maya · resumo do {scope === "day" ? "dia" : "semana"}</span>
        </div>
        <Button size="sm" variant="ghost" onClick={generate} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <div className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </div>
  );
}
