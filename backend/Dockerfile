# ============================================================
# FacturaExpress API - Imagen Docker
# Stack: Node.js 22 + Express
# La version de Node esta alineada con .nvmrc (22), con el campo
# "engines" de package.json y con el frontend y el pipeline de CI.
# ============================================================

FROM node:22-alpine

WORKDIR /app

# Entorno de produccion por defecto: activa el flag Secure de la cookie de
# sesion y la validacion estricta del secreto JWT. Antes no se definia, de
# modo que un `docker run` directo arrancaba en modo desarrollo.
ENV NODE_ENV=production

# Copiar solo las dependencias para aprovechar la cache de capas.
# .dockerignore impide que un node_modules local sobrescriba esta instalacion.
COPY package.json package-lock.json ./

# Instalar dependencias de produccion
RUN npm ci --omit=dev

# Copiar el codigo fuente de la API
COPY . .

# Puerto que expone el servidor Express
EXPOSE 4000

# Ejecutar sin privilegios: la imagen oficial incluye el usuario "node".
# Los respaldos se escriben en el directorio temporal, no en /app.
USER node

# Comando por defecto: inicia el servidor
# (la base de datos se prepara con: node scripts/setupDb.js)
CMD ["node", "server.js"]
