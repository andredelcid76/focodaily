import { useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Filter, Lock, X, Mail, Video, Briefcase, Pencil } from "lucide-react";
import type { TaskCategory, TaskStatus } from "@/hooks/useTasks";
import type { Role } from "@/hooks/useRoles";
import type { Project } from "@/hooks/useProjects";

export type TaskOrigin = "manual" | "pipedrive" | "email" | "meeting";

export type TaskFilters = {
  roleIds: Set<string | "none">; // "none" = sem papel
  projectIds: Set<string | "none">;
  categories: Set<TaskCategory>;
  statuses: Set<TaskStatus>;
  origins: Set<TaskOrigin>;
  nonNegotiableOnly: boolean;
};

export const emptyFilters = (): TaskFilters => ({
  roleIds: new Set(),
  projectIds: new Set(),
  categories: new Set(),
  statuses: new Set(),
  origins: new Set(),
  nonNegotiableOnly: false,
});

export function countActiveFilters(f: TaskFilters): number {
  return (
    f.roleIds.size +
    f.projectIds.size +
    f.categories.size +
    f.statuses.size +
    f.origins.size +
    (f.nonNegotiableOnly ? 1 : 0)
  );
}

export function applyTaskFilters<T extends {
  role_id: string | null;
  project_id: string | null;
  category: TaskCategory;
  status: TaskStatus;
  non_negotiable: boolean;
  origin_source?: string | null;
}>(tasks: T[], f: TaskFilters): T[] {
  if (countActiveFilters(f) === 0) return tasks;
  return tasks.filter((t) => {
    if (f.roleIds.size > 0) {
      const k = t.role_id ?? "none";
      if (!f.roleIds.has(k)) return false;
    }
    if (f.projectIds.size > 0) {
      const k = t.project_id ?? "none";
      if (!f.projectIds.has(k)) return false;
    }
    if (f.categories.size > 0 && !f.categories.has(t.category)) return false;
    if (f.statuses.size > 0 && !f.statuses.has(t.status)) return false;
    if (f.origins.size > 0) {
      const src = (t.origin_source ?? null) as TaskOrigin | null;
      const origin: TaskOrigin = src === "pipedrive" || src === "email" || src === "meeting" ? src : "manual";
      if (!f.origins.has(origin)) return false;
    }
    if (f.nonNegotiableOnly && !t.non_negotiable) return false;
    return true;
  });
}

const ORIGIN_LABEL: Record<TaskOrigin, string> = {
  manual: "Manual",
  pipedrive: "Pipedrive",
  email: "Outlook",
  meeting: "Fireflies",
};
const ORIGIN_ICON: Record<TaskOrigin, React.ReactNode> = {
  manual: <Pencil className="h-3 w-3" />,
  pipedrive: <Briefcase className="h-3 w-3" />,
  email: <Mail className="h-3 w-3" />,
  meeting: <Video className="h-3 w-3" />,
};

const CATEGORY_LABEL: Record<TaskCategory, string> = {
  urgent: "Urgente",
  important: "Importante",
  circumstantial: "Circunstancial",
};
const CATEGORY_COLOR: Record<TaskCategory, string> = {
  urgent: "text-urgent",
  important: "text-important",
  circumstantial: "text-circumstantial",
};
const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "A fazer",
  doing: "Fazendo",
  done: "Feita",
};

export function TaskFiltersBar({
  filters,
  onChange,
  roles,
  projects,
}: {
  filters: TaskFilters;
  onChange: (f: TaskFilters) => void;
  roles: Role[];
  projects: Project[];
}) {
  const count = countActiveFilters(filters);

  const update = (patch: Partial<TaskFilters>) => onChange({ ...filters, ...patch });
  const toggle = <K extends keyof TaskFilters>(key: K, value: any) => {
    const set = new Set(filters[key] as Set<any>);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    update({ [key]: set } as any);
  };

  const visibleProjects = useMemo(
    () => projects.filter((p) => p.status !== "archived"),
    [projects]
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`h-9 gap-1.5 ${count > 0 ? "border-primary/50 text-primary" : ""}`}
        >
          <Filter className="h-3.5 w-3.5" />
          Filtros
          {count > 0 && (
            <span className="ml-1 rounded-full bg-primary/20 px-1.5 text-[10px] font-semibold tabular-nums">
              {count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="max-h-[70vh] overflow-y-auto p-3 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Filtrar tarefas</h3>
            {count > 0 && (
              <button
                onClick={() => onChange(emptyFilters())}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" /> Limpar
              </button>
            )}
          </div>

          <FilterSection title="Papel">
            <Chip
              active={filters.roleIds.has("none")}
              onClick={() => toggle("roleIds", "none")}
              label="Sem papel"
            />
            {roles.map((r) => (
              <Chip
                key={r.id}
                active={filters.roleIds.has(r.id)}
                onClick={() => toggle("roleIds", r.id)}
                label={r.name}
                color={r.color}
              />
            ))}
            {roles.length === 0 && <Empty text="Nenhum papel cadastrado" />}
          </FilterSection>

          <FilterSection title="Projeto">
            <Chip
              active={filters.projectIds.has("none")}
              onClick={() => toggle("projectIds", "none")}
              label="Sem projeto"
            />
            {visibleProjects.map((p) => (
              <Chip
                key={p.id}
                active={filters.projectIds.has(p.id)}
                onClick={() => toggle("projectIds", p.id)}
                label={p.name}
                color={p.color}
              />
            ))}
            {visibleProjects.length === 0 && <Empty text="Nenhum projeto" />}
          </FilterSection>

          <FilterSection title="Categoria">
            {(Object.keys(CATEGORY_LABEL) as TaskCategory[]).map((c) => (
              <Chip
                key={c}
                active={filters.categories.has(c)}
                onClick={() => toggle("categories", c)}
                label={CATEGORY_LABEL[c]}
                className={CATEGORY_COLOR[c]}
              />
            ))}
          </FilterSection>

          <FilterSection title="Status">
            {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
              <Chip
                key={s}
                active={filters.statuses.has(s)}
                onClick={() => toggle("statuses", s)}
                label={STATUS_LABEL[s]}
                icon={s === "done" ? <CheckCircle2 className="h-3 w-3" /> : undefined}
              />
            ))}
          </FilterSection>

          <FilterSection title="Especiais">
            <Chip
              active={filters.nonNegotiableOnly}
              onClick={() => update({ nonNegotiableOnly: !filters.nonNegotiableOnly })}
              label="Só inegociáveis"
              icon={<Lock className="h-3 w-3" />}
              className="text-overdue"
            />
          </FilterSection>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {title}
      </p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-xs text-muted-foreground/60 italic">{text}</p>;
}

function Chip({
  active,
  onClick,
  label,
  color,
  icon,
  className = "",
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-border/60 bg-card/40 text-muted-foreground hover:text-foreground hover:border-primary/40"
      } ${className}`}
      style={color ? { borderColor: active ? color : undefined, color: active ? color : undefined } : undefined}
    >
      {color && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />}
      {icon}
      {label}
    </button>
  );
}
