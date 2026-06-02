## 1. Tela "Hoje" — esconder responsável

`TaskCard` ganha prop opcional `hideAssignee`. Na rota `/` (Hoje), passa `hideAssignee` em todas as instâncias. O chip do responsável continua aparecendo em projetos, agenda, semana e Tarefas.

## 2. Menu "Minhas tarefas" → "Tarefas"

- `AppSidebar`: renomear label.
- `src/routes/minhas-tarefas.tsx`: título + meta = "Tarefas". (Manter URL `/minhas-tarefas` para não quebrar links/atalho.)
- Substituir o filtro atual `kindFilter` por um **toggle principal** com 3 opções: **Todas** · **Minhas** (criadas por mim ou onde sou responsável) · **De outros** (tarefas em projetos compartilhados onde o dono e o responsável não sou eu). Mantém demais filtros.
- Backend `listMyAssignedTasks` já retorna own + delegadas. Para "de outros" precisamos também trazer tarefas de projetos compartilhados onde eu **não** sou owner nem assignee. Vou ampliar o serverFn para incluir tarefas dos projetos onde sou membro/equipe, marcando `kind: 'shared'`.

## 3. Card de projeto mostra o Líder

`ProjectCard` (em `projetos.index.tsx`) exibe um chip "Líder: Nome" usando `useProfiles` para resolver o `project.user_id`. Também aparece na visão Tabela.

## 4. Renomear "Admin" → "Líder"

Conceito: **Líder = `projects.user_id`** (quem criou, por padrão). Manager e member continuam em `project_members`. Renomeação é **UI-only**:

- `ProjectMembersSection`, helpers e labels: trocar todos os "Admin"/"admin (papel)" exibidos → "Líder". O valor `role='admin'` em `project_members` continua existindo no banco, mas não é mais oferecido na UI (líder é único e definido pelo `user_id` do projeto).
- Adicionar ação **"Transferir liderança"** no `ProjectDialog` (visível só para o líder atual): seleciona um membro existente, e via `updateProject({ user_id: novoLider })`. Inclui confirmação. RLS atual já permite manager+ atualizar projeto, então a transferência funciona; depois da troca o ex-líder vira manager automaticamente (insert em `project_members`).

## 5. Modelo de permissões (confirmar/explicitar)

Já está mapeado nas RLS atuais — só precisamos garantir consistência na UI:

- **Líder** (`projects.user_id`): tudo — edita projeto, qualquer tarefa, gerencia membros, transfere liderança.
- **Manager** (`project_members.role = 'manager'` ou `team_members.role='manager'`): edita qualquer tarefa do projeto (já permitido por `is_project_manager_or_above`), **mas não edita dados do projeto**. Vou ajustar a RLS de UPDATE em `projects` para exigir **líder apenas** (hoje aceita manager+) e ajustar `ProjectDialog` para esconder campos para não-líder.
- **Member**: só edita tarefas onde é `user_id` ou `assignee_id` (já garantido pelo trigger `enforce_member_task_constraints` + RLS `Tasks update own assigned or as manager`).

### Migração necessária

```sql
-- Restringir UPDATE de projects ao líder (owner)
DROP POLICY "Project update by manager or above" ON public.projects;
CREATE POLICY "Project update by leader only"
ON public.projects FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

-- Quando o líder transfere a liderança, garantir que o antigo líder vire manager:
-- feito via código (insert em project_members) no fluxo de transferência.
```

## Arquivos afetados

- `src/components/TaskCard.tsx` (prop `hideAssignee`)
- `src/routes/index.tsx` (passar prop)
- `src/components/AppSidebar.tsx` (rename label)
- `src/routes/minhas-tarefas.tsx` (título + toggle)
- `src/lib/myTasks.functions.ts` (incluir tarefas "de outros" em projetos compartilhados)
- `src/routes/projetos.index.tsx` (chip Líder no card/tabela)
- `src/components/ProjectMembersSection.tsx` (rename Admin → Líder na UI)
- `src/components/ProjectDialog.tsx` (botão "Transferir liderança"; esconder edição p/ não-líder)
- Migração RLS em `projects`.

Pronto para implementar?