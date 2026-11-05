# Kanvy — DevTasks

Aplicación de gestión de tareas estilo Kanban (multi-proyecto, multiusuario, con IA).

- **Frontend:** React 19 + Vite + TypeScript, puerto 5173
- **Backend:** Express 5 + Prisma 7 + PostgreSQL 15, puerto 5001
- **Auth:** Google Identity Services + JWT

## Arranque rápido

```powershell
# 1. Base de datos
docker compose up -d

# 2. Backend
cd backend
copy .env.example .env       # completar JWT_SECRET y GOOGLE_CLIENT_ID
npm install
npx prisma migrate deploy
npm run dev                  # http://localhost:5001

# 3. Frontend (otra terminal)
cd frontend
copy .env.example .env       # completar VITE_GOOGLE_CLIENT_ID
npm install
npm run dev                  # http://localhost:5173
```

Datos de prueba: `cd backend && npm run db:seed`.

## Comandos

| Comando | Dónde | Qué hace |
|---|---|---|
| `npm run dev` | backend / frontend | Servidor de desarrollo |
| `npm run build` | backend / frontend | Compila (backend regenera Prisma) |
| `npm start` | backend | Migra y arranca en producción |
| `npm test` | backend | Test de cobertura de autorización (estático) |
| `npm run test:http` | backend | Prueba HTTP con dos cuentas y Prisma simulado (sin BD) |
| `npm run test:runtime` | backend | Prueba HTTP contra la BD real (requiere servidor y Postgres) |
| `npm run lint` | frontend | ESLint |
| `npx tsc --noEmit` / `npx tsc -b` | backend / frontend | Typecheck |
| `npm run db:migrate` | backend | `prisma migrate dev` |
| `npm run db:seed` | backend | Datos demo idempotentes |

## Seguridad

- **Autorización por recurso:** cada ruta de proyecto/sección/tarea resuelve el acceso efectivo
  (`OWNER > FULL > EDITOR > VIEWER`) antes de responder. `npm test` falla si un handler queda sin guard.
- **Adjuntos:** solo JPEG/PNG/GIF/WEBP/PDF, verificados por magic bytes; se sirven con URLs firmadas
  (HMAC + expiración), nunca como carpeta estática pública.
- **SSE:** el stream de notificaciones usa un ticket de un solo uso (60 s), no el JWT en la query.
- **IA:** `baseUrl` validado contra hosts oficiales (o `AI_ALLOWED_BASE_URLS`), timeouts y rate limit por usuario.
- **Secretos:** `.env` está en `.gitignore`; las API keys de IA se guardan por usuario en la BD
  cifradas con AES-256-GCM (clave en `API_KEY_ENCRYPTION_SECRET`).

## Estructura

```
devtasks/
├── backend/   API Express, Prisma (17 modelos), migraciones, seeds
├── frontend/  SPA React, contextos, vistas Kanban/Calendario/Lista/Gantt
├── mcp-server/ Servidor MCP portable (stdio/HTTP) para agentes
└── shared/    Contrato de tipos y chequeo de drift
```

## Documentación

- [`AGENTS.md`](AGENTS.md) — convenciones y comandos
- [`DEPLOY.md`](DEPLOY.md) — despliegue con Cloudflare Tunnel
- [`MEMORY.md`](MEMORY.md) — changelog funcional
- [`AI_INTEGRATION_PLAN.md`](AI_INTEGRATION_PLAN.md) — diseño de la importación con IA
- [`mcp-server/README.md`](mcp-server/README.md) — servidor MCP para Claude Code, Cursor, VS Code, Codex y otros
