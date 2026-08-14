/**
 * routes/usuarios.routes.js
 * Definicion de las rutas del modulo de usuarios (solo admin).
 */

const { Router } = require('express');
const {
  listUsuarios,
  getUsuario,
  createUsuario,
  updateUsuario,
  toggleActivo,
  deleteUsuario,
} = require('../controllers/usuarios.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  crearUsuarioValidator,
  actualizarUsuarioValidator,
  toggleActivoValidator,
  idValidator,
} = require('../validators');

const router = Router();

// Todas las rutas de este modulo exigen autenticacion (y luego admin por ruta)
router.use(authenticate);

router.get('/', authorize('admin'), listUsuarios);
router.get('/:id', authorize('admin'), idValidator, validate, getUsuario);
router.post('/', authorize('admin'), crearUsuarioValidator, validate, createUsuario);
router.put('/:id', authorize('admin'), idValidator, actualizarUsuarioValidator, validate, updateUsuario);
router.patch('/:id/activo', authorize('admin'), toggleActivoValidator, validate, toggleActivo);
router.delete('/:id', authorize('admin'), idValidator, validate, deleteUsuario);

module.exports = router;
