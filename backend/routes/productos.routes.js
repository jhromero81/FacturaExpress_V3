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
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  productoBaseValidator,
  productoUpdateValidator,
  ajusteStockValidator,
  idValidator,
} = require('../validators');

const router = Router();

// Todas las rutas de productos requieren autenticacion
router.use(authenticate);

router.get('/', listProductos);
router.get('/:id', idValidator, validate, getProducto);
router.post('/', productoBaseValidator, validate, createProducto);
router.put('/:id', idValidator, productoUpdateValidator, validate, updateProducto);
router.patch('/:id/stock', ajusteStockValidator, validate, adjustStock);
router.delete('/:id', idValidator, validate, deleteProducto);

module.exports = router;
