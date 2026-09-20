/**
 * routes/clientes.routes.js
 * Definicion de las rutas del modulo de clientes.
 */

const { Router } = require('express');
const {
  listClientes,
  getCliente,
  createCliente,
  updateCliente,
  deleteCliente,
} = require('../controllers/clientes.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { clienteBaseValidator, clienteUpdateValidator, idValidator } = require('../validators');

const router = Router();

// Todas las rutas de clientes requieren autenticacion. Los permisos de
// escritura siguen la matriz de permisos por rol documentada:
// lectura para todos, alta/edicion para admin y vendedor, eliminacion
// solo para admin.
router.use(authenticate);

router.get('/', listClientes);
router.get('/:id', idValidator, validate, getCliente);
router.post('/', authorize('admin', 'vendedor'), clienteBaseValidator, validate, createCliente);
router.put('/:id', authorize('admin', 'vendedor'), idValidator, clienteUpdateValidator, validate, updateCliente);
router.delete('/:id', authorize('admin'), idValidator, validate, deleteCliente);

module.exports = router;
