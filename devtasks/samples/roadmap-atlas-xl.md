# Atlas — Red logística para medicamentos

**Roadmap ficticio de programa para probar AI Import con documentos grandes.**
**Horizonte:** enero–diciembre de 2027 · **Equipo:** 1 PM, 1 diseñadora, 3 ingenieros, 1 especialista IoT, 1 seguridad, 1 operaciones y 1 growth.

**Contexto y metas**

Atlas es una red logística para transportar medicamentos con temperatura controlada entre laboratorios, farmacias y clínicas. El programa cubre pedidos, optimización de rutas, telemetría IoT, cumplimiento GDP y facturación por envío. El objetivo de 2027 es pasar de un piloto en dos ciudades a una operación con 500 envíos diarios, 25 clientes y 99,5 % de cumplimiento térmico.

Métricas de éxito: 500 envíos diarios al cierre de diciembre, 99,5 % de entregas dentro de rango térmico, 25 clientes activos, 1,2 M€ de ingresos recurrentes anuales, NPS de operadores superior a 45 y coste por envío un 18 % menor que el piloto.

## Fase 1 — Descubrimiento y cumplimiento (enero–febrero 2027)

**Resultado:** alcance regulatorio claro, arquitectura validada, proveedor de sensores elegido y criterios del piloto aprobados.

- **Entrevistas a 20 farmacias y 8 clínicas** — 3 semanas, responsable Elena, #discovery, vence 2027-01-22.
- **Mapa regulatorio de cadena de frío por país** — 2 semanas, responsable Raúl, #compliance, vence 2027-01-29.
- **Benchmark de 8 operadores logísticos** — 2 semanas, responsable Iván, #discovery, vence 2027-01-27.
- **Definir la arquitectura de eventos IoT** — 2 semanas, responsable Bruno, #iot, vence 2027-02-05.
- **Diseño del flujo de pedidos, recogida y entrega** — 3 semanas, responsable Clara, #design, vence 2027-02-12.
- **Modelo de datos de envíos, lotes y temperaturas** — 2 semanas, responsable Tomás, #backend, vence 2027-02-10.
- **Política de privacidad y retención de datos** — 1 semana, responsable Raúl, #security, vence 2027-02-08.
- **Plan de certificación GDP para transporte** — 3 semanas, responsable Nadia, #compliance, vence 2027-02-19.
- **Prueba de concepto con sensores BLE y LTE** — 2 semanas, responsable Bruno, #iot, vence 2027-02-17.
- **Investigación de precios y modelo de ingresos** — 2 semanas, responsable Iván, #growth, vence 2027-02-12.
- **Roadmap técnico y presupuesto de infraestructura** — 1 semana, responsable Tomás, #architecture, vence 2027-02-19.
- **Criterios de aceptación y alcance del piloto** — 1 semana, responsable Elena, #discovery, vence 2027-02-24.

## Fase 2 — Plataforma core (marzo–mayo 2027)

**Resultado:** pedidos, rutas, app de conductor, telemetría, alertas térmicas y auditoría funcionando en entorno interno.

- **API de pedidos y asignación de rutas** — 3 semanas, responsable Tomás, #backend, vence 2027-03-19.
- **Motor de optimización de rutas con ventanas horarias** — 4 semanas, responsables Bruno y Tomás, #data #backend, vence 2027-04-09. Depende de la API de pedidos.
- **App de conductor con escaneo y firma digital** — 4 semanas, responsable Inés, #mobile, vence 2027-04-16. Depende de la API de pedidos.
- **Panel de operaciones en tiempo real** — 3 semanas, responsables Clara e Inés, #frontend #ops, vence 2027-04-23.
- **Ingesta de telemetría de temperatura** — 2 semanas, responsable Bruno, #iot #data, vence 2027-04-02. Depende de la prueba de concepto de sensores.
- **Alertas de excursión térmica y escalado** — 2 semanas, responsable Tomás, #backend #iot, vence 2027-04-16. Depende de la ingesta de telemetría.
- **Autenticación SSO y roles por organización** — 2 semanas, responsable Raúl, #security, vence 2027-03-26.
- **Registro de auditoría inmutable** — 2 semanas, responsable Raúl, #security #compliance, vence 2027-04-23. Depende del SSO.
- **Gestión de flota y mantenimiento** — 2 semanas, responsable Nadia, #ops, vence 2027-04-30.
- **Notificaciones a farmacias por SMS y email** — 1 semana, responsable Inés, #mobile #integrations, vence 2027-04-30.
- **Centro de ayuda y guías de operación** — 2 semanas, responsable Clara, #design #ops, vence 2027-05-07.
- **Suite de pruebas de cadena de frío** — 2 semanas, responsable Nadia, #qa #compliance, vence 2027-05-14.

## Fase 3 — Piloto en dos ciudades (junio–agosto 2027)

**Resultado:** 300 envíos controlados, integraciones con farmacias y clínicas, SLA medido y certificación GDP preparada.

- **Selección de dos ciudades y 15 farmacias piloto** — 2 semanas, responsable Elena, #discovery #ops, vence 2027-06-04.
- **Integración con el ERP de las farmacias** — 4 semanas, responsable Tomás, #integrations, vence 2027-06-25. Depende de la API de pedidos.
- **Integración con sistemas de clínicas** — 3 semanas, responsable Inés, #integrations, vence 2027-07-09. Depende de la integración con farmacias.
- **Onboarding de operadores y conductores** — 2 semanas, responsable Nadia, #ops, vence 2027-06-18.
- **Simulación de rutas y capacidad para el piloto** — 2 semanas, responsable Bruno, #data #ops, vence 2027-06-18.
- **Piloto controlado con 300 envíos** — 4 semanas, responsable Elena, #ops #qa, vence 2027-07-16.
- **Monitoreo de SLA y temperatura en vivo** — 2 semanas, responsable Bruno, #iot #ops, vence 2027-07-02.
- **Soporte 24/7 y runbook de incidentes** — 2 semanas, responsable Nadia, #ops #support, vence 2027-07-23.
- **Encuestas NPS y entrevistas de usabilidad** — 2 semanas, responsable Clara, #design #discovery, vence 2027-07-30.
- **Ajustes de rutas según feedback del piloto** — 3 semanas, responsable Tomás, #backend #data, vence 2027-08-13.
- **Informe de resultados del piloto** — 1 semana, responsable Elena, #discovery, vence 2027-08-20.
- **Preparación de la certificación GDP** — 3 semanas, responsable Raúl, #compliance, vence 2027-08-27.

## Fase 4 — Escala e integraciones (septiembre–octubre 2027)

**Resultado:** multi-tenant, facturación, portal de clientes, API pública y operación preparada para 10.000 envíos diarios.

- **Multi-tenant y aislamiento de datos** — 3 semanas, responsable Tomás, #backend #security, vence 2027-09-17.
- **Facturación y conciliación por envío** — 3 semanas, responsable Inés, #billing #backend, vence 2027-09-24.
- **Portal de clientes con tracking público** — 3 semanas, responsable Clara, #frontend, vence 2027-09-17.
- **App de farmacia para solicitar recogidas** — 3 semanas, responsable Inés, #mobile, vence 2027-10-01.
- **Integración con Salesforce y HubSpot** — 3 semanas, responsable Tomás, #integrations, vence 2027-10-08.
- **Webhooks y API pública v1** — 2 semanas, responsable Tomás, #integrations, vence 2027-10-15. Depende de multi-tenant.
- **Pronóstico de demanda por zona** — 3 semanas, responsable Bruno, #data #ml, vence 2027-10-15.
- **Optimización de costes de combustible** — 2 semanas, responsable Bruno, #data #ops, vence 2027-10-22.
- **Panel de cumplimiento y auditoría para clientes** — 2 semanas, responsable Raúl, #compliance #frontend, vence 2027-10-08.
- **Programa de formación para operadores** — 2 semanas, responsable Nadia, #ops #growth, vence 2027-10-22.
- **Pruebas de carga a 10.000 envíos diarios** — 2 semanas, responsable Tomás, #qa #backend, vence 2027-10-29.
- **Plan de soporte multinivel** — 1 semana, responsable Nadia, #support #ops, vence 2027-10-29.

## Fase 5 — Lanzamiento general (noviembre–diciembre 2027)

**Resultado:** certificaciones, seguridad auditada, migración a producción, campaña de lanzamiento y expansión a dos ciudades adicionales.

- **Auditoría externa de seguridad** — 3 semanas, responsable Raúl, #security, vence 2027-11-19.
- **Certificación GDP final** — 3 semanas, responsable Nadia, #compliance, vence 2027-11-26.
- **Migración de datos del piloto a producción** — 2 semanas, responsable Tomás, #backend #ops, vence 2027-11-12.
- **Campaña de lanzamiento y tres casos de estudio** — 3 semanas, responsable Iván, #growth #marketing, vence 2027-11-19.
- **Sitio web, precios y documentación pública** — 3 semanas, responsable Clara, #marketing #design, vence 2027-11-26.
- **Expansión a dos ciudades adicionales** — 3 semanas, responsable Elena, #ops, vence 2027-12-10.
- **Contratación y formación de 10 operadores** — 3 semanas, responsable Nadia, #ops #hr, vence 2027-12-03.
- **Panel de salud del negocio y alertas** — 2 semanas, responsable Bruno, #data #analytics, vence 2027-12-03.
- **Revisión de contratos y seguros de flota** — 2 semanas, responsable Raúl, #legal #compliance, vence 2027-12-10.
- **Plan de continuidad y recuperación** — 2 semanas, responsable Tomás, #security #ops, vence 2027-12-17.
- **Webinar de lanzamiento y programa de referidos** — 2 semanas, responsable Iván, #growth, vence 2027-12-17.
- **Retrospectiva del año y roadmap 2028** — 1 semana, responsable Elena, #discovery, vence 2027-12-22.

**Hitos**

| Fecha | Hito | Criterio de salida |
|---|---|---|
| 2027-02-24 | Fundaciones y cumplimiento | Arquitectura, GDP y criterios del piloto aprobados |
| 2027-05-14 | Plataforma core | 300 envíos simulados sin incidentes críticos |
| 2027-08-27 | Piloto validado | 300 envíos reales, SLA y temperatura medidos |
| 2027-10-29 | Operación escalable | 10.000 envíos/día en pruebas de carga |
| 2027-12-22 | Lanzamiento general | 25 clientes, 2 ciudades nuevas y certificación GDP |

**Riesgos y supuestos**

La certificación GDP puede retrasarse si cambia la normativa local; se reserva un 20 % del tiempo de la fase 5. La disponibilidad de sensores LTE es un riesgo de suministro y se validará con dos proveedores. La integración con ERP de farmacias depende de APIs legacy; se hará un adaptador por cliente si es necesario. La expansión a dos ciudades asume que la operación del piloto alcanza 99,5 % de cumplimiento térmico. El equipo de soporte es compartido con otro producto hasta noviembre; si la beta supera 300 envíos diarios, se contratará un especialista antes.

**Fuera de alcance:** entregas el mismo día, flota propia de vehículos, apps para pacientes y operación fuera de España y Portugal.
