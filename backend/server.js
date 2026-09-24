/**
 * server.js
 * Punto de entrada de la API REST de FacturaExpress.
 * Monta el servidor Express, registra los middlewares globales
 * y las rutas de cada modulo del sistema.
 *
 * Evidencia GA7-220501096-AA5-EV03
 * Stack: Node.js + Express + MySQL
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');

const { pool, testConnection } = require('./config/db');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { apiLimiter, apiAuthLimiter } = require('./middleware/security');

// Rutas de cada modulo del sistema
const authRoutes = require('./routes/auth.routes');
const clientesRoutes = require('./routes/clientes.routes');
const productosRoutes = require('./routes/productos.routes');
const facturasRoutes = require('./routes/facturas.routes');
const configuracionRoutes = require('./routes/configuracion.routes');
const reportesRoutes = require('./routes/reportes.routes');
const usuariosRoutes = require('./routes/usuarios.routes');
const erroresRoutes = require('./routes/errores.routes');
const logsRoutes = require('./routes/logs.routes');
const backupRoutes = require('./routes/backup.routes');

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 4000);

/**
 * Origenes permitidos por CORS. El .env documenta una lista separada por
 * comas; antes se pasaba la cadena completa como un unico origen, de modo
 * que varias origenes nunca coincidian y el navegador bloqueaba la
 * peticion. Se normaliza a un arreglo.
 */
function resolverOrigenesCors() {
  const configurado = process.env.CORS_ORIGIN || 'http://localhost:4200';
  return configurado
    .split(',')
    .map((origen) => origen.trim())
    .filter((origen) => origen.length > 0);
}

const CORS_ORIGINS = resolverOrigenesCors();

/**
 * Detras de un proxy inverso (nginx en produccion) Express debe confiar
 * en el encabezado X-Forwarded-For para conocer la IP real del cliente;
 * sin esto, el rate limiting y la auditoria verian siempre la IP del
 * proxy. Configurable con TRUST_PROXY (numero de saltos, 'loopback',
 * 'false' o lista de IPs).
 */
function resolveTrustProxy() {
  const valor = process.env.TRUST_PROXY;
  if (valor !== undefined && valor !== '') {
    return /^\d+$/.test(valor) ? Number(valor) : valor;
  }
  return process.env.NODE_ENV === 'production' ? 1 : 'loopback';
}
app.set('trust proxy', resolveTrustProxy());

/**
 * Parser de query string simple (querystring nativo) en lugar del
 * extendido: la API solo lee parametros planos y se reduce la superficie
 * de ataque del parseo (anidamiento y prototipos).
 */
app.set('query parser', 'simple');

// Middlewares globales
// Helmet: cabeceras HTTP de seguridad (CSP, X-Frame-Options, etc.)
app.use(helmet());
// CORS: permite los origenes del frontend con credenciales (cookies)
app.use(cors({ origin: CORS_ORIGINS, credentials: true }));
// Cookie parser: necesaria para leer la cookie httpOnly de sesion
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
// extended:false usa el modulo querystring nativo (no 'qs'), reduciendo la
// superficie de ataque de parsing; la API solo consume JSON.
app.use(express.urlencoded({ extended: false }));

// Limites de peticiones para toda la API:
//  - apiLimiter: anonimos (120/min por IP)
//  - apiAuthLimiter: autenticados (600/min, sesion cookie o Bearer)
// El cupo se decide verificando la firma del token, no su mera presencia.
// La ruta /health queda exenta para monitoreo ininterrumpido.
app.use('/api', apiLimiter);
app.use('/api', apiAuthLimiter);

/**
 * Endpoint de salud: verifica que la API y la base de datos respondan.
 * Devuelve 503 si la base de datos no esta disponible, de modo que un
 * orquestador no considere sana una instancia que no puede atender.
 */
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      success: true,
      servicio: 'FacturaExpress API',
      version: '1.0.0',
      baseDatos: 'ok',
      fecha: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      servicio: 'FacturaExpress API',
      version: '1.0.0',
      baseDatos: 'no disponible',
      message: 'La base de datos no responde.',
    });
  }
});

// Ruta raiz: evita el 404 opaco y muestra informacion util de la API
app.get('/', (req, res) => {
  res.json({
    success: true,
    servicio: 'FacturaExpress API',
    salud: `/api/health`,
    frontend: CORS_ORIGINS,
  });
});

// Registrar las rutas de la API bajo el prefijo /api
app.use('/api/auth', authRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/productos', productosRoutes);
app.use('/api/facturas', facturasRoutes);
app.use('/api/configuracion', configuracionRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/errores', erroresRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/backup', backupRoutes);

// Manejadores de rutas no encontradas y errores centralizados
app.use(notFound);
app.use(errorHandler);

/** Cada cuanto se depuran los tokens revocados ya expirados */
const INTERVALO_LIMPIEZA_TOKENS_MS = 60 * 60 * 1000;

/**
 * Elimina de tokens_revocados las entradas cuya vigencia ya termino. Se
 * ejecuta fuera del ciclo de peticion (antes se hacia en cada logout, una
 * escritura anonima y global en el camino critico).
 * @returns {Promise<void>}
 */
async function limpiarTokensExpirados() {
  try {
    await pool.query('DELETE FROM tokens_revocados WHERE expira_en < NOW()');
  } catch (error) {
    console.warn(`[server] No fue posible depurar tokens expirados: ${error.message}`);
  }
}

/**
 * Arranque del servidor.
 * Primero verifica la conexion a la base de datos y luego
 * inicia la escucha de peticiones HTTP.
 * @returns {Promise<void>}
 */
async function start() {
  try {
    await testConnection();
  } catch (error) {
    console.error('[server] No fue posible conectar a la base de datos:', error.message);
    console.error('[server] Verifique las credenciales en el archivo .env');
    process.exit(1);
  }

  const servidor = app.listen(PORT, () => {
    console.log(`[server] FacturaExpress API escuchando en http://localhost:${PORT}`);
    console.log(`[server] Documentacion disponible en http://localhost:${PORT}/api/health`);
  });

  await limpiarTokensExpirados();
  const temporizador = setInterval(limpiarTokensExpirados, INTERVALO_LIMPIEZA_TOKENS_MS);
  temporizador.unref();

  /**
   * Cierre ordenado: deja de aceptar peticiones, espera a las que estan
   * en curso y libera el pool de conexiones. Sin esto, un "docker stop"
   * cortaba las peticiones en vuelo.
   * @param {string} senal - Senal recibida.
   */
  const cerrar = (senal) => {
    console.log(`[server] ${senal} recibido: cerrando ordenadamente...`);
    clearInterval(temporizador);
    servidor.close(async () => {
      await pool.end().catch(() => {});
      console.log('[server] Servidor detenido.');
      process.exit(0);
    });
    // Si alguna conexion queda colgada, forzar la salida.
    setTimeout(() => process.exit(0), 10000).unref();
  };

  process.on('SIGTERM', () => cerrar('SIGTERM'));
  process.on('SIGINT', () => cerrar('SIGINT'));
}

start();

module.exports = app;
