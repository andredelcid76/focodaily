import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BellRing } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { NOTIFICATION_TYPES } from "@/lib/notificationTypes";

type Channel = "app" | "email" | "teams";
type Prefs = Record<string, Partial<Record<Channel, boolean>>>;
type EmailMode = "instant" | "digest" | "off";

const EMAIL_MODES: { value: EmailMode; label: string; hint: string }[] = [
  { value: "instant", label: "Na hora", hint: "Um e-mail a cada aviso" },
  { value: "digest", label: "Resumo diário", hint: "Um e-mail por dia, às 7h, com tudo" },
  { value: "off", label: "Não enviar", hint: "Só avisos no app e no Teams" },
];

export function NotificationPreferencesCard() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Prefs>({});
  const [mode, setMode] = useState<EmailMode>("instant");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("notification_preferences")
      .select("prefs,email_mode")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setPrefs((data.prefs ?? {}) as Prefs);
          setMode((data.email_mode as EmailMode) ?? "instant");
        }
        setLoaded(true);
      });
  }, [user]);

  const save = async (nextPrefs: Prefs, nextMode: EmailMode) => {
    if (!user) return;
    setPrefs(nextPrefs);
    setMode(nextMode);
    const { error } = await supabase
      .from("notification_preferences")
      .upsert({ user_id: user.id, prefs: nextPrefs, email_mode: nextMode }, { onConflict: "user_id" });
    if (error) toast.error("Não foi possível salvar suas preferências");
  };

  const isOn = (type: string, ch: Channel) => prefs[type]?.[ch] !== false;
  const toggle = (type: string, ch: Channel, value: boolean) =>
    save({ ...prefs, [type]: { ...prefs[type], [ch]: value } }, mode);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BellRing className="h-4 w-4" />
          </div>
          <div>
            <CardTitle>Preferências de avisos</CardTitle>
            <CardDescription>Escolha o que chega para você no app, por e-mail e no Teams.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="mb-2 text-xs font-medium text-muted-foreground">E-mails</div>
          <div className="grid gap-2 sm:grid-cols-3">
            {EMAIL_MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                disabled={!loaded}
                onClick={() => save(prefs, m.value)}
                className={`rounded-lg border p-2.5 text-left transition-colors ${
                  mode === m.value ? "border-primary/50 bg-primary/10" : "border-border/60 hover:bg-muted/40"
                }`}
              >
                <div className="text-sm font-medium">{m.label}</div>
                <div className="text-[11px] text-muted-foreground">{m.hint}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-1.5 font-medium">Aviso</th>
                <th className="w-16 py-1.5 text-center font-medium">App</th>
                <th className="w-16 py-1.5 text-center font-medium">E-mail</th>
                <th className="w-16 py-1.5 text-center font-medium">Teams</th>
              </tr>
            </thead>
            <tbody>
              {NOTIFICATION_TYPES.map((t) => (
                <tr key={t.value} className="border-t border-border/40">
                  <td className="py-2 pr-2">
                    <div className="font-medium">{t.label}</div>
                    <div className="text-[11px] text-muted-foreground">{t.description}</div>
                  </td>
                  {(["app", "email", "teams"] as Channel[]).map((ch) => (
                    <td key={ch} className="py-2 text-center">
                      <Switch
                        disabled={!loaded || (ch === "email" && mode === "off")}
                        checked={isOn(t.value, ch)}
                        onCheckedChange={(v) => toggle(t.value, ch, v)}
                        aria-label={`${t.label} — ${ch}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Você nunca recebe aviso das suas próprias ações. Várias alterações seguidas na mesma tarefa viram um só aviso.
        </p>
      </CardContent>
    </Card>
  );
}
