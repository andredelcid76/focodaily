import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme, type Theme } from "@/lib/theme";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const OPTIONS: { value: Theme; label: string; icon: typeof Sun; hint: string }[] = [
  { value: "light", label: "Claro", icon: Sun, hint: "Fundo claro o tempo todo" },
  { value: "dark", label: "Escuro", icon: Moon, hint: "Reduz cansaço visual à noite" },
  { value: "system", label: "Sistema", icon: Monitor, hint: "Acompanha seu SO" },
];

export function AppearanceCard() {
  const { theme, setTheme } = useTheme();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Aparência</CardTitle>
        <CardDescription>Escolha o tema da interface. Salvo no seu navegador.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2">
          {OPTIONS.map(({ value, label, icon: Icon, hint }) => {
            const active = theme === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                className={cn(
                  "flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-all",
                  "hover:border-primary/40 hover:bg-accent/40",
                  active
                    ? "border-primary bg-accent/60 ring-2 ring-primary/20"
                    : "border-border bg-card"
                )}
                aria-pressed={active}
              >
                <Icon className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">{label}</span>
                <span className="text-[11px] text-muted-foreground leading-tight">{hint}</span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
