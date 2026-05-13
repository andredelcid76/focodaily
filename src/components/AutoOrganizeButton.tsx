import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Sparkles, Settings2, Loader2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  autoOrganizeDay,
  autoOrganizeWeek,
  getUserPreferences,
  updateUserPreferences,
} from "@/lib/autoOrganize.functions";

type Props = {
  scope: "day" | "week";
  date?: string; // for day
  weekStart?: string; // for week
  onDone?: () => void;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "icon";
  label?: string;
};

export function AutoOrganizeButton({ scope, date, weekStart, onDone, variant = "outline", size = "sm", label }: Props) {
  const runDay = useServerFn(autoOrganizeDay);
  const runWeek = useServerFn(autoOrganizeWeek);
  const fetchPrefs = useServerFn(getUserPreferences);
  const savePrefs = useServerFn(updateUserPreferences);

  const [loading, setLoading] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [capacity, setCapacity] = useState(480);
  const [useAi, setUseAi] = useState(true);

  useEffect(() => {
    if (!prefsOpen) return;
    fetchPrefs({}).then((p) => {
      setCapacity(p.daily_capacity_minutes);
      setUseAi(p.auto_organize_use_ai);
    }).catch(() => {});
  }, [prefsOpen, fetchPrefs]);

  const handleRun = async () => {
    setLoading(true);
    try {
      console.log("[AutoOrganize] click", { scope, date, weekStart });
      if (scope === "day" && date) {
        const r = await runDay({ data: { date } });
        console.log("[AutoOrganize] day result", r);
        if (r.ordered_ids.length === 0) {
          toast.info("Nenhuma tarefa para organizar neste dia.");
        } else if (r.overflow) {
          toast.warning(`Dia organizado, mas está cheio: ${Math.round(r.total_minutes / 60 * 10) / 10}h em ${Math.round(r.capacity_minutes / 60 * 10) / 10}h disponíveis.`);
        } else {
          toast.success(r.reasoning ? `Organizado · ${r.reasoning}` : "Dia organizado");
        }
      } else if (scope === "week" && weekStart) {
        const r = await runWeek({ data: { week_start: weekStart } });
        console.log("[AutoOrganize] week result", r);
        const overflow = r.days.filter((d) => d.overflow);
        if (overflow.length) {
          toast.warning(`Semana organizada · ${overflow.length} dia(s) acima da capacidade.`);
        } else {
          toast.success("Semana organizada");
        }
      }
      onDone?.();
    } catch (e) {
      console.error("[AutoOrganize] error", e);
      toast.error(e instanceof Error ? e.message : "Falha ao auto-organizar");
    } finally {
      setLoading(false);
    }
  };

  const handleSavePrefs = async () => {
    try {
      await savePrefs({ data: { daily_capacity_minutes: capacity, auto_organize_use_ai: useAi } });
      toast.success("Preferências salvas");
      setPrefsOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    }
  };

  return (
    <div className="inline-flex items-center gap-1">
      <Button variant={variant} size={size} onClick={handleRun} disabled={loading} title="Reordenar com base em prioridades, adiamentos e regras">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {size !== "icon" && <span className="ml-1">{label ?? (scope === "week" ? "Auto-organizar semana" : "Auto-organizar")}</span>}
      </Button>
      <Popover open={prefsOpen} onOpenChange={setPrefsOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" title="Preferências de auto-organização" className="h-8 w-8">
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 space-y-3">
          <div>
            <Label htmlFor="ao-capacity" className="text-xs">Capacidade diária (horas)</Label>
            <Input
              id="ao-capacity"
              type="number"
              min={1}
              max={16}
              step={0.5}
              value={capacity / 60}
              onChange={(e) => setCapacity(Math.round(parseFloat(e.target.value || "0") * 60))}
              className="h-9 mt-1"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Usada para detectar dias cheios demais.</p>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-xs">Refinar com IA</Label>
              <p className="text-[10px] text-muted-foreground">Usa Lovable AI para refinar a ordem.</p>
            </div>
            <Switch checked={useAi} onCheckedChange={setUseAi} />
          </div>
          <Button size="sm" className="w-full" onClick={handleSavePrefs}>Salvar</Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
