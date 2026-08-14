/**
 * controllers/logs.controller.js
 * Controlador del modulo de auditoria.
 * Permite consultar la bitacora de operaciones del sistema con
 * filtros por tabla afectada y por usuario.
 */

const { pool } = require('../config/db');
const { asyncHandler, createHttpError } = require('../middleware/errorHandler');

/**
 * Normaliza una fila de logs_auditoria para el frontend.
 * @param {object} row - Fila de logs_auditoria (con JOIN a usuarios).
 * @returns {object} Registro normalizado.
 */
function mapLogRow(row) {
  return {
    id: row.id,
    usuarioId: row.usuario_id,
    usuarioNombre: row.usuario_nombre || 'Sistema',
    accion: row.accion,
    tabla: row.tabla_afectada,
    registroId: row.registro_id,
    ip: row.ip_origen || '--',
    fecha: row.created_at,
  };
}

/**
 * GET /api/logs
 * Lista los registros de auditoria. Query params:
 *  - tabla: filtra por tabla afectada.
 *  - usuarioId: filtra por usuario.
 *  - limite: cantidad maxima (default 100).
 */
const listLogs = asyncHandler(async (req, res) => {
  const { tabla = '', usuarioId = '', limite = 100 } = req.query;
  const condiciones = [];
  const parametros = [];

  if (tabla.trim()) {
    condiciones.push('l.tabla_afectada = ?');
    parametros.push(tabla.trim());
  }
  if (usuarioId && Number.isInteger(Number(usuarioId)) && Number(usuarioId) > 0) {
    condiciones.push('l.usuario_id = ?');
    parametros.push(Number(usuarioId));
  } else if (usuarioId) {
    throw createHttpError(400, 'El usuarioId debe ser un numero valido.');
  }

  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';
  const limiteFinal = Math.min(Math.max(Number(limite) || 100, 1), 500);

  const [rows] = await pool.query(
    `SELECT l.id, l.usuario_id, l.accion, l.tabla_afectada, l.registro_id,
            l.ip_origen, l.created_at, u.nombre AS usuario_nombre
       FROM logs_auditoria l
       LEFT JOIN usuarios u ON u.id = l.usuario_id
       ${where}
      ORDER BY l.created_at DESC
      LIMIT ?`,
    [...parametros, limiteFinal]
  );

  // Tablas disponibles para el filtro de la interfaz
  const [tablas] = await pool.query(
    `SELECT DISTINCT tabla_afectada AS tabla
       FROM logs_auditoria
      ORDER BY tabla_afectada ASC`
  );

  res.json({
    success: true,
    logs: rows.map(mapLogRow),
    tablas: tablas.map((t) => t.tabla),
  });
});

module.exports = { listLogs };
