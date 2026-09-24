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

/** Valores de ejemplo que NUNCA deben usarse como secreto real */
const SECRETOS_PLACEHOLDER = [
  'cambia_este_secreto_por_una_cadena_aleatoria_larga',
  'cambia_este_secreto',
  'changeme',
  'secret',
  'secreto',
  'jwt_secret',
];

/** Longitud minima exigida al secreto en produccion */
const MIN_SECRETO_LARGO = 32;

/**
 * Valida el secreto JWT en produccion. Antes solo se comprobaba que la
 * variable existiera, de modo que el valor de ejemplo del .env.example
 * era aceptado literalmente y cualquiera podia firmar tokens validos.
 * @param {string} secreto - Secreto configurado.
 * @returns {string|null} Mensaje de error, o null si es aceptable.
 */
function validarSecreto(secreto) {
  if (!secreto) {
    return 'JWT_SECRET es obligatorio en produccion. Definalo en las variables de entorno.';
  }
  if (secreto.length < MIN_SECRETO_LARGO) {
    return `JWT_SECRET debe tener al menos ${MIN_SECRETO_LARGO} caracteres en produccion.`;
  }
  if (SECRETOS_PLACEHOLDER.includes(secreto.trim().toLowerCase())) {
    return 'JWT_SECRET conserva el valor de ejemplo. Genere uno aleatorio antes de desplegar.';
  }
  return null;
}

if (NODE_ENV === 'production') {
  const errorSecreto = validarSecreto(process.env.JWT_SECRET);
  if (errorSecreto) {
    throw new Error(`[security] ${errorSecreto}`);
  }
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
 * Emisor y audiencia del token. Estaban documentados en el .env.example
 * pero el codigo nunca los leia ni los validaba, de modo que un token
 * emitido para otro servicio con el mismo secreto era aceptado.
 */
const JWT_ISSUER = process.env.JWT_ISSUER || 'facturaexpress-api';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'facturaexpress-web';

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
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

/**
 * Verifica la firma y vigencia de un token JWT, exigiendo ademas el
 * emisor y la audiencia esperados.
 * @param {string} token - Token a validar.
 * @returns {object} Payload decodificado del token.
 * @throws {Error} Si el token es invalido o expiro.
 */
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

module.exports = {
  generateToken,
  verifyToken,
  COOKIE_MAX_AGE_MS,
  JWT_ISSUER,
  JWT_AUDIENCE,
};
