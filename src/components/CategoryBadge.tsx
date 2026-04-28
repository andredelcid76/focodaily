import type { TaskCategory } from "@/hooks/useTasks";

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

export function CategoryBadge({ category, size = "sm" }: { category: TaskCategory; size?: "sm" | "xs" }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${styles[category]} ${
        size === "xs" ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-xs"
      }`}
    >
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
