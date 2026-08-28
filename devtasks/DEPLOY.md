# Guía de Despliegue — Kanvy con Cloudflare Named Tunnel

> Objetivo: dejar Kanvy accesible desde internet con URL fija y HTTPS, corriendo en una PC.
> Público: Windows (PowerShell). Plan gratis de Cloudflare.

## Arquitectura final

```
Usuario → https://app.tudominio.eu.org ──→ Edge de Cloudflare (HTTPS automático)
                                              │
                                              ▼  (conexión saliente — sin puertos abiertos)
                                        cloudflared (servicio de Windows)
                                              │
                                              ▼
                                        http://localhost:5001 (Express)
                                              ├── /api/*        → API REST
                                              ├── /uploads      → archivos adjuntos
                                              └── /*            → frontend (dist/)
                                              │
                                              ▼
                                        PostgreSQL 15 (Docker, localhost:5433)
```

**Decisión de diseño**: un solo hostname y un solo puerto. Express sirve también el
frontend compilado (`dist/`), así todo comparte origen: no hay CORS, solo un túnel,
una URL. Esto requiere los cambios de la Fase 2 (aún no implementados).

---

## Fase 0 — Prerequisitos

- [ ] Cuenta en **Cloudflare** (gratis): https://dash.cloudflare.com/sign-up
- [ ] Acceso a **Google Cloud Console** (el proyecto del login con Google ya existe)
- [ ] Un **dominio** (ver abajo)

### Opción A — Dominio gratis (eu.org)

1. Entrar a https://nic.eu.org → *Sign-in or sign-up here* → crear cuenta
   (te asignan un "handle", ej. `ABCD1234-EU`)
2. Primero crear cuenta Cloudflare y hacer *Add a site* con un nombre cualquiera
   para obtener los 2 nameservers (`x.ns.cloudflare.com`, `y.ns.cloudflare.com`)
3. En eu.org → **New Domain** → nombre deseado (ej. `tukanvy.eu.org`) →
   colocar los nameservers de Cloudflare
4. **Esperar aprobación manual** (días a semanas). Revisar spam del correo.
   No hay soporte ni forma de acelerarlo.

### Opción B — Dominio pago (recomendado, $1–3 primer año)

- Comprar un `.xyz`, `.site` o `.online` en Porkbun, Namecheap o Spaceship
- Se activa en minutos y evita la espera de eu.org

> ⚠️ DuckDNS/FreeDNS **no sirven**: Cloudflare necesita que el dominio sea una
> "zona" tuya para crear el DNS del túnel.

---

## Fase 1 — Dominio en Cloudflare

- [ ] Dash de Cloudflare → **Add a site** → ingresar el dominio
- [ ] Elegir plan **Free**
- [ ] Si es dominio pago: cambiar los nameservers en el registrador por los que indica Cloudflare
- [ ] Esperar a que el estado sea **Active** (minutos a horas)
- [ ] **SSL/TLS → Overview** → modo **Full (strict)** (no hay cert en origen, Cloudflare lo termina)

---

## Fase 2 — Cambios de código (PENDIENTES de implementar)

> Estos cambios aún NO están en el repo. Pedir al asistente que los aplique antes
> de la Fase 4:

| # | Cambio | Detalle |
|---|---|---|
| 1 | Express sirve `frontend/dist/` | Static + fallback SPA para react-router (excepto `/api` y `/uploads`), ruta configurable por env `STATIC_DIR` |
| 2 | `.env.production` en frontend | `VITE_API_URL=/api` para que el build use la API del mismo origen |
| 3 | `deploy.ps1` | Script: build backend → build frontend → arranca Express en producción |
| 4 | (Opcional) ruta absoluta de uploads | Si Express corre como servicio con otro `cwd`, fijar `UPLOADS_DIR` absoluto |

---

## Fase 3 — Instalar y configurar cloudflared

- [ ] Instalar: `winget install Cloudflare.cloudflared`
- [ ] Verificar: `cloudflared --version`

### Prueba rápida sin dominio (opcional, para validar que la app sirve)

```powershell
cloudflared tunnel --url http://localhost:5001
```

Da una URL aleatoria (`https://xxx.trycloudflare.com`) que cambia al reiniciar.
Sirve solo para probar, no es la URL final.

### Crear el Named Tunnel (vía dashboard, recomendado)

- [ ] Dash → **Zero Trust → Networks → Tunnels** → **Create a tunnel**
- [ ] Tipo: **Cloudflared** → nombre: `kanvy` → guardar
- [ ] Copiar el **token** que muestra
- [ ] Instalar como servicio de Windows (arranca solo con la PC):

```powershell
cloudflared service install <TOKEN>
```

- [ ] En el dashboard → **Public Hostname** → agregar:

| Campo | Valor |
|---|---|
| Subdomain | `app` |
| Domain | `tudominio.eu.org` |
| Type | HTTP |
| URL | `localhost:5001` |

- [ ] Verificar que el túnel aparezca **HEALTHY** (Zero Trust → Tunnels)

### Alternativa vía CLI (locally-managed)

```powershell
cloudflared tunnel login
cloudflared tunnel create kanvy
cloudflared tunnel route dns kanvy app.tudominio.eu.org
```

Editar `C:\Users\<usuario>\.cloudflared\config.yml`:

```yaml
tunnel: <TUNNEL_ID>
credentials-file: C:\Users\<usuario>\.cloudflared\<TUNNEL_ID>.json
ingress:
  - hostname: app.tudominio.eu.org
    service: http://localhost:5001
  - service: http_status:404
```

Instalar servicio: `cloudflared service install`

---

## Fase 4 — Poner la app en producción

### 4.1 Base de datos

```powershell
cd C:\Users\EMMAN\OneDrive\Documentos\tasks\devtasks
docker compose up -d
docker compose ps   # PostgreSQL debe estar Up (puerto 5433)
```

### 4.2 Variables de entorno (backend/.env)

| Variable | Valor |
|---|---|
| `DATABASE_URL` | (ya configurada — no tocar) |
| `GOOGLE_CLIENT_ID` | (ya configurado — no tocar) |
| `PORT` | `5001` |
| `CORS_ORIGIN` | `http://localhost:5173,http://localhost:5174` (solo dev; en prod no aplica por mismo origen) |

### 4.3 Build

```powershell
cd backend
npm run build          # prisma generate && tsc

cd ..\frontend
# crear .env.production con:  VITE_API_URL=/api
npm run build          # genera dist/
```

### 4.4 Arrancar

```powershell
cd ..\backend
npm start              # prisma migrate deploy && node dist/index.js
```

### 4.5 Verificación local

- [ ] `http://localhost:5001/api/health` → `{"status":"ok",...}`
- [ ] `http://localhost:5001/` → debe mostrar el frontend de Kanvy (no 404)

---

## Fase 5 — Login con Google

- [ ] Google Cloud Console → **APIs & Services → Credentials** → el **OAuth 2.0 Client ID** que usa la app
- [ ] **Authorized JavaScript origins** → agregar `https://app.tudominio.eu.org`
- [ ] Guardar (tarda unos minutos en propagar)
- [ ] Probar el login desde la URL pública

> La app usa Google Identity Services (verificación de ID token, sin redirect),
> por lo que solo hace falta el origin, no redirect URIs.

---

## Fase 6 — Persistencia (todo arranca solo)

- [ ] **cloudflared**: ya es servicio de Windows (Fase 3)
- [ ] **PostgreSQL**: Docker Desktop → Settings → *Start Docker Desktop when you sign in*; el compose arranca solo si se marcó restart automático (o lanzarlo con `docker compose up -d` al iniciar sesión)
- [ ] **Express** — opción A, NSSM (https://nssm.cc):

```powershell
nssm install KanvyBackend "C:\Program Files\nodejs\node.exe" "dist\index.js"
nssm set KanvyBackend AppDirectory C:\Users\EMMAN\OneDrive\Documentos\tasks\devtasks\backend
nssm set KanvyBackend AppStdout C:\Users\EMMAN\OneDrive\Documentos\tasks\devtasks\backend\logs\out.log
nssm set KanvyBackend AppStderr C:\Users\EMMAN\OneDrive\Documentos\tasks\devtasks\backend\logs\err.log
nssm start KanvyBackend
```

- [ ] **Express** — opción B, Task Scheduler:

```powershell
schtasks /create /tn "KanvyBackend" /tr "cmd /c cd /d C:\Users\EMMAN\OneDrive\Documentos\tasks\devtasks\backend && npm start" /sc onstart /ru SYSTEM
```

---

## Fase 7 — Verificación final

- [ ] `https://app.tudominio.eu.org/api/health` responde `ok`
- [ ] Login con Google funciona desde la URL pública
- [ ] Drag & drop de tareas y secciones funciona
- [ ] Subir un archivo adjunto y verificar que se descarga (uploads)
- [ ] IA funciona (las API keys siguen guardadas en BD por usuario)
- [ ] Reiniciar la PC → esperar 2 min → la app vuelve sola

---

## Troubleshooting

| Síntoma | Causa probable | Solución |
|---|---|---|
| Error **522** de Cloudflare | cloudflared o Express caídos | Verificar servicio: `services.msc`; logs en `cloudflared service uninstall`/reinstall o `sc query cloudflared` |
| Login Google: "origin not allowed" | Falta el origin en Google Cloud Console | Fase 5 |
| Adjuntos rotos en producción | `cwd` del servicio ≠ carpeta backend | Fijar ruta absoluta de `uploads` (cambio #4 de Fase 2) |
| 502 Bad Gateway | Express no escucha en 5001 | `netstat -ano \| findstr 5001`; revisar `npm start` |
| eu.org nunca aprobado | Aprobación manual lenta | Esperar o comprar dominio pago |
| Cambios de código no aparecen | Falta re-build | Re-ejecutar 4.3 y reiniciar KanvyBackend |
| Errores CORS | Solo ocurren si se usa doble hostname | Usar el diseño de un solo origen (este doc) |

---

## Referencias

- Cloudflare Tunnel docs: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/
- eu.org: https://nic.eu.org
- NSSM: https://nssm.cc
- Google OAuth origins: https://console.cloud.google.com/apis/credentials
