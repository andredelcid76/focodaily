## Objetivo

Em `/projetos`:
1. Abrir já no **Kanban** (em vez de Cards).
2. Mostrar um **número de prioridade** (#1, #2, #3…) em cada card do Kanban, refletindo a ordem em que estão na coluna.
3. Permitir **arrastar para reordenar** dentro da mesma coluna para definir a prioridade — a ordem fica salva e persiste entre sessões/dispositivos.

## Como vai funcionar

- Cada card do Kanban ganha um selo discreto com o número (ex.: `#1` no topo da coluna, `#2` logo abaixo, etc.).
- A numeração é por coluna: cada coluna ("Em andamento", "Ativo", "Pausado", "Não iniciado", "Finalizado" — e idem quando agrupado por papel) começa em `#1`.
- Arrastar um card para cima/baixo dentro da coluna muda o número imediatamente; arrastar para outra coluna muda o status (como já faz hoje) e o card entra no fim da nova coluna.
- A ordem é por usuário/projeto e fica salva no banco — não é só ordenação visual local.

## Detalhes técnicos

1. **Banco**: migration adicionando coluna `position int` em `public.projects` (default 0), preenchida inicialmente com `row_number() OVER (PARTITION BY user_id, status ORDER BY created_at)`. Trocar `order("name")` por `order("position")` em `useProjects`.
2. **RPC**: função `reorder_projects(p_ordered_ids uuid[])` análoga a `reorder_tasks`, com `SECURITY DEFINER` checando `auth.uid() = user_id` para cada projeto.
3. **Kanban (`src/routes/projetos.index.tsx`)**:
   - `useState<ViewMode>("kanban")` como padrão.
   - Envolver cada `KanbanCol` em `SortableContext` (estratégia vertical) e cada `KanbanProjectCard` em `useSortable` para permitir reorder dentro da coluna.
   - `handleDragEnd` distingue: drop em card da mesma coluna → reorder local + chamada `reorder_projects`; drop em coluna diferente → muda status/papel (comportamento atual) e acrescenta no final.
   - Selo `#N` no canto superior do card, baseado no índice dentro de `grouped[col.id]`.
4. **Ordenação por papel**: a coluna `position` é global por usuário; quando o agrupamento é "por papel", a numeração visual ainda funciona (usa o índice no array da coluna), mas o reorder persistido só ocorre quando agrupado por status (para não conflitar). Posso também salvar uma segunda coluna `position_role` se você quiser persistir ambas — me diga se prefere.

## Fora do escopo

- Não vou mexer em Tarefas (já têm sua própria ordenação).
- Não vou mudar Cards/Tabela/Cronograma além de manter "Kanban" pré-selecionado.
