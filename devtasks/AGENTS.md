# Kanvy — DevTasks

Aplicación de gestión de tareas estilo Kanban para equipos de desarrollo.

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 19, Vite 8, TypeScript 5.9, react-router-dom 7, @dnd-kit, i18next |
| Backend | Express 5, TypeScript 6, Prisma 7, PostgreSQL 15 (Docker) |
| Auth | Google OAuth + JWT (7 días) |

## Estructura del Proyecto

```
devtasks/
├── backend/          # API REST Express 5, puerto 5001
│   ├── src/routes/   # Endpoints REST
│   ├── src/lib/      # Prisma client, access control, AI providers, SSE
│   ├── src/middleware/# auth.ts (JWT verify)
│   └── prisma/       # Schema (16 modelos, 5 enums), migraciones, seeds
├── frontend/         # SPA React 19 + Vite, puerto 5173
│   ├── src/pages/    # Login, Projects, ProjectBoard, Settings
│   ├── src/components/
│   │   ├── Kanban/   # Board, Column, TaskCard, TaskModal
│   │   ├── Calendar/ # CalendarBoard
│   │   ├── ListView/ # ListView
│   │   ├── Gantt/    # GanttBoard
│   │   └── AI/       # AIImportModal, AIImportPreview
│   ├── src/context/  # AuthContext, ThemeContext, NotificationContext
│   ├── src/services/ # api.ts (Axios + JWT interceptor)
│   ├── src/i18n/     # en.json, es.json (~200 claves)
│   └── src/styles/   # globals.css, theme.css, kanban.css
└── docker-compose.yml # PostgreSQL 15, puerto 5433
```

## Comandos Principales

### Backend
- `npm run dev` — Iniciar en modo desarrollo con tsx watch (directorio: `backend/`)
- `npm run build` — Compilar TypeScript
- `npx prisma migrate dev` — Ejecutar migraciones pendientes
- `npx prisma generate` — Regenerar Prisma Client
- `npx prisma db seed` — Sembrar datos de prueba

### Frontend
- `npm run dev` — Iniciar Vite dev server (directorio: `frontend/`)
- `npm run build` — Build de producción
- `npm run lint` — ESLint
- `npx tsc -b` — TypeScript check con project references

### Infraestructura
- `docker compose up -d` — Iniciar PostgreSQL

## Convenciones de Código

### TypeScript
- Strict mode habilitado en todos los tsconfig
- Usar `type` para imports de solo tipos
- Interfaces de tipos en `frontend/src/types/index.ts`
- Backend usa CommonJS (no ESM)

### Backend
- Rutas en `src/routes/` con Express Router
- Lógica de negocio en `src/lib/` (prisma, access, activity, notify)
- Acceso a BD solo vía Prisma Client desde `lib/prisma.ts`
- Control de acceso fino: resolver permisos (OWNER > FULL > EDITOR > VIEWER) por proyecto → sección → tarea
- Activity log: fire-and-forget con `lib/activity.ts`
- IA: factory pattern en `lib/ai/factory.ts`, providers en `lib/ai/providers/`

### Frontend
- Componentes funcionales con hooks
- Estado global en contextos (AuthContext, ThemeContext, NotificationContext)
- API calls vía `services/api.ts` (Axios con JWT interceptor)
- Estilos en CSS (theme.css para variables, kanban.css para componentes)
- i18n: usar hook `useTranslation()` de react-i18next

### Nombrado
- Archivos: PascalCase para componentes, camelCase para utils/librerías
- Rutas API: `/api/entidad` con métodos HTTP REST

## Verificación Post-Cambios

**Siempre ejecutar después de hacer cambios:**

1. **TypeScript** — Verificar que ambos proyectos compilan:
   - Frontend: `cd frontend && npx tsc -b`
   - Backend: `cd backend && npx tsc --noEmit`

2. **ESLint** — Verificar linting en frontend:
   - `cd frontend && npm run lint`

3. **Prisma** — Si se modificó el schema, regenerar cliente:
   - `cd backend && npx prisma generate`

4. **Ejecutar migraciones pendientes** si se tocó el schema:
   - `cd backend && npm run db:migrate`

## Seguridad
- JWT se almacena en localStorage y se envía como Bearer token
- Middleware `auth.ts` valida JWT en cada request protegido
- Control de acceso en cascada: verificar pertenencia al proyecto/sección/tarea antes de operar
- API keys de IA se almacenan en BD, encriptadas (campo `api_key` en `UserApiKey`)
- `.env` NUNCA se commitea (excluido en `.gitignore`)
- CORS configurado con orígenes específicos en producción
