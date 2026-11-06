# Aurora — Copiloto de accesibilidad web

**Roadmap de producto ficticio para probar AI Import.**
**Horizonte:** enero–junio de 2027 · **Equipo:** 1 PM, 1 diseñador, 3 ingenieros y 1 QA.

**Contexto y metas**

Aurora es una herramienta que detecta, explica y ayuda a corregir problemas de accesibilidad WCAG 2.2 AA en aplicaciones React. El objetivo del semestre es pasar de un prototipo interno a un producto de pago con 150 equipos en beta y 25 clientes de pago al cierre de junio.

Métricas de éxito: 150 equipos en beta privada con 40 % de activación semanal, 25 clientes de pago y 30.000 € de ingresos recurrentes anuales, tiempo medio de primera corrección inferior a 10 minutos y NPS de beta superior a 40.

## Fase 1 — Descubrimiento y fundaciones (enero 2027)

**Resultado:** arquitectura validada, diseño del panel aprobado y criterios de accesibilidad acordados.

- **Entrevistas a 12 equipos de producto** — 4 días, responsable Lucía, #research, vence 2027-01-22.
- **Benchmark de 6 competidores y análisis de precios** — 3 días, responsable Marco, #research, vence 2027-01-20.
- **Definir la arquitectura del motor de reglas** — 1 semana, responsable Sofía, #architecture, vence 2027-01-29.
- **Design system y flujos del panel de resultados** — 2 semanas, responsable Diego, #design, vence 2027-02-05.
- **Criterios internos WCAG 2.2 AA y plan de auditoría** — 2 días, responsable Nerea, #compliance, vence 2027-01-27.

## Fase 2 — MVP (febrero–marzo 2027)

**Resultado:** escáner funcional, panel de resultados, extensión de Chrome y primeros informes exportables.

- **Motor de análisis estático para React** — 2 semanas, responsable Sofía, #backend, vence 2027-02-19.
- **Reglas WCAG 2.2 AA: contraste, foco y ARIA** — 2 semanas, responsable Sofía, #rules, vence 2027-02-26. Depende del motor de análisis.
- **Panel de resultados con severidad y evidencia** — 1,5 semanas, responsable Diego, #frontend, vence 2027-03-05.
- **Autenticación con Google y organizaciones** — 1 semana, responsable Marco, #backend, vence 2027-02-26.
- **Exportar informes en PDF y CSV** — 4 días, responsable Marco, #reporting, vence 2027-03-12.
- **Extensión de Chrome para inspeccionar páginas** — 2 semanas, responsable Lucía, #extension, vence 2027-03-19. Depende de las reglas WCAG.
- **Suite de pruebas con 20 sitios reales** — 1 semana, responsable Nerea, #qa, vence 2027-03-19.

## Fase 3 — Beta privada (abril–mayo 2027)

**Resultado:** 150 equipos usando Aurora, integraciones con GitHub y Slack, y primeros ingresos.

- **GitHub App para abrir PRs con sugerencias de corrección** — 2 semanas, responsable Sofía, #integrations, vence 2027-04-09.
- **Alertas en Slack y correo para nuevas incidencias** — 1 semana, responsable Marco, #integrations, vence 2027-04-16.
- **Onboarding guiado y checklist de activación** — 1,5 semanas, responsable Diego, #growth, vence 2027-04-23.
- **Facturación con Stripe y planes** — 1 semana, responsable Marco, #billing, vence 2027-04-30.
- **Panel de métricas de uso y salud del producto** — 1 semana, responsable Sofía, #analytics, vence 2027-05-07.
- **Programa de 20 design partners y feedback semanal** — continuo, responsable Lucía, #research, vence 2027-05-14.

## Fase 4 — Lanzamiento general (junio 2027)

**Resultado:** producto público, seguridad revisada, documentación y campaña de lanzamiento.

- **Sitio de marketing y documentación pública** — 2 semanas, responsable Diego, #marketing, vence 2027-05-28.
- **Auditoría de seguridad y revisión de permisos** — 1 semana, responsables Nerea y Sofía, #security, vence 2027-05-21.
- **Migración a planes pagados y comunicación de precios** — 3 días, responsable Marco, #billing, vence 2027-06-04.
- **Soporte de primer nivel y runbook de incidentes** — 1 semana, responsable Nerea, #support, vence 2027-06-04.
- **Webinar de lanzamiento y 3 casos de estudio** — 1 semana, responsable Lucía, #marketing, vence 2027-06-11.

**Hitos**

| Fecha | Hito | Criterio de salida |
|---|---|---|
| 2027-02-05 | Fundaciones listas | Arquitectura y diseño aprobados |
| 2027-03-19 | MVP interno | 20 sitios analizados sin errores críticos |
| 2027-05-14 | Beta con clientes | 150 equipos activos y 10 clientes de pago |
| 2027-06-11 | Lanzamiento general | Producto público y campaña ejecutada |

**Riesgos y supuestos**

El motor de reglas puede generar falsos positivos; reservar un 20 % del tiempo de la fase 2 para calibrarlos. La extensión de Chrome puede retrasarse por cambios en la Web Store, así que hay un plan B con bookmarklet. La integración con GitHub requiere permisos de organización y se validará con 3 design partners antes de abril. El equipo de soporte es compartido con otro producto; si la beta supera 200 equipos, se contratará un especialista. Se asume que los clientes usan React 18 o superior; Vue y Angular quedan para el segundo semestre.

**Fuera de alcance:** apps móviles nativas, auditorías manuales asistidas y soporte para frameworks distintos de React.
