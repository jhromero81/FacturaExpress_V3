/**
 * middleware/security.js
 * Middlewares de seguridad de la API:
 *  - loginLimiter: limita los intentos de inicio de sesion para
 *    prevenir ataques de fuerza bruta.
 *  - apiLimiter: limita el trafico general de la API.
 */

const rateLimit = require('express-rate-limit');

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

/**
 * Limite general de la API.
 * Permite 120 peticiones por minuto por direccion IP.
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // Ventana de 1 minuto
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiadas peticiones. Intente de nuevo en un minuto.',
  },
});

module.exports = { loginLimiter, apiLimiter };
