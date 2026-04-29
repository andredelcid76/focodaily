import { Link } from "@tanstack/react-router";
import { FolderKanban } from "lucide-react";
import type { Project } from "@/hooks/useProjects";

export function ProjectChip({
  project,
  size = "xs",
  asLink = true,
}: {
  project: Project;
  size?: "xs" | "sm";
  asLink?: boolean;
}) {
  const className = `inline-flex items-center gap-1 rounded-md border font-medium ${
    size === "xs" ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-xs"
  }`;
  const style = {
    backgroundColor: `${project.color}20`,
    borderColor: `${project.color}55`,
    color: project.color,
  } as const;

  const content = (
    <>
      <FolderKanban className={size === "xs" ? "h-2.5 w-2.5" : "h-3 w-3"} />
      <span className="max-w-[10rem] truncate">{project.name}</span>
    </>
  );

  if (!asLink) {
    return (
      <span className={className} style={style}>
        {content}
      </span>
    );
  }

  return (
    <Link
      to="/projetos/$id"
      params={{ id: project.id }}
      onClick={(e) => e.stopPropagation()}
      className={`${className} hover:brightness-125 transition-[filter]`}
      style={style}
    >
      {content}
    </Link>
  );
}

export function ProjectStatusBadge({
  status,
  size = "xs",
}: {
  status: import("@/hooks/useProjects").ProjectStatus;
  size?: "xs" | "sm";
}) {
  const map: Record<typeof status, { label: string; color: string }> = {
    draft: { label: "Rascunho", color: "#94a3b8" },
    active: { label: "Ativo", color: "#10b981" },
    paused: { label: "Em pausa", color: "#f59e0b" },
    done: { label: "Concluído", color: "#3b82f6" },
    archived: { label: "Arquivado", color: "#64748b" },
  } as const;
  const cfg = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${
        size === "xs" ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-xs"
      }`}
      style={{
        backgroundColor: `${cfg.color}20`,
        borderColor: `${cfg.color}55`,
        color: cfg.color,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cfg.color }} />
      {cfg.label}
    </span>
  );
}
