import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageSquare, Send, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Comment = {
  id: string;
  task_id: string;
  user_id: string;
  content: string;
  created_at: string;
};

type Profile = { user_id: string; display_name: string | null; email: string | null };

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Chronological comment thread for a task. Visibility/authoring is enforced by
 * RLS (creator, assignee, project owner and project members).
 */
export function TaskComments({ taskId, userId }: { taskId: string; userId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [people, setPeople] = useState<Profile[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("user_id,display_name,email")
      .neq("user_id", userId)
      .not("display_name", "is", null)
      .order("display_name")
      .limit(300)
      .then(({ data }) => setPeople((data ?? []) as Profile[]));
  }, [userId]);

  const mentionOptions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return people
      .filter((p) => (p.display_name ?? "").toLowerCase().includes(q) || (p.email ?? "").toLowerCase().includes(q))
      .slice(0, 6);
  }, [people, mentionQuery]);

  const onDraftChange = (value: string) => {
    setDraft(value);
    const m = /(?:^|\s)@([^@\n]{0,30})$/.exec(value);
    setMentionQuery(m ? m[1] : null);
  };

  const pickMention = (p: Profile) => {
    const name = p.display_name ?? p.email ?? "";
    setDraft((d) => d.replace(/@([^@\n]{0,30})$/, `@${name} `));
    setMentionQuery(null);
  };

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from("task_comments")
      .select("id,task_id,user_id,content,created_at")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });
    const rows = (data ?? []) as Comment[];
    setComments(rows);
    const ids = Array.from(new Set(rows.map((r) => r.user_id)));
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id,display_name,email")
        .in("user_id", ids);
      setProfiles((profs ?? []) as Profile[]);
    } else {
      setProfiles([]);
    }
  }, [taskId]);

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel(`tc-${taskId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_comments", filter: `task_id=eq.${taskId}` },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [taskId, refresh]);

  const nameOf = useMemo(() => {
    const map = new Map(profiles.map((p) => [p.user_id, p.display_name ?? p.email ?? "Usuário"]));
    return (uid: string) => map.get(uid) ?? "Usuário";
  }, [profiles]);

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    const { error } = await supabase
      .from("task_comments")
      .insert({ task_id: taskId, user_id: userId, content: text });
    setSending(false);
    if (error) {
      toast.error("Não foi possível comentar");
      return;
    }
    setDraft("");
    setMentionQuery(null);
    refresh();
    import("@/lib/notifications.functions")
      .then((m) => m.flushNotificationDelivery())
      .catch(() => {});
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("task_comments").delete().eq("id", id);
    if (error) toast.error("Não foi possível excluir");
    else refresh();
  };

  return (
    <div id="task-comments">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <MessageSquare className="h-3.5 w-3.5" />
        Comentários
        {comments.length > 0 && (
          <span className="rounded bg-muted px-1.5 py-0.5 tabular-nums">{comments.length}</span>
        )}
      </div>

      <div className="space-y-2">
        {comments.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhum comentário ainda.</p>
        )}
        {comments.map((c) => {
          const name = nameOf(c.user_id);
          return (
            <div key={c.id} className="group flex gap-2 rounded-lg border border-border/50 bg-muted/20 p-2">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                {initials(name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground">{name}</span>
                  <span className="tabular-nums">
                    {new Date(c.created_at).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {c.user_id === userId && (
                    <button
                      onClick={() => remove(c.id)}
                      className="ml-auto opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label="Excluir comentário"
                    >
                      <Trash2 className="h-3 w-3 text-muted-foreground hover:text-overdue" />
                    </button>
                  )}
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-xs">{c.content}</p>
              </div>
            </div>
          );
        })}
      </div>

      {mentionOptions.length > 0 && (
        <div className="mt-2 overflow-hidden rounded-lg border border-border/60 bg-popover">
          {mentionOptions.map((p) => (
            <button
              key={p.user_id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                pickMention(p);
              }}
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted"
            >
              <span className="font-medium">{p.display_name}</span>
              <span className="truncate text-muted-foreground">{p.email}</span>
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-end gap-2">
        <Textarea
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder="Escreva um comentário… use @ para mencionar alguém"
          rows={2}
          className="min-h-[38px] text-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
        />
        <Button size="icon" onClick={send} disabled={sending || !draft.trim()} aria-label="Enviar comentário">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
