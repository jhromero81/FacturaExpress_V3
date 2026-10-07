#!/usr/bin/env node
/**
 * scripts/bootstrap.js
 * Prepara un clon del repositorio para poder ejecutarse en cualquier
 * maquina, sin pasos manuales ni decisiones de plataforma.
 *
 * Que hace (idempotente: nunca sobrescribe un .env existente):
 *   1. Verifica la version de Node contra el campo "engines" de la raiz.
 *   2. Crea .env en la raiz si falta, con secretos aleatorios.
 *   3. Crea backend/.env si falta, con secretos aleatorios y la
 *      configuracion de desarrollo por defecto.
 *   4. Informa los siguientes pasos.
 *
 * Uso:
 *   node scripts/bootstrap.js          # o `npm run env:bootstrap`
 *   node scripts/bootstrap.js --force  # regenera los .env (sobrescribe)
 *
 * Solo usa la biblioteca estandar de Node: funciona igual en
 * Windows, Linux y macOS.
 */

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..');
const FORCE = process.argv.includes('--force');

const NODE_MINIMA = [22, 12, 0];

/** Genera un secreto hexadecimal aleatorio y seguro. */
function secreto(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/** Compara la version de Node en ejecucion con la minima requerida. */
function verificarNode() {
  const [mayor, menor, parche] = process.versions.node
    .split('.')
    .map((n) => Number.parseInt(n, 10));
  const [minMayor, minMenor, minParche] = NODE_MINIMA;

  const actual = mayor * 1e6 + menor * 1e3 + parche;
  const minima = minMayor * 1e6 + minMenor * 1e3 + minParche;

  if (actual < minima) {
    console.error(
      `[bootstrap] ERROR: Node ${process.versions.node} es demasiado antiguo.\n` +
        `            Se requiere Node >= ${NODE_MINIMA.join('.')} (vea .nvmrc).\n` +
        `            Instale la version con: nvm install && nvm use`,
    );
    process.exit(1);
  }
  console.log(`[bootstrap] Node ${process.versions.node} OK (>= ${NODE_MINIMA.join('.')})`);
}

/**
 * Crea un archivo a partir de una plantilla solo si no existe.
 * @param {string} destino Ruta absoluta del archivo a crear.
 * @param {string} contenido Texto que se escribira.
 * @returns {boolean} true si lo creo, false si ya existia.
 */
function crearSiFalta(destino, contenido) {
  const relativo = path.relative(RAIZ, destino);
  if (fs.existsSync(destino) && !FORCE) {
    console.log(`[bootstrap] ${relativo} ya existe: se conserva sin cambios.`);
    return false;
  }
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, contenido, { encoding: 'utf8', mode: 0o600 });
  console.log(`[bootstrap] ${relativo} creado` + (FORCE ? ' (--force)' : ''));
  return true;
}

/** Contenido del .env de la raiz (usado por docker-compose.yml). */
function envRaiz() {
  return `# Generado por scripts/bootstrap.js - NO versionar este archivo.
# Se usa con: docker compose up --build  (stack completo de produccion)

# Clave root del contenedor MySQL (solo administracion interna)
MYSQL_ROOT_PASSWORD=${secreto(24)}

# Base de datos de la aplicacion
DB_NAME=facturaexpress_apirest
DB_USER=facturaexpress
DB_PASSWORD=${secreto(24)}

# Secreto de firma JWT (obligatorio)
JWT_SECRET=${secreto(32)}
JWT_EXPIRES_IN=8h

# Origen autorizado del frontend (con credenciales/cookies)
CORS_ORIGIN=http://localhost:4200
`;
}

/**
 * Contenido del .env del backend.
 * @param {{host: string, puerto: number, mail: boolean}} modo
 *   host/puerto de MySQL y si se activa la captura de correo.
 */
function envBackend(modo) {
  const { host, puerto, mail } = modo;
  return `# Generado por scripts/bootstrap.js - NO versionar este archivo.

# --- Entorno ---
NODE_ENV=development

# --- Servidor HTTP ---
PORT=4000

# --- CORS ---
CORS_ORIGIN=http://localhost:4200

# --- JWT ---
JWT_SECRET=${secreto(32)}
JWT_EXPIRES_IN=8h

# --- Base de datos MySQL ---
DB_HOST=${host}
DB_PORT=${puerto}
DB_USER=root
DB_PASSWORD=${modo.password}
DB_NAME=facturaexpress_apirest
DB_SKIP_CREATE=${modo.skipCreate}

# --- Credenciales del seed (evita perder las claves aleatorias en dev) ---
SEED_ADMIN_PASSWORD=Admin123*
SEED_VENDEDOR_PASSWORD=Vendedor123*
SEED_CONTADOR_PASSWORD=Contador123*

# --- Correo (Mailpit del docker-compose.dev.yml) ---
# Dejar MAIL_USERNAME/MAIL_PASSWORD vacios desactiva el envio
# (ver backend/services/email.service.js).
MAIL_HOST=${mail ? '127.0.0.1' : 'smtp.gmail.com'}
MAIL_PORT=${mail ? '1025' : '587'}
MAIL_USERNAME=${mail ? 'dev@facturaexpress.local' : ''}
MAIL_PASSWORD=${mail ? 'dev' : ''}
`;
}

function principal() {
  console.log('=== FacturaExpress - bootstrap ===\n');
  verificarNode();

  const creados = [];

  // 1) .env de la raiz -> lo consume docker-compose.yml (stack completo)
  if (crearSiFalta(path.join(RAIZ, '.env'), envRaiz())) {
    creados.push('.env');
  }

  // 2) backend/.env -> lo consume la API al correr en el host.
  //    Por defecto apunta al MySQL del docker-compose.dev.yml (127.0.0.1:3308).
  const envBackendContenido = envBackend({
    host: '127.0.0.1',
    puerto: 3308,
    mail: true,
    password: 'devroot',
    skipCreate: 1,
  });
  if (crearSiFalta(path.join(RAIZ, 'backend', '.env'), envBackendContenido)) {
    creados.push('backend/.env');
  }

  console.log('');
  if (creados.length === 0) {
    console.log('[bootstrap] Nada que crear: el entorno ya estaba preparado.');
  } else {
    console.log(`[bootstrap] Listo. Archivos creados: ${creados.join(', ')}`);
  }

  console.log(`
Siguientes pasos:

  1) Instalar dependencias
       npm install && npm run install:all

  2) Levantar la infraestructura de desarrollo (MySQL 3308 + Mailpit + Adminer)
       npm run infra:up

  3) Preparar la base de datos (en este orden)
       npm run db:seed && npm run db:migrate

  4) Arrancar la aplicacion (API + Angular con recarga automatica)
       npm run dev

  Alternativa: si backend/.env apunta a su MySQL local (puerto 3306),
  ajuste DB_HOST/DB_PORT/DB_PASSWORD/DB_SKIP_CREATE en ese archivo.
`);
}

principal();
