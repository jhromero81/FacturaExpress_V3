/**
 * controllers/configuracion.controller.js
 * Controlador del modulo de configuracion del sistema.
 * Gestiona los datos de la empresa emisora y la configuracion
 * fiscal (DIAN). La tabla empresa mantiene un unico registro
 * (id = 1) que se inicializa con el seed.
 */

const { pool } = require('../config/db');
const { asyncHandler, createHttpError } = require('../middleware/errorHandler');
const { isRequiredString } = require('../utils/helpers');

/**
 * GET /api/configuracion
 * Devuelve la configuracion de la empresa y su estado fiscal.
 */
const getConfiguracion = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT nit, razon_social, email_facturacion, telefono,
            resolucion_dian, fecha_expiracion_cert, ultima_sync
       FROM empresa WHERE id = 1`
  );

  if (rows.length === 0) {
    throw createHttpError(404, 'Configuracion no encontrada. Ejecute el seed de datos.');
  }

  const e = rows[0];
  res.json({
    success: true,
    configuracion: {
      empresa: {
        nit: e.nit,
        razonSocial: e.razon_social,
        emailFacturacion: e.email_facturacion,
        telefono: e.telefono,
      },
      fiscal: {
        resolucionDIAN: e.resolucion_dian,
        fechaExpiracionCert: e.fecha_expiracion_cert,
        ultimaSync: e.ultima_sync,
      },
    },
  });
});

/**
 * PUT /api/configuracion/empresa
 * Actualiza los datos basicos de la empresa.
 * Body: { nit?, razonSocial?, emailFacturacion?, telefono? }
 */
const updateEmpresa = asyncHandler(async (req, res) => {
  const { nit, razonSocial, emailFacturacion, telefono } = req.body || {};

  await pool.query(
    `UPDATE empresa
        SET nit               = COALESCE(?, nit),
            razon_social      = COALESCE(?, razon_social),
            email_facturacion = COALESCE(?, email_facturacion),
            telefono          = COALESCE(?, telefono)
      WHERE id = 1`,
    [
      nit?.trim() || null,
      razonSocial?.trim() || null,
      emailFacturacion?.trim() || null,
      telefono?.trim() || null,
    ]
  );

  const [rows] = await pool.query(
    'SELECT nit, razon_social, email_facturacion, telefono FROM empresa WHERE id = 1'
  );
  const e = rows[0];

  res.json({
    success: true,
    message: 'Datos de la empresa actualizados.',
    empresa: {
      nit: e.nit,
      razonSocial: e.razon_social,
      emailFacturacion: e.email_facturacion,
      telefono: e.telefono,
    },
  });
});

/**
 * PUT /api/configuracion/fiscal
 * Actualiza la configuracion fiscal (resolucion DIAN y vigencia).
 * Body: { resolucionDIAN?, fechaExpiracionCert? }
 */
const updateFiscal = asyncHandler(async (req, res) => {
  const { resolucionDIAN, fechaExpiracionCert } = req.body || {};

  await pool.query(
    `UPDATE empresa
        SET resolucion_dian       = COALESCE(?, resolucion_dian),
            fecha_expiracion_cert = COALESCE(?, fecha_expiracion_cert)
      WHERE id = 1`,
    [resolucionDIAN?.trim() || null, fechaExpiracionCert || null]
  );

  const [rows] = await pool.query(
    'SELECT resolucion_dian, fecha_expiracion_cert FROM empresa WHERE id = 1'
  );
  const e = rows[0];

  res.json({
    success: true,
    message: 'Configuracion fiscal actualizada.',
    fiscal: {
      resolucionDIAN: e.resolucion_dian,
      fechaExpiracionCert: e.fecha_expiracion_cert,
    },
  });
});

/**
 * POST /api/configuracion/dian/sync
 * Simula una sincronizacion con la DIAN actualizando la fecha
 * de la ultima sincronizacion.
 */
const syncDIAN = asyncHandler(async (req, res) => {
  await pool.query(
    'UPDATE empresa SET ultima_sync = NOW() WHERE id = 1'
  );

  const [rows] = await pool.query(
    'SELECT ultima_sync FROM empresa WHERE id = 1'
  );

  res.json({
    success: true,
    message: 'Sincronizacion con DIAN completada.',
    fiscal: { ultimaSync: rows[0].ultima_sync },
  });
});

module.exports = {
  getConfiguracion,
  updateEmpresa,
  updateFiscal,
  syncDIAN,
};
