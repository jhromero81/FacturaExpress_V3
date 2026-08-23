# ============================================================
# FacturaExpress API - Imagen Docker
# Stack: Node.js 18 + Express
# ============================================================

FROM node:18-alpine

WORKDIR /app

# Copiar solo las dependencias para aprovechar la cache de capas
COPY package.json package-lock.json ./

# Instalar dependencias de produccion
RUN npm ci --omit=dev

# Copiar el codigo fuente de la API
COPY . .

# Puerto que expone el servidor Express
EXPOSE 4000

# Comando por defecto: inicia el servidor
# (la base de datos se prepara con: node scripts/setupDb.js)
CMD ["node", "server.js"]
