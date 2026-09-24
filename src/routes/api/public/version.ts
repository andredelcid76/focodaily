import { createFileRoute } from "@tanstack/react-router";
import { LATEST } from "@/lib/changelog";

/** Versão publicada no momento — o app compara com a sua para avisar de atualizações. */
export const Route = createFileRoute("/api/public/version")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(
          {
            id: __APP_BUILD_ID__,
            notes: LATEST ? { title: LATEST.title, items: LATEST.items.slice(0, 3) } : null,
          },
          { headers: { "Cache-Control": "no-store, max-age=0" } },
        ),
    },
  },
});
