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
    'SELECT archivo, usuario_id, checksum, created_at FROM backups'
  );
  const registroPorArchivo = new Map(registros.map((r) => [r.archivo, r]));

  res.json({
    success: true,
    backups: archivos.map((a) => {
      const registro = registroPorArchivo.get(a.archivo);
      return {
        archivo: a.archivo,
        tamano: a.tamano,
        fecha: a.fecha,
        usuarioId: registro?.usuario_id || null,
        // Un respaldo sin huella registrada no se puede verificar al
        // restaurar (corresponde a versiones anteriores del modulo).
        verificado: Boolean(registro?.checksum),
      };
    }),
  });
});

/**
 * POST /api/backups
 * Crea un nuevo respaldo de la base de datos.
 */
const crearBackup = asyncHandler(async (req, res) => {
  const respaldo = await backupService.crearBackup();

  await pool.query(
    'INSERT INTO backups (archivo, tamano, checksum, usuario_id) VALUES (?, ?, ?, ?)',
    [respaldo.archivo, respaldo.tamano, respaldo.checksum, req.usuario.id]
  );

  await registrarAuditoria(req, `BACKUP creado: ${respaldo.archivo}`, 'backups');

  res.status(201).json({
    success: true,
    message: 'Respaldo creado correctamente.',
    backup: {
      archivo: respaldo.archivo,
      tamano: respaldo.tamano,
      checksum: respaldo.checksum,
      fecha: new Date(),
      usuarioId: req.usuario.id,
    },
  });
});

/**
 * POST /api/backups/restaurar
 * Restaura la base de datos desde un respaldo. Body: { archivo }.
 * Solo se aceptan respaldos registrados (con huella conocida).
 */
const restaurarBackup = asyncHandler(async (req, res) => {
  const { archivo } = req.body || {};

  if (!archivo) {
    throw createHttpError(400, 'Debe indicar el archivo de respaldo a restaurar.');
  }

  const [registros] = await pool.query(
    'SELECT checksum FROM backups WHERE archivo = ?',
    [String(archivo)]
  );
  if (registros.length === 0) {
    throw createHttpError(404, 'El respaldo indicado no esta registrado en el sistema.');
  }

  await backupService.restaurarBackup(String(archivo), registros[0].checksum);

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
