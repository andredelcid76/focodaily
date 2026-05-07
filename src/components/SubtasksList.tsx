import { useState, type KeyboardEvent } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2, Plus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useSubtasks, type Subtask } from "@/hooks/useSubtasks";
import { toast } from "sonner";

type Props = {
  taskId: string;
  userId: string;
};

function SortableItem({
  subtask,
  onToggle,
  onRename,
  onRemove,
}: {
  subtask: Subtask;
  onToggle: (id: string, v: boolean) => void;
  onRename: (id: string, v: string) => void;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: subtask.id,
  });
  const [value, setValue] = useState(subtask.title);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/40 px-2 py-1.5"
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
        aria-label="Reordenar"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Checkbox
        checked={subtask.completed}
        onCheckedChange={(v) => onToggle(subtask.id, !!v)}
      />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if (value.trim() && value !== subtask.title) onRename(subtask.id, value.trim());
          else if (!value.trim()) setValue(subtask.title);
        }}
        className={`h-7 border-0 bg-transparent px-1 text-sm focus-visible:ring-0 ${
          subtask.completed ? "line-through text-muted-foreground" : ""
        }`}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-destructive"
        onClick={() => onRemove(subtask.id)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function SubtasksList({ taskId, userId }: Props) {
  const { subtasks, create, toggle, rename, remove, reorder } = useSubtasks(taskId, userId);
  const [newTitle, setNewTitle] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const completedCount = subtasks.filter((s) => s.completed).length;

  const handleAdd = async () => {
    const t = newTitle.trim();
    if (!t) return;
    try {
      await create(t);
      setNewTitle("");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao adicionar subtarefa");
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = subtasks.findIndex((s) => s.id === active.id);
    const newIndex = subtasks.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(subtasks, oldIndex, newIndex);
    reorder(reordered.map((s) => s.id));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Subtarefas</Label>
        {subtasks.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {completedCount} de {subtasks.length} concluídas
          </span>
        )}
      </div>

      {subtasks.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={subtasks.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5">
              {subtasks.map((s) => (
                <SortableItem
                  key={s.id}
                  subtask={s}
                  onToggle={toggle}
                  onRename={rename}
                  onRemove={remove}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <div className="flex items-center gap-2">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Nova subtarefa…"
          className="h-8 text-sm"
        />
        <Button type="button" size="sm" variant="outline" onClick={handleAdd} disabled={!newTitle.trim()}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
        </Button>
      </div>
    </div>
  );
}
