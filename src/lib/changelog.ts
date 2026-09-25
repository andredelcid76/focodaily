/**
 * Novidades do Foco. Adicione a entrada mais nova NO TOPO a cada publicação.
 * `highlights` = telas que ganham o selo "Novo" no menu até a pessoa visitá-las.
 */
export type ChangelogEntry = {
  id: string; // único e crescente, ex.: "2026-09-24"
  date: string; // AAAA-MM-DD
  title: string;
  items: string[];
  highlights?: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: "2026-09-25",
    date: "2026-09-25",
    title: "Hoje mais rápido",
    items: [
      "A tela Hoje abre bem mais rápido ao voltar para ela.",
      "Fim das tarefas atrasadas \"fantasmas\" que apareciam por um instante antes da lista certa.",
      "Menu e cabeçalho não recarregam mais a cada troca de tela.",
      "Avisos por e-mail passam a ir para o e-mail atual da conta.",
    ],
  },
  {
    id: "2026-09-24",
    date: "2026-09-24",
    title: "Delegadas, notificações e novidades",
    items: [
      "Delegadas agora tem a aba \"Que eu deleguei\": acompanhe o que você passou para outras pessoas.",
      "Notificações ganharam lugar no menu lateral, com histórico completo e preferências.",
      "Avisos mais úteis: foto de quem fez, filtros, menções com @ e alertas de prazo.",
      "Troca de telas mais rápida, sem mostrar a tela anterior.",
      "Novo aviso quando há versão nova, com o resumo do que mudou.",
    ],
    highlights: ["/delegadas", "/notificacoes"],
  },
];

export const LATEST = CHANGELOG[0];

const SEEN_KEY = "foco-changelog-seen";
const VISITED_KEY = "foco-highlights-visited";

export function getSeenId(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}
export function markSeen(id: string) {
  try {
    localStorage.setItem(SEEN_KEY, id);
  } catch {
    /* noop */
  }
}

function visited(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(VISITED_KEY) || "{}");
  } catch {
    return {};
  }
}

/** Telas com selo "Novo" ainda não visitadas desde a entrada que as destacou. */
export function pendingHighlights(): Set<string> {
  const v = visited();
  const out = new Set<string>();
  for (const e of CHANGELOG.slice(0, 3)) {
    for (const h of e.highlights ?? []) if (!v[h] || v[h] < e.id) out.add(h);
  }
  return out;
}
export function markVisited(path: string) {
  const v = visited();
  if (!LATEST) return;
  v[path] = LATEST.id;
  try {
    localStorage.setItem(VISITED_KEY, JSON.stringify(v));
    window.dispatchEvent(new Event("foco:highlights"));
  } catch {
    /* noop */
  }
}
