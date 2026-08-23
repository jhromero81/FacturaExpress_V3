/**
 * controllers/clientes.controller.js
 * Controlador del modulo de clientes.
 * Implementa el CRUD completo del directorio de clientes con
 * busqueda por texto, validacion de duplicados y manejo de
 * errores.
 */

const { pool } = require('../config/db');
const { asyncHandler, createHttpError } = require('../middleware/errorHandler');
const { isRequiredString, mapClienteRow } = require('../utils/helpers');

/**
 * GET /api/clientes
 * Lista los clientes del directorio.
 * Query params opcionales:
 *  - q: texto de busqueda por nombre, identificacion o email.
 *  - pagina / limite: paginacion de resultados.
 */
const listClientes = asyncHandler(async (req, res) => {
  const { q = '', pagina = 1, limite = 50 } = req.query;
  const termino = `%${q.trim()}%`;

  const [rows] = await pool.query(
    `SELECT id, identificacion, nombre, email, telefono
       FROM clientes
      WHERE activo = 1
        AND (nombre LIKE ? OR identificacion LIKE ? OR email LIKE ?)
      ORDER BY nombre ASC
      LIMIT ? OFFSET ?`,
    [termino, termino, termino, Number(limite), (Number(pagina) - 1) * Number(limite)]
  );

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total
       FROM clientes
      WHERE activo = 1
        AND (nombre LIKE ? OR identificacion LIKE ? OR email LIKE ?)`,
    [termino, termino, termino]
  );

  const total = Number(countRows[0].total);

  res.json({
    success: true,
    total,
    totalPaginas: Math.ceil(total / Number(limite)),
    clientes: rows.map(mapClienteRow),
  });
});

/**
 * GET /api/clientes/:id
 * Devuelve un cliente especifico por su identificador.
 */
const getCliente = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, identificacion, nombre, email, telefono FROM clientes WHERE id = ? AND activo = 1',
    [req.params.id]
  );

  if (rows.length === 0) {
    throw createHttpError(404, 'Cliente no encontrado.');
  }

  res.json({ success: true, cliente: mapClienteRow(rows[0]) });
});

/**
 * POST /api/clientes
 * Crea un nuevo cliente.
 * Body: { identificacion, nombre, email?, telefono? }
 */
const createCliente = asyncHandler(async (req, res) => {
  const { identificacion, nombre, email, telefono } = req.body || {};

  // Validar campos obligatorios
  if (!isRequiredString(identificacion)) {
    throw createHttpError(400, 'La identificacion es obligatoria.');
  }
  if (!isRequiredString(nombre)) {
    throw createHttpError(400, 'El nombre es obligatorio.');
  }

  // Evitar duplicados por identificacion
  const [existentes] = await pool.query(
    'SELECT id FROM clientes WHERE identificacion = ?',
    [identificacion.trim()]
  );
  if (existentes.length > 0) {
    throw createHttpError(409, 'Ya existe un cliente con esa identificacion.');
  }

  const [result] = await pool.query(
    `INSERT INTO clientes (identificacion, nombre, email, telefono)
     VALUES (?, ?, ?, ?)`,
    [identificacion.trim(), nombre.trim(), email?.trim() || null, telefono?.trim() || null]
  );

  // Recuperar el cliente recien creado para responderlo completo
  const [rows] = await pool.query(
    'SELECT id, identificacion, nombre, email, telefono FROM clientes WHERE id = ?',
    [result.insertId]
  );

  res.status(201).json({
    success: true,
    message: 'Cliente registrado correctamente.',
    cliente: mapClienteRow(rows[0]),
  });
});

/**
 * PUT /api/clientes/:id
 * Actualiza los datos de un cliente existente.
 * Body: { identificacion?, nombre?, email?, telefono? }
 */
const updateCliente = asyncHandler(async (req, res) => {
  const { identificacion, nombre, email, telefono } = req.body || {};

  // Verificar existencia del cliente
  const [actual] = await pool.query(
    'SELECT id FROM clientes WHERE id = ? AND activo = 1',
    [req.params.id]
  );
  if (actual.length === 0) {
    throw createHttpError(404, 'Cliente no encontrado.');
  }

  // Si se envia una nueva identificacion, validar duplicado
  if (identificacion && identificacion.trim()) {
    const [duplicados] = await pool.query(
      'SELECT id FROM clientes WHERE identificacion = ? AND id <> ?',
      [identificacion.trim(), req.params.id]
    );
    if (duplicados.length > 0) {
      throw createHttpError(409, 'Ya existe un cliente con esa identificacion.');
    }
  }

  await pool.query(
    `UPDATE clientes
        SET identificacion = COALESCE(?, identificacion),
            nombre         = COALESCE(?, nombre),
            email          = COALESCE(?, email),
            telefono       = COALESCE(?, telefono)
      WHERE id = ?`,
    [
      identificacion?.trim() || null,
      nombre?.trim() || null,
      email?.trim() || null,
      telefono?.trim() || null,
      req.params.id,
    ]
  );

  // Recuperar el cliente actualizado
  const [rows] = await pool.query(
    'SELECT id, identificacion, nombre, email, telefono FROM clientes WHERE id = ?',
    [req.params.id]
  );

  res.json({
    success: true,
    message: 'Cliente actualizado correctamente.',
    cliente: mapClienteRow(rows[0]),
  });
});

/**
 * DELETE /api/clientes/:id
 * Elimina logicamente un cliente (marca activo = 0) para
 * conservar la integridad de las facturas historicas.
 */
const deleteCliente = asyncHandler(async (req, res) => {
  const [result] = await pool.query(
    'UPDATE clientes SET activo = 0 WHERE id = ? AND activo = 1',
    [req.params.id]
  );

  if (result.affectedRows === 0) {
    throw createHttpError(404, 'Cliente no encontrado.');
  }

  res.json({ success: true, message: 'Cliente eliminado correctamente.' });
});

module.exports = {
  listClientes,
  getCliente,
  createCliente,
  updateCliente,
  deleteCliente,
};
