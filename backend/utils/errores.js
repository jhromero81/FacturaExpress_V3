/**
 * utils/errores.js
 * Servicio del modulo "Errores del Sistema".
 * Permite registrar errores de los procesos internos (firma, DIAN,
 * base de datos, correo u otros) en la tabla errores_sistema y
 * consultarlos desde la interfaz de administracion.
 */

const { pool } = require('../config/db');

/**
 * Registra un error del sistema en la bitacora.
 * @param {string} mensaje - Descripcion del error.
 * @param {string} tipo - Tipo: firma | dian | bd | correo | otro.
 * @param {number|null} facturaId - Factura asociada (opcional).
 * @returns {Promise<number|null>} Identificador del error registrado.
 */
async function registrarError(mensaje, tipo = 'otro', facturaId = null) {
  try {
    const [result] = await pool.query(
      `INSERT INTO errores_sistema (mensaje, tipo, factura_id)
       VALUES (?, ?, ?)`,
      [String(mensaje).slice(0, 2000), tipo, facturaId || null]
    );
    return result.insertId;
  } catch (error) {
    console.error(`[errores] No fue posible registrar el error: ${error.message}`);
    return null;
  }
}

module.exports = { registrarError };
