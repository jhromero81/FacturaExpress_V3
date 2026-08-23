/**
 * utils/auditoria.js
 * Servicio de auditoria del sistema.
 * Registra en la tabla logs_auditoria cada operacion critica
 * (insercion, actualizacion o eliminacion) realizada por un
 * usuario autenticado, incluyendo la IP de origen.
 */

const { pool } = require('../config/db');

/**
 * Obtiene la direccion IP real del cliente, priorizando el
 * encabezado X-Forwarded-For cuando existe (proxies inversos).
 * @param {object} req - Objeto de peticion de Express.
 * @returns {string} IP de origen de la peticion.
 */
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const primera = String(forwarded).split(',')[0].trim();
    if (primera) return primera;
  }
  return req.ip || 'desconocida';
}

/**
 * Registra una accion en la bitacora de auditoria.
 * @param {object} req - Objeto de peticion de Express (req.usuario).
 * @param {string} accion - Descripcion de la accion (ej: "INSERT cliente").
 * @param {string} tabla - Tabla afectada (clientes, productos, facturas...).
 * @param {number|null} registroId - Identificador del registro afectado.
 * @returns {Promise<void>}
 */
async function registrarAuditoria(req, accion, tabla = 'general', registroId = null) {
  const usuarioId = (req.usuario && req.usuario.id) || null;
  try {
    await pool.query(
      `INSERT INTO logs_auditoria (usuario_id, accion, tabla_afectada, registro_id, ip_origen)
       VALUES (?, ?, ?, ?, ?)`,
      [usuarioId, accion, tabla, registroId, getClientIp(req)]
    );
  } catch (error) {
    // La auditoria nunca debe impedir la operacion principal
    console.error(`[auditoria] No fue posible registrar la accion "${accion}": ${error.message}`);
  }
}

/**
 * Registra una accion de auditoria a partir de un usuario ya
 * resuelto (utilizado fuera de controladores).
 * @param {number|null} usuarioId - Identificador del usuario.
 * @param {string} accion - Descripcion de la accion.
 * @param {string} tabla - Tabla afectada.
 * @param {number|null} registroId - Identificador del registro.
 * @param {string} ip - IP de origen.
 * @returns {Promise<void>}
 */
async function registrarAuditoriaDirecta(usuarioId, accion, tabla = 'general', registroId = null, ip = null) {
  try {
    await pool.query(
      `INSERT INTO logs_auditoria (usuario_id, accion, tabla_afectada, registro_id, ip_origen)
       VALUES (?, ?, ?, ?, ?)`,
      [usuarioId, accion, tabla, registroId, ip]
    );
  } catch (error) {
    console.error(`[auditoria] No fue posible registrar la accion "${accion}": ${error.message}`);
  }
}

module.exports = { getClientIp, registrarAuditoria, registrarAuditoriaDirecta };
