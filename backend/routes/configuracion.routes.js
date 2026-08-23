/**
 * routes/configuracion.routes.js
 * Definicion de las rutas del modulo de configuracion.
 */

const { Router } = require('express');
const {
  getConfiguracion,
  updateEmpresa,
  updateFiscal,
  syncDIAN,
} = require('../controllers/configuracion.controller');
const { authenticate } = require('../middleware/auth');

const router = Router();

// Todas las rutas de configuracion requieren autenticacion
router.use(authenticate);

router.get('/', getConfiguracion);
router.put('/empresa', updateEmpresa);
router.put('/fiscal', updateFiscal);
router.post('/dian/sync', syncDIAN);

module.exports = router;
