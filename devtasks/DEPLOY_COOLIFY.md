# Desplegar Kanvy en Coolify

Guía para un VPS con Coolify. La app se construye con el `Dockerfile` del repo y
usa un PostgreSQL gestionado por Coolify. No uses el `docker-compose.yml` local
para producción: está pensado para desarrollo y para tener todo en una máquina.

## Arquitectura

```
Internet → Coolify / Traefik (HTTPS) → contenedor Kanvy :5001
                                              │
                                              └─ PostgreSQL de Coolify (red interna)
```

## 1. Crear PostgreSQL

En el proyecto de Coolify:

1. **+ New → Database → PostgreSQL 15**.
2. Nombre: `kanvy-db`.
3. Guarda la contraseña que genera.
4. Cuando esté corriendo, copia la **Internal Database URL**.

Suele tener esta forma:

```
postgresql://postgres:<password>@<service>:5432/postgres?schema=public
```

Si la URL no trae `?schema=public`, añádelo.

## 2. Crear la aplicación

1. **+ New → Application → Git repository**.
2. Repositorio: `https://github.com/manny333/DevTasks` (o conéctalo por GitHub App si es privado).
3. Branch: `main`.
4. Build pack: **Dockerfile**.

Configuración de build:

| Campo | Valor |
|---|---|
| Base Directory | `/devtasks` |
| Dockerfile Location | `/backend/Dockerfile` |
| Ports Exposes | `5001` |

El **Base Directory** es importante: el Dockerfile copia `frontend/` y
`backend/` desde la raíz de `devtasks`.

## 3. Variables de entorno

En **Environment Variables** de la aplicación:

```env
DATABASE_URL=postgresql://postgres:<password>@<service>:5432/postgres?schema=public

JWT_SECRET=<48+ caracteres aleatorios>
UPLOADS_SECRET=<32+ caracteres aleatorios>
API_KEY_ENCRYPTION_SECRET=<32+ caracteres aleatorios>

GOOGLE_CLIENT_ID=<client id de Google>
CORS_ORIGIN=https://kanvy.tudominio.com
TRUST_PROXY=1

PORT=5001
STATIC_DIR=/app/frontend/dist
VITE_API_URL=/api
```

Genera secretos con:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

No cambies `API_KEY_ENCRYPTION_SECRET` después de guardar API keys de IA, o las
claves almacenadas quedarán ilegibles.

### Google Client ID en el build

`VITE_GOOGLE_CLIENT_ID` se incrusta en el frontend **durante el build**, no en
runtime. En Coolify:

- **Advanced → Build → Build Arguments**, añade:

```env
VITE_GOOGLE_CLIENT_ID=<el mismo client id>
```

- O marca la variable como **Build Variable** si tu versión de Coolify lo
  permite.

Si el login de Google falla con un client ID vacío, reconstruye la app después
de añadirla. `VITE_API_URL=/api` ya es el valor por defecto del Dockerfile y no
necesita build arg.

## 4. Dominio

En **General → Domains** de la aplicación:

```
https://kanvy.tudominio.com
```

Coolify crea el certificado con Let's Encrypt y enruta al puerto `5001`.
Asegúrate de que el DNS del dominio apunta al VPS antes de desplegar.

En Google Cloud Console, el **Authorized JavaScript origin** debe ser:

```
https://kanvy.tudominio.com
```

No hace falta añadir `/api` ni una redirect URI si el login es con Google
Identity Services.

## 5. Uploads persistentes

En **Persistent Storage → Add → Volume Mount**:

| Campo | Valor |
|---|---|
| Destination Path | `/app/backend/uploads` |
| Source Path | (dejar que Coolify lo genere) |

La app escribe los adjuntos en `process.cwd()/uploads`; dentro del contenedor el
working directory es `/app/backend`, así que ese es el path correcto.

El contenedor corre como usuario `kanvy`. Si el volumen se monta con otro
propietario y fallan las subidas:

```bash
docker exec -u root <container> chown -R kanvy:kanvy /app/backend/uploads
```

## 6. Desplegar

1. Pulsa **Deploy**.
2. En los logs debe verse:
   - build del frontend,
   - build del backend,
   - `prisma migrate deploy`,
   - `DevTasks API running on http://localhost:5001`.
3. Comprueba:

```
https://kanvy.tudominio.com/api/health
```

Debe devolver `{"status":"ok","database":"up", ...}`.

## 7. Seed opcional

Solo si quieres datos demo:

```bash
docker exec -it <container> npm run db:seed
```

O desde la terminal de Coolify.

## 8. Backups y operación

- Activa backups del PostgreSQL en Coolify (S3 o volumen).
- Haz backup del volumen de uploads; no es lo mismo que la base de datos.
- Mantén **una sola réplica**. Los uploads son locales y SSE/notificaciones no
  están pensados para varias instancias.
- Recursos recomendados: **1 vCPU / 1,5–2 GB RAM**. La app y el build de Vite
  caben en un VPS pequeño.

## Problemas típicos

| Síntoma | Causa / solución |
|---|---|
| `JWT_SECRET is required` | Falta la variable en runtime |
| `P1001: Can't reach database` | `DATABASE_URL` incorrecta o DB en otra red; usa la Internal URL |
| Login Google sin client ID | Falta `VITE_GOOGLE_CLIENT_ID` como build arg; reconstruye |
| Dominio 502 | El proceso no escucha en `0.0.0.0` o `Ports Exposes` no es 5001 |
| Uploads fallan | Permisos del volumen; `chown` al usuario `kanvy` |
| Migraciones fallan al arrancar | La DB no está lista; revisa logs y reinicia |
| Cambios no aparecen | Coolify cacheó capas; fuerza rebuild sin caché |

## Por qué no usar el compose en Coolify

El `docker-compose.yml` del repo levanta también PostgreSQL y publica puertos
locales (`5001`, `5433`). En Coolify es mejor:

- PostgreSQL como **Database resource** (backups y URL interna gestionadas),
- la app como **Dockerfile application**,
- dominio y TLS en Coolify.

Así no hay que mantener secretos en un `.env.docker` dentro del servidor ni
exponer el puerto de PostgreSQL.
