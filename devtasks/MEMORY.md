# Kanvy — Feature Tracking & Changelog

> Última actualización: Mayo 2026

---

## Vistas del Tablero

| Feature | Descripción |
|---|---|
| **Kanban Board** | 4 columnas (TODO, IN_PROGRESS, IN_REVIEW, DONE) con drag & drop, DnD entre columnas y secciones |
| **Calendar View** | Vista mensual/semanal con navegación, tasks como badges por día, zoom |
| **List View** | Tabla ordenable por título, sección, status, fecha. Tags, assignees, progreso |
| **Gantt Chart** | Timeline con barras por sección, 3 modos (Normal/Fases/Secuencial), zoom día/semana/mes, pan con drag del mouse |

---

## Filtros Avanzados

| Feature | Descripción |
|---|---|
| **Status filter** | Multi-select de pills TODO/IN_PROGRESS/IN_REVIEW/DONE |
| **Assignee filter** | Dropdown con miembros del proyecto y avatares |
| **Tag filter** | Dropdown con tags del proyecto, dots de color |
| **Due date filter** | Presets: Any date, Overdue, Today, This Week |
| **Clear filters** | Botón con badge contador de filtros activos |
| **Backend filtering** | Query params `status`, `assigneeId`, `tagId`, `dueDateFrom`, `dueDateTo` |

---

## Historial de Actividad

| Feature | Descripción |
|---|---|
| **Activity Log** | Tabla `ActivityLog` en BD, 19 tipos de acción (`TASK_CREATED`, `TASK_STATUS_CHANGED`, etc.) |
| **Timeline UI** | Vista vertical con dots y línea conectora en el drawer de tarea |
| **Eventos registrados** | Crear tarea, cambio de status, mover sección, archivar/desarchivar, comentarios, asignar/quitar, tags |
| **Auto-logging** | Helper `logActivity()` fire-and-forget en todas las rutas relevantes |

---

## Modal de Tarea (Rediseño)

| Feature | Descripción |
|---|---|
| **Metadata row** | Badge de status, nombre de sección con dot, fechas (start/due), creado |
| **Tags en header** | Debajo del título, dentro del sticky header |
| **Acciones movidas** | Edit, Archive, Move, Delete debajo de metadata/tags |
| **Secciones colapsables** | Attachments y Activity con toggle clickeable |
| **Save indicator** | Badge inline (Guardando.../✓ Guardado/✗ Error) con spinner/check |
| **Date pickers** | `react-day-picker v9` customizado con tema Kanvy, edición directa sin "Edit" |
| **Separadores suaves** | `border-top` con `--bg-tertiary` en vez de `--border` |
| **Cmd/Ctrl+Enter** | Atajo para guardar en modo edición |
| **Ícono lápiz** | Aparece al hover sobre el título |

---

## IA — Importación desde Markdown

| Feature | Descripción |
|---|---|
| **Multi-provider** | DeepSeek V4 Pro, OpenAI GPT-4o, Claude 3.5 Sonnet, Gemini 2.0 Flash |
| **Abstracción** | `AIProvider` interface, factory pattern, providers independientes |
| **System prompts** | Contexto de proyecto existente (secciones, tags, miembros) |
| **Preview interactivo** | Checkboxes por sección/tarea, tags, assignees, subtasks visibles |
| **Project name** | Campo opcional en modal; IA sugiere si está vacío |
| **Start date** | Date picker; IA calcula due dates basado en estimaciones del MD |
| **Work schedule** | Configurable en Settings (horas/día, días laborales) |
| **API Keys en DB** | Tabla `UserApiKey`, prioridad: modal > DB > env var |
| **Settings page** | `/settings` con gestión de API keys por provider + work config |
| **Modal UX** | No se cierra al click fuera, dropdown con estado (● configurado / ○ sin key), link a Settings |
| **Botón AI** | Gradiente violeta→rosa con shimmer hover, en projects page y sidebar del board |

---

## Exportación

| Feature | Descripción |
|---|---|
| **Excel (XLSX)** | `exceljs` con branding Kanvy, colores, gradientes |
| **Hoja Summary** | Resumen con secciones, conteo, progreso |
| **Hojas por sección** | Columnas: Title, Description, Status, Start/Due Date, Assignees, Tags, Subtasks, Comments |
| **Estilos** | Headers fondo oscuro (#1E2D40), filas alternadas, status coloreados, bordes |
| **Botón sidebar** | "Exportar" con ícono de descarga, descarga vía axios (JWT incluido) |

---

## Modelo de Datos

| Cambio | Descripción |
|---|---|
| **Subtask** | Checklist dentro de tareas con progreso |
| **ActivityLog** | Historial de actividad por tarea/proyecto |
| **UserApiKey** | API keys de IA por usuario/provider |
| **Task.startDate** | Fecha de inicio opcional en tareas |

---

## UI/UX General

| Feature | Descripción |
|---|---|
| **Dark mode** | `color-scheme: dark`, CSS variables, date picker adaptado |
| **i18n** | Inglés y español completos (200+ claves) |
| **Temas** | Light/dark toggle en navbar |
| **Botón AI** | Gradiente animado con shimmer |
| **Date inputs** | `react-day-picker v9` con popover, clear button, locale ES |
| **Responsive** | Sidebar adaptable, vistas móviles para kanban/calendario/lista/gantt |
| **Undo toast** | 4 segundos para deshacer eliminación de tareas/secciones |

---

## Commits

| # | Commit | Descripción |
|---|---|---|
| 1 | `90eecaf` | feat: add advanced board filters |
| 2 | `a5cb473` | feat: add activity history / audit trail |
| 3 | `c38f30e` | refactor: improve task modal layout and UX |
| 4 | `1a9178c` | feat: add calendar view (month/week) |
| 5 | `0b47dab` | feat: add list view with sortable table |
| 6 | `00f0664` | fix: restore move-to-section in calendar/list views |
| 7 | `d3d1b19` | fix: revert migration checksum |
| 8 | `16e6453` | feat: multi-provider AI + user API keys + Settings |
| 9 | `a816959` | feat: AI import project name + start date with due dates |
| 10 | `ee3ba34` | fix: subtasks before attachments, AI button gradient |
| 11 | `f9b3108` | feat: AI-powered project import from markdown |
| 12 | `efc6ac9` | feat: task startDate field + Gantt chart view |
| 13 | `fd05a8f` | feat: Gantt timeline pan/drag scroll |
| 14 | `286ceea` | feat: Excel export with Kanvy branding |
| 15 | `bbcce2c` | feat: replace native date inputs with react-day-picker v9 |
| 16 | `b87f560` | feat: date labels + direct date editing |
