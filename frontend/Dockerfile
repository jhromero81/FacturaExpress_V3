# ============================================================
# FacturaExpress - Frontend Angular
# Etapa 1: compilacion de la SPA con Angular CLI
# Etapa 2: distribucion estatica con nginx + proxy /api
# ============================================================

FROM node:22-alpine AS build
WORKDIR /app

# Copiar solo las dependencias para aprovechar la cache de capas
COPY package.json package-lock.json ./
RUN npm ci

# Copiar el codigo fuente y compilar la aplicacion
COPY . .
RUN npm run build -- --configuration production

# ---------- Imagen final ----------
FROM nginx:1.27-alpine

# Configuracion de nginx: SPA con fallback a index.html y proxy /api
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Artefacto compilado por Angular (Angular 17+ emite en /browser)
COPY --from=build /app/dist/facturaexpress-frontend/browser /usr/share/nginx/html

EXPOSE 80
