import type { Role } from "@/hooks/useRoles";

export function RoleBadge({ role, size = "sm" }: { role: Role; size?: "sm" | "xs" }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${
        size === "xs" ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-xs"
      }`}
      style={{
        backgroundColor: `${role.color}20`,
        borderColor: `${role.color}55`,
        color: role.color,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: role.color }} />
      {role.name}
    </span>
  );
}
