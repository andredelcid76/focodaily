import { useEffect, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Send, Loader2, Wrench } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Msg = {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  tool_name?: string | null;
};

const SUGGESTIONS = [
  "Resuma minha semana",
  "Liste minhas reuniões recentes do Fireflies",
  "Estou sobrecarregado essa semana?",
  "Reorganize minhas tarefas atrasadas",
];

export function MayaChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    const userMsg: Msg = { id: crypto.randomUUID(), role: "user", content: text };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Sessão expirada — entre novamente");

      const r = await fetch("/api/public/maya?action=chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ conversation_id: conversationId, message: text }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? `Erro ${r.status}`);

      setConversationId(data.conversation_id);
      if (data.tools_used?.length) {
        setMessages((m) => [
          ...m,
          { id: crypto.randomUUID(), role: "tool", content: data.tools_used.join(", "), tool_name: "tools" },
        ]);
      }
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", content: data.message }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao falar com Maya");
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "assistant", content: "_Tive um problema agora. Tente de novo._" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          aria-label="Abrir Maya"
          className="group fixed bottom-6 right-6 z-40 inline-flex h-14 items-center gap-2.5 rounded-full bg-gradient-prestige px-5 text-sm font-semibold text-primary-foreground shadow-glow transition-all hover:shadow-glow-gold hover:scale-[1.03] active:scale-95"
        >
          <span className="relative flex h-6 w-6 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-primary-foreground/30" />
            <Sparkles className="relative h-4 w-4" />
          </span>
          <span className="hidden sm:inline">Maya</span>
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0 glass-strong">
        <SheetHeader className="px-4 py-3 border-b border-border/60">
          <SheetTitle className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-prestige shadow-glow">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="flex flex-col items-start leading-tight">
              <span className="font-display">Maya</span>
              <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-normal">
                assistente do Foco
              </span>
            </div>
          </SheetTitle>
        </SheetHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 && !loading && (
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>Olá! Posso te ajudar a organizar a semana, gerar tarefas a partir de atas do Fireflies, e responder sobre sua agenda.</p>
              <div className="grid gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-left rounded-lg border border-border/60 bg-card/60 px-3 py-2 text-xs hover:border-primary/40 hover:bg-accent/40 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) =>
            m.role === "tool" ? (
              <div key={m.id} className="flex items-center gap-1.5 text-[11px] text-muted-foreground italic">
                <Wrench className="h-3 w-3" />
                consultou: {m.content}
              </div>
            ) : (
              <div
                key={m.id}
                className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "ml-auto max-w-[85%] bg-primary text-primary-foreground"
                    : "mr-auto max-w-[90%] bg-card/80 border border-border/60"
                }`}
              >
                <div className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              </div>
            ),
          )}

          {loading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Pensando…
            </div>
          )}
        </div>

        <div className="border-t border-border/60 p-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex gap-2 items-end"
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Pergunte algo ou cole uma ata…"
              rows={2}
              className="resize-none"
              disabled={loading}
            />
            <Button type="submit" size="icon" disabled={loading || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
