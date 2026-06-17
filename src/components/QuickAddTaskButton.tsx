import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TaskDialog } from "@/components/TaskDialog";
import { useAuth } from "@/lib/auth";
import { useTasks } from "@/hooks/useTasks";
import { useProjects } from "@/hooks/useProjects";
import { useRoles } from "@/hooks/useRoles";
import { todayISO } from "@/lib/date";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Floating action button available on every authenticated page.
 * Opens the standard TaskDialog so the user can add a task without
 * navigating to a specific view.
 */
export function QuickAddTaskButton() {
  const { user } = useAuth();
  const userId = user?.id;
  const [open, setOpen] = useState(false);
  const tasksApi = useTasks(userId);
  const { projects } = useProjects(userId);
  const { roles } = useRoles(userId);
  const qc = useQueryClient();

  if (!userId) return null;

  const today = todayISO();

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="icon"
        aria-label="Adicionar tarefa"
        title="Adicionar tarefa"
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all hover:scale-105"
      >
        <Plus className="h-6 w-6" />
      </Button>

      {open && (
        <TaskDialog
          open={open}
          onOpenChange={setOpen}
          defaultDate={today}
          roles={roles}
          projects={projects}
          onSave={async (data) => {
            const inserted = await tasksApi.createTask({
              ...data,
              original_date: data.scheduled_date,
              position: tasksApi.topPositionForDay(data.scheduled_date),
            });
            toast.success("Tarefa criada");
            qc.invalidateQueries({ queryKey: ["tasks"] });
            return inserted?.id;
          }}
        />
      )}
    </>
  );
}
