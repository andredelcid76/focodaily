import { useLocation, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Global "back" button. Uses browser history so filters/scroll on the
 * previous screen are preserved. Hidden on first load (nothing to go back to).
 */
export function BackButton() {
  const router = useRouter();
  const location = useLocation();
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setCanGoBack(window.history.length > 1);
  }, [location.pathname]);

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
