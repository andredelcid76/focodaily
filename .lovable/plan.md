# Colunas customizáveis — Planejar/Tarefas (Hoje)

## Objetivo
Permitir que cada usuário ajuste a tabela de tarefas da tela Hoje: mostrar/ocultar colunas, arrastar para redimensionar, e reordenar via drag — com a configuração salva e restaurada entre sessões.

## Escopo
- **Tela:** apenas `/` (Planejar/Tarefas — Hoje). Semana e Minhas Tarefas seguem com layout fixo.
- **Colunas controláveis:** Tarefa, Projeto, Papel, Duração, Vencimento, Status.
- **Colunas fixas (sempre visíveis, não move):** drag handle, checkbox de concluir, ações (timer + menu) — são UI estrutural.
- **Mobile (<768px):** controles desabilitados; usa o layout empilhado já corrigido.

## UX

### Controles
- Botão **"Colunas"** no topo da lista (ao lado dos filtros existentes), abre popover com:
  - Lista de colunas com checkbox (mostrar/ocultar) e handle de arrastar (reordenar).
  - Botão "Restaurar padrão".
- **Redimensionar:** arrastar a borda direita do cabeçalho de cada coluna. Cursor `col-resize`, faixa visual de 4px no hover.
- **Reordenar:** também direto no header — segurar e arrastar uma coluna para nova posição (além do popover).

### Persistência
Salva por usuário em `localStorage` com chave `today-table-columns-v1`. Estrutura:
```json
{
  "order": ["title","project","role","duration","due","status"],
  "hidden": ["role"],
  "widths": { "title": "1.5fr", "project": "2fr", "role": "7rem", ... }
}
```
Sem ida ao banco — preferência puramente client-side, sincroniza entre abas via `storage` event.

## Implementação técnica

### Novo hook
`src/hooks/useTaskColumns.ts` — gerencia state + localStorage + defaults. Expõe:
- `columns`: array ordenado de `{ key, label, visible, width }`
- `setWidth(key, width)`, `toggleVisible(key)`, `reorder(from, to)`, `reset()`
- `gridTemplate`: string pronta para `grid-template-columns` (concatena fixos + dinâmicos).

### Refatorar `TaskListRow.tsx`
- Receber `columns` como prop (vindo do container `routes/index.tsx`).
- Substituir o grid-template hardcoded por `style={{ gridTemplateColumns: gridTemplate }}`.
- Renderizar cada cell condicionalmente baseado em `visible` e na ordem do array.
- Cells viram um pequeno map `{ title: <TitleCell/>, project: <ProjectCell/>, ... }` para reordenação.

### Refatorar `TaskListHeader`
- Mesmo `gridTemplate`.
- Cada `<SortBtn>` ganha:
  - Wrapper com handle de resize na borda direita (`onPointerDown` → captura, calcula delta em px, converte para fr/rem).
  - Suporte a drag-to-reorder (usar `@dnd-kit` que já está no projeto, com `SortableContext` horizontal).

### Container (`src/routes/index.tsx`)
- Importar `useTaskColumns`, passar `columns` e `gridTemplate` para header + rows.
- Adicionar botão "Colunas" + popover com `ColumnSettingsPopover`.

### Novo componente
`src/components/ColumnSettingsPopover.tsx` — lista checkbox + drag list (dnd-kit vertical).

## Arquivos

**Criar:**
- `src/hooks/useTaskColumns.ts`
- `src/components/ColumnSettingsPopover.tsx`

**Editar:**
- `src/components/TaskListRow.tsx` (gridTemplate dinâmico, cells condicionais)
- `src/routes/index.tsx` (wiring + botão Colunas)

## Fora de escopo (poderia vir depois)
- Múltiplas "visualizações nomeadas" (ex: "Foco", "Revisão") salvas por usuário no banco.
- Sincronização cross-device (hoje fica em localStorage).
- Aplicar mesma config em Semana/Minhas Tarefas.
