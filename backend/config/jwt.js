/**
 * config/jwt.js
 * Utilidades para la generacion y verificacion de tokens JWT.
 * Centraliza la configuracion (secreto y expiracion) para que
 * los controladores no dependan directamente de jsonwebtoken.
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();

const NODE_ENV = process.env.NODE_ENV || 'development';

// En produccion el secreto es obligatorio: un valor por defecto conocido
// permitia falsificar tokens. La API se detiene si no esta configurado.
if (NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error(
    '[security] JWT_SECRET es obligatorio en produccion. Definalo en las variables de entorno.'
  );
}

/**
 * Secreto para firmar los tokens (desde variables de entorno).
 * En desarrollo, si no esta definido, se genera uno aleatorio por
 * proceso: evita viajar con un secreto conocido en el codigo fuente.
 * Consecuencia: las sesiones se invalidan al reiniciar la API.
 */
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  JWT_SECRET = crypto.randomBytes(48).toString('hex');
  console.warn(
    '[security] JWT_SECRET no definido: se genero un secreto aleatorio temporal ' +
      '(las sesiones expiran al reiniciar). Definalo en el archivo .env para persistencia.'
  );
}
/** Tiempo de expiracion del token (ej: 8h, 1d) */
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

/**
 * Convierte una duracion en formato corto (ej: '8h', '30m', '7d')
 * a milisegundos. Se usa para sincronizar la vigencia de la cookie
 * httpOnly con la expiracion del token JWT.
 * @param {string} duration - Duracion en formato {numero}{unidad}.
 * @returns {number} Duracion en milisegundos.
 */
function parseDurationToMs(duration) {
  const match = String(duration).trim().match(/^(\d+)\s*([smhd]|ms)$/i);
  if (!match) return 8 * 60 * 60 * 1000; // 8 horas por defecto
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = { ms: 1, s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
  return value * multipliers[unit];
}

/** Duracion de la cookie de sesion en milisegundos */
const COOKIE_MAX_AGE_MS = parseDurationToMs(JWT_EXPIRES_IN);

/**
 * Genera un token JWT para un usuario.
 * Incluye un identificador unico (jti) que permite revocar el
 * token individualmente (lista de tokens_revocados en logout).
 * @param {object} payload - Datos que viajan dentro del token.
 * @returns {string} Token firmado.
 */
function generateToken(payload) {
  return jwt.sign({ ...payload, jti: crypto.randomUUID() }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

/**
 * Verifica la firma y vigencia de un token JWT.
 * @param {string} token - Token a validar.
 * @returns {object} Payload decodificado del token.
 * @throws {Error} Si el token es invalido o expiro.
 */
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = { generateToken, verifyToken, COOKIE_MAX_AGE_MS };
