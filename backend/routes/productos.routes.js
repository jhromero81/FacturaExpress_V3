/**
 * routes/productos.routes.js
 * Definicion de las rutas del modulo de productos.
 */

const { Router } = require('express');
const {
  listProductos,
  getProducto,
  createProducto,
  updateProducto,
  adjustStock,
  deleteProducto,
} = require('../controllers/productos.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  productoBaseValidator,
  productoUpdateValidator,
  ajusteStockValidator,
  idValidator,
} = require('../validators');

const router = Router();

// Todas las rutas de productos requieren autenticacion. Segun la matriz
// de permisos: catalogo de solo lectura para todos los roles y
// alta/edicion/stock/baja exclusivos del administrador.
router.use(authenticate);

router.get('/', listProductos);
router.get('/:id', idValidator, validate, getProducto);
router.post('/', authorize('admin'), productoBaseValidator, validate, createProducto);
router.put('/:id', authorize('admin'), idValidator, productoUpdateValidator, validate, updateProducto);
router.patch('/:id/stock', authorize('admin'), ajusteStockValidator, validate, adjustStock);
router.delete('/:id', authorize('admin'), idValidator, validate, deleteProducto);

module.exports = router;
