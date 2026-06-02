
## 1. Onboarding sem projeto obrigatório

- Passo de criar projeto vira **opcional** (botão "Pular" claro, sem fricção).
- Após onboarding (com ou sem projeto), usuário cai em **nova tela de boas-vindas** (`/bem-vindo`) com atalhos:
  - Criar tarefa rápida
  - Criar projeto
  - Conectar Outlook / Fireflies / Pipedrive
  - Ir para Hoje
- Tela aparece só enquanto `onboarded_at` é recente OU não há tarefas/projetos. Dispensável com "Não mostrar de novo".

## 2. Hierarquia de papéis no projeto: Owner / Editor / Viewer

Modelo:
- **Owner** — criador do projeto. Tudo: editar projeto, excluir, gerenciar membros, mudar papéis.
- **Editor** — cria/edita/exclui tarefas, milestones, comentários, links. Não mexe em membros nem nas configs do projeto.
- **Viewer** — somente leitura. Vê tarefas, comentários, milestones, mas não cria nem edita nada.

Mudanças de banco (migration):
- `project_members.role` aceita `owner | editor | viewer` (atualmente `member`). Migrar `member → editor`.
- Funções auxiliares: `is_project_editor(_project_id, _user_id)` e `can_edit_project(_project_id, _user_id)` (owner OR editor).
- RLS reescrita em `tasks`, `task_subtasks`, `project_milestones`, `project_comments`, `project_links`:
  - SELECT: owner OR member (qualquer papel)
  - INSERT/UPDATE/DELETE: owner OR editor (viewer NÃO escreve)
- `team_invites` / `project_invites` ganham coluna `role` (default `editor`).
- UI de membros: dropdown de papel ao convidar e ao lado de cada membro (apenas owner muda).

## 3. Reformulação UX (Hoje, Projetos, Inbox + formulários + transições)

### Princípios aplicados
- **Optimistic updates em toda mutação** via TanStack Query (`onMutate` → `setQueryData` → `onError` rollback). Status, conclusão, atribuição, papel, reordenação, comentários — tudo atualiza na hora.
- **Autosave inline**: nada de botão "Salvar" em campos isolados. Debounce de 400ms com indicador discreto ("Salvo" no canto).
- **View Transitions API** (`document.startViewTransition`) nas trocas de rota e mudanças de layout (kanban ↔ lista ↔ cronograma).
- **Skeletons consistentes** (não spinners) em toda lista; estados de empty/erro padronizados via componente único `<EmptyState>` / `<ErrorState>`.
- **Microinterações**: `framer-motion` para entrada/saída de itens (`AnimatePresence`), checkmark animado ao concluir tarefa, ripple sutil em botões primários, drag-and-drop fluido com placeholder.
- **Feedback contextual**: toasts com ação "Desfazer" em ações destrutivas (excluir tarefa, remover membro). Atalho `Z` para desfazer.
- **Comando-K global** (já existe parcial) reforçado: ir para projeto, criar tarefa, mudar status, alternar visão.

### Telas reformuladas

**Hoje (`/hoje`)**
- Editar título da tarefa inline (click → input no lugar, blur salva).
- Checkbox com animação de risco no título + slide-out suave do item.
- Mudar status/prioridade direto na linha via popovers leves, sem abrir diálogo.
- Reordenar com `dnd-kit` + spring animation; persistência otimista.

**Projetos (`/projetos/$id`)**
- Header já reformulado mantém-se; melhorias:
  - Tabs (Lista / Kanban / Cronograma) com `<motion.div layoutId>` na transição.
  - Edição inline de nome do projeto, deadline, status.
  - Filtros (responsável, status) com chips removíveis.
- Lista de tarefas: linhas com inputs inline, mudança de responsável via Combobox de avatares.
- Kanban: drag entre colunas com placeholder ghost + spring; otimista.
- Lista de membros mostra papel e dropdown de mudança (só owner).

**Inbox (`/inbox`)**
- Tabs por origem mantidas; transições entre abas com fade+slide.
- Card de sugestão: ações (Aceitar/Recusar) inline com confirmação otimista + desfazer.
- "Buscar agora" com loader não bloqueante + count de novidades animado.

### Formulários (todos)
- `TaskDialog`, `ProjectDialog`, `ProfileCard`, convites:
  - Validação inline com mensagens curtas abaixo do campo.
  - Campos relacionados aparecem/somem com transição (`AnimatePresence`).
  - Submit com estado loading no botão e desabilita só o necessário.
  - Esc fecha, Cmd+Enter salva.

### Transições globais
- Hook `useViewTransition()` envolve `router.navigate` para rotas chave.
- Rotas com `<motion.main>` aplicando fade+rise (12px) em mount.
- Sidebar: indicador ativo desliza entre itens (`layoutId="sidebar-active"`).

## 4. Entrega faseada (mesmo PR, mas em blocos)

1. **Bloco DB**: migration de papéis (owner/editor/viewer) + RLS + invites com role.
2. **Bloco Onboarding**: passo de projeto opcional + `/bem-vindo`.
3. **Bloco UX core**: utilitários (`useViewTransition`, `<EmptyState>`, `<ErrorState>`, toast undo), motion wrappers, padrão optimistic.
4. **Bloco Hoje**: inline edit, animações, drag.
5. **Bloco Projetos**: tabs animadas, membros com papéis, inline edit, kanban otimista.
6. **Bloco Inbox**: ações otimistas, transições de aba.
7. **Bloco Formulários**: autosave/validação nos diálogos principais.

## Detalhes técnicos (referência)

- Mutations TanStack Query padrão:
  ```ts
  onMutate: async (vars) => {
    await qc.cancelQueries({ queryKey });
    const prev = qc.getQueryData(queryKey);
    qc.setQueryData(queryKey, (old) => apply(old, vars));
    return { prev };
  },
  onError: (_e, _v, ctx) => qc.setQueryData(queryKey, ctx?.prev),
  onSettled: () => qc.invalidateQueries({ queryKey }),
  ```
- View Transitions: feature-detect (`if ('startViewTransition' in document)`).
- `framer-motion` já presente; usar `AnimatePresence` + `motion.li layout`.
- `dnd-kit` para drag.
- Toast undo: sonner `toast(...).action({ label: 'Desfazer', onClick })`.

## Riscos

- Migração de `member → editor` em `project_members` exige UPDATE em dados existentes (tudo vira editor, owner permanece).
- View Transitions API não funciona em Firefox antigo — degrada silenciosamente para troca normal.
- Optimistic updates exigem cuidado em queries com filtros — usaremos `invalidateQueries` no `onSettled` como rede de segurança.

Posso seguir com a implementação assim?
