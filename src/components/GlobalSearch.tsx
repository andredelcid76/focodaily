import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { CategoryIcon } from "@/components/CategoryBadge";
import {
  CalendarDays,
  CheckCircle2,
  Circle,
  FolderKanban,
  ListTodo,
  Lock,
  Search as SearchIcon,
  Users,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { PROJECT_STATUS_LABEL } from "@/hooks/useProjects";
import { formatHuman } from "@/lib/date";

type Task = Tables<"tasks">;
type Project = Tables<"projects">;

export function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);

  // Debounced search
  useEffect(() => {
    if (!open || !user) return;
    const q = query.trim();
    if (!q) {
      setTasks([]);
      setProjects([]);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      const pattern = `%${q}%`;
      const [tRes, pRes] = await Promise.all([
        supabase
          .from("tasks")
          .select("*")
          .or(`title.ilike.${pattern},description.ilike.${pattern}`)
          .order("scheduled_date", { ascending: false })
          .limit(15),
        supabase
          .from("projects")
          .select("*")
          .or(`name.ilike.${pattern},description.ilike.${pattern}`)
          .limit(8),
      ]);
      setTasks(tRes.data ?? []);
      setProjects(pRes.data ?? []);
      setLoading(false);
    }, 180);
    return () => clearTimeout(handle);
  }, [query, open, user]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setQuery("");
      setTasks([]);
      setProjects([]);
    }
  }, [open]);

  const close = () => onOpenChange(false);

  const navItems = useMemo(
    () => [
      { label: "Hoje", to: "/", icon: ListTodo },
      { label: "Semana", to: "/semana", icon: CalendarDays },
      { label: "Agenda", to: "/agenda", icon: CalendarDays },
      { label: "Projetos", to: "/projetos", icon: FolderKanban },
      { label: "Caixa de entrada", to: "/inbox", icon: ListTodo },
      { label: "Papéis", to: "/papeis", icon: Users },
    ],
    []
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Buscar tarefas, projetos…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {!query && (
          <CommandGroup heading="Navegar">
            {navItems.map((item) => (
              <CommandItem
                key={item.to}
                onSelect={() => {
                  navigate({ to: item.to });
                  close();
                }}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {query && !loading && tasks.length === 0 && projects.length === 0 && (
          <CommandEmpty>Nada encontrado para "{query}".</CommandEmpty>
        )}

        {tasks.length > 0 && (
          <CommandGroup heading={`Tarefas (${tasks.length})`}>
            {tasks.map((t) => (
              <CommandItem
                key={t.id}
                value={`task-${t.id}-${t.title}`}
                onSelect={() => {
                  // Navigate to Today view for that date AND request that the task dialog opens
                  const openTask = () => {
                    window.dispatchEvent(
                      new CustomEvent("focodaily:open-task", { detail: { taskId: t.id } })
                    );
                  };
                  navigate({ to: "/", search: { date: t.scheduled_date } as any });
                  // Give the route a tick to mount, then dispatch
                  setTimeout(openTask, 50);
                  close();
                }}
              >
                {t.completed ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" />
                )}
                <CategoryIcon category={t.category} className="h-3.5 w-3.5" />
                <span className={t.completed ? "line-through text-muted-foreground" : ""}>
                  {t.title}
                </span>
                {t.non_negotiable && <Lock className="h-3 w-3 text-overdue" />}
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                  {formatHuman(t.scheduled_date)}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {projects.length > 0 && (
          <>
            {tasks.length > 0 && <CommandSeparator />}
            <CommandGroup heading={`Projetos (${projects.length})`}>
              {projects.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`project-${p.id}-${p.name}`}
                  onSelect={() => {
                    navigate({ to: "/projetos/$id", params: { id: p.id } });
                    close();
                  }}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: p.color }}
                  />
                  <span>{p.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground capitalize">
                    {p.status}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {loading && query && (
          <div className="py-6 text-center text-xs text-muted-foreground">
            <SearchIcon className="inline h-3 w-3 mr-1" /> Buscando…
          </div>
        )}
      </CommandList>
    </CommandDialog>
  );
}

/** Hook that wires Cmd/Ctrl+K to open the palette. */
export function useGlobalSearchHotkey(open: boolean, setOpen: (o: boolean) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);
}
