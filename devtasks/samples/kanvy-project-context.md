# Kanvy — Contexto del proyecto

> Documento de contexto para personas y agentes que trabajen en Kanvy.
> Última actualización: 2026-11-19.
> Categoría sugerida al subirlo: **Guía** o **Especificación**.

## 1. Qué es Kanvy

Kanvy es una aplicación de gestión de proyectos y tareas estilo Kanban, multiusuario, con una capa de conocimiento del proyecto y una integración nativa con agentes de IA.

No es solo un tablero: el objetivo es que cualquier developer pueda entender el proyecto, encontrar una actividad lista y tomarla con contexto suficiente, sin depender de la persona que la creó.

### Principios

- El proyecto tiene una memoria; las tareas son el trabajo que se hace con esa memoria.
- El contexto debe estar conectado al proyecto y a la actividad, no disperso en chats.
- Los agentes leen bajo demanda; no reciben todo el proyecto en cada prompt.
- Las reglas para IA son una guía, no un mecanismo de enforcement.
- Los permisos del proyecto se respetan en todas las capas, incluidos los agentes.

## 2. Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 19, Vite 8, TypeScript 5.9, react-router-dom 7, @dnd-kit, i18next |
| Backend | Express 5, TypeScript 6, Prisma 7, PostgreSQL 15 |
| Auth | Google Identity Services + JWT |
| IA | Proveedores configurables; importación de Markdown |
| Agentes | MCP (stdio/HTTP) y plugin nativo de DeepSeek Harness |
| Infra local | Docker Compose |
| Infra productiva | Cloudflare Tunnel o Coolify + PostgreSQL |

## 3. Arquitectura

```text
frontend/ (React SPA)
    │  /api
    ▼
backend/ (Express + Prisma)
    │
    ├── PostgreSQL
    ├── uploads/ (adjuntos de tareas)
    ├── MCP server (stdio / HTTP)
    └── DSH plugin (tools nativas)
```

El backend sirve el frontend compilado en producción. En desarrollo, Vite corre en `5173` y el backend en `5001`.

### Estructura del repositorio

```text
devtasks/
├── backend/     API Express, Prisma, migraciones, seeds
├── frontend/    SPA React, vistas Kanban/Calendario/Lista/Gantt/Documentación
├── mcp-server/  Servidor MCP portable
├── dsh-kanvy/   Plugin nativo de DeepSeek Harness
├── shared/      Contrato de tipos y chequeo de drift
├── samples/     Documentos de ejemplo
└── docker-compose.yml
```

## 4. Cómo ejecutarlo

### Desarrollo local

```powershell
cd devtasks

# PostgreSQL
docker compose up -d postgres

# Backend (terminal 1)
cd backend
copy .env.example .env
# completar JWT_SECRET y GOOGLE_CLIENT_ID
npm install
npx prisma migrate deploy
npm run dev
# http://localhost:5001

# Frontend (terminal 2)
cd frontend
copy .env.example .env
# completar VITE_GOOGLE_CLIENT_ID
npm install
npm run dev
# http://localhost:5173
```

### Todo en Docker

```powershell
cd devtasks
copy .env.docker.example .env.docker
# completar secretos y Google Client ID
docker compose --env-file .env.docker up -d --build
# http://localhost:5001
```

### Health check

```powershell
Invoke-RestMethod http://localhost:5001/api/health
```

Respuesta esperada:

```json
{"status":"ok","database":"up"}
```

## 5. Módulos principales

### Proyectos y tareas

- Proyectos con secciones, miembros, etiquetas y plantillas.
- Tareas con estado, fechas, subtareas, comentarios, dependencias y adjuntos.
- Vistas Kanban, Calendario, Lista y Gantt.
- Actividad por tarea y notificaciones.

### Documentación

Base de conocimiento Markdown por proyecto:

- documentos en PostgreSQL,
- categorías: especificación, requisitos, arquitectura, decisión, guía, runbook y otro,
- subida de `.md` y `.markdown`,
- edición con preview,
- búsqueda por título y contenido,
- documentos anclados para el contexto de IA,
- versionado automático al editar,
- archivado y restauración.

Límites actuales:

- 1 MB por documento,
- 20 archivos por importación,
- 5 documentos anclados por proyecto,
- solo Markdown en esta versión.

### AI Import

Permite convertir un documento Markdown (roadmap, especificaciones) en secciones y tareas usando un proveedor de IA. La importación se confirma antes de aplicar cambios.

### MCP y DSH

Kanvy expone su información a agentes mediante:

- servidor MCP portable (stdio y HTTP),
- plugin nativo de DeepSeek Harness.

Herramientas actuales: **33** en ambos casos.

Lectura de documentación:

- `list_documents`
- `get_document`
- `search_documents`
- `get_project_context`

Recursos MCP:

```text
kanvy://projects/{slug}/documents
kanvy://projects/{slug}/documents/{documentId}
kanvy://projects/{slug}/context
```

## 6. Roles y permisos

| Nivel | Alcance |
|---|---|
| OWNER | Propietario del proyecto |
| FULL | Administra el proyecto, excepto borrarlo |
| EDITOR | Crea y edita tareas, secciones y documentación |
| VIEWER | Solo lectura |

En documentación:

- `VIEWER` puede leer.
- `EDITOR` puede crear y editar.
- `FULL`/`OWNER` pueden archivar y restaurar.
- El acceso es siempre a nivel proyecto; un permiso de sección o tarea no da acceso a toda la documentación.

## 7. Cómo trabajar en este proyecto

### Convenciones

- TypeScript estricto.
- Backend en CommonJS; frontend con ESM.
- Rutas REST en `src/routes/`.
- Lógica de negocio en `src/lib/`.
- Acceso a base de datos solo mediante Prisma.
- Componentes React funcionales con hooks.
- Estilos en CSS, con variables de tema.
- Textos de UI en español e inglés mediante i18n.
- No commitear secretos ni archivos `.env`.

### Antes de cerrar un cambio

```powershell
# Backend
cd devtasks/backend
npx tsc --noEmit
npm test
npm run build

# Frontend
cd devtasks/frontend
npx tsc -b
npm run lint
npm run build

# Contrato compartido
cd devtasks
node shared/check.mjs
```

Si se tocó el schema de Prisma:

```powershell
cd devtasks/backend
npx prisma migrate dev --name <descripcion>
```

### Tests específicos

```powershell
cd devtasks/mcp-server
npm test
npm run test:e2e

cd devtasks/dsh-kanvy
npm test
```

## 8. Despliegue

### Cloudflare Tunnel

La app corre en la PC y Cloudflare publica HTTPS sin abrir puertos. Ver `DEPLOY.md`.

### Coolify

- Aplicación con build pack **Dockerfile**.
- Base Directory: `/devtasks`.
- Dockerfile Location: `/backend/Dockerfile`.
- Puerto expuesto: `5001`.
- PostgreSQL como Database resource.
- Volumen persistente en `/app/backend/uploads`.

Ver `DEPLOY_COOLIFY.md`.

## 9. Estado y roadmap

Implementado:

- Kanban, calendario, lista y Gantt.
- Comentarios, subtareas, dependencias, etiquetas y miembros.
- AI Import.
- MCP con 33 herramientas.
- Plugin DSH con 33 herramientas.
- Documentación Markdown por proyecto.

Backlog aprobado:

- Project Passport: ficha operativa del proyecto.
- Task 360 y Pickup Brief.
- Definition of Ready y vista “Pickable”.
- Búsqueda universal.
- Decision log / ADRs.
- Runbooks y ambientes.
- Integración con Git/PRs.
- Timeline y digest.
- Plantillas y glosario.
- Reglas de IA compartidas.
- Ask Kanvy con fuentes.
- Knowledge Health.
- Conocimiento cross-project.

El diseño completo está en `PROJECT_DOCS_PLAN.md`.

## 10. Enlaces

- Repositorio: https://github.com/manny333/DevTasks
- Plan de conocimiento: `devtasks/PROJECT_DOCS_PLAN.md`
- MCP: `devtasks/mcp-server/README.md`
- Plugin DSH: `devtasks/dsh-kanvy/README.md`
- Despliegue Cloudflare: `devtasks/DEPLOY.md`
- Despliegue Coolify: `devtasks/DEPLOY_COOLIFY.md`

## 11. Nota para agentes

Antes de modificar código:

1. Lee este documento y el `PROJECT_DOCS_PLAN.md`.
2. Consulta la documentación anclada del proyecto con `get_project_context`.
3. Revisa las tareas y dependencias relacionadas.
4. No inventes contexto que no esté en Kanvy, el repositorio o la conversación.
5. Si una regla del proyecto entra en conflicto con una petición explícita del usuario, señálalo y deja que el usuario decida; las reglas son una guía, no un bloqueo.
