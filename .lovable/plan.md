# Equipes como entidade própria

## Ideia em uma frase
Em vez de marcar cada projeto como "pessoal" ou "de equipe" e convidar pessoa por pessoa, você cria **Equipes** uma vez, convida as pessoas, e depois atribui projetos àquela equipe. Todo mundo da equipe entra automaticamente no projeto.

## Como fica para o usuário

**Novo menu "Equipes"** (no sidebar, entre Projetos e Mais):
- Lista das equipes que você é dono ou membro
- Botão "Nova equipe" → nome, cor/ícone opcional
- Dentro de cada equipe: lista de membros, convites pendentes, projetos da equipe
- Convidar por e-mail (mesmo fluxo de `/convite/:token` que já existe)
- Sair da equipe / transferir propriedade / renomear

**ProjectDialog (mudança principal):**
Hoje tem toggle "Pessoal / Equipe" + lista de membros do projeto.
Passa a ter um campo **"Visibilidade"**:
- `Pessoal` (só você)
- `Equipe: [seletor com suas equipes]` 

A seção "membros do projeto" deixa de existir nesse dialog — os membros vêm da equipe escolhida. Quem é dono do projeto pode opcionalmente **adicionar convidados extras** fora da equipe (manter o `project_members` como fallback).

## O que muda no banco

```text
teams                 (id, owner_id, name, color, icon, timestamps)
team_members          (team_id, user_id, role: owner|admin|member, joined_at)
team_invites          (id, team_id, email, token, invited_by, expires_at, accepted_at, accepted_by)
projects.team_id      → nova coluna nullable (FK para teams)
```

Regras de acesso (RLS):
- Você vê um projeto se: é dono, OU está em `project_members`, OU está em `team_members` da `team_id` do projeto.
- Mesma lógica se estende a tarefas, marcos, comentários, links, reuniões e subtarefas (todas hoje usam `is_project_member`). A função `is_project_member` é estendida para considerar também membership por equipe — assim **nenhuma policy precisa mudar**, só a função.

## Migração de dados existentes
Projetos que hoje têm `project_members` continuam funcionando — `project_members` vira o "convidado extra" do projeto. Não força migração; quem quiser unifica criando uma equipe e movendo os projetos.

## Decisões que preciso confirmar com você

1. **Papéis dentro da equipe**: começo simples com `owner` e `member` (igual projetos hoje), ou já incluo `admin` (gerencia membros sem ser dono)?
2. **Convidados extras no projeto**: mantenho a possibilidade de adicionar alguém de fora da equipe num projeto específico, ou simplifico e o projeto fica restrito 100% aos membros da equipe?
3. **Delegação de tarefa**: ao escolher responsável numa tarefa de projeto de equipe, listo **todos os membros da equipe** (faz sentido) — confirma?

## Escopo desta entrega
- Migração: tabelas `teams`, `team_members`, `team_invites`, coluna `projects.team_id`, atualizar `is_project_member` para considerar equipes.
- Server functions: `listTeams`, `createTeam`, `renameTeam`, `inviteTeamMember`, `removeTeamMember`, `acceptTeamInvite`, `leaveTeam`, `deleteTeam`.
- UI:
  - Nova rota `/equipes` (lista) e `/equipes/:id` (detalhe com membros, convites, projetos).
  - Item no sidebar.
  - `ProjectDialog` com novo seletor de visibilidade.
  - `TaskDialog` lista membros da equipe quando o projeto pertence a uma.
- Mantém tudo que já existe (project_members, project_invites, notificações de delegação) funcionando.

## Fora de escopo (próximas iterações)
- Permissões finas por papel (viewer, admin).
- Cobrança/limites por equipe.
- Visão "Pessoas" agregando tarefas por membro da equipe.
- Mover tarefas/projetos em massa entre equipes.
