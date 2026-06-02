# Plano: 4 melhorias

## 1. Caixa de entrada agrupada por origem
- Em `src/routes/inbox.tsx`, agrupar sugestões por `source` (Outlook, Fireflies, Pipedrive) em seções/abas.
- Manter ordem cronológica dentro de cada grupo. Adicionar contador por origem.

## 2. Rotina de verificação automática a cada 2h
- Criar rota pública `src/routes/api/public/inbox/scan-all.ts` que itera todos os usuários com integrações ativas (Outlook, Pipedrive, Fireflies) e dispara scan de inbox + sync de agenda Outlook.
- Cron via pg_cron (`net.http_post`) a cada 2 horas chamando essa rota.
- Botão "Buscar agora" já existe; mantém refresh manual.
- Incluir sync de eventos do Outlook calendar (novo endpoint ou estender o scan existente). Verificar se já existe sync de agenda — se não, adicionar fetch de `/me/calendarview` ao scan.

## 3. Onboarding de novos usuários
- Nova rota `src/routes/onboarding.tsx` com 3 passos:
  1. Boas-vindas + foto/nome
  2. Criar primeiro projeto (foco em "Projetos")
  3. Adicionar primeiras tarefas de "Hoje"
- Flag `onboarded_at` em `profiles`. Redirecionar usuários sem essa flag para `/onboarding` após login (lógica em `__root.tsx` ou layout `_authenticated`).
- Skip opcional.

## 4. Perfil/configurações da conta
- Em `src/routes/configuracoes.tsx`, adicionar seção "Perfil":
  - Upload de foto (Supabase Storage bucket `avatars`, público)
  - Nome de exibição
  - Fuso horário
  - Idioma (pt-BR default)
  - Email (read-only)
  - Botão alterar senha
- Migration: criar bucket `avatars` com RLS, adicionar colunas `avatar_url`, `timezone`, `locale`, `onboarded_at` em `profiles`.

## Detalhes técnicos
- Storage: bucket público `avatars`, path `{user_id}/avatar.{ext}`, RLS para o usuário só atualizar seu próprio path.
- Cron usa `apikey` header com anon key.
- Scan-all deve ter timeout curto por usuário e processar em paralelo limitado (Promise.allSettled em lotes).
- Onboarding usa server fn para criar projeto + tarefas e marcar `onboarded_at`.
