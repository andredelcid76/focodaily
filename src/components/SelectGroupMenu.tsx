import { CheckSquare, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type SelectGroup = { key: string; label: string; ids: string[] };

/** "Selecionar ▾" menu: pick a whole group of tasks at once. */
export function SelectGroupMenu({
  groups,
  selectedCount,
  onSelect,
  onClear,
}: {
  groups: SelectGroup[];
  selectedCount: number;
  onSelect: (ids: string[]) => void;
  onClear: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs" data-bulk-bar="true">
          <CheckSquare className="mr-1 h-3.5 w-3.5" />
          Selecionar
          <ChevronDown className="ml-1 h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-xs">Adicionar à seleção</DropdownMenuLabel>
        {groups.map((g) => (
          <DropdownMenuItem
            key={g.key}
            disabled={g.ids.length === 0}
            onSelect={() => onSelect(g.ids)}
            className="text-xs"
          >
            <span className="flex-1">{g.label}</span>
            <span className="tabular-nums text-muted-foreground">{g.ids.length}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={selectedCount === 0} onSelect={onClear} className="text-xs">
          Limpar seleção
        </DropdownMenuItem>
        <div className="px-2 pb-1.5 pt-1 text-[10px] leading-snug text-muted-foreground">
          Dica: Shift + clique seleciona um intervalo; Ctrl/⌘ + clique soma uma tarefa.
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
