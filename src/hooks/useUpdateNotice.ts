import { useEffect, useRef } from "react";
import { toast } from "sonner";

const CHECK_EVERY_MS = 5 * 60 * 1000;

async function applyUpdate() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    await Promise.allSettled(regs.map((r) => r.update()));
  } catch {
    /* noop */
  }
  window.location.reload();
}

/**
 * Detecta quando uma nova versão do Foco foi publicada e oferece
 * "Atualizar" — sem precisar fechar e abrir o app.
 */
export function useUpdateNotice() {
  const shown = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const current = __APP_BUILD_ID__;

    const check = async () => {
      if (shown.current || document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/public/version?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const { id, notes } = (await res.json()) as {
          id?: string;
          notes?: { title: string; items: string[] } | null;
        };
        if (!id || id === current) return;
        shown.current = true;
        const summary = notes?.items?.length
          ? notes.items.map((i) => `• ${i}`).join("\n")
          : "Atualize para receber as melhorias. Leva só um segundo.";
        toast("Nova versão do Foco disponível", {
          description: summary,
          classNames: { description: "whitespace-pre-line" },
          duration: Infinity,
          action: { label: "Atualizar", onClick: () => applyUpdate() },
          onDismiss: () => {
            // Volta a lembrar na próxima verificação.
            setTimeout(() => (shown.current = false), CHECK_EVERY_MS);
          },
        });
      } catch {
        /* offline: tenta de novo depois */
      }
    };

    const t = setTimeout(check, 15_000);
    const i = setInterval(check, CHECK_EVERY_MS);
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearTimeout(t);
      clearInterval(i);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);
}
