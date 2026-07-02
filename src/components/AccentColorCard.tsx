import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Palette } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";
import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT,
  applyAccentColor,
  type AccentColorId,
} from "@/lib/accentColors";
import { cn } from "@/lib/utils";

export function AccentColorCard() {
  const qc = useQueryClient();
  const fetchProfile = useServerFn(getMyProfile);
  const update = useServerFn(updateMyProfile);

  const { data } = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => fetchProfile(),
  });

  const saved =
    ((data?.profile as { accent_color?: AccentColorId } | null)?.accent_color as AccentColorId) ??
    DEFAULT_ACCENT;

  const [selected, setSelected] = useState<AccentColorId>(saved);

  useEffect(() => { setSelected(saved); }, [saved]);

  const dirty = selected !== saved;

  const saveMut = useMutation({
    mutationFn: () => update({ data: { accent_color: selected } }),
    onSuccess: () => {
      applyAccentColor(selected);
      toast.success("Cor de destaque atualizada");
      qc.invalidateQueries({ queryKey: ["my-profile"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Live preview while browsing — reverts if user leaves without saving
  // (next remount reads the persisted value).
  const onPick = (id: AccentColorId) => {
    setSelected(id);
    applyAccentColor(id);
  };

  const onReset = () => {
    setSelected(saved);
    applyAccentColor(saved);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <Palette className="h-4 w-4" />
          </div>
          <div>
            <CardTitle>Cor de destaque</CardTitle>
            <CardDescription>
              Escolha a cor dos botões, links e realces. Vale só para você — mantém o tema escuro
              e o mesmo brilho suave.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap gap-3">
          {ACCENT_PRESETS.map((p) => {
            const isActive = selected === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onPick(p.id)}
                aria-label={p.label}
                aria-pressed={isActive}
                title={p.label}
                className={cn(
                  "group relative flex h-11 w-11 items-center justify-center rounded-full transition-all",
                  "ring-offset-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive
                    ? "ring-2 ring-foreground/70 scale-110"
                    : "ring-1 ring-border/60 hover:scale-105",
                )}
                style={{
                  background: `radial-gradient(circle at 30% 30%, color-mix(in oklab, ${p.swatch} 100%, white 18%), ${p.swatch} 70%)`,
                  boxShadow: isActive
                    ? `0 0 24px -6px ${p.swatch}`
                    : `0 2px 8px -4px ${p.swatch}55`,
                }}
              >
                {isActive && <Check className="h-4 w-4 text-white drop-shadow" />}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs text-muted-foreground">
            Selecionada: <span className="font-medium text-foreground">
              {ACCENT_PRESETS.find((p) => p.id === selected)?.label}
            </span>
          </p>
          <div className="flex items-center gap-2">
            {dirty && (
              <Button variant="ghost" size="sm" onClick={onReset}>
                Cancelar
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => saveMut.mutate()}
              disabled={!dirty || saveMut.isPending}
            >
              {saveMut.isPending ? "Salvando…" : "Salvar cor"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
