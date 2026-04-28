import type { TaskCategory } from "@/hooks/useTasks";
import { Flame, Star, Droplet } from "lucide-react";

const labels: Record<TaskCategory, string> = {
  urgent: "Urgente",
  important: "Importante",
  circumstantial: "Circunstancial",
};

const styles: Record<TaskCategory, string> = {
  urgent: "bg-urgent/15 text-urgent border-urgent/30",
  important: "bg-important/15 text-important border-important/30",
  circumstantial: "bg-circumstantial/15 text-circumstantial border-circumstantial/30",
};

const icons: Record<TaskCategory, typeof Flame> = {
  urgent: Flame,
  important: Star,
  circumstantial: Droplet,
};

export function CategoryIcon({ category, className = "h-3.5 w-3.5" }: { category: TaskCategory; className?: string }) {
  const Icon = icons[category];
  const colorClass =
    category === "urgent" ? "text-urgent" : category === "important" ? "text-important" : "text-circumstantial";
  return <Icon className={`${className} ${colorClass}`} />;
}

export function CategoryBadge({ category, size = "sm" }: { category: TaskCategory; size?: "sm" | "xs" }) {
  const Icon = icons[category];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${styles[category]} ${
        size === "xs" ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-xs"
      }`}
    >
      <Icon className={size === "xs" ? "h-2.5 w-2.5" : "h-3 w-3"} />
      {labels[category]}
    </span>
  );
}

export function CategoryDot({ category }: { category: TaskCategory }) {
  const map: Record<TaskCategory, string> = {
    urgent: "bg-urgent",
    important: "bg-important",
    circumstantial: "bg-circumstantial",
  };
  return <span className={`inline-block h-2 w-2 rounded-full ${map[category]}`} />;
}
