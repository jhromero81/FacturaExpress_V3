/**
 * controllers/productos.controller.js
 * Controlador del modulo de productos.
 * Implementa el CRUD del catalogo de productos, incluyendo el
 * ajuste de stock disponible para la venta.
 */

const { pool } = require('../config/db');
const { asyncHandler, createHttpError } = require('../middleware/errorHandler');
const { isRequiredString, isValidPositiveInt, mapProductoRow } = require('../utils/helpers');

/** Tasa de IVA por defecto para nuevos productos */
const IVA_DEFAULT = 0.19;

/**
 * GET /api/productos
 * Lista los productos del catalogo.
 * Query params opcionales:
 *  - q: texto de busqueda por nombre o codigo.
 *  - pagina / limite: paginacion de resultados.
 */
const listProductos = asyncHandler(async (req, res) => {
  const { q = '', pagina = 1, limite = 50 } = req.query;
  const termino = `%${q.trim()}%`;

  const [rows] = await pool.query(
    `SELECT id, codigo, nombre, precio, iva, stock
       FROM productos
      WHERE activo = 1
        AND (nombre LIKE ? OR codigo LIKE ?)
      ORDER BY nombre ASC
      LIMIT ? OFFSET ?`,
    [termino, termino, Number(limite), (Number(pagina) - 1) * Number(limite)]
  );

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total
       FROM productos
      WHERE activo = 1
        AND (nombre LIKE ? OR codigo LIKE ?)`,
    [termino, termino]
  );

  const total = Number(countRows[0].total);

  res.json({
    success: true,
    total,
    totalPaginas: Math.ceil(total / Number(limite)),
    productos: rows.map(mapProductoRow),
  });
});

/**
 * GET /api/productos/:id
 * Devuelve un producto especifico por su identificador.
 */
const getProducto = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, codigo, nombre, precio, iva, stock FROM productos WHERE id = ? AND activo = 1',
    [req.params.id]
  );

  if (rows.length === 0) {
    throw createHttpError(404, 'Producto no encontrado.');
  }

  res.json({ success: true, producto: mapProductoRow(rows[0]) });
});

/**
 * POST /api/productos
 * Crea un nuevo producto en el catalogo.
 * Body: { codigo, nombre, precio, iva?, stock? }
 */
const createProducto = asyncHandler(async (req, res) => {
  const { codigo, nombre, precio, iva, stock } = req.body || {};

  // Validaciones de campos obligatorios
  if (!isRequiredString(codigo)) {
    throw createHttpError(400, 'El codigo del producto es obligatorio.');
  }
  if (!isRequiredString(nombre)) {
    throw createHttpError(400, 'El nombre del producto es obligatorio.');
  }
  if (!Number.isFinite(Number(precio)) || Number(precio) < 0) {
    throw createHttpError(400, 'El precio debe ser un valor numerico mayor o igual a cero.');
  }

  // Evitar duplicados por codigo
  const [existentes] = await pool.query(
    'SELECT id FROM productos WHERE codigo = ?',
    [codigo.trim()]
  );
  if (existentes.length > 0) {
    throw createHttpError(409, 'Ya existe un producto con ese codigo.');
  }

  const [result] = await pool.query(
    `INSERT INTO productos (codigo, nombre, precio, iva, stock)
     VALUES (?, ?, ?, ?, ?)`,
    [
      codigo.trim(),
      nombre.trim(),
      Number(precio),
      Number(iva ?? IVA_DEFAULT),
      Number.isInteger(Number(stock)) && Number(stock) >= 0 ? Number(stock) : 0,
    ]
  );

  const [rows] = await pool.query(
    'SELECT id, codigo, nombre, precio, iva, stock FROM productos WHERE id = ?',
    [result.insertId]
  );

  res.status(201).json({
    success: true,
    message: 'Producto registrado correctamente.',
    producto: mapProductoRow(rows[0]),
  });
});

/**
 * PUT /api/productos/:id
 * Actualiza los datos de un producto existente.
 * Body: { codigo?, nombre?, precio?, iva?, stock? }
 */
const updateProducto = asyncHandler(async (req, res) => {
  const { codigo, nombre, precio, iva, stock } = req.body || {};

  const [actual] = await pool.query(
    'SELECT id FROM productos WHERE id = ? AND activo = 1',
    [req.params.id]
  );
  if (actual.length === 0) {
    throw createHttpError(404, 'Producto no encontrado.');
  }

  // Si se envia un nuevo codigo, validar duplicado
  if (codigo && codigo.trim()) {
    const [duplicados] = await pool.query(
      'SELECT id FROM productos WHERE codigo = ? AND id <> ?',
      [codigo.trim(), req.params.id]
    );
    if (duplicados.length > 0) {
      throw createHttpError(409, 'Ya existe un producto con ese codigo.');
    }
  }

  await pool.query(
    `UPDATE productos
        SET codigo = COALESCE(?, codigo),
            nombre = COALESCE(?, nombre),
            precio = COALESCE(?, precio),
            iva    = COALESCE(?, iva),
            stock  = COALESCE(?, stock)
      WHERE id = ?`,
    [
      codigo?.trim() || null,
      nombre?.trim() || null,
      precio !== undefined ? Number(precio) : null,
      iva !== undefined ? Number(iva) : null,
      stock !== undefined ? Number(stock) : null,
      req.params.id,
    ]
  );

  const [rows] = await pool.query(
    'SELECT id, codigo, nombre, precio, iva, stock FROM productos WHERE id = ?',
    [req.params.id]
  );

  res.json({
    success: true,
    message: 'Producto actualizado correctamente.',
    producto: mapProductoRow(rows[0]),
  });
});

/**
 * PATCH /api/productos/:id/stock
 * Ajusta el stock de un producto sumando (o restando) unidades.
 * Body: { cantidad: numero }  (positivo suma, negativo resta)
 */
const adjustStock = asyncHandler(async (req, res) => {
  const { cantidad } = req.body || {};

  if (!Number.isInteger(Number(cantidad)) || Number(cantidad) === 0) {
    throw createHttpError(400, 'La cantidad debe ser un entero distinto de cero.');
  }

  const [result] = await pool.query(
    'UPDATE productos SET stock = stock + ? WHERE id = ? AND activo = 1',
    [Number(cantidad), req.params.id]
  );

  if (result.affectedRows === 0) {
    throw createHttpError(404, 'Producto no encontrado.');
  }

  const [rows] = await pool.query(
    'SELECT id, codigo, nombre, precio, iva, stock FROM productos WHERE id = ?',
    [req.params.id]
  );

  res.json({
    success: true,
    message: 'Stock actualizado correctamente.',
    producto: mapProductoRow(rows[0]),
  });
});

/**
 * DELETE /api/productos/:id
 * Elimina logicamente un producto (marca activo = 0) para
 * conservar la integridad de los items de facturas historicas.
 */
const deleteProducto = asyncHandler(async (req, res) => {
  const [result] = await pool.query(
    'UPDATE productos SET activo = 0 WHERE id = ? AND activo = 1',
    [req.params.id]
  );

  if (result.affectedRows === 0) {
    throw createHttpError(404, 'Producto no encontrado.');
  }

  res.json({ success: true, message: 'Producto eliminado correctamente.' });
});

module.exports = {
  listProductos,
  getProducto,
  createProducto,
  updateProducto,
  adjustStock,
  deleteProducto,
};
