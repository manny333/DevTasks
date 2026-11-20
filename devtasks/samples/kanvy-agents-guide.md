# Kanvy — Guía para agentes y convenciones de trabajo

> Guía operativa para agentes que trabajen en el repositorio de Kanvy.
> Última actualización: 2026-11-19.
> Categoría sugerida: **Guía**.

## 1. Propósito

Este documento define cómo debe trabajar un agente dentro de Kanvy:

- qué leer antes de actuar,
- cómo planear,
- cómo tocar código,
- cómo probar,
- cómo documentar,
- cómo comunicar riesgos y decisiones.

Es una **guía**, no un mecanismo de enforcement. Si el usuario pide explícitamente una excepción, el agente puede señalarla y continuar bajo responsabilidad del usuario.

## 2. Antes de empezar

Orden recomendado:

1. Leer el documento **Kanvy — Contexto del proyecto**.
2. Consultar el contexto anclado del proyecto con `get_project_context`.
3. Revisar la tarea, sus criterios de aceptación, dependencias y documentación relacionada.
4. Revisar el estado del repositorio antes de modificar archivos.
5. Si falta contexto crítico, preguntar antes de inventarlo.

No asumir que una decisión sigue vigente solo porque aparece en un comentario antiguo. Buscar la decisión o documento más reciente.

## 3. Principios de trabajo

- **Entender antes de cambiar.** Leer el código y los patrones existentes.
- **Cambios pequeños.** Evitar refactors masivos mezclados con la funcionalidad pedida.
- **Una fuente de verdad.** Si existe un helper, modelo o patrón, reutilizarlo.
- **No inventar contexto.** Si no está en Kanvy, el repo o la conversación, decirlo.
- **No ocultar incertidumbre.** Reportar supuestos y riesgos.
- **No romper compatibilidad sin avisar.** Migraciones, contratos y APIs se tratan con cuidado.
- **Seguridad primero.** Nunca commitear secretos ni exponer tokens.

## 4. Git y cambios

Recomendaciones:

- No hacer commits directos a `main`; usar una rama por actividad.
- Nombre sugerido: `feat/<task-id>-<slug>`, `fix/<task-id>-<slug>` o `docs/<slug>`.
- Commits pequeños y con mensaje claro.
- Revisar `git diff` antes de commitear.
- No mezclar cambios no relacionados.
- No hacer `force-push` a ramas compartidas.
- No reescribir historia ya publicada sin autorización explícita.

Si el usuario pide saltarse una recomendación, señalarlo brevemente y continuar si insiste.

## 5. Convenciones de código

### General

- TypeScript estricto.
- Evitar `any`; si es necesario, justificarlo.
- Imports de tipos con `import type`.
- No duplicar lógica existente.
- Mantener el estilo del archivo que se edita.

### Backend

- Rutas en `src/routes/`.
- Lógica de negocio en `src/lib/`.
- Acceso a base de datos solo con Prisma.
- Resolver permisos antes de responder: `requireProjectAccess`, `requireTaskAccess`, etc.
- No devolver stack traces ni errores crudos del driver.
- Registrar actividad cuando corresponda.

### Frontend

- Componentes funcionales con hooks.
- Estado global solo cuando sea necesario.
- Llamadas API mediante `services/api.ts`.
- Textos en español e inglés en `i18n`.
- Estilos en CSS, respetando variables de tema.
- Manejar estados de carga, vacío y error.

### Base de datos

- Cambios de schema con migración de Prisma.
- No editar migraciones ya aplicadas.
- Ejecutar `npx prisma generate` después de cambiar el schema.
- Revisar impacto de `onDelete` y de nuevos índices.

## 6. Verificación antes de cerrar

### Backend

```powershell
cd devtasks/backend
npx tsc --noEmit
npm test
npm run build
```

### Frontend

```powershell
cd devtasks/frontend
npx tsc -b
npm run lint
npm run build
```

### Contrato compartido

```powershell
cd devtasks
node shared/check.mjs
```

### MCP y plugin

```powershell
cd devtasks/mcp-server
npm test
npm run test:e2e

cd devtasks/dsh-kanvy
npm test
```

No declarar una tarea terminada si los checks aplicables fallan o no se ejecutaron.

## 7. Documentación

- Si el cambio afecta comportamiento, actualizar la documentación correspondiente.
- Si se crea una decisión importante, registrarla como documento de tipo **Decisión**.
- Si se agrega una funcionalidad de IA, documentar tools, recursos y límites.
- Mantener documentos cortos y con enlaces, sin duplicar el README.

### Uso de la documentación de Kanvy

- `list_documents`: descubrir documentos.
- `search_documents`: encontrar contexto.
- `get_document`: leer completo o por partes.
- `get_project_context`: contexto base anclado.

No volcar documentos enteros al prompt si basta un excerpt o una búsqueda.

## 8. Seguridad

- No commitear `.env`, tokens, claves ni archivos de credenciales.
- No imprimir tokens en logs o respuestas.
- No deshabilitar validaciones de autorización para “probar”.
- No exponer endpoints sin guard.
- Validar tamaño, tipo y contenido en uploads.
- Mantener los secretos de cifrado estables.
- Reportar cualquier riesgo de seguridad encontrado.

## 9. Definición de terminado

Una actividad está terminada cuando:

- cumple los criterios de aceptación,
- los checks aplicables pasan,
- no introduce secretos,
- la documentación afectada está actualizada,
- el cambio está commiteado y pusheado,
- se reporta qué se hizo y qué quedó fuera.

## 10. Comunicación con el usuario

Al terminar, reportar:

- qué se implementó,
- qué se verificó,
- qué no se pudo verificar,
- riesgos o decisiones pendientes,
- siguiente paso recomendado.

No decir “listo” si falta una parte importante. Si algo falló, mostrar el error concreto y la hipótesis.

## 11. Excepciones

El usuario puede pedir explícitamente una excepción a esta guía. En ese caso:

1. Señalar la regla afectada.
2. Confirmar que se entiende la excepción.
3. Continuar si el usuario insiste.
4. No presentar la excepción como la norma del proyecto.

Las reglas ayudan a mantener calidad y consistencia; no sustituyen el criterio del usuario.
