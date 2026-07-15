import { useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Global "back" button. Uses browser history so filters/scroll on the previous
 * screen are preserved. Hidden when there's nowhere to go back to (e.g. first
 * page load, direct link entry).
 */
export function BackButton() {
  const router = useRouter();
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    // Track whether we've navigated anywhere in this session.
    const update = () => setCanGoBack(window.history.length > 1);
    update();
    const unsub = router.subscribe("onResolved", update);
    return () => unsub();
  }, [router]);

  if (!canGoBack) return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9 shrink-0"
      onClick={() => router.history.back()}
      aria-label="Voltar"
      title="Voltar"
    >
      <ArrowLeft className="h-4 w-4" />
    </Button>
  );
}
