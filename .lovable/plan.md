# Subtarefas dentro do card de detalhes da tarefa

## O que será adicionado

Dentro do diálogo de detalhes da tarefa (`TaskDialog`), uma nova seção **Subtarefas** com:

- Campo para adicionar nova subtarefa (Enter para confirmar)
- Lista de subtarefas, cada uma com:
  - Checkbox para marcar como concluída (com texto riscado quando feita)
  - Botão para excluir
  - Handle de arraste (`GripVertical`) para reordenar a ordem de execução
- Reordenação via drag-and-drop usando `@dnd-kit` (já instalado no projeto)
- Contador "X de Y concluídas" no topo da seção
- Persistência no banco de dados (Lovable Cloud)

## Mudanças no banco

Nova tabela `task_subtasks`:

- `task_id` (referência à tarefa)
- `title` (texto)
- `completed` (boolean)
- `position` (inteiro, para ordenação)
- `user_id` + RLS (somente o dono lê/escreve)

## Mudanças no código

1. **Migração SQL**: cria `task_subtasks` com RLS por `user_id` e índice por `(task_id, position)`.
2. **Novo hook `useSubtasks(taskId)`** em `src/hooks/useSubtasks.ts`:
   - listar, criar, marcar/desmarcar, renomear, excluir, reordenar (atualiza `position` em lote).
3. **Novo componente `SubtasksList`** em `src/components/SubtasksList.tsx`:
   - usa `DndContext` + `SortableContext` (vertical) com `PointerSensor` (mesma config do projeto).
   - cada item: checkbox shadcn + input inline + grip + botão remover.
4. **`TaskDialog`**: renderiza `<SubtasksList taskId={task.id} />` apenas quando `task?.id` existe (tarefa salva). Para tarefa nova, mostra dica "Salve a tarefa para adicionar subtarefas".

## Comportamento

- Clique no checkbox → marca/desmarca (otimista).
- Arrastar pelo grip → reordena e persiste novas posições.
- Enter no campo "Nova subtarefa" → cria e mantém foco para próxima.
- Subtarefas não afetam o status da tarefa-mãe (decisão simples; podemos evoluir depois para "concluir tudo conclui a tarefa" se você quiser).

Confirma que posso seguir? Se quiser que concluir todas as subtarefas conclua a tarefa-mãe, me avise antes.
