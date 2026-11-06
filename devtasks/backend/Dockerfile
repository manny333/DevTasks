# syntax=docker/dockerfile:1.7
# Build context: devtasks/
# docker build -f backend/Dockerfile -t kanvy .

FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
ARG VITE_API_URL=/api
ARG VITE_GOOGLE_CLIENT_ID=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
RUN npm run build

FROM node:22-alpine AS backend
WORKDIR /app/backend
RUN apk add --no-cache openssl libc6-compat
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ ./
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runtime
WORKDIR /app/backend
RUN apk add --no-cache openssl libc6-compat \
  && addgroup -S kanvy \
  && adduser -S kanvy -G kanvy

ENV NODE_ENV=production
ENV HOME=/app
ENV npm_config_cache=/app/.npm

COPY backend/package.json backend/package-lock.json ./
COPY --from=backend /app/backend/node_modules ./node_modules
COPY --from=backend /app/backend/dist ./dist
COPY --from=backend /app/backend/prisma ./prisma
COPY --from=backend /app/backend/prisma.config.ts ./prisma.config.ts
COPY --from=frontend /app/frontend/dist /app/frontend/dist

RUN mkdir -p /app/backend/uploads /app/.npm /app/.cache \
  && chown -R kanvy:kanvy /app/backend/uploads /app/frontend /app/.npm /app/.cache

USER kanvy
EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
