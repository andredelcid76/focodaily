import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useRoles, ROLE_COLORS, type Role } from "@/hooks/useRoles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Check, X, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/papeis")({
  component: () => (
    <AppShell>
      <RolesPage />
    </AppShell>
  ),
});

function RolesPage() {
  const { user } = useAuth();
  if (!user) return null;
  return <RolesInner userId={user.id} />;
}

export function RolesInner({ userId }: { userId: string }) {
  const { roles, createRole, updateRole, deleteRole } = useRoles(userId);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(ROLE_COLORS[0]);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    try {
      await createRole({ name: newName.trim(), color: newColor, position: roles.length });
      setNewName("");
      setNewColor(ROLE_COLORS[0]);
      setAdding(false);
      toast.success("Papel criado");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao criar");
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Configuração</p>
          <h1 className="font-display text-3xl font-bold">Meus papéis</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Defina os papéis que você desempenha (CEO, Pessoal, Head de Vendas…) para classificar suas tarefas.
          </p>
        </div>
        {!adding && (
          <Button onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-4 w-4" /> Novo papel
          </Button>
        )}
      </div>

      {adding && (
        <div className="rounded-2xl border border-primary/40 bg-primary/5 p-4 space-y-3">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nome do papel (ex: CEO, Pessoal, Pai)"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <ColorPicker value={newColor} onChange={setNewColor} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setAdding(false); setNewName(""); }}>
              <X className="mr-1 h-4 w-4" /> Cancelar
            </Button>
            <Button onClick={handleAdd}>
              <Check className="mr-1 h-4 w-4" /> Criar
            </Button>
          </div>
        </div>
      )}

      {roles.length === 0 && !adding ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-10 text-center">
          <p className="text-muted-foreground">Você ainda não criou nenhum papel.</p>
          <Button variant="outline" className="mt-4" onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-4 w-4" /> Criar primeiro papel
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {roles.map((r) => (
            <RoleRow key={r.id} role={r} onUpdate={updateRole} onDelete={deleteRole} />
          ))}
        </div>
      )}
    </div>
  );
}

function RoleRow({
  role,
  onUpdate,
  onDelete,
}: {
  role: Role;
  onUpdate: (id: string, patch: Partial<Role>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState(role.color);

  const save = async () => {
    if (!name.trim()) return;
    try {
      await onUpdate(role.id, { name: name.trim(), color });
      setEditing(false);
      toast.success("Atualizado");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const remove = async () => {
    if (!confirm(`Excluir papel "${role.name}"? As tarefas vinculadas perderão essa associação.`)) return;
    try {
      await onDelete(role.id);
      toast.success("Excluído");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (editing) {
    return (
      <div className="rounded-xl border border-primary/40 bg-card/60 p-3 space-y-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <ColorPicker value={color} onChange={setColor} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setName(role.name); setColor(role.color); }}>
            Cancelar
          </Button>
          <Button size="sm" onClick={save}>Salvar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card/60 p-3">
      <div className="flex items-center gap-3">
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: role.color }} />
        <span className="font-medium">{role.name}</span>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={() => setEditing(true)}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={remove} className="text-destructive hover:text-destructive">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ROLE_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`h-7 w-7 rounded-full border-2 transition-transform ${
            value === c ? "border-foreground scale-110" : "border-transparent hover:scale-105"
          }`}
          style={{ backgroundColor: c }}
          aria-label={c}
        />
      ))}
    </div>
  );
}
