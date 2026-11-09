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
│   └── prisma/       # Schema (17 modelos, 5 enums), migraciones, seeds
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
├── mcp-server/       # Servidor MCP portable (stdio/HTTP) para agentes
├── dsh-kanvy/        # Plugin nativo de DeepSeek Harness (tools Kanvy)
├── shared/           # Contrato de tipos + check de drift (CI)
└── docker-compose.yml # Stack Docker: app + PostgreSQL 15
```

## Comandos Principales

### Backend
- `npm run dev` — Iniciar en modo desarrollo con tsx watch (directorio: `backend/`)
- `npm run build` — Compilar TypeScript
- `npm test` — Test de cobertura de autorización (no requiere base de datos)
- `npm run typecheck` — `tsc --noEmit`
- `npx prisma migrate dev` — Ejecutar migraciones pendientes
- `npx prisma generate` — Regenerar Prisma Client
- `npx prisma db seed` — Sembrar datos de prueba

### Frontend
- `npm run dev` — Iniciar Vite dev server (directorio: `frontend/`)
- `npm run build` — Build de producción
- `npm run lint` — ESLint
- `npx tsc -b` — TypeScript check con project references

### Infraestructura
- `docker compose up -d postgres` — Iniciar solo PostgreSQL para desarrollo
- `docker compose --env-file .env.docker up -d --build` — App completa (frontend + backend + PostgreSQL)

### MCP server (directorio: `mcp-server/`)
- `npm run build` — Compilar TypeScript
- `npm test` — Tests unitarios (config, cliente, tools)
- `npm run test:e2e` — Cliente MCP real por stdio + smoke HTTP

### Plugin DSH (directorio: `dsh-kanvy/`)
- `npm run build` — Compilar TypeScript
- `npm test` — Config, cliente, formatters, tools y wiring del plugin

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

5. **Test de autorización** — ningún handler de datos puede quedar sin guard:
   - `cd backend && npm test`
   - Prueba HTTP con dos cuentas y Prisma simulado (sin BD): `npm run test:http`
   - Prueba contra Postgres real (con el servidor arriba): `npm run test:runtime`

6. **Contrato de tipos compartido** — Prisma, shared y frontend deben coincidir:
   - `cd .. && node shared/check.mjs`

## Seguridad
- JWT se almacena en localStorage y se envía como Bearer token
- Middleware `auth.ts` valida JWT en cada request protegido
- Control de acceso en cascada: `getProjectAccess` (solo nivel proyecto), `getSectionAccess` (una sección), `getTaskAccess` (tarea). Los grants de sección/tarea nunca escalan a todo el proyecto
- Guards reutilizables: `requireProjectAccess`, `requireSectionAccess`, `requireTaskAccess`, `ensureProjectAccess`, `ensureSectionAccess`
- `npm test` escanea todas las rutas y falla si un handler de datos no resuelve acceso (`scripts/authz-coverage.mjs`)
- Adjuntos: MIME verificado por magic bytes y URLs firmadas con expiración (HMAC). No existe carpeta `/uploads` pública
- SSE: ticket de un solo uso de 60 s (`POST /api/notifications/stream-ticket`); el JWT no viaja en la URL
- IA: `baseUrl` restringido a hosts oficiales o `AI_ALLOWED_BASE_URLS`, timeout de 60 s y rate limit por usuario
- API keys de IA por usuario en `UserApiKey`, cifradas con AES-256-GCM y AAD ligado a usuario+proveedor (`API_KEY_ENCRYPTION_SECRET`)
- `.env` NUNCA se commitea (excluido en `.gitignore`); hay `.env.example` en backend y frontend
- CORS configurado con orígenes específicos en producción
