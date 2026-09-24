/**
 * routes/facturas.routes.js
 * Definicion de las rutas del modulo de ventas y facturacion.
 */

const { Router } = require('express');
const {
  listFacturas,
  getFactura,
  createFactura,
  updateEstadoFactura,
  deleteFactura,
  getFacturaPDF,
  getFacturaXML,
  getFacturaCSV,
} = require('../controllers/facturas.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  createFacturaValidator,
  updateEstadoFacturaValidator,
  idValidator,
} = require('../validators');

const router = Router();

// Todas las rutas de facturas requieren autenticacion. Los permisos
// siguen la matriz documentada por rol:
//  - consulta y descargas: todos los roles.
//  - emision de la venta: admin y vendedor.
//  - cambio de estado DIAN: admin y contador (funcion contable).
//  - eliminacion: solo admin (afecta registros fiscales).
router.use(authenticate);

router.get('/', listFacturas);
router.post('/', authorize('admin', 'vendedor'), createFacturaValidator, validate, createFactura);
router.get('/:id', idValidator, validate, getFactura);
router.get('/:id/pdf', idValidator, validate, getFacturaPDF);
router.get('/:id/xml', idValidator, validate, getFacturaXML);
router.get('/:id/csv', idValidator, validate, getFacturaCSV);
router.put('/:id/estado', authorize('admin', 'contador'), updateEstadoFacturaValidator, validate, updateEstadoFactura);
router.delete('/:id', authorize('admin'), idValidator, validate, deleteFactura);

module.exports = router;
