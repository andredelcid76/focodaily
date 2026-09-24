import { createFileRoute } from "@tanstack/react-router";

/** Versão publicada no momento — o app compara com a sua para avisar de atualizações. */
export const Route = createFileRoute("/api/public/version")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(
          { id: __APP_BUILD_ID__ },
          { headers: { "Cache-Control": "no-store, max-age=0" } },
        ),
    },
  },
});
