import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Columns3, GripVertical, RotateCcw, Eye, EyeOff } from "lucide-react";
import type { TaskColumnDef, TaskColumnKey } from "@/hooks/useTaskColumns";
import { useState } from "react";

type Props = {
  columns: TaskColumnDef[];
  onToggleVisible: (key: TaskColumnKey) => void;
  onReorder: (from: TaskColumnKey, to: TaskColumnKey) => void;
  onReset: () => void;
};

export function ColumnSettingsPopover({ columns, onToggleVisible, onReorder, onReset }: Props) {
  const [dragKey, setDragKey] = useState<TaskColumnKey | null>(null);
  const visibleCount = columns.filter((c) => c.visible).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          <Columns3 className="h-3.5 w-3.5" />
          <span className="text-xs">Colunas</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Colunas
          </span>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            title="Restaurar padrão"
          >
            <RotateCcw className="h-3 w-3" /> Padrão
          </button>
        </div>
        <p className="px-1 pb-2 text-[10px] text-muted-foreground">
          Arraste para reordenar. Largura: arraste a borda da coluna no cabeçalho.
        </p>
        <ul className="flex flex-col gap-0.5">
          {columns.map((col) => {
            const canHide = !(col.visible && visibleCount <= 1);
            return (
              <li
                key={col.key}
                draggable
                onDragStart={(e) => {
                  setDragKey(col.key);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => setDragKey(null)}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragKey && dragKey !== col.key) onReorder(dragKey, col.key);
                  setDragKey(null);
                }}
                className={`flex items-center gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-accent/40 ${
                  dragKey === col.key ? "opacity-50" : ""
                }`}
              >
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground/60 cursor-grab active:cursor-grabbing" />
                <span className="flex-1 text-xs">{col.label}</span>
                <button
                  type="button"
                  onClick={() => canHide && onToggleVisible(col.key)}
                  disabled={!canHide}
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                    col.visible
                      ? "text-foreground hover:bg-accent/60"
                      : "text-muted-foreground/50 hover:bg-accent/60"
                  } ${!canHide ? "opacity-40 cursor-not-allowed" : ""}`}
                  title={col.visible ? (canHide ? "Ocultar" : "Pelo menos uma coluna deve ficar visível") : "Mostrar"}
                  aria-label={col.visible ? "Ocultar coluna" : "Mostrar coluna"}
                >
                  {col.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
