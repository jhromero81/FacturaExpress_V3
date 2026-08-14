/**
 * routes/errores.routes.js
 * Definicion de las rutas del modulo de errores del sistema.
 */

const { Router } = require('express');
const {
  listErrores,
  resolverError,
} = require('../controllers/errores.controller');
const { authenticate } = require('../middleware/auth');

const router = Router();

// Todas las rutas de este modulo exigen autenticacion
router.use(authenticate);

router.get('/', listErrores);
router.patch('/:id/resolver', resolverError);

module.exports = router;
