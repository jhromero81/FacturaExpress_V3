/**
 * middleware/errorHandler.js
 * Manejo centralizado de errores y de rutas no encontradas.
 * Garantiza que toda respuesta erronea de la API tenga una
 * estructura JSON consistente: { success, message }.
 */

/**
 * Middleware para rutas inexistentes (404).
 * Se registra despues de todas las rutas de la aplicacion.
 * @param {object} req - Objeto de peticion de Express.
 * @param {object} res - Objeto de respuesta de Express.
 */
function notFound(req, res) {
  res.status(404).json({
    success: false,
    // Solo el metodo y la ruta: reflejar la URL completa incluia la cadena
    // de consulta enviada por el cliente en la respuesta.
    message: `Recurso no encontrado: ${req.method} ${req.path}`,
  });
}

/**
 * Manejador central de errores.
 * Recibe cualquier error lanzado por los controladores.
 * @param {Error} error - Error capturado.
 * @param {object} req - Objeto de peticion de Express.
 * @param {object} res - Objeto de respuesta de Express.
 * @param {function} next - Funcion siguiente (no utilizada).
 */
function errorHandler(error, req, res, next) {
  // Registrar el error completo en consola para diagnostico
  console.error(`[error] ${error.stack || error.message}`);

  // Errores controlados por la aplicacion llevan statusCode
  const statusCode = error.statusCode || 500;

  // En produccion los errores 500 no exponen detalles internos
  // (consultas SQL, rutas, etc.) al cliente; solo se loguean.
  const ocultarDetalle = statusCode >= 500 && process.env.NODE_ENV === 'production';

  res.status(statusCode).json({
    success: false,
    message: ocultarDetalle ? 'Error interno del servidor.' : error.message,
  });
}

/**
 * Envoltorio para controladores asincronos.
 * Captura errores de promesas rechazadas y los envia al
 * manejador central, evitando try/catch repetido en cada ruta.
 * Devuelve la promesa para que quien invoque el controlador (por
 * ejemplo una prueba) pueda esperar a que termine; Express ignora el
 * valor de retorno y sigue usando `next`.
 * @param {function} handler - Controlador asincrono.
 * @returns {function} Controlador envuelto para Express.
 */
function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

/**
 * Fabrica de errores de aplicacion con codigo HTTP.
 * @param {number} statusCode - Codigo HTTP de la respuesta.
 * @param {string} message - Mensaje descriptivo del error.
 * @returns {Error} Error con propiedades de status.
 */
function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = { notFound, errorHandler, asyncHandler, createHttpError };
