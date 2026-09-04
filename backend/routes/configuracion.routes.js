/**
 * routes/configuracion.routes.js
 * Definicion de las rutas del modulo de configuracion.
 * Todas las operaciones de escritura estan restringidas al rol admin
 * (modificar los datos de la empresa o la configuracion fiscal no debe
 * estar al alcance de vendedores/contadores).
 */

const { Router } = require('express');
const {
  getConfiguracion,
  updateEmpresa,
  updateFiscal,
  syncDIAN,
} = require('../controllers/configuracion.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  configuracionEmpresaValidator,
  configuracionFiscalValidator,
} = require('../validators');

const router = Router();

// Todas las rutas de configuracion requieren autenticacion
router.use(authenticate);

router.get('/', getConfiguracion);
router.put('/empresa', authorize('admin'), configuracionEmpresaValidator, validate, updateEmpresa);
router.put('/fiscal', authorize('admin'), configuracionFiscalValidator, validate, updateFiscal);
router.post('/dian/sync', authorize('admin'), syncDIAN);

module.exports = router;