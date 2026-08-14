/**
 * utils/cune.js
 * Generacion del CUDE/CUNE (Codigo Unico de Documento Electronico)
 * de una factura. Es un identificador unico derivado de los datos
 * clave de la factura mediante SHA-256, en el mismo espiritu del
 * modelo de facturacion electronica de la DIAN.
 */

const crypto = require('crypto');

/**
 * Genera el CUNE de una factura a partir de sus datos clave.
 * @param {object} datos - { numero, clienteId, clienteNit, total, fecha }.
 * @returns {string} Hash SHA-256 en hexadecimal mayusculas.
 */
function generarCUNE({ numero, clienteId, clienteNit, total, fecha }) {
  const base = [
    numero,
    clienteId,
    clienteNit || '',
    Number(total || 0).toFixed(2),
    fecha ? new Date(fecha).toISOString() : new Date().toISOString(),
  ].join('|');

  return crypto.createHash('sha256').update(base, 'utf8').digest('hex').toUpperCase();
}

module.exports = { generarCUNE };
