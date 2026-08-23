/**
 * middleware/validate.js
 * Middleware de validacion centralizada con express-validator.
 * Las reglas (loginValidator, clienteBaseValidator, etc.) se ejecutan
 * como middleware previo; este verifica el resultado y responde 400
 * con la lista de campos invalidos en caso de error.
 */

const { validationResult } = require('express-validator');

/**
 * Verifica los errores de validacion acumulados en la peticion.
 * Si hay errores, responde 400; en caso contrario continua con el
 * controlador.
 *
 * @param {object} req - Peticion de Express.
 * @param {object} res - Respuesta de Express.
 * @param {function} next - Siguiente middleware.
 */
function validate(req, res, next) {
  const errors = validationResult(req);

  if (errors.isEmpty()) {
    return next();
  }

  return res.status(400).json({
    success: false,
    message: 'Datos de entrada invalidos.',
    errors: errors.array().map((error) => ({
      campo: error.path,
      mensaje: error.msg,
    })),
  });
}

module.exports = { validate };
