# Kanvy — Documentación y memoria del proyecto

> **Estado:** propuesta de diseño, no implementada.
> **Objetivo:** que Kanvy deje de ser solo un tablero y se convierta en la memoria viva del proyecto para personas y agentes.
> **Fecha:** 2026-11-18.

---

## 1. Resumen

Kanvy ya tiene proyectos, tareas, comentarios, etiquetas, dependencias y una integración con agentes vía MCP y plugin de DSH. Lo que falta es un lugar canónico para el **conocimiento del proyecto**: especificaciones, requerimientos, arquitectura, decisiones, runbooks y guías para agentes.

La propuesta es añadir una sección **Documentación** por proyecto:

- Documentos **Markdown** almacenados en PostgreSQL.
- Subida de archivos `.md` y edición dentro de Kanvy.
- Categorías, búsqueda, documentos anclados y versionado.
- Lectura bajo demanda desde MCP/DSH, sin volcar todo el proyecto en cada prompt.
- Integración con AI Import para conservar el documento fuente.

La idea central:

> **El proyecto tiene una memoria; las tareas son el trabajo que se hace con esa memoria.**

---

## 2. Problema y oportunidad

Hoy el contexto de un proyecto queda disperso entre:

- la descripción del proyecto,
- las descripciones y comentarios de las tareas,
- los adjuntos de cada tarea,
- documentos externos (Notion, Google Docs, repositorio, archivos locales),
- el contexto que el agente recibe en cada conversación.

Eso produce tres problemas:

1. **La IA no tiene una fuente estable de verdad.** Cada sesión empieza sin los requerimientos, la arquitectura o las decisiones previas.
2. **El equipo duplica contexto.** Se vuelve a explicar lo mismo en tareas, comentarios y prompts.
3. **Los documentos no están conectados al trabajo.** Una especificación existe, pero no se puede consultar desde Kanvy ni desde un agente.

Kanvy puede resolverlo sin convertirse en un wiki genérico: el valor está en que la documentación esté **dentro del proyecto**, con sus permisos y disponible para la IA.

---

## 3. Principios de diseño

1. **Markdown como formato canónico.** Versionable, legible por humanos y por modelos, sin dependencias propietarias.
2. **El documento vive en la base de datos.** No es un adjunto binario ni un archivo suelto en disco.
3. **Contexto bajo demanda.** La IA lista, busca y lee; no recibe todos los documentos por defecto.
4. **Permisos del proyecto.** Los documentos heredan el acceso del proyecto.
5. **Trazabilidad.** Quién creó, quién editó y qué versión anterior existía.
6. **Empezar simple.** Sin embeddings, PDFs ni edición colaborativa en el MVP.
7. **Una sola fuente de verdad.** Si un documento se sube y luego se edita, Kanvy conserva el historial.

---

## 4. Alcance

### 4.1 MVP

- Modelo `ProjectDocument` y `ProjectDocumentVersion`.
- Subida múltiple de archivos `.md` / `.markdown`.
- Creación y edición con editor + vista previa Markdown.
- Título, slug, categoría y estado anclado.
- Lista, búsqueda por texto, filtros por categoría.
- Vista previa de documento.
- Archivar y restaurar.
- Versiones guardadas automáticamente al editar.
- API con autorización por proyecto.
- Herramientas MCP/DSH de lectura:
  - `list_documents`
  - `get_document`
  - `search_documents`
  - `get_project_context`
- Recursos MCP de índice, documento y contexto.

### 4.2 Fuera del MVP

- PDF, DOCX, imágenes o binarios.
- Edición colaborativa en tiempo real.
- Embeddings o búsqueda semántica.
- Enlaces públicos para compartir documentos.
- Documentos a nivel sección o tarea.
- Comentarios sobre documentos.
- Plantillas de documentos.
- Sincronización con Google Drive/Notion.

### 4.3 Fase 2

- Herramientas de escritura para agentes: `create_document`, `update_document`, `archive_document`.
- Historial de versiones en la UI y restauración.
- Guardar automáticamente el origen de AI Import.
- Búsqueda full-text en PostgreSQL con snippets.
- Enlaces “documento relacionado” en tareas.
- Contexto por tarea o por sección.

### 4.4 Fase 3

- Búsqueda semántica con embeddings si el volumen lo justifica.
- PDF/DOCX con extracción de texto.
- Sugerencias de documentación faltante.
- Contexto automático según la tarea que se está viendo.
- Plantillas y validaciones de documentación.

---

## 5. UX

### 5.1 Ubicación

Añadir una pestaña en la vista de proyecto:

```
[Kanban] [Calendario] [Lista] [Gantt] [Documentación]
```

La pestaña debe ser visible para cualquier miembro con acceso al proyecto. Las acciones de escritura se ocultan según permisos.

### 5.2 Layout

```
┌ Documentación ─────────────────┬ Vista previa ─────────────────┐
│ + Subir MD     + Nuevo         │ # Especificación              │
│ Buscar...                      │                               │
│                                │ Contenido Markdown...         │
│ ★ Contexto base                │                               │
│   Especificación       SPEC    │                               │
│   Requisitos           REQ     │                               │
│   Arquitectura         ARCH    │                               │
│                                │                               │
│ Sin anclar                     │                               │
│   Runbook              RUN     │                               │
│   Decisiones           ADR     │                               │
└────────────────────────────────┴───────────────────────────────┘
```

### 5.3 Lista de documentos

Cada fila muestra:

- título,
- categoría,
- excerpt corto,
- autor,
- fecha de actualización,
- indicador de anclado,
- menú de acciones (editar, archivar, historial).

Filtros:

- búsqueda por texto,
- categoría,
- solo anclados,
- incluir archivados.

### 5.4 Subida

- Drag & drop o selector de archivos.
- Múltiples `.md` a la vez.
- Acepta `.md` y `.markdown`.
- Máximo 1 MB por archivo.
- Título inicial:
  1. primer `# H1` del documento,
  2. nombre del archivo sin extensión,
  3. “Documento sin título”.
- Categoría por defecto: `OTHER`; el usuario puede cambiarla antes o después.
- Si el contenido ya existe en el proyecto (mismo hash), ofrecer omitir o reemplazar.

### 5.5 Editor

- Área de texto Markdown.
- Vista previa en la misma pantalla o en pestaña.
- Guardado explícito y autosave con indicador.
- `Ctrl/Cmd + S` guarda.
- Al guardar, se crea una versión anterior.
- No permitir HTML crudo.

### 5.6 Contexto base

Los documentos anclados forman el **contexto base** del proyecto:

- máximo 5 documentos anclados,
- aparecen primero en la lista,
- `get_project_context` los devuelve,
- el agente puede leerlos sin buscar.

Esto permite tener una especificación, una guía para agentes y un runbook como contexto permanente, sin obligar a la IA a leer todo.

---

## 6. Modelo de datos

### 6.1 Enums

```prisma
enum DocumentCategory {
  SPEC
  REQUIREMENTS
  ARCHITECTURE
  DECISION
  GUIDE
  RUNBOOK
  OTHER
}

enum DocumentSource {
  UPLOAD
  EDITOR
  AI_IMPORT
}
```

### 6.2 Documento

```prisma
model ProjectDocument {
  id          String           @id @default(cuid())
  projectId   String
  project     Project          @relation(fields: [projectId], references: [id], onDelete: Cascade)

  title       String
  slug        String           // estable, único por proyecto
  category    DocumentCategory @default(OTHER)
  content     String           @db.Text
  contentHash String?          // SHA-256 del contenido, para detectar duplicados
  source      DocumentSource   @default(EDITOR)

  isPinned    Boolean          @default(false)
  isArchived  Boolean          @default(false)

  createdById String
  createdBy   User             @relation("DocumentAuthor", fields: [createdById], references: [id])
  updatedById String?
  updatedBy   User?            @relation("DocumentEditor", fields: [updatedById], references: [id])

  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt

  versions    ProjectDocumentVersion[]

  @@unique([projectId, slug])
  @@index([projectId, category])
  @@index([projectId, isPinned])
  @@index([projectId, contentHash])
}
```

### 6.3 Versiones

```prisma
model ProjectDocumentVersion {
  id          String          @id @default(cuid())
  documentId  String
  document    ProjectDocument @relation(fields: [documentId], references: [id], onDelete: Cascade)

  title       String
  category    DocumentCategory
  content     String          @db.Text
  createdById String?
  createdAt   DateTime        @default(now())

  @@index([documentId, createdAt])
}
```

### 6.4 Relaciones adicionales

En `Project`:

```prisma
documents ProjectDocument[]
```

En `User`:

```prisma
documentsCreated ProjectDocument[] @relation("DocumentAuthor")
documentsUpdated ProjectDocument[] @relation("DocumentEditor")
```

### 6.5 Reglas

- `slug` se genera al crear y **no cambia** al editar el título.
- Si hay colisión de slug en el proyecto, añadir sufijo `-2`, `-3`, etc.
- Al actualizar, copiar el contenido anterior a `ProjectDocumentVersion`.
- Retener las últimas 20 versiones por documento.
- Los documentos archivados no aparecen por defecto ni entran en el contexto de IA.
- `contentHash` permite detectar duplicados sin comparar todo el texto.

---

## 7. API

Todas las rutas exigen acceso al proyecto.

### 7.1 Documentos

```http
GET    /api/projects/:projectId/documents
POST   /api/projects/:projectId/documents
POST   /api/projects/:projectId/documents/import
GET    /api/projects/:projectId/documents/:documentId
PATCH  /api/projects/:projectId/documents/:documentId
POST   /api/projects/:projectId/documents/:documentId/archive
GET    /api/projects/:projectId/documents/:documentId/versions
POST   /api/projects/:projectId/documents/:documentId/versions/:versionId/restore
```

### 7.2 Lista

`GET /documents` devuelve **metadatos**, no el contenido completo:

```json
[
  {
    "id": "doc_123",
    "title": "Especificación de autenticación",
    "slug": "especificacion-de-autenticacion",
    "category": "SPEC",
    "isPinned": true,
    "updatedAt": "2026-11-18T17:00:00.000Z",
    "author": { "id": "u1", "name": "Emmanuel" },
    "excerpt": "La autenticación usa Google Identity Services..."
  }
]
```

Parámetros:

- `q`: búsqueda por texto.
- `category`: filtro.
- `pinned`: solo anclados.
- `includeArchived`: incluir archivados.

### 7.3 Detalle

`GET /documents/:id` devuelve el documento con `content`, metadatos y autor.

### 7.4 Importación

`POST /documents/import` acepta `multipart/form-data`:

- `files[]`: uno o varios `.md`.
- `category?`: categoría común.
- `pinned?`: anclar los importados.

Validaciones:

- extensión `.md` / `.markdown`,
- contenido UTF-8,
- tamaño máximo 1 MB,
- máximo 20 archivos por importación,
- rechazo de binarios.

### 7.5 Contexto

`GET /api/projects/:projectId/context` devuelve:

- descripción del proyecto,
- documentos anclados con contenido,
- límite de 20k caracteres,
- indicador de truncado.

---

## 8. Permisos

Se reutiliza el sistema actual de acceso por proyecto (`OWNER > FULL > EDITOR > VIEWER`).

| Acción | VIEWER | EDITOR | FULL | OWNER |
|---|---:|---:|---:|---:|
| Ver documentos y versiones | ✅ | ✅ | ✅ | ✅ |
| Crear/editar | ❌ | ✅ | ✅ | ✅ |
| Anclar/desanclar | ❌ | ✅ | ✅ | ✅ |
| Archivar/restaurar | ❌ | ❌ | ✅ | ✅ |
| Borrar definitivamente | ❌ | ❌ | ❌ | ✅ |
| Restaurar una versión | ❌ | ❌ | ✅ | ✅ |

Notas:

- La lectura de documentos requiere al menos `VIEWER`.
- La escritura requiere `EDITOR`.
- Las acciones destructivas requieren `FULL` u `OWNER`.
- Los documentos no se comparten por URL pública.

---

## 9. Integración con IA

### 9.1 Herramientas nuevas

Con 29 herramientas actuales, la propuesta añade **7**, para un total de **36**.

#### Lectura

| Herramienta | Descripción |
|---|---|
| `list_documents` | Metadatos, excerpt y filtros por proyecto/categoría/búsqueda |
| `get_document` | Contenido paginado con `offset` y `maxChars` |
| `search_documents` | Snippets relevantes, no documentos completos |
| `get_project_context` | Contexto base: descripción + documentos anclados |

#### Escritura

| Herramienta | Descripción |
|---|---|
| `create_document` | Crear un documento Markdown |
| `update_document` | Editar título, categoría, contenido o anclado |
| `archive_document` | Archivar o restaurar |

En el plugin DSH se registran con prefijo `kanvy_`:

- `kanvy_list_documents`
- `kanvy_get_document`
- `kanvy_search_documents`
- `kanvy_get_project_context`
- `kanvy_create_document`
- `kanvy_update_document`
- `kanvy_archive_document`

### 9.2 Recursos MCP

```
kanvy://projects/{slug}/documents
kanvy://projects/{slug}/documents/{docSlug}
kanvy://projects/{slug}/context
```

- El índice no incluye contenido completo.
- El documento individual devuelve Markdown.
- El contexto devuelve solo anclados, con límite de tamaño.

### 9.3 Estrategia de contexto

El agente no debe recibir todos los documentos en cada llamada.

Flujo recomendado:

1. `get_project_context(projectSlug)` al empezar.
2. Si necesita más detalle, `search_documents`.
3. Luego `get_document` del documento relevante.
4. Solo entonces lee secciones largas con `offset`/`maxChars`.

Reglas:

- `get_project_context` máximo 20k caracteres.
- `list_documents` excerpt máximo 300 caracteres.
- `search_documents` snippet máximo 500 caracteres.
- `get_document` devuelve como máximo 12k caracteres por llamada.
- Si se trunca, indicar `truncated: true` y `nextOffset`.

### 9.4 Por qué no embeddings todavía

Con menos de ~100 documentos por proyecto, una búsqueda textual + títulos + categorías suele ser suficiente. Los embeddings añaden:

- costo de generación,
- almacenamiento vectorial,
- complejidad de sincronización,
- resultados difíciles de explicar.

Se pueden añadir en Fase 3 si la búsqueda textual deja de ser suficiente.

---

## 10. Búsqueda y versionado

### 10.1 Búsqueda MVP

- `ILIKE` sobre `title` y `content`, sin distinguir mayúsculas.
- Búsqueda en servidor para no traer todos los documentos.
- Excerpt generado alrededor de la coincidencia.
- Límite de 50 resultados.

### 10.2 Búsqueda full-text (Fase 2)

- Índice GIN sobre `to_tsvector('simple', title || ' ' || content)`.
- `websearch_to_tsquery('simple', $query)`.
- `ts_headline` para snippets.
- Configuración `simple` para no depender del idioma del documento.

### 10.3 Versionado

- Cada `PATCH` guarda la versión anterior.
- Retención: 20 versiones por documento.
- Restauración: copia la versión elegida al documento actual y genera una nueva versión.
- La UI de historial puede llegar después; el dato se guarda desde el MVP.

---

## 11. Integración con AI Import

Cuando un usuario importe un roadmap o especificación con AI Import:

1. Se genera el plan y las tareas como hoy.
2. Se guarda el Markdown original como `ProjectDocument`.
3. `source = AI_IMPORT`.
4. Categoría sugerida: `SPEC` o `OTHER`.
5. Título: nombre del archivo o primer H1.
6. Si ya existe un documento con el mismo `contentHash`, no duplicar.

Beneficios:

- trazabilidad entre documento y tareas creadas,
- contexto futuro para agentes,
- una sola carga del documento,
- posibilidad de volver a importar o comparar versiones.

---

## 12. Seguridad

- **Autorización:** siempre resolver acceso al proyecto antes de leer o escribir.
- **Validación:** extensión, UTF-8, tamaño y número de archivos.
- **Markdown:** `react-markdown` escapa HTML por defecto; no habilitar HTML crudo.
- **Secretos:** advertir que los documentos son visibles para todos los `VIEWER` del proyecto.
- **Rate limit:** importación y edición.
- **Sin URLs públicas:** el contenido se sirve solo por API autenticada.
- **Auditoría:** guardar autor y versiones; opcionalmente registrar eventos de documento.
- **Borrado:** preferir archivar; el borrado definitivo solo para `OWNER`.

---

## 13. Fases de implementación

### Fase 1 — MVP

**Backend**

- Enums, modelos, migración.
- Rutas CRUD, importación, archivo, versiones y contexto.
- Autorización y validaciones.
- Tests de permisos, límites, slugs y versiones.

**Frontend**

- Pestaña Documentación.
- Lista, búsqueda, filtros y preview.
- Subida múltiple.
- Editor Markdown con preview.
- Anclar, archivar y restaurar.
- Estado vacío y estados de carga/error.

**IA**

- `list_documents`, `get_document`, `search_documents`, `get_project_context` en MCP.
- Recursos de índice, documento y contexto.
- Mismas herramientas de lectura en el plugin DSH.

**Estimación orientativa:** 1–2 semanas de trabajo enfocado.

### Fase 2

- Escritura desde agentes.
- Historial visual de versiones.
- Full-text search con snippets.
- Guardado automático del origen de AI Import.
- Enlaces documento–tarea.

### Fase 3

- Embeddings/búsqueda semántica.
- PDF/DOCX.
- Contexto automático por tarea.
- Sugerencias de documentación faltante.

---

## 14. Criterios de aceptación del MVP

- [ ] Se puede subir uno o varios `.md` y aparecen en el proyecto.
- [ ] Se puede crear y editar un documento con preview.
- [ ] El slug es único por proyecto y estable.
- [ ] Se puede buscar por título y contenido.
- [ ] Se puede anclar un documento y aparece en el contexto base.
- [ ] `get_project_context` devuelve descripción + anclados.
- [ ] `get_document` pagina contenido largo.
- [ ] Un `VIEWER` no puede editar; un `EDITOR` sí.
- [ ] Al editar se guarda la versión anterior.
- [ ] Archivar oculta el documento de la lista y del contexto.
- [ ] Los documentos no se sirven por URL pública.
- [ ] Tests de backend, MCP y plugin en verde.

---

## 15. Riesgos y decisiones abiertas

### Riesgos

| Riesgo | Mitigación |
|---|---|
| Documentos enormes que consumen tokens | `maxChars`, `offset`, contexto solo de anclados |
| Documentación desactualizada | Fecha visible, versiones, revisión periódica |
| Duplicados | `contentHash`, aviso al importar |
| Información sensible | Permisos de proyecto y advertencia explícita |
| Búsqueda pobre en español/inglés | Empezar con `ILIKE`; luego FTS `simple` |
| Crecimiento de la tabla de versiones | Retener 20 por documento |

### Decisiones abiertas

1. ¿Solo Markdown o también `.txt` en el MVP?
   - Recomendación: solo `.md` / `.markdown`.
2. ¿Edición dentro de Kanvy o solo subida?
   - Recomendación: ambas.
3. ¿La IA puede escribir documentos en el MVP?
   - Recomendación: solo lectura en Fase 1; escritura en Fase 2.
4. ¿Los documentos se enlazan a tareas desde el inicio?
   - Recomendación: no; Fase 2.
5. ¿Nombre de la sección: “Documentación” o “Contexto”?
   - Recomendación: **Documentación** para la UI; **Contexto** para la lectura de IA.
6. ¿PDF/DOCX?
   - Recomendación: fuera del MVP.

---

## 16. Recomendación final

Implementar la sección **Documentación** como una base de conocimiento Markdown por proyecto, con:

- contenido en PostgreSQL,
- subida y edición,
- categorías y documentos anclados,
- versionado desde el inicio,
- lectura bajo demanda para MCP/DSH,
- contexto base limitado a los anclados.

Es un cambio acotado que multiplica el valor de Kanvy como herramienta de trabajo con agentes, sin convertirlo en un wiki genérico ni añadir infraestructura innecesaria.

---

## 17. Reglas de IA compartidas (backlog aprobado)

> **Estado:** propuesta futura. **No forma parte del MVP de Documentación** y no se implementa todavía. Se implementará cuando se solicite.
>
> **Idea:** que cada proyecto tenga un documento canónico de reglas para la IA, compartido por todos los developers, para que los agentes trabajen con la misma base de criterios.
>
> **Naturaleza:** son reglas de **guía**, no de enforcement. El usuario que ejecuta el agente puede pedirle explícitamente que se salte una regla; es su decisión. Kanvy no bloquea la ejecución ni audita el cumplimiento en esta fase.

### 17.1 Concepto

Un único documento **Reglas de IA** por proyecto:

- Markdown,
- versionado,
- con borrador y versión publicada,
- editable solo por `FULL`/`OWNER`,
- legible por todos los miembros,
- disponible para MCP/DSH y para los archivos de instrucciones del workspace.

Ejemplos de contenido:

- cómo manejar Git (ramas, PRs, commits),
- convenciones de código,
- pruebas obligatorias,
- manejo de secretos,
- definición de terminado,
- límites de alcance para agentes.

La regla “nada directo a main” es solo un ejemplo. El agente la toma como base; si el usuario pide una excepción, puede aceptarla y continuar.

### 17.2 Dos capas

#### Capa A — Reglas canónicas en Kanvy

La fuente de verdad. Se edita en la UI y se publica.

#### Capa B — Sincronización al workspace

Un comando escribe las reglas publicadas en los archivos que cada cliente lee al iniciar:

- `CLAUDE.md` para Claude Code,
- `AGENTS.md` para Codex y agentes compatibles,
- `.cursor/rules/kanvy.mdc` para Cursor,
- `.github/copilot-instructions.md` para Copilot,
- opcionalmente `.windsurf/rules/kanvy.md`.

Así el agente las detecta sin depender de que decida llamar a una tool.

### 17.3 Por qué no basta con MCP

MCP es un modelo **pull**: expone herramientas y recursos, pero el cliente decide si los lee. No inyecta un system prompt por sí solo.

Por eso el diseño combina:

1. **Kanvy** como fuente de verdad.
2. **CLI de sincronización** para el workspace.
3. **MCP/DSH** para consultar las reglas en vivo.

### 17.4 Modelo propuesto

No es un `ProjectDocument` normal: es un objeto único por proyecto, con publicación y versiones.

```prisma
model ProjectAiRules {
  id               String   @id @default(cuid())
  projectId        String   @unique
  project          Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  draftContent     String   @db.Text
  publishedContent String?  @db.Text
  version          Int      @default(0)

  publishedAt      DateTime?
  publishedById    String?
  publishedBy      User?    @relation("RulesPublisher", fields: [publishedById], references: [id])

  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  versions         ProjectAiRulesVersion[]
}

model ProjectAiRulesVersion {
  id            String          @id @default(cuid())
  rulesId       String
  rules         ProjectAiRules  @relation(fields: [rulesId], references: [id], onDelete: Cascade)

  version       Int
  content       String          @db.Text
  changeNote    String?
  publishedById String?
  publishedAt   DateTime        @default(now())

  @@unique([rulesId, version])
  @@index([rulesId, publishedAt])
}
```

Reglas:

- Solo hay un `ProjectAiRules` por proyecto.
- Los agentes leen `publishedContent`, nunca el borrador.
- Cada publicación incrementa `version` y crea una fila en `ProjectAiRulesVersion`.
- Se conservan todas las versiones (el documento es pequeño) o las últimas 20.
- `Project` añade `aiRules ProjectAiRules?`.
- `User` añade `publishedRules ProjectAiRules[] @relation("RulesPublisher")`.

### 17.5 API

```http
GET  /api/projects/:projectId/ai-rules
GET  /api/projects/:projectId/ai-rules/draft
PUT  /api/projects/:projectId/ai-rules/draft
POST /api/projects/:projectId/ai-rules/publish
GET  /api/projects/:projectId/ai-rules/versions
POST /api/projects/:projectId/ai-rules/versions/:version/restore
```

- `GET /ai-rules`: devuelve la versión publicada (para cualquier miembro).
- `GET /draft`: solo `FULL`/`OWNER`.
- `PUT /draft`: solo `FULL`/`OWNER`.
- `POST /publish`: copia el borrador a publicado, incrementa versión y guarda `changeNote`.
- `restore`: crea una nueva publicación a partir de una versión anterior.

### 17.6 UX

Tarjeta fija al inicio de **Documentación**:

```
┌ Reglas de IA ──────────────────────────────┐
│ Publicadas · versión 4 · hace 2 días        │
│ "Nada directo a main; todo por PR."          │
│ [Ver] [Editar borrador] [Historial]          │
└─────────────────────────────────────────────┘
```

Editor:

```
[ Borrador ] [ Publicada ] [ Diferencias ]

# Reglas de IA — Proyecto X

## Git
- Ningún commit directo a main.
- Todo cambio va por pull request.
...

[ Publicar cambios ]
```

Detalles:

- `Publicar` pide una nota breve: “Qué cambió y por qué”.
- Solo `FULL`/`OWNER` publica.
- Notificación al equipo al publicar.
- Se muestra versión, autor y fecha.
- Botón **“Copiar comando de sincronización”**:
  ```bash
  kanvy rules pull
  ```

### 17.7 Contenido recomendado

Máximo ~8.000 caracteres, con reglas verificables y lenguaje claro:

```md
# Reglas de IA — Proyecto Kanvy

## Git
- MUST: ningún commit directo a main.
- MUST: todo cambio va por pull request.
- MUST: una rama por tarea; nombre `feat/<task-id>-<slug>`.
- SHOULD: commits pequeños y descriptivos.

## Código
- MUST: TypeScript estricto.
- MUST: no introducir `any` sin justificación.
- SHOULD: reutilizar los patrones existentes.

## Pruebas
- MUST: todo cambio de backend pasa `npm test`.
- MUST: todo cambio de frontend pasa lint + build.

## Seguridad
- MUST: no commitear secretos.
- MUST: no exponer tokens en logs.

## Entrega
- MUST: actualizar la documentación afectada.
```

`MUST` / `SHOULD` / `MAY` ayudan a distinguir obligación de preferencia, aunque el usuario siempre puede pedir una excepción.

### 17.8 Sincronización al workspace

Comando propuesto:

```bash
kanvy rules pull              # sincroniza
kanvy rules diff              # muestra diferencias
kanvy rules check --strict    # falla si el workspace está desactualizado
```

Configuración del repo:

```json
{
  "apiUrl": "https://kanvy.example.com/api",
  "project": "mi-proyecto"
}
```

Archivo: `.kanvy/config.json`. Sin token; el token va por variable de entorno o archivo local.

Escritura:

- Bloque gestionado dentro de `CLAUDE.md` / `AGENTS.md` / `copilot-instructions.md`, sin pisar instrucciones propias:
  ```md
  <!-- KANVY_RULES_START v4 2026-11-18 -->
  # Reglas de IA — Proyecto Kanvy
  ...
  <!-- KANVY_RULES_END -->
  ```
- Archivo dedicado para Cursor: `.cursor/rules/kanvy.mdc`.
- Copia canónica: `.kanvy/rules.md`.

`rules check --strict` puede usarse en CI o en un pre-commit hook.

### 17.9 Integración con MCP y DSH

Herramienta de lectura:

```text
get_project_rules(projectSlug)
```

Devuelve:

- contenido publicado,
- versión,
- fecha,
- hash.

Recurso:

```text
kanvy://projects/{slug}/rules
```

En el plugin DSH:

- `kanvy_get_project_rules`.
- Si el SDK permite inyectar una sección de system prompt, cargar automáticamente las reglas del proyecto activo.
- Si no, dejar una instrucción clara: “antes de modificar código, consulta las reglas del proyecto”.

No exponer `update_project_rules` a los agentes en el MVP. Las reglas las cambian personas; si más adelante un agente propone cambios, que sean borradores sujetos a aprobación humana.

### 17.10 Permisos y gobernanza

| Acción | VIEWER | EDITOR | FULL | OWNER |
|---|---:|---:|---:|---:|
| Ver reglas publicadas | ✅ | ✅ | ✅ | ✅ |
| Ver borrador | ❌ | ❌ | ✅ | ✅ |
| Editar borrador | ❌ | ❌ | ✅ | ✅ |
| Publicar | ❌ | ❌ | ✅ | ✅ |
| Restaurar versión | ❌ | ❌ | ✅ | ✅ |

- `EDITOR` puede leer y aplicar, pero no cambiar las reglas.
- `FULL`/`OWNER` editan y publican.
- Notificación al equipo al publicar.
- Historial con diff y nota de cambio.
- Las reglas no se borran; se reemplazan por una nueva versión publicada.

### 17.11 Precedencia y override

El diseño asume que las reglas son una **base**, no una jaula:

1. Seguridad e instrucciones del sistema.
2. Petición explícita del usuario.
3. Reglas publicadas de Kanvy.
4. Instrucciones específicas del repo.
5. Preferencias por defecto del agente.

Si el usuario pide algo que contradice una regla, el agente puede:

- señalar brevemente la regla,
- aceptar la excepción si el usuario insiste,
- continuar.

No hay bloqueo ni auditoría de excepciones en esta fase. Si más adelante se quiere, se puede añadir un registro opcional de overrides, pero no es parte del MVP.

### 17.12 Enforcement (opcional, fuera de Kanvy)

Las reglas de IA no sustituyen los controles técnicos. Para reglas críticas como “nada directo a main” se recomienda, aparte:

- branch protection,
- PR obligatorio,
- revisión obligatoria,
- CI obligatorio,
- pre-commit hooks,
- prohibición de force-push.

Kanvy puede documentar y sincronizar la regla, pero no debe prometer que la IA “obligará” a cumplirla. El usuario puede pedir una excepción y es su decisión.

### 17.13 Fases de implementación

#### Fase A — Backend y UI

- Modelo `ProjectAiRules` y versiones.
- API de borrador/publicación/historial.
- Tarjeta y editor en Documentación.
- Permisos y notificación.
- Tests de publicación, versiones y autorización.

#### Fase B — Distribución

- CLI `kanvy rules pull/diff/check`.
- `.kanvy/config.json`.
- Adaptadores para Claude Code, Codex, Cursor y Copilot.
- `get_project_rules` en MCP.
- `kanvy_get_project_rules` en DSH.

#### Fase C — Automatización

- Inyección automática en DSH si el SDK lo permite.
- GitHub Action que abra PR cuando cambien las reglas.
- Reglas por scope (`backend`, `frontend`, `infra`).
- Aprobación por segundo owner.
- Registro opcional de overrides.

### 17.14 Criterios de aceptación

- [ ] Hay un solo documento de reglas por proyecto.
- [ ] Los agentes solo leen la versión publicada.
- [ ] El borrador no es visible para `VIEWER`.
- [ ] Publicar incrementa la versión y guarda una nota.
- [ ] Se puede ver el historial y restaurar una versión.
- [ ] `get_project_rules` devuelve versión y contenido publicado.
- [ ] `kanvy rules pull` escribe archivos para los clientes configurados sin pisar contenido propio.
- [ ] `kanvy rules check --strict` falla si el workspace está desactualizado.
- [ ] Un usuario puede pedir una excepción y el agente puede aceptarla.

### 17.15 Decisiones abiertas

1. ¿Un solo documento por proyecto o varios por scope?
   - Recomendación: uno por proyecto en la primera versión; scopes en Fase C.
2. ¿Quién publica?
   - Recomendación: `FULL`/`OWNER`.
3. ¿Clientes objetivo?
   - Recomendación: Claude Code, Codex, Cursor, Copilot y DSH.
4. ¿Sincronización manual o automática?
   - Recomendación: manual con `kanvy rules pull`; CI con `check --strict`; automatización después.
5. ¿Registro de overrides?
   - Recomendación: no en la primera versión; opcional en Fase C.

### 17.16 Recomendación

Implementar **Reglas de IA** como una capacidad posterior a Documentación, compartiendo editor, versionado y permisos, pero con un modelo y una UX propios.

La combinación que mejor cumple el objetivo es:

> **Kanvy guarda las reglas una vez; el CLI las lleva al workspace de cada developer; los agentes las leen al empezar; y el usuario conserva la libertad de pedir excepciones.**

No se implementa todavía: queda en el backlog aprobado para cuando se solicite.

---

## 18. Sistema centralizado de conocimiento del proyecto (backlog)

> **Estado:** propuesta futura. No forma parte del MVP de Documentación ni de Reglas de IA. Se implementará cuando se solicite.
>
> **Norte:** que un developer nuevo pueda entrar a Kanvy, entender el proyecto, encontrar una tarea lista y tomarla sin hacer una sola pregunta por Slack.

Este apartado no propone convertir Kanvy en un wiki genérico ni en un clon de Jira. Propone que el conocimiento esté **conectado al proyecto y a la actividad**, para que cualquier persona pueda tomar cualquier tarea con contexto suficiente.

### 18.1 Los seis momentos

| Momento | Pregunta del developer | Funcionalidades |
|---|---|---|
| Entender | ¿Qué es este proyecto y cómo está organizado? | Ficha del proyecto, documentos, decisiones |
| Correr | ¿Cómo lo levanto y lo pruebo? | Runbooks, ambientes, comandos |
| Elegir | ¿Qué puedo tomar ahora? | Definition of Ready, vista “Pickable” |
| Ejecutar | ¿Qué hay que hacer y por qué? | Task 360, criterios de aceptación, contexto vinculado |
| Cerrar | ¿Cuándo está terminado? | Criterios de aceptación, Definition of Done |
| Ponerse al día | ¿Qué cambió mientras no estaba? | Timeline del proyecto, digest, búsqueda |

### 18.2 P0 — Ficha del proyecto (“Project Passport”)

Una vista **Overview** del proyecto, curada, que sea el punto de entrada para personas y agentes:

- qué es el proyecto y para quién,
- stack y repositorio,
- cómo instalar, correr, probar y desplegar,
- ambientes local/staging/producción,
- arquitectura de alto nivel,
- documentos y decisiones clave,
- owners y contactos,
- prioridades y riesgos actuales,
- checklist “Empezar aquí”.

No es un documento más: es la **portada operativa** del proyecto.

Modelo mínimo sugerido:

```prisma
model ProjectProfile {
  id              String  @id @default(cuid())
  projectId       String  @unique
  project         Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  purpose         String? @db.Text
  repoUrl         String?
  defaultBranch   String?
  stack           String?
  setupCommands   String? @db.Text
  runCommands     String? @db.Text
  testCommands    String? @db.Text
  deployUrl       String?
  stagingUrl      String?
  owners          String? @db.Text
  onCall          String? @db.Text

  updatedAt       DateTime @updatedAt
}
```

La ficha puede combinar campos estructurados con documentos enlazados. No debe duplicar el README del repo: debe enlazarlo y resumir lo esencial.

Exposición para agentes:

```text
kanvy://projects/{slug}/passport
get_project_passport(projectSlug)
```

### 18.3 P0 — Task 360 y “Pickup Brief”

Una tarea debe dejar de ser “título + descripción”. Campos recomendados:

- **Por qué** existe la tarea.
- **Criterios de aceptación** separados de la descripción.
- **Fuera de alcance**.
- **Notas técnicas**.
- **Documentos y decisiones relacionadas**.
- **Dependencias y bloqueos**.
- **Repositorio, rama y PR**.
- **Actividad reciente**.
- **Preguntas abiertas**.

El botón **“Tomar tarea”** genera un **Pickup Brief**:

```md
# Contexto para tomar esta tarea

## Qué hay que lograr
...

## Criterios de aceptación
- [ ] ...

## Documentos relevantes
- Especificación...
- Decisión...

## Dependencias
- ...

## Últimos cambios
- ...

## Preguntas abiertas
- ...
```

En MCP/DSH:

```text
get_task_context(taskId)
```

Devuelve tarea + documentos + decisiones + dependencias + actividad + criterios.

El brief puede mostrarse en un modal y guardarse opcionalmente como comentario; no debería generar ruido automáticamente en todas las tareas.

### 18.4 P0 — Definition of Ready y vista “Pickable”

Checklist configurable por proyecto:

- problema/contexto,
- criterios de aceptación,
- documentación vinculada,
- dependencias resueltas,
- ambiente/repositorio identificado,
- estimación o tamaño,
- preguntas abiertas resueltas.

Badges:

- `READY`
- `NEEDS_CONTEXT`
- `BLOCKED`

Vista:

> **Listas para tomar**: sin asignar, listas y sin bloqueos.

No debe bloquear la creación de tareas; solo hacer visible la diferencia entre una tarea y una idea. El objetivo es que tomar una tarea sea una decisión informada, no una apuesta.

### 18.5 P0 — Búsqueda universal

Extender la búsqueda actual a:

- documentos,
- comentarios,
- decisiones,
- personas,
- etiquetas,
- PRs y ramas,
- actividad.

Con filtros y una **command palette** (`Ctrl/Cmd + K`) para saltar a cualquier resultado.

Si el conocimiento no se puede encontrar, no existe.

### 18.6 P1 — Decision Log / ADRs

Las especificaciones dicen **qué**; las decisiones dicen **por qué**.

Cada decisión debería tener:

- estado: propuesta, aceptada, reemplazada,
- fecha,
- personas que decidieron,
- decisión anterior que reemplaza,
- tareas y documentos vinculados.

Preguntas que debe responder:

- “¿Por qué elegimos PostgreSQL?”
- “¿Por qué no usamos X?”
- “¿Qué reemplazó esta decisión?”

Puede empezar como un documento con categoría `DECISION` y metadatos; si crece, un modelo `ProjectDecision` con relaciones a tareas y documentos.

### 18.7 P1 — Runbooks y ambientes

Documentos operativos:

- cómo levantar el entorno,
- cómo correr migraciones,
- cómo desplegar,
- cómo hacer rollback,
- qué hacer si falla X,
- a quién avisar.

Con:

- último momento en que se verificó,
- owner,
- enlaces a dashboards.

No guardar secretos: solo el procedimiento y dónde obtenerlos.

### 18.8 P1 — Integración con Git/PRs

MVP:

- vincular una tarea a una rama y un PR,
- mostrar estado del PR y checks,
- ver commits y archivos tocados,
- mover la tarea a `IN_REVIEW`/`DONE` cuando corresponda.

Después:

- GitHub App/webhooks,
- reglas de naming de ramas,
- revisores sugeridos,
- vínculo automático por `KANVY-123` en el commit.

Sin integración, al menos permitir pegar manualmente `repoUrl`, `branch` y `prUrl` en la tarea.

### 18.9 P1 — Timeline del proyecto y digest

Actividad a nivel proyecto:

- tareas creadas/movidas,
- documentos publicados,
- decisiones aceptadas,
- miembros agregados,
- PRs mergeados.

Vista:

> “Qué cambió desde tu última visita”

Más un digest semanal por email/Slack.

### 18.10 P1 — Plantillas de tareas y documentos

Plantillas por tipo:

- Feature,
- Bug,
- Spike,
- Incidente,
- Deuda técnica,
- Decisión,
- Runbook.

Cada plantilla trae los campos de contexto necesarios. Así la información se captura **al crear**, no después.

También plantillas de documentos: especificación, ADR, runbook, postmortem.

### 18.11 P1 — Glosario del dominio

Términos, siglas y conceptos del negocio:

- “¿Qué es un ‘slot’?”
- “¿Qué diferencia hay entre ‘cliente’ y ‘cuenta’?”

Con enlaces desde documentos y tareas, y disponible para la IA.

Modelo mínimo:

```prisma
model GlossaryTerm {
  id          String   @id @default(cuid())
  projectId   String
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  term        String
  definition  String   @db.Text
  aliases     String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([projectId, term])
}
```

En equipos con lenguaje de dominio propio, esto ahorra muchísimo tiempo.

### 18.12 P2 — “Ask Kanvy” con citas

Un chat sobre el conocimiento del proyecto:

- “¿Cómo se despliega?”
- “¿Qué decidimos sobre autenticación?”
- “¿Qué tareas están bloqueadas por el servicio X?”

Reglas:

- responder solo con fuentes de Kanvy,
- citar documento/tarea/decisión,
- decir “no encontré información” si no hay fuente,
- respetar permisos.

No implementar antes de tener documentos, decisiones y búsqueda funcionando bien.

### 18.13 P2 — Knowledge Health

Dashboard de salud del conocimiento:

- documentos sin revisar en X meses,
- tareas sin criterios de aceptación,
- documentos huérfanos,
- áreas con un solo contribuyente,
- tareas bloqueadas hace mucho,
- documentación sin owner.

No para vigilar personas, sino para detectar **dónde el conocimiento está frágil**.

### 18.14 P2 — Cross-project knowledge

Cuando el equipo tenga varios proyectos:

- búsqueda global,
- documentos compartidos,
- glosario común,
- plantillas compartidas,
- dependencias entre proyectos,
- vista de portafolio.

### 18.15 Roadmap recomendado

| Fase | Funcionalidades |
|---|---|
| 1 | Documentación (sección 1–16) + Project Passport |
| 2 | Task 360, Pickup Brief, Definition of Ready, “Pickable”, búsqueda universal |
| 3 | Decision log, runbooks, Git/PR links, timeline/digest |
| 4 | Plantillas, glosario, AI rules (sección 17) |
| 5 | Ask Kanvy, Knowledge Health, cross-project, integraciones |

Dependencias:

- Documentación es la base para Passport, decisiones, runbooks y glosario.
- Task 360 puede empezar sin Git; los links enriquecen después.
- Ask Kanvy depende de documentos + búsqueda + decisiones.
- Knowledge Health depende de que existan owners/fechas de revisión.

### 18.16 Qué evitar

- Convertir Kanvy en un wiki genérico: el valor está en la conexión con proyectos y tareas.
- Duplicar la fuente de verdad: si ya está en el repo o en Git, enlazarlo, no copiarlo.
- Asignar automáticamente todas las tareas: “cualquiera puede tomarla” no significa “cualquiera está obligado”.
- Obligar a llenar veinte campos: mejor un readiness score visible que un formulario que nadie completa.
- Hacer que la IA responda sin citas: una respuesta sin fuente es peor que “no sé”.
- Construir todo a la vez: primero contexto, después descubrimiento, después automatización.

### 18.17 Criterios de aceptación

- [ ] Existe una ficha de proyecto con stack, repo, comandos, ambientes y owners.
- [ ] Un agente puede obtener la ficha por MCP.
- [ ] Una tarea muestra criterios de aceptación y contexto vinculado.
- [ ] “Tomar tarea” genera un Pickup Brief con documentos y dependencias.
- [ ] Existe una vista “Listas para tomar” con readiness y bloqueos.
- [ ] La búsqueda cubre tareas, documentos, comentarios y decisiones.
- [ ] Las decisiones se pueden registrar y consultar.
- [ ] Un PR se puede vincular a una tarea y reflejar su estado.
- [ ] Existe una vista “qué cambió desde tu última visita”.
- [ ] Un developer nuevo puede tomar una tarea sin preguntar por Slack.

### 18.18 Decisiones abiertas

1. ¿La ficha del proyecto es editable o se genera desde documentos?
   - Recomendación: campos estructurados + enlaces; edición manual.
2. ¿Los criterios de aceptación son un campo Markdown o un checklist?
   - Recomendación: checklist con texto; más fácil de marcar y mostrar.
3. ¿Git se integra desde el inicio?
   - Recomendación: links manuales en Fase 1; GitHub App después.
4. ¿Definition of Ready bloquea el movimiento?
   - Recomendación: no; solo muestra readiness y advierte.
5. ¿Ask Kanvy usa embeddings?
   - Recomendación: primero búsqueda textual con citas; embeddings solo si hace falta.

### 18.19 Recomendación

Después de Documentación, el orden sería:

1. **Project Passport** — la portada que explica el proyecto.
2. **Task 360 + Pickup Brief** — el contexto para tomar una tarea.
3. **Definition of Ready + vista “Pickable”** — saber qué se puede tomar.
4. **Búsqueda universal** — encontrar todo.
5. **Decision log + runbooks** — capturar el porqué y el cómo.
6. **Git/PR links + timeline** — conectar con la realidad del código.
7. **Plantillas + glosario** — capturar mejor desde el inicio.
8. **Ask Kanvy + knowledge health** — cuando ya hay conocimiento que valga la pena consultar.

La métrica de éxito:

> Un developer nuevo entra a Kanvy, entiende el proyecto, encuentra una tarea lista y la toma sin hacer una sola pregunta por Slack.

No se implementa todavía: queda en el backlog aprobado para cuando se solicite.


