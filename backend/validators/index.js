/**
 * validators/index.js
 * Reglas de validacion de entrada por modulo usando express-validator.
 * Garantizan que los datos que llegan a los controladores tengan el
 * tipo, formato y rango esperado antes de tocar la base de datos.
 */

const { body, param } = require('express-validator');

// ============================================================
// Autenticacion
// ============================================================

/** Reglas para POST /api/auth/login */
const loginValidator = [
  body('nit').trim().notEmpty().withMessage('El NIT es obligatorio.'),
  body('password').notEmpty().withMessage('La contrasena es obligatoria.'),
];

// ============================================================
// Clientes
// ============================================================

const clienteBaseValidator = [
  body('identificacion')
    .trim()
    .notEmpty()
    .withMessage('La identificacion es obligatoria.')
    .isLength({ max: 20 })
    .withMessage('La identificacion no puede superar 20 caracteres.'),
  body('nombre')
    .trim()
    .notEmpty()
    .withMessage('El nombre es obligatorio.')
    .isLength({ max: 120 })
    .withMessage('El nombre no puede superar 120 caracteres.'),
  body('email')
    .optional({ values: 'falsy' })
    .isEmail()
    .withMessage('El correo no es valido.')
    .isLength({ max: 150 })
    .withMessage('El correo no puede superar 150 caracteres.'),
  body('telefono')
    .optional({ values: 'falsy' })
    .isLength({ max: 20 })
    .withMessage('El telefono no puede superar 20 caracteres.'),
];

const idValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('El id debe ser un numero entero positivo.')
    .toInt(),
];

// Reglas para PUT /api/clientes/:id (actualizacion parcial).
// Todos los campos son opcionales; solo se validan si llegan.
const clienteUpdateValidator = [
  body('identificacion')
    .optional({ values: 'falsy' })
    .isLength({ max: 20 })
    .withMessage('La identificacion no puede superar 20 caracteres.'),
  body('nombre')
    .optional({ values: 'falsy' })
    .isLength({ max: 120 })
    .withMessage('El nombre no puede superar 120 caracteres.'),
  body('email')
    .optional({ values: 'falsy' })
    .isEmail()
    .withMessage('El correo no es valido.')
    .isLength({ max: 150 })
    .withMessage('El correo no puede superar 150 caracteres.'),
  body('telefono')
    .optional({ values: 'falsy' })
    .isLength({ max: 20 })
    .withMessage('El telefono no puede superar 20 caracteres.'),
];

// ============================================================
// Productos
// ============================================================

const productoBaseValidator = [
  body('codigo')
    .trim()
    .notEmpty()
    .withMessage('El codigo es obligatorio.')
    .isLength({ max: 20 })
    .withMessage('El codigo no puede superar 20 caracteres.'),
  body('nombre')
    .trim()
    .notEmpty()
    .withMessage('El nombre es obligatorio.')
    .isLength({ max: 120 })
    .withMessage('El nombre no puede superar 120 caracteres.'),
  body('precio')
    .isFloat({ min: 0 })
    .withMessage('El precio debe ser un numero mayor o igual a 0.')
    .toFloat(),
  body('iva')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0, max: 1 })
    .withMessage('El IVA debe ser un valor entre 0 y 1 (ej: 0.19).')
    .toFloat(),
  body('stock')
    .optional({ values: 'falsy' })
    .isInt({ min: 0 })
    .withMessage('El stock debe ser un entero mayor o igual a 0.')
    .toInt(),
];

const ajusteStockValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('El id debe ser un numero entero positivo.')
    .toInt(),
  body('cantidad')
    .isInt({ min: -99999, max: 99999 })
    .withMessage('La cantidad debe ser un entero (positivo suma, negativo resta).')
    .toInt(),
];

// Reglas para PUT /api/productos/:id (actualizacion parcial).
// Todos los campos son opcionales; solo se validan si llegan.
const productoUpdateValidator = [
  body('codigo')
    .optional({ values: 'falsy' })
    .isLength({ max: 20 })
    .withMessage('El codigo no puede superar 20 caracteres.'),
  body('nombre')
    .optional({ values: 'falsy' })
    .isLength({ max: 120 })
    .withMessage('El nombre no puede superar 120 caracteres.'),
  body('precio')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0 })
    .withMessage('El precio debe ser un numero mayor o igual a 0.')
    .toFloat(),
  body('iva')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0, max: 1 })
    .withMessage('El IVA debe ser un valor entre 0 y 1 (ej: 0.19).')
    .toFloat(),
  body('stock')
    .optional({ values: 'falsy' })
    .isInt({ min: 0 })
    .withMessage('El stock debe ser un entero mayor o igual a 0.')
    .toInt(),
];

// ============================================================
// Facturas / ventas
// ============================================================

const createFacturaValidator = [
  body('clienteId')
    .isInt({ min: 1 })
    .withMessage('El clienteId es obligatorio y debe ser un entero positivo.')
    .toInt(),
  body('items')
    .isArray({ min: 1 })
    .withMessage('Debe incluir al menos un item en la factura.'),
  body('items.*.productoId')
    .isInt({ min: 1 })
    .withMessage('Cada item debe tener un productoId entero positivo.')
    .toInt(),
  body('items.*.cantidad')
    .isInt({ min: 1 })
    .withMessage('Cada item debe tener una cantidad entera mayor a 0.')
    .toInt(),
  body('descuento')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0 })
    .withMessage('El descuento debe ser un numero mayor o igual a 0.')
    .toFloat(),
];

const updateEstadoFacturaValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('El id debe ser un numero entero positivo.')
    .toInt(),
  body('estado')
    .notEmpty()
    .withMessage('El estado es obligatorio.')
    .isIn(['pendiente', 'enviado', 'enviada', 'procesando', 'rechazado', 'anulada'])
    .withMessage('El estado no es un valor DIAN valido.'),
];

// ============================================================
// Usuarios (solo admin)
// ============================================================

const crearUsuarioValidator = [
  body('nit')
    .trim()
    .notEmpty()
    .withMessage('El NIT es obligatorio.')
    .isLength({ max: 20 })
    .withMessage('El NIT no puede superar 20 caracteres.'),
  body('nombre')
    .trim()
    .notEmpty()
    .withMessage('El nombre es obligatorio.')
    .isLength({ max: 120 })
    .withMessage('El nombre no puede superar 120 caracteres.'),
  body('email')
    .optional({ values: 'falsy' })
    .isEmail()
    .withMessage('El correo no es valido.'),
  body('rol')
    .optional({ values: 'falsy' })
    .isIn(['admin', 'vendedor', 'contador'])
    .withMessage('El rol debe ser admin, vendedor o contador.'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('La contrasena debe tener al menos 6 caracteres.'),
];

const actualizarUsuarioValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('El id debe ser un numero entero positivo.')
    .toInt(),
  body('nit')
    .optional({ values: 'falsy' })
    .isLength({ max: 20 })
    .withMessage('El NIT no puede superar 20 caracteres.'),
  body('nombre')
    .optional({ values: 'falsy' })
    .isLength({ max: 120 })
    .withMessage('El nombre no puede superar 120 caracteres.'),
  body('email')
    .optional({ values: 'falsy' })
    .isEmail()
    .withMessage('El correo no es valido.'),
  body('rol')
    .optional({ values: 'falsy' })
    .isIn(['admin', 'vendedor', 'contador'])
    .withMessage('El rol debe ser admin, vendedor o contador.'),
];

const toggleActivoValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('El id debe ser un numero entero positivo.')
    .toInt(),
  body('activo')
    .isBoolean()
    .withMessage('El campo activo debe ser true o false.'),
];

module.exports = {
  loginValidator,
  clienteBaseValidator,
  clienteUpdateValidator,
  idValidator,
  productoBaseValidator,
  productoUpdateValidator,
  ajusteStockValidator,
  createFacturaValidator,
  updateEstadoFacturaValidator,
  crearUsuarioValidator,
  actualizarUsuarioValidator,
  toggleActivoValidator,
};
