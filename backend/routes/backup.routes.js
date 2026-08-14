/**
 * routes/backup.routes.js
 * Definicion de las rutas del modulo de respaldos (solo admin).
 */

const { Router } = require('express');
const {
  listBackups,
  crearBackup,
  restaurarBackup,
  descargarBackup,
  eliminarBackup,
} = require('../controllers/backup.controller');
const { authenticate, authorize } = require('../middleware/auth');

const router = Router();

// Respaldo y restauracion: solo autenticados con rol admin
router.use(authenticate, authorize('admin'));

router.get('/', listBackups);
router.post('/', crearBackup);
router.post('/restaurar', restaurarBackup);
router.get('/:archivo/download', descargarBackup);
router.delete('/:archivo', eliminarBackup);

module.exports = router;
