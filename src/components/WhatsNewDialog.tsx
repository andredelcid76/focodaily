import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LATEST, getSeenId, markSeen } from "@/lib/changelog";

/** Mostra uma vez as novidades da versão mais recente. */
export function WhatsNewDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!LATEST) return;
    const seen = getSeenId();
    if (seen === null) {
      // Primeira visita neste aparelho: não interrompe, só registra.
      markSeen(LATEST.id);
      return;
    }
    if (seen !== LATEST.id) setOpen(true);
  }, []);

  if (!LATEST) return null;
  const close = () => {
    markSeen(LATEST.id);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Novidades do Foco
          </DialogTitle>
          <DialogDescription>{LATEST.title}</DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 text-sm">
          {LATEST.items.map((it) => (
            <li key={it} className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <span>{it}</span>
            </li>
          ))}
        </ul>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" asChild onClick={close}>
            <Link to="/novidades">Ver histórico</Link>
          </Button>
          <Button onClick={close}>Entendi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
