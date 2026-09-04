/**
 * utils/helpers.js
 * Funciones auxiliares de logica de negocio de FacturaExpress:
 * generacion de numeros de factura, calculo de IVA, validaciones
 * de entrada y limpieza de objetos de respuesta.
 */

const { pool } = require('../config/db');

/** Tasa de IVA configurable (19% en Colombia) */
const IVA_RATE = 0.19;

/**
 * Calcula el IVA de un valor base redondeado a enteros.
 * @param {number} base - Valor base sin IVA.
 * @returns {number} Monto de IVA calculado.
 */
function calcularIVA(base) {
  return Math.round(base * IVA_RATE);
}

/** Nombre del advisory lock usado para serializar la numeracion. */
const LOCK_NUMERACION = 'facturaexpress_secuencia_facturas';

/** Prefijo del numero de factura del mes actual (FAC-YYYYMM-). */
function prefijoFacturaMes() {
  const ahora = new Date();
  const year = ahora.getFullYear();
  const month = String(ahora.getMonth() + 1).padStart(2, '0');
  return `FAC-${year}${month}-`;
}

/**
 * Obtiene el advisory lock de numeracion sobre una conexion concreta.
 * El lock se mantiene hasta hacer RELEASE_LOCK() o cerrar la conexion,
 * por lo que puede abarcar toda una transaccion (getConnection).
 * @param {object} connection - Conexion de mysql2 sobre la que se ejecuta.
 * @returns {Promise<boolean>} true si el lock fue adquirido.
 */
async function adquirirLockNumeracion(connection) {
  const [rows] = await connection.query('SELECT GET_LOCK(?, 10) AS ok', [LOCK_NUMERACION]);
  return Boolean(rows && rows[0] && Number(rows[0].ok) === 1);
}

/**
 * Libera el advisory lock de numeracion. Nunca lanza errores para no
 * interrumpir la operacion principal (el lock se libera solo al cerrar
 * la conexion).
 * @param {object} connection - Conexion sobre la que se libera el lock.
 * @returns {Promise<void>}
 */
async function liberarLockNumeracion(connection) {
  try {
    await connection.query('SELECT RELEASE_LOCK(?)', [LOCK_NUMERACION]);
  } catch {
    /* el lock caduca con la conexion */
  }
}

/**
 * Calcula el siguiente numero de factura del mes actual sobre una
 * conexion concreta (debe ejecutarse bajo el lock de numeracion para
 * garantizar la exclusividad).
 * @param {object} connection - Conexion de mysql2.
 * @returns {Promise<string>} Numero generado.
 */
async function calcularSiguienteNumero(connection) {
  const prefix = prefijoFacturaMes();

  // Contar facturas emitidas en el mes actual
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS total
       FROM facturas
      WHERE numero LIKE ?`,
    [`${prefix}%`]
  );

  const secuencia = Number(rows[0].total) + 1;
  return `${prefix}${String(secuencia).padStart(5, '0')}`;
}

/**
 * Genera el numero secuencial de una factura con el formato
 * FAC-YYYYMM-XXXXX, donde XXXXX es la siguiente posicion de la
 * secuencia dentro del mes actual. Si no hay facturas en el mes,
 * la secuencia inicia en 1.
 *
 * Usa un advisory lock de MySQL para evitar que dos ventas concurrentes
 * generen el mismo numero. Cuando se pasa una conexion de transaccion
 * (controllers), la numeracion queda protegida hasta el commit.
 *
 * @param {object} [connection=pool] - Conexion sobre la que contar y bloquear.
 * @returns {Promise<string>} Numero de factura generado.
 */
async function generateInvoiceNumber(connection = pool) {
  const ok = await adquirirLockNumeracion(connection);
  if (!ok) {
    throw new Error('No fue posible obtener el bloqueo de numeracion de facturas.');
  }
  try {
    return await calcularSiguienteNumero(connection);
  } finally {
    await liberarLockNumeracion(connection);
  }
}

/**
 * Lee y acota un parametro de paginacion (pagina o limite) recibido por
 * query string. Evita valores NaN, negativos o desbordados que volverian
 * inestable una consulta (LIMIT/OFFSET invalido => error 500) o que un
 * cliente pidiera resultados ilimitados.
 * @param {string|number} valor - Valor crudo del query string.
 * @param {number} minimo - Valor minimo aceptado (incluido).
 * @param {number} maximo - Valor maximo aceptado (incluido).
 * @param {number} defecto - Valor usado cuando no es numerico.
 * @returns {number} Entero acotado.
 */
function clampInt(valor, minimo, maximo, defecto) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return defecto;
  return Math.min(Math.max(Math.trunc(numero), minimo), maximo);
}

/**
 * Verifica que un valor sea un entero positivo.
 * @param {*} value - Valor a comprobar.
 * @returns {boolean} true si es un entero mayor que cero.
 */
function isValidPositiveInt(value) {
  return Number.isInteger(Number(value)) && Number(value) > 0;
}

/**
 * Verifica que un campo obligatorio de tipo texto este presente.
 * @param {*} value - Valor a comprobar.
 * @returns {boolean} true si el campo tiene contenido.
 */
function isRequiredString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Convierte una fila numerica de MySQL a la estructura que
 * consume el frontend (items de factura).
 * @param {object} row - Fila de la tabla factura_items.
 * @returns {object} Item normalizado.
 */
function mapItemRow(row) {
  return {
    id: row.producto_id,
    codigo: row.codigo,
    nombre: row.nombre,
    cantidad: row.cantidad,
    precioUnitario: Number(row.precio_unitario),
    iva: Number(row.iva),
    subtotal: Number(row.subtotal),
  };
}

/**
 * Normaliza una fila de la tabla facturas a la estructura JSON
 * que usa el frontend (p.ej. factura.cliente, factura.total).
 * @param {object} row - Fila de la tabla facturas.
 * @returns {object} Factura normalizada.
 */
function mapFacturaRow(row) {
  return {
    id: row.id,
    numero: row.numero,
    fecha: row.fecha instanceof Date ? row.fecha.toISOString() : row.fecha,
    cliente: {
      id: row.cliente_id,
      identificacion: row.cliente_identificacion,
      nombre: row.cliente_nombre,
    },
    subtotal: Number(row.subtotal),
    iva: Number(row.iva),
    descuento: Number(row.descuento),
    total: Number(row.total),
    estado: row.estado,
    cufe: row.cufe || null,
    firmaEstado: row.firma_estado || 'pendiente',
    intentosDian: Number(row.intentos_dian || 0),
    correoEnviado: Boolean(row.correo_enviado),
  };
}

/**
 * Normaliza una fila de la tabla clientes a la estructura JSON
 * del frontend (identificacion, nombre, email, telefono).
 * @param {object} row - Fila de la tabla clientes.
 * @returns {object} Cliente normalizado.
 */
function mapClienteRow(row) {
  return {
    id: row.id,
    identificacion: row.identificacion,
    nombre: row.nombre,
    email: row.email || '',
    telefono: row.telefono || '',
  };
}

/**
 * Normaliza una fila de la tabla productos a la estructura JSON
 * del frontend (codigo, nombre, precio, iva, stock).
 * @param {object} row - Fila de la tabla productos.
 * @returns {object} Producto normalizado.
 */
function mapProductoRow(row) {
  return {
    id: row.id,
    codigo: row.codigo,
    nombre: row.nombre,
    precio: Number(row.precio),
    iva: Number(row.iva),
    stock: row.stock,
  };
}

/**
 * Escapa caracteres especiales de un valor para incrustarlo de forma
 * segura en un documento XML (evita XML invalido por nombres o textos
 * que contengan &, <, >, " o ').
 * @param {*} value - Valor a escapar.
 * @returns {string} Texto seguro para XML.
 */
function escapeXML(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Escapa un valor para un archivo CSV (RFC 4180): se entrecomilla si
 * contiene comas, comillas dobles o saltos de linea, duplicando las
 * comillas internas.
 * @param {*} value - Valor a escapar.
 * @returns {string} Valor seguro para CSV.
 */
function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

module.exports = {
  IVA_RATE,
  calcularIVA,
  generateInvoiceNumber,
  adquirirLockNumeracion,
  liberarLockNumeracion,
  calcularSiguienteNumero,
  clampInt,
  isValidPositiveInt,
  isRequiredString,
  escapeXML,
  escapeCSV,
  mapItemRow,
  mapFacturaRow,
  mapClienteRow,
  mapProductoRow,
};
