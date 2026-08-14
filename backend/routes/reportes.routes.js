/**
 * routes/reportes.routes.js
 * Definicion de las rutas del modulo de reportes.
 */

const { Router } = require('express');
const {
  getKPIs,
  getVentasSemanales,
  getVentasPeriodo,
  getProductosTop,
  getUltimasTransacciones,
  getReportePDF,
  listReportes,
} = require('../controllers/reportes.controller');
const { authenticate } = require('../middleware/auth');

const router = Router();

// Todas las rutas de reportes requieren autenticacion
router.use(authenticate);

router.get('/kpis', getKPIs);
router.get('/ventas-semanales', getVentasSemanales);
router.get('/ventas-periodo', getVentasPeriodo);
router.get('/productos-top', getProductosTop);
router.get('/ultimas-transacciones', getUltimasTransacciones);
router.get('/pdf', getReportePDF);
router.get('/historial', listReportes);

module.exports = router;
