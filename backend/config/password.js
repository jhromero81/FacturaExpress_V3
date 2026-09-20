/**
 * config/password.js
 * Politica de contrasenas del sistema, en un unico lugar para que el
 * validador, los controladores, el seed y el frontend apliquen la
 * misma regla (antes el minimo era 6 en la API y 4 en la interfaz, de
 * modo que el formulario aceptaba claves que la API rechazaba).
 */

/** Longitud minima exigida */
const MIN_PASSWORD = 8;

/** Longitud maxima aceptada (bcrypt trunca a 72 bytes) */
const MAX_PASSWORD = 72;

/** Coste de bcrypt: 12 ~ 250 ms por hash en hardware moderno */
const BCRYPT_ROUNDS = 12;

/** Categorias que debe reunir una contrasena aceptable */
const CATEGORIAS = [
  { nombre: 'una letra minuscula', regex: /[a-z]/ },
  { nombre: 'una letra mayuscula', regex: /[A-Z]/ },
  { nombre: 'un digito', regex: /[0-9]/ },
];

/**
 * Valida una contrasena segun la politica del sistema.
 * @param {*} password - Contrasena en texto plano.
 * @returns {string|null} Mensaje de error, o null si es valida.
 */
function validarPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    return 'La contrasena es obligatoria.';
  }
  if (password.length < MIN_PASSWORD) {
    return `La contrasena debe tener al menos ${MIN_PASSWORD} caracteres.`;
  }
  if (password.length > MAX_PASSWORD) {
    return `La contrasena no puede superar ${MAX_PASSWORD} caracteres.`;
  }
  for (const categoria of CATEGORIAS) {
    if (!categoria.regex.test(password)) {
      return `La contrasena debe incluir ${categoria.nombre}.`;
    }
  }
  return null;
}

module.exports = { MIN_PASSWORD, MAX_PASSWORD, BCRYPT_ROUNDS, validarPassword };
