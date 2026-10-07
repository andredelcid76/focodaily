import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const TASKS_CHANGED_EVENT = "foco:tasks-changed";

/**
 * Mantém todas as telas atualizadas sozinhas: qualquer tarefa criada, concluída,
 * alterada ou excluída (por você, por outra pessoa ou pelo sistema) recarrega
 * os dados visíveis. Também atualiza ao voltar para a janela.
 */
export function useLiveTaskSync(userId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        qc.invalidateQueries();
        window.dispatchEvent(new CustomEvent(TASKS_CHANGED_EVENT));
      }, 700);
    };
    const channel = supabase
      .channel(`live-sync-${userId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_comments" }, bump)
      .subscribe();
    let hiddenAt = 0;
    const onVis = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 20_000) bump();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);
}
