import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRoles } from "@/hooks/useRoles";
import { useProjects, type Project } from "@/hooks/useProjects";
import { TaskDialog } from "@/components/TaskDialog";
import type { Task } from "@/hooks/useTasks";
import { todayISO } from "@/lib/date";

/**
 * Abre qualquer tarefa por cima da tela atual — usado pelos avisos
 * (sininho, página de notificações e links "?tarefa=" dos e-mails).
 */
export function GlobalTaskOpener() {
  const { user } = useAuth();
  const { roles } = useRoles(user?.id);
  const { projects } = useProjects(user?.id);
  const [task, setTask] = useState<Task | null>(null);
  const [extraProject, setExtraProject] = useState<Project | null>(null);
  const [open, setOpen] = useState(false);

  const load = async (taskId: string, comments: boolean) => {
    const { data, error } = await supabase
      .from("tasks")
      .select("*, project:projects(id,name,color,icon)")
      .eq("id", taskId)
      .maybeSingle();
    if (error || !data) {
      toast.error("Essa tarefa não existe mais ou você não tem acesso a ela.");
      return;
    }
    const { project, ...row } = data as Task & { project: Project | null };
    setExtraProject(project ?? null);
    setTask(row as Task);
    setOpen(true);
    if (comments) {
      setTimeout(() => {
        document.getElementById("task-comments")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 450);
    }
  };

  useEffect(() => {
    if (!user) return;
    const onEvent = (e: Event) => {
      const d = (e as CustomEvent<{ taskId: string; comments: boolean }>).detail;
      if (d?.taskId) load(d.taskId, d.comments);
    };
    window.addEventListener("foco:open-task", onEvent);
    // Links vindos de e-mail/Teams: /?tarefa=<id>&comentarios=1
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("tarefa");
    if (fromUrl) {
      load(fromUrl, params.get("comentarios") === "1");
      params.delete("tarefa");
      params.delete("comentarios");
      const qs = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
    return () => window.removeEventListener("foco:open-task", onEvent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const dialogProjects = useMemo(() => {
    if (!extraProject || projects.some((p) => p.id === extraProject.id)) return projects;
    return [...projects, extraProject];
  }, [projects, extraProject]);

  if (!user) return null;

  return (
    <TaskDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setTask(null);
      }}
      defaultDate={task?.scheduled_date ?? todayISO()}
      task={task}
      roles={roles}
      projects={dialogProjects}
      onSave={async (patch) => {
        if (!task) return;
        const { error } = await supabase.from("tasks").update(patch).eq("id", task.id);
        if (error) {
          toast.error(error.message);
          return;
        }
        toast.success("Tarefa atualizada");
        import("@/lib/notifications.functions")
          .then((m) => m.flushNotificationDelivery())
          .catch(() => {});
      }}
      onDelete={async () => {
        if (!task) return;
        const { error } = await supabase.from("tasks").delete().eq("id", task.id);
        if (error) toast.error(error.message);
        else {
          toast.success("Tarefa excluída");
          setOpen(false);
        }
      }}
      onToggleComplete={async () => {
        if (!task) return;
        const next = !task.completed;
        const { error } = await supabase
          .from("tasks")
          .update({ completed: next, completed_at: next ? new Date().toISOString() : null, status: next ? "done" : "todo" })
          .eq("id", task.id);
        if (error) toast.error(error.message);
        else {
          setTask({ ...task, completed: next });
          import("@/lib/notifications.functions")
            .then((m) => m.flushNotificationDelivery())
            .catch(() => {});
        }
      }}
    />
  );
}
