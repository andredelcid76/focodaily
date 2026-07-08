## Objetivo

Melhorar a página `/projetos` em dois pontos:

1. **Filtro por status** disponível em todas as visões (hoje só existe "Ocultar finalizados").
2. **Cronograma** mais legível, com escala de tempo (dia / semana / mês / trimestre) e navegação por período.

Arquivo único afetado: `src/routes/projetos.index.tsx`.

---

### 1. Filtro por status (multi-seleção)

Na barra de filtros, adicionar um `Popover` "Status" ao lado do Select de papel:

- Chips clicáveis para cada `ProjectStatus` (Em andamento, Ativo, Pausado, Não iniciado, Finalizado), usando as cores do `ProjectStatusBadge`.
- Estado local `statusFilter: Set<ProjectStatus>` (vazio = todos).
- Contador no botão quando há seleção; botão "Limpar".
- Integra com `filtered` no `useMemo` existente: se `statusFilter.size > 0`, exige `statusFilter.has(p.status)`.
- Mantém a checkbox "Ocultar finalizados" (atalho independente); quando `statusFilter` inclui `finished` explicitamente, ignora o "ocultar".

### 2. Cronograma mais claro + escala de datas

Refatorar `ProjectsTimelineView`:

**Controles no topo da visão (dentro do card do cronograma):**
- Toggle de escala: `Dia | Semana | Mês | Trimestre` (default: Mês).
- Navegação: botões `‹ Hoje ›` para deslocar a janela visível pela escala atual.
- Label central mostrando o intervalo visível (ex.: "Jul 2026 – Set 2026").

**Régua de tempo (nova):**
- Grid superior com marcadores da escala escolhida (ex.: colunas de mês com nome abreviado, linhas verticais suaves atrás das barras).
- Linhas verticais de grid alinhadas com os marcadores, atrás das barras dos projetos.
- Marcador "hoje" mantido, agora com linha pontilhada mais visível e label melhor posicionado.

**Barras dos projetos:**
- Janela visível calculada a partir da escala + offset, não do min/max dos projetos (evita barras espremidas quando há um projeto muito longo).
- Projetos fora da janela: barra ainda desenhada com clip nas bordas e indicador `‹` / `›` mostrando que continua fora do viewport.
- Nome do projeto sempre visível à esquerda (coluna fixa de ~200px), barra à direita em área com scroll horizontal quando a escala for menor que o intervalo total.
- Tooltip por projeto mostrando início, fim, dias restantes e % progresso.
- Ordenação: por data de início, com projetos sem `starts_on` agrupados no topo com aviso "sem data de início".

**Legibilidade geral:**
- Zebra striping suave nas linhas.
- Separadores de mês/semana na régua com peso visual maior no primeiro dia de mês.
- Cabeçalho fixo (sticky) da régua ao rolar verticalmente com muitos projetos.

### Detalhes técnicos

- Todas as datas continuam manipuladas como strings ISO via helpers de `src/lib/date.ts` (`addDays`, `toISODate`, `startOfWeek`); adicionar apenas helpers locais no arquivo se necessário (ex.: `startOfMonth`, `addMonths`) — sem novos módulos.
- Sem alterações em hooks, migrations, RLS ou tipos.
- Sem mudanças de comportamento nas visões Cards / Tabela / Kanban além de respeitarem o novo `statusFilter`.

### Fora de escopo

- Drag para reagendar projetos no cronograma.
- Persistir escala/filtro entre sessões.
- Filtro por período (data) além da janela visual do cronograma.
