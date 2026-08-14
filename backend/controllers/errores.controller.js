/**
 * controllers/errores.controller.js
 * Controlador del modulo "Errores del Sistema".
 * Permite listar, filtrar por tipo y marcar como resueltos los
 * errores registrados por los procesos internos de la aplicacion.
 */

const { pool } = require('../config/db');
const { asyncHandler, createHttpError } = require('../middleware/errorHandler');
const { registrarAuditoria } = require('../utils/auditoria');

/** Tipos de error conocidos por el sistema */
const TIPOS_ERROR = ['firma', 'dian', 'bd', 'correo', 'otro'];

/**
 * Normaliza una fila de errores_sistema para el frontend.
 * @param {object} row - Fila de errores_sistema.
 * @returns {object} Error normalizado.
 */
function mapErrorRow(row) {
  return {
    id: row.id,
    mensaje: row.mensaje,
    tipo: row.tipo,
    facturaId: row.factura_id,
    facturaNumero: row.numero,
    resuelto: Boolean(row.resuelto),
    fechaResolucion: row.fecha_resolucion,
    createdAt: row.created_at,
  };
}

/**
 * GET /api/errores
 * Lista los errores del sistema. Query params:
 *  - tipo: filtra por tipo de error.
 *  - resuelto: filtra por estado (1, 0) o vacio para todos.
 */
const listErrores = asyncHandler(async (req, res) => {
  const { tipo = '', resuelto = '' } = req.query;
  const condiciones = [];
  const parametros = [];

  if (tipo && TIPOS_ERROR.includes(tipo)) {
    condiciones.push('e.tipo = ?');
    parametros.push(tipo);
  }
  if (resuelto === '1' || resuelto === '0') {
    condiciones.push('e.resuelto = ?');
    parametros.push(Number(resuelto));
  }

  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

  // Contadores para los KPIs del modulo
  const [counts] = await pool.query(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(e.resuelto = 1), 0) AS resueltos,
            COALESCE(SUM(e.resuelto = 0), 0) AS noResueltos
       FROM errores_sistema e
       ${where}`,
    parametros
  );

  const [rows] = await pool.query(
    `SELECT e.id, e.mensaje, e.tipo, e.factura_id, e.resuelto,
            e.fecha_resolucion, e.created_at, f.numero
       FROM errores_sistema e
       LEFT JOIN facturas f ON f.id = e.factura_id
       ${where}
      ORDER BY e.created_at DESC
      LIMIT 200`,
    parametros
  );

  res.json({
    success: true,
    total: Number(counts[0].total),
    resueltos: Number(counts[0].resueltos),
    noResueltos: Number(counts[0].noResueltos),
    errores: rows.map(mapErrorRow),
  });
});

/**
 * PATCH /api/errores/:id/resolver
 * Marca un error como resuelto.
 */
const resolverError = asyncHandler(async (req, res) => {
  const [result] = await pool.query(
    `UPDATE errores_sistema
        SET resuelto = 1, fecha_resolucion = NOW()
      WHERE id = ?`,
    [req.params.id]
  );
  if (result.affectedRows === 0) {
    throw createHttpError(404, 'Error no encontrado.');
  }

  await registrarAuditoria(req, `RESOLVER error id=${req.params.id}`, 'errores_sistema', req.params.id);

  res.json({ success: true, message: 'Error marcado como resuelto.' });
});

module.exports = { listErrores, resolverError };
