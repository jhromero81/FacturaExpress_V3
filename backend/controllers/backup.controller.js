/**
 * controllers/backup.controller.js
 * Controlador del modulo de respaldos y restauracion (solo rol admin).
 * Expone la creacion, descarga, restauracion y eliminacion de los
 * respaldos SQL de la base de datos.
 */

const { pool } = require('../config/db');
const { asyncHandler, createHttpError } = require('../middleware/errorHandler');
const { registrarAuditoria } = require('../utils/auditoria');
const backupService = require('../services/backup.service');

/**
 * GET /api/backups
 * Lista los respaldos disponibles con su informacion.
 */
const listBackups = asyncHandler(async (req, res) => {
  const archivos = backupService.listarBackups();

  const [registros] = await pool.query(
    'SELECT archivo, usuario_id, created_at FROM backups'
  );
  const usuarioPorArchivo = new Map(registros.map((r) => [r.archivo, r.usuario_id]));

  res.json({
    success: true,
    backups: archivos.map((a) => ({
      archivo: a.archivo,
      tamano: a.tamano,
      fecha: a.fecha,
      usuarioId: usuarioPorArchivo.get(a.archivo) || null,
    })),
  });
});

/**
 * POST /api/backups
 * Crea un nuevo respaldo de la base de datos.
 */
const crearBackup = asyncHandler(async (req, res) => {
  const respaldo = await backupService.crearBackup();

  await pool.query(
    'INSERT INTO backups (archivo, tamano, usuario_id) VALUES (?, ?, ?)',
    [respaldo.archivo, respaldo.tamano, req.usuario.id]
  );

  await registrarAuditoria(req, `BACKUP creado: ${respaldo.archivo}`, 'backups');

  res.status(201).json({
    success: true,
    message: 'Respaldo creado correctamente.',
    backup: {
      archivo: respaldo.archivo,
      tamano: respaldo.tamano,
      fecha: new Date(),
      usuarioId: req.usuario.id,
    },
  });
});

/**
 * POST /api/backups/restaurar
 * Restaura la base de datos desde un respaldo. Body: { archivo }.
 */
const restaurarBackup = asyncHandler(async (req, res) => {
  const { archivo } = req.body || {};

  if (!archivo) {
    throw createHttpError(400, 'Debe indicar el archivo de respaldo a restaurar.');
  }

  await backupService.restaurarBackup(archivo);

  await registrarAuditoria(req, `RESTORE desde ${archivo}`, 'backups');

  res.json({ success: true, message: `Base de datos restaurada desde ${archivo}.` });
});

/**
 * GET /api/backups/:archivo/download
 * Descarga un respaldo como archivo SQL.
 */
const descargarBackup = asyncHandler(async (req, res) => {
  const ruta = backupService.getBackupPath(req.params.archivo);
  if (!ruta) {
    throw createHttpError(404, 'Respaldo no encontrado.');
  }
  res.download(ruta, req.params.archivo);
});

/**
 * DELETE /api/backups/:archivo
 * Elimina un respaldo de la base de datos.
 */
const eliminarBackup = asyncHandler(async (req, res) => {
  const archivo = req.params.archivo;

  backupService.eliminarBackup(archivo);

  await pool.query('DELETE FROM backups WHERE archivo = ?', [archivo]);
  await registrarAuditoria(req, `DELETE backup ${archivo}`, 'backups');

  res.json({ success: true, message: `Respaldo ${archivo} eliminado.` });
});

module.exports = {
  listBackups,
  crearBackup,
  restaurarBackup,
  descargarBackup,
  eliminarBackup,
};
