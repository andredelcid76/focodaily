## Módulo de Projetos

A ideia é tratar **projeto** como um "container de propósito" — algo maior que uma tarefa, com começo, prazo, contexto próprio e várias entregas. As tarefas continuam sendo a unidade de execução do dia (são elas que aparecem em Hoje/Semana/Kanban), e ganham um vínculo opcional a um projeto. Compromissos da agenda também podem ser vinculados (ex.: "Reunião de kickoff" → Projeto X).

### Conceito

Um projeto tem:
- **Identidade**: nome, descrição rica (contexto/briefing), cor, ícone, papel (Role) responsável.
- **Status**: rascunho, ativo, em pausa, concluído, arquivado.
- **Datas**: data de início e prazo final (deadline). Opcionais: marcos intermediários (milestones).
- **Saúde**: progresso calculado (% de subtarefas concluídas), tempo estimado vs. tempo gasto, dias restantes até o prazo.
- **Conteúdo vinculado**:
  - **Subtarefas** = tarefas comuns marcadas com `project_id` (reusa todo o motor atual: agendamento, recorrência, timer, kanban).
  - **Reuniões** vinculadas (`project_id` em meetings).
  - **Notas/contexto**: campo de descrição longa em markdown para briefing, links, decisões.

A diferença em relação à tarefa é que o projeto **não vive em um único dia** — ele é um espaço persistente com timeline própria, e suas tarefas se distribuem nos dias.

### Telas

**1. `/projetos` — Lista de projetos**
- Cards agrupados por status (Ativos / Em pausa / Concluídos / Arquivados).
- Cada card mostra: nome, papel, prazo (com indicador "faltam X dias" ou "atrasado"), barra de progresso, contagem de subtarefas abertas/totais, tempo gasto.
- Filtros por papel e status. Botão "Novo projeto".

**2. `/projetos/$id` — Detalhe do projeto** (a tela diferenciada)
Layout em duas colunas no desktop, tabs no mobile:
- **Cabeçalho**: nome editável inline, papel, status (badge clicável para mudar), datas (início → prazo), barra de progresso, KPIs (tempo estimado, tempo gasto, subtarefas abertas, dias restantes).
- **Coluna principal — abas**:
  - **Subtarefas**: lista agrupada por "Atrasadas / Hoje / Próximos 7 dias / Sem data / Concluídas". Cada item é o `TaskCard` atual (mesmos atalhos: timer, postpone, follow-up). Botão "Adicionar subtarefa" cria uma tarefa já com `project_id` preenchido.
  - **Kanban**: as subtarefas em colunas A fazer / Fazendo / Feitas (reusa o componente do `/kanban`, filtrado por projeto).
  - **Timeline**: eixo horizontal com início → prazo, marcando subtarefas (por `scheduled_date`) e reuniões vinculadas. Linha vertical "hoje".
  - **Reuniões**: lista de reuniões vinculadas, com botão para vincular/desvincular reuniões existentes da agenda.
- **Coluna lateral — Contexto**: campo de descrição longa (textarea grande, multilinha) para briefing, objetivos, links. Editável inline. Abaixo, "Atividade recente" (últimas conclusões e mudanças de status).

**3. Integração nas telas existentes**
- **TaskDialog**: novo campo "Projeto" (Select com busca) — opcional. Se a tarefa for criada de dentro de um projeto, vem pré-preenchido.
- **TaskCard** (Hoje, Semana, Kanban): se a tarefa tiver projeto, mostra um pequeno chip colorido com o nome do projeto, clicável → abre `/projetos/$id`.
- **Agenda / Reuniões**: dropdown "Vincular ao projeto" no diálogo de reunião.
- **Hoje**: nova seção opcional "Projetos com prazo próximo" (próximos 7 dias) com link rápido.

### Como o módulo "amarra" tudo
- Projeto é o ponto de vista estratégico ("o quê e por quê").
- Tarefa continua sendo o ponto operacional ("o que fazer hoje").
- Agenda traz o tempo real de reuniões.
- Tudo conversa pelo `project_id`, sem duplicar dados — uma subtarefa de projeto **é** uma tarefa normal, então aparece naturalmente em Hoje, Semana e Kanban.

---

## Detalhes técnicos

**Banco (migration nova):**
- `projects` (id, user_id, name, description, color, icon, role_id, status enum [`draft`,`active`,`paused`,`done`,`archived`], starts_on date, deadline date, created_at, updated_at). RLS por `user_id`. Índice em `(user_id, status)`.
- `tasks` ganha coluna `project_id uuid NULL` + índice. Sem FK rígida (mantém padrão atual de não usar FK para auth.users; aqui fazemos FK opcional para `projects(id) ON DELETE SET NULL` — está em schema próprio, ok).
- `meetings` ganha coluna `project_id uuid NULL` + índice (FK SET NULL).
- Trigger `update_updated_at` reaproveitado para `projects`.

**Frontend:**
- Hook `useProjects(userId)`: CRUD + realtime, estatísticas derivadas (progresso, tempo, atrasados).
- Hook `useTasks` ganha `tasksByProject(projectId)` e parâmetro `project_id` em createTask/updateTask.
- Hook `useMeetings` ganha `meetingsByProject(projectId)` e suporte a `project_id`.
- Componentes novos: `ProjectCard`, `ProjectDialog` (criar/editar), `ProjectStatusBadge`, `ProjectTimeline`, `ProjectChip` (chip pequeno usado em TaskCard).
- Rotas novas: `src/routes/projetos.tsx` (lista) e `src/routes/projetos.$id.tsx` (detalhe).
- `AppShell`: adiciona item de navegação "Projetos" (ícone `FolderKanban`).
- `TaskDialog.tsx`: novo Select "Projeto" alimentado por `useProjects`.
- `TaskCard.tsx`: renderiza `ProjectChip` quando `task.project_id` existe.

**Cálculos:**
- Progresso = subtarefas concluídas / total (excluindo arquivadas).
- Tempo gasto = soma de `time_spent_seconds` das subtarefas.
- Tempo estimado = soma de `duration_minutes` das subtarefas abertas.
- Dias restantes = `deadline - today` (negativo = atrasado).

**Sem mudanças em:** RLS pattern existente, Outlook sync, recorrência, timer.

---

## Entregas (na ordem em que serão implementadas)

1. Migration: tabela `projects` + colunas `project_id` em `tasks` e `meetings` + índices.
2. Hook `useProjects` + extensão de `useTasks`/`useMeetings`.
3. Rota `/projetos` (lista, filtros, criar/editar via dialog).
4. Rota `/projetos/$id` (cabeçalho, KPIs, aba Subtarefas, aba Contexto).
5. Aba Kanban e aba Timeline do projeto.
6. Vínculo de reuniões + aba Reuniões.
7. Integração no `TaskDialog` (Select de projeto) e `TaskCard` (chip de projeto).
8. Item de menu "Projetos" no `AppShell` + seção opcional "Projetos com prazo próximo" em Hoje.