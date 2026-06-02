import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toISODate } from "@/lib/date";

type Props = {
  value: string; // YYYY-MM-DD or "" for empty
  onChange: (iso: string) => void;
  className?: string;
  size?: "sm" | "md";
  placeholder?: string;
  clearable?: boolean;
};

const formatLabel = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
};

const isValidISO = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

export function DatePickerField({
  value,
  onChange,
  className,
  size = "md",
  placeholder = "Selecionar data",
  clearable = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const valid = isValidISO(value);
  let selected: Date | undefined;
  if (valid) {
    const [y, m, d] = value.split("-").map(Number);
    selected = new Date(y, m - 1, d);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start gap-2 text-left font-normal",
            size === "sm" ? "h-9" : "h-10",
            !valid && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          <span className="capitalize flex-1 truncate">
            {valid ? formatLabel(value) : placeholder}
          </span>
          {valid && clearable && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange("");
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
              aria-label="Limpar data"
            >
              ✕
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            if (date) {
              onChange(toISODate(date));
              setOpen(false);
            }
          }}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}

