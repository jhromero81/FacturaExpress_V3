/**
 * middleware/security.js
 * Middlewares de seguridad de la API:
 *  - loginLimiter: limita los intentos de inicio de sesion para
 *    prevenir ataques de fuerza bruta.
 *  - apiLimiter: limite general para peticiones anonimas.
 *  - apiAuthLimiter: limite ampliado para clientes autenticados
 *    (cookie httpOnly o header Bearer), cuyas operaciones legitimas
 *    (listados, POS, reportes) requieren mas volumen de peticiones.
 */

const rateLimit = require('express-rate-limit');

/**
 * Indica si la peticion trae un token de sesion (autenticada).
 * @param {object} req - Objeto de peticion de Express.
 * @returns {boolean}
 */
function tieneToken(req) {
  const authHeader = req.headers.authorization || '';
  return authHeader.startsWith('Bearer ') || Boolean(req.cookies?.token);
}

/**
 * Limite estricto para el endpoint de inicio de sesion.
 * Permite 5 intentos cada 15 minutos por direccion IP.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // Ventana de 15 minutos
  limit: 5, // Maximo de intentos por ventana
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiados intentos de inicio de sesion. Intente de nuevo en 15 minutos.',
  },
});

/** Rutas exentas del limite general (monitoreo y salud del servicio) */
function esExenta(req) {
  return req.path === '/health';
}

/**
 * Limite general de la API para peticiones ANONIMAS.
 * Permite 120 peticiones por minuto por direccion IP. Los clientes
 * autenticados se saltan este limite (les aplica apiAuthLimiter).
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // Ventana de 1 minuto
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => tieneToken(req) || esExenta(req),
  message: {
    success: false,
    message: 'Demasiadas peticiones. Intente de nuevo en un minuto.',
  },
});

/**
 * Limite ampliado para clientes AUTENTICADOS.
 * Permite 600 peticiones por minuto por direccion IP: cubre el uso
 * intensivo legitimo (punto de venta, reportes) sin abrir la puerta
 * al abuso anonimo.
 */
const apiAuthLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => !tieneToken(req) || esExenta(req),
  message: {
    success: false,
    message: 'Demasiadas peticiones. Intente de nuevo en un minuto.',
  },
});

module.exports = { loginLimiter, apiLimiter, apiAuthLimiter };
