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

const { testConnection } = require('./config/db');
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
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:4200';

// Middlewares globales
// Helmet: cabeceras HTTP de seguridad (CSP, X-Frame-Options, etc.)
app.use(helmet());
// CORS: permite el origen del frontend con credenciales (cookies)
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
// Cookie parser: necesaria para leer la cookie httpOnly de sesion
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Limites de peticiones para toda la API:
//  - apiLimiter: anonimos (120/min por IP)
//  - apiAuthLimiter: autenticados (600/min, sesion cookie o Bearer)
// La ruta /health queda exenta para monitoreo ininterrumpido.
app.use('/api', apiLimiter);
app.use('/api', apiAuthLimiter);

// Endpoint de salud: verifica que la API este respondiendo
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    servicio: 'FacturaExpress API',
    version: '1.0.0',
    fecha: new Date().toISOString(),
  });
});

// Ruta raiz: evita el 404 opaco y muestra informacion util de la API
app.get('/', (req, res) => {
  res.json({
    success: true,
    servicio: 'FacturaExpress API',
    salud: `/api/health`,
    frontend: CORS_ORIGIN,
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

/**
 * Arranque del servidor.
 * Primero verifica la conexion a la base de datos y luego
 * inicia la escucha de peticiones HTTP.
 */
async function start() {
  try {
    await testConnection();
    app.listen(PORT, () => {
      console.log(`[server] FacturaExpress API escuchando en http://localhost:${PORT}`);
      console.log(`[server] Documentacion disponible en http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error('[server] No fue posible conectar a la base de datos:', error.message);
    console.error('[server] Verifique las credenciales en el archivo .env');
    process.exit(1);
  }
}

start();

module.exports = app;
