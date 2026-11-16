import { createFileRoute, redirect } from "@tanstack/react-router";

// A Caixa de entrada foi desativada; links salvos para /inbox voltam para Hoje.
export const Route = createFileRoute("/inbox")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
});
