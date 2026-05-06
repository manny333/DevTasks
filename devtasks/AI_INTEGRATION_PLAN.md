# Plan: Integración IA en Kanvy

## Resumen

Integrar inteligencia artificial en Kanvy para permitir importar proyectos completos desde archivos Markdown. La IA analiza el contenido, genera secciones, tareas, subtareas, tags y asigna miembros automáticamente. Compatible con cualquier proveedor de modelos (DeepSeek, OpenAI, Anthropic, etc.) mediante una capa de abstracción.

---

## Arquitectura General

```
Frontend                              Backend                         AI Provider
─────────                             ───────                         ───────────
AIImportModal ──POST /ai/preview──→  parse MD ──chat(system+MD)──→  DeepSeek V4
    │                                 receive JSON ←────────────────  (o OpenAI, etc.)
    │  ←── preview JSON ──────────→  validate schema
    │                                 enrich with project context
    ▼
Preview (editable checkboxes)
    │
    └──POST /ai/apply──→  create sections, tasks, tags, assignees in DB
```

---

## Decisiones de Diseño

| Decisión | Elección |
|---|---|
| Formato MD | Libre (README, specs, requirements, cualquier markdown) |
| Modelo | Configurable por petición (dropdown en UI) |
| Ubicación UI | Ambos: crear proyecto desde MD + importar tareas a proyecto existente |
| Streaming | Batch (respuesta completa → preview → confirmar) |

---

## 1. Backend — Capa de Abstracción de IA

### `src/lib/ai/types.ts`

```typescript
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json_object';
}

interface ChatResponse {
  content: string;
  usage?: { promptTokens: number; completionTokens: number };
}

interface AIProvider {
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
}
```

### Schema de respuesta esperado del LLM

```json
{
  "sections": [
    {
      "name": "Backend",
      "description": "Tareas relacionadas con el servidor y base de datos",
      "tasks": [
        {
          "title": "Configurar base de datos PostgreSQL",
          "description": "Instalar y configurar PostgreSQL con Docker",
          "tags": ["database", "devops"],
          "assigneeEmails": ["emma@example.com"],
          "subtasks": [
            { "title": "Crear docker-compose.yml" },
            { "title": "Configurar variables de entorno" }
          ],
          "dueDate": "2026-05-15"
        }
      ]
    }
  ]
}
```

### `src/lib/ai/prompts.ts`

System prompts específicos para Kanvy:

- **systemPromptNew**: Instruye al LLM sobre la estructura de Kanvy (sections → tasks → subtasks, tags, assignees, due dates). Le pide analizar el MD y generar secciones y tareas desde cero.

- **systemPromptExisting**: Igual que el anterior, pero inyecta contexto del proyecto existente:
  - Secciones actuales (nombre, color, ID)
  - Tags existentes (nombre, color)
  - Miembros del proyecto (nombre, email)
  - Historial de actividad reciente (últimos 50 eventos)
  
  Instruye al LLM a **reusar** secciones/tags existentes cuando tengan sentido, y solo crear nuevas cuando sea necesario.

### `src/lib/ai/providers/deepseek.ts`

```typescript
export class DeepSeekProvider implements AIProvider {
  constructor(private apiKey: string, private baseUrl: string) {}
  
  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options?.model || 'deepseek-chat',
        messages,
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 4096,
        response_format: options?.responseFormat === 'json_object' ? { type: 'json_object' } : undefined,
      }),
    });
    const data = await res.json();
    return { content: data.choices[0].message.content, usage: data.usage };
  }
}
```

### `src/lib/ai/providers/openai.ts`

Misma interfaz `AIProvider`, endpoints de OpenAI.

### `src/lib/ai/factory.ts`

```typescript
export function createProvider(type: string, config: AIConfig): AIProvider {
  switch (type) {
    case 'deepseek': return new DeepSeekProvider(config.apiKey, config.baseUrl);
    case 'openai': return new OpenAIProvider(config.apiKey, config.baseUrl);
    case 'anthropic': return new AnthropicProvider(config.apiKey, config.baseUrl);
    default: throw new Error(`Unknown provider: ${type}`);
  }
}
```

Configuración desde variables de entorno o desde el body de la petición.

---

## 2. Backend — Endpoints

### `POST /api/ai/preview`

**Request:**
```json
{
  "markdown": "# Proyecto\n\n## Backend\n- Tarea 1\n- Tarea 2",
  "projectId": "optional-project-id",
  "provider": "deepseek",
  "model": "deepseek-chat"
}
```

**Response (200):**
```json
{
  "preview": {
    "sections": [
      {
        "tempId": "sec-1",
        "name": "Backend",
        "description": "...",
        "action": "create",
        "existingSectionId": null,
        "tasks": [
          {
            "tempId": "task-1",
            "title": "Configurar base de datos",
            "description": "...",
            "section": "Backend",
            "tags": [{ "name": "database", "action": "create" }],
            "assignees": [{ "email": "emma@example.com", "name": "Emma" }],
            "subtasks": [{ "title": "Crear docker-compose.yml" }],
            "dueDate": "2026-05-15"
          }
        ]
      }
    ]
  },
  "usage": { "promptTokens": 1200, "completionTokens": 800 }
}
```

**Flujo:**
1. Si hay `projectId`, carga contexto del proyecto (secciones, tags, miembros, actividad)
2. Crea `AIProvider` vía factory con las credenciales configuradas
3. Construye mensajes: system prompt + contexto + markdown del usuario
4. Llama al LLM con `response_format: json_object`
5. Valida y normaliza el JSON de respuesta
6. Resuelve emails de assignees contra usuarios existentes en DB
7. Marca tags/secciones como "create" (nuevo) o "reuse" (existente)
8. Devuelve preview estructurado

### `POST /api/ai/apply`

**Request:**
```json
{
  "projectId": "proj-123",
  "preview": {
    "sections": [ /* mismo schema que el preview, con items seleccionados */ ]
  }
}
```

**Response (200):**
```json
{
  "created": {
    "sections": 2,
    "tasks": 8,
    "tags": 4,
    "assignees": 3
  }
}
```

**Flujo:**
1. Itera sobre secciones del preview
2. Crea secciones nuevas (si `action === "create"`)
3. Crea tareas en la sección correspondiente
4. Asigna tags (crea nuevos o vincula existentes)
5. Asigna miembros por email
6. Crea subtareas
7. Registra actividad (`TASK_CREATED`, `SECTION_CREATED`)
8. Devuelve resumen

---

## 3. Frontend — Componentes

### `src/components/AI/AIImportModal.tsx`

Modal de 2 pasos:

**Paso 1 — Input:**
- Textarea grande (400px altura) para pegar markdown
- Selector de proveedor/modelo (dropdown poblado desde env o API)
- Toggle "Usar contexto del proyecto" (solo visible si hay projectId)
- Botón "Generar preview" (deshabilitado si textarea vacío)
- Spinner durante la generación
- Si falla, mostrar error con opción de reintentar

**Paso 2 — Preview:**
- Renderiza `AIImportPreview`
- Botón "Importar" (llama a `/ai/apply`)
- Toast de éxito con resumen (X secciones, Y tareas creadas)

### `src/components/AI/AIImportPreview.tsx`

Muestra el preview generado por la IA:

- **Por sección**: tarjeta expandible con header (nombre + descripción + badge "nueva" o "existente")
- **Por tarea dentro de cada sección**:
  - Checkbox para seleccionar/deseleccionar
  - Título (editable inline al hacer click)
  - Descripción (colapsada, expandible)
  - Tags como badges (click para remover)
  - Assignee como avatar + nombre (dropdown para cambiar)
  - Subtareas listadas con checkboxes
  - Due date (date input inline)
- **Select all / Deselect all** por sección
- **Resumen** arriba: "8 tareas en 2 secciones seleccionadas"

### Ubicación en la UI

- **Crear proyecto**: Botón "Importar con IA" en `TemplatePicker.tsx` (abre `AIImportModal` sin projectId)
- **Proyecto existente**: Botón "Importar con IA" en el sidebar de `ProjectBoard.tsx` (abre `AIImportModal` con projectId)

---

## 4. Variables de Entorno

```env
# DeepSeek
AI_DEEPSEEK_API_KEY=sk-xxxxxxxx
AI_DEEPSEEK_BASE_URL=https://api.deepseek.com
AI_DEEPSEEK_MODEL=deepseek-chat

# OpenAI
AI_OPENAI_API_KEY=sk-xxxxxxxx
AI_OPENAI_BASE_URL=https://api.openai.com
AI_OPENAI_MODEL=gpt-4o

# Anthropic
AI_ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
AI_ANTHROPIC_BASE_URL=https://api.anthropic.com
AI_ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
```

Un endpoint `GET /api/ai/providers` devuelve los providers disponibles (con API key configurada) para poblar el dropdown del frontend.

---

## 5. Manejo de Errores

| Escenario | Manejo |
|---|---|
| API key no configurada | `GET /ai/providers` no lista ese provider; si se intenta usar, error 400 claro |
| LLM rate limit (429) | Reintentar hasta 3 veces con backoff exponencial |
| JSON malformado del LLM | Intentar extraer JSON con regex; si falla, pedir al LLM que regenere |
| Token excedido | Truncar MD a ~3000 tokens con advertencia en la respuesta |
| Timeout (>30s) | Error 504 con mensaje "El modelo tardó demasiado, intenta con menos contenido" |
| Usuario no encontrado (assignee) | El email se muestra en el preview pero marcado como "no encontrado" |

---

## 6. Archivos a Crear/Modificar

| Archivo | Tipo | Descripción |
|---|---|---|
| `backend/src/lib/ai/types.ts` | Nuevo | Interfaces ChatMessage, AIProvider, schemas |
| `backend/src/lib/ai/factory.ts` | Nuevo | createProvider(type, config) |
| `backend/src/lib/ai/prompts.ts` | Nuevo | System prompts (nuevo proyecto + existente) |
| `backend/src/lib/ai/providers/deepseek.ts` | Nuevo | DeepSeekProvider |
| `backend/src/lib/ai/providers/openai.ts` | Nuevo | OpenAIProvider |
| `backend/src/routes/ai.ts` | Nuevo | POST /ai/preview, POST /ai/apply, GET /ai/providers |
| `backend/src/index.ts` | Modificar | Registrar ruta /api/ai |
| `backend/.env` | Modificar | Nuevas variables de entorno |
| `frontend/src/components/AI/AIImportModal.tsx` | Nuevo | Modal de importación con IA |
| `frontend/src/components/AI/AIImportPreview.tsx` | Nuevo | Preview editable del resultado |
| `frontend/src/pages/Projects.tsx` | Modificar | Botón importar con IA en crear proyecto |
| `frontend/src/pages/ProjectBoard.tsx` | Modificar | Botón importar con IA en proyecto existente |
| `frontend/src/i18n/en.json` | Modificar | Traducciones sección "ai" |
| `frontend/src/i18n/es.json` | Modificar | Traducciones sección "ai" |
| `frontend/src/styles/kanban.css` | Modificar | Estilos del modal y preview |
