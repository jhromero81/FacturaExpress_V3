/**
 * routes/errores.routes.js
 * Definicion de las rutas del modulo de errores del sistema.
 * Solo el rol admin consulta y resuelve los errores registrados por
 * los procesos internos (firma, DIAN, correo, base de datos).
 */

const { Router } = require('express');
const {
  listErrores,
  resolverError,
} = require('../controllers/errores.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { idValidator } = require('../validators');

const router = Router();

// Todas las rutas de este modulo exigen autenticacion y rol admin
router.use(authenticate, authorize('admin'));

router.get('/', listErrores);
router.patch('/:id/resolver', idValidator, validate, resolverError);

module.exports = router;