# Checklist/Subtareas — Progreso

## Backend
- [x] Agregar modelo `Subtask` en `prisma/schema.prisma` y relación en `Task`
- [x] Crear migración SQL `20260501000000_add_subtasks`
- [x] Agregar endpoints CRUD de subtareas en `routes/tasks.ts`
- [x] Incluir subtareas en listado de `routes/sectionTasks.ts`

## Frontend
- [x] Extender tipos en `types/index.ts` (Subtask + Task.subtasks)
- [x] Agregar sección Checklist en `TaskModal.tsx`
- [x] Mostrar indicador de progreso en `TaskCard.tsx`
- [x] Agregar estilos en `styles/kanban.css`
- [x] Agregar traducciones en `i18n/en.json` y `i18n/es.json`

## Post-edición
- [x] Ejecutar migración Prisma (`npx prisma migrate dev`)
- [x] Regenerar Prisma Client
- [x] Probar flujo completo end-to-end
