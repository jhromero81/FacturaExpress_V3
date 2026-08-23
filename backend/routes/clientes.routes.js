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
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { clienteBaseValidator, clienteUpdateValidator, idValidator } = require('../validators');

const router = Router();

// Todas las rutas de clientes requieren autenticacion
router.use(authenticate);

router.get('/', listClientes);
router.get('/:id', idValidator, validate, getCliente);
router.post('/', clienteBaseValidator, validate, createCliente);
router.put('/:id', idValidator, clienteUpdateValidator, validate, updateCliente);
router.delete('/:id', idValidator, validate, deleteCliente);

module.exports = router;
