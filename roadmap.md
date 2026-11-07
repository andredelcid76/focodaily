# Auditoria — Fase 2
- [x] B1/B2: busca global segura e abertura universal; remover diálogo duplicado.
- [x] B3/B6/B8: data local única, proteção contra 404 Pipedrive e histórico completo.
- [x] P1/P5/P7/P10: atualização incremental filtrada, dependências e cache/memorização.
- [x] P9/Pendência: índices e remoção idempotente do cron legado em migration nova.
- [x] Executar testes existentes/novos e verificar riscos de Realtime.
- [x] Revisão Fase 2: Pipedrive ignora tarefas já marcadas, aborta só a própria sincronização e marca atividades desativadas.
- [x] Revisão Fase 2: tempo real com exclusões, comentários de terceiros, perda/ganho de acesso e filtros agrupados.
- [ ] Validar busca/Realtime em duas sessões reais — bloqueado por ausência de sessão autenticada disponível.
# Auditoria de segurança — Fase 1
- [x] Revisão: classificar falhas de entrega, recuperar reservas de 15 min e limitar a 5 tentativas.
- [x] Revisão: alinhar MCP com permissões atuais e validar responsável no projeto destino.
- [x] Revisão: mostrar recusa de cadastro no retorno social e corrigir cron legado de scan.
- [x] Revisão: executar testes de entrega, permissões, login e agendamento.
- [x] S1: proteger posse, projeto de origem e ator MCP.
- [x] S2/S3: proteger convites, limite combinado e e-mail confirmado.
- [x] S4/S7: exigir Bearer MCP e validar retornos internos.
- [x] S6: proteger agendadores e reservar notificações atomicamente; testar concorrência.
- [x] Restringir novos cadastros e executar testes de segurança SQL e frontend.
- [ ] Ativar chamadas agendadas com CRON_SECRET — aguardando cadastro do segredo e publicação.
- [ ] Conferir OAuth real, convites/e-mails/Teams e MCP com tokens reais após publicação.
# Delegação sem projeto
- [x] Agrupar avisos por tarefa no sino e na página, preservando filtros e contadores.
- [x] Validar agrupamento com cinco testes e expansão/ações em navegador com dados de exemplo.
- [ ] Conferir ações persistidas na conta real — bloqueado por ausência de sessão autenticada na prévia.
- [x] Disponibilizar responsável em tarefas sem projeto, usando os contatos existentes.
- [x] Conferir permissões, MCP e notificações para delegação independente de projeto.
- [x] Validar seletor no navegador e payload de persistência no código, sem enviar delegações de teste a contatos reais.
# Avisos de dependências
- [x] Mostrar inconsistências de datas e predecessoras pendentes nas tarefas.
- [x] Oferecer Ajustar / Manter como está ao criar vínculos inconsistentes.
- [x] Confirmar reagendamentos por arrasto antes do limite sem bloqueio obrigatório.
- [x] Validar regras e interação dos avisos.
# Atualização da tela Hoje
- [x] Impedir que a tela Hoje reutilize uma lista antiga de tarefas ao voltar para ela.
- [x] Validar a troca de telas no navegador autenticado.
- [x] Abrir Hoje com uma busca enxuta de tarefas atuais e atrasadas.
- [x] Manter a conta carregada durante a troca entre páginas.
- [x] Deixar a tela Hoje pronta em segundo plano antes do clique no menu.
- [x] Manter menu, cabeçalho e avisos montados durante toda a navegação interna.
- [x] Excluir o histórico concluído da busca inicial de Hoje.
- [x] Medir a abertura rápida no navegador autenticado.
- [x] Impedir tarefas de projetos pausados de aparecerem antes da leitura dos projetos terminar.
- [x] Corrigir a reinicialização causada pelo canal duplicado do contador de avisos.
- [x] Validar a volta para Hoje quadro a quadro, sem tarefas fantasmas.
- [x] Autor correto (current_actor_id) nos avisos de tarefas, inclusive via MCP.
- [x] Marca cinza "Criada pelo Claude" (created_via) no MCP, list_tasks, TaskCard e TaskListRow.
