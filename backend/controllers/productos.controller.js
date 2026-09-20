/**
 * controllers/productos.controller.js
 * Controlador del modulo de productos.
 * Implementa el CRUD del catalogo de productos, incluyendo el
 * ajuste de stock disponible para la venta.
 */

const { pool } = require('../config/db');
const { asyncHandler, createHttpError } = require('../middleware/errorHandler');
const { isRequiredString, isValidPositiveInt, mapProductoRow, clampInt, asString } = require('../utils/helpers');
const { registrarAuditoria } = require('../utils/auditoria');

/** Tasa de IVA por defecto para nuevos productos */
const IVA_DEFAULT = 0.19;

/**
 * Resuelve la tarifa de IVA enviada por el cliente.
 * Un campo vacio significa "usar la tarifa general"; un 0 explicito es
 * una tarifa valida (producto exento o excluido). Antes `Number('')`
 * convertia la cadena vacia en 0 y el producto quedaba creado con IVA 0%
 * sin que nadie lo hubiera pedido.
 * @param {*} valor - Valor recibido en el cuerpo.
 * @returns {number} Tarifa en tanto por uno.
 */
function resolverTarifaIva(valor) {
  if (valor === undefined || valor === null || valor === '') return IVA_DEFAULT;
  const numero = Number(valor);
  return Number.isFinite(numero) && numero >= 0 && numero <= 1 ? numero : IVA_DEFAULT;
}

/**
 * GET /api/productos
 * Lista los productos del catalogo.
 * Query params opcionales:
 *  - q: texto de busqueda por nombre o codigo.
 *  - pagina / limite: paginacion de resultados.
 */
const listProductos = asyncHandler(async (req, res) => {
  const q = asString(req.query.q);
  const { pagina = 1, limite = 50 } = req.query;
  const termino = `%${q.trim()}%`;
  const paginaEntera = clampInt(pagina, 1, 100000, 1);
  const limiteEntero = clampInt(limite, 1, 200, 50);

  const [rows] = await pool.query(
    `SELECT id, codigo, nombre, precio, iva, stock
       FROM productos
      WHERE activo = 1
        AND (nombre LIKE ? OR codigo LIKE ?)
      ORDER BY nombre ASC
      LIMIT ? OFFSET ?`,
    [termino, termino, limiteEntero, (paginaEntera - 1) * limiteEntero]
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
    totalPaginas: Math.ceil(total / limiteEntero),
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

  // Evitar duplicados por codigo. Si el producto existe pero fue dado de
  // baja (borrado logico), se reactiva con los datos nuevos: el codigo es
  // UNIQUE y de otro modo quedaba bloqueado para siempre.
  const [existentes] = await pool.query(
    'SELECT id, activo FROM productos WHERE codigo = ?',
    [codigo.trim()]
  );
  if (existentes.length > 0 && existentes[0].activo) {
    throw createHttpError(409, 'Ya existe un producto con ese codigo.');
  }

  const stockFinal = Number.isInteger(Number(stock)) && Number(stock) >= 0 ? Number(stock) : 0;
  const ivaFinal = resolverTarifaIva(iva);

  let productoId;
  if (existentes.length > 0) {
    productoId = existentes[0].id;
    await pool.query(
      `UPDATE productos
          SET nombre = ?, precio = ?, iva = ?, stock = ?, activo = 1
        WHERE id = ?`,
      [nombre.trim(), Number(precio), ivaFinal, stockFinal, productoId]
    );
  } else {
    const [result] = await pool.query(
      `INSERT INTO productos (codigo, nombre, precio, iva, stock)
       VALUES (?, ?, ?, ?, ?)`,
      [codigo.trim(), nombre.trim(), Number(precio), ivaFinal, stockFinal]
    );
    productoId = result.insertId;
  }

  const [rows] = await pool.query(
    'SELECT id, codigo, nombre, precio, iva, stock FROM productos WHERE id = ?',
    [productoId]
  );

  await registrarAuditoria(
    req,
    `${existentes.length > 0 ? 'REACTIVAR' : 'INSERT'} producto id=${productoId}`,
    'productos',
    productoId
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
      // Una tarifa vacia significa "no cambiar"; un 0 explicito es valido.
      iva !== undefined && iva !== null && iva !== '' ? resolverTarifaIva(iva) : null,
      stock !== undefined ? Number(stock) : null,
      req.params.id,
    ]
  );

  const [rows] = await pool.query(
    'SELECT id, codigo, nombre, precio, iva, stock FROM productos WHERE id = ?',
    [req.params.id]
  );

  await registrarAuditoria(req, `UPDATE producto id=${req.params.id}`, 'productos', req.params.id);

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

  const cantidadNum = Number(cantidad);

  const [result] = await pool.query(
    'UPDATE productos SET stock = stock + ? WHERE id = ? AND activo = 1 AND stock + ? >= 0',
    [cantidadNum, req.params.id, cantidadNum]
  );

  if (result.affectedRows === 0) {
    const [existe] = await pool.query(
      'SELECT id, stock FROM productos WHERE id = ? AND activo = 1',
      [req.params.id]
    );
    if (existe.length === 0) {
      throw createHttpError(404, 'Producto no encontrado.');
    }
    throw createHttpError(400, `Stock insuficiente: el producto solo tiene ${existe[0].stock} unidades.`);
  }

  const [rows] = await pool.query(
    'SELECT id, codigo, nombre, precio, iva, stock FROM productos WHERE id = ?',
    [req.params.id]
  );

  await registrarAuditoria(
    req,
    `AJUSTE stock producto id=${req.params.id} cantidad=${cantidadNum}`,
    'productos',
    req.params.id
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

  await registrarAuditoria(req, `DELETE producto id=${req.params.id}`, 'productos', req.params.id);

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
