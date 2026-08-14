/**
 * controllers/usuarios.controller.js
 * Controlador del modulo de administracion de usuarios (solo rol
 * admin). Implementa el CRUD completo de perfiles de acceso con
 * contrasenas encriptadas (bcrypt) y activacion/desactivacion.
 */

const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { asyncHandler, createHttpError } = require('../middleware/errorHandler');
const { isRequiredString } = require('../utils/helpers');
const { registrarAuditoria } = require('../utils/auditoria');

/** Roles permitidos del sistema */
const ROLES_VALIDOS = ['admin', 'vendedor', 'contador'];

/** Longitud minima de la contrasena */
const MIN_PASSWORD = 4;

/**
 * Normaliza una fila de usuarios a la estructura JSON del frontend.
 * @param {object} row - Fila de la tabla usuarios.
 * @returns {object} Usuario normalizado.
 */
function mapUsuarioRow(row) {
  return {
    id: row.id,
    nit: row.nit,
    nombre: row.nombre,
    email: row.email,
    telefono: row.telefono || '',
    rol: row.rol,
    activo: Boolean(row.activo),
    created_at: row.created_at,
  };
}

/**
 * GET /api/usuarios
 * Lista los usuarios del sistema con busqueda opcional.
 */
const listUsuarios = asyncHandler(async (req, res) => {
  const { q = '', rol = '' } = req.query;
  const condiciones = [];
  const parametros = [];

  if (q.trim()) {
    condiciones.push('(u.nombre LIKE ? OR u.nit LIKE ? OR u.email LIKE ?)');
    const termino = `%${q.trim()}%`;
    parametros.push(termino, termino, termino);
  }
  if (rol && ROLES_VALIDOS.includes(rol)) {
    condiciones.push('u.rol = ?');
    parametros.push(rol);
  }

  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT id, nit, nombre, email, telefono, rol, activo, created_at
       FROM usuarios u
       ${where}
      ORDER BY u.nombre ASC`,
    parametros
  );

  res.json({ success: true, usuarios: rows.map(mapUsuarioRow) });
});

/**
 * GET /api/usuarios/:id
 * Devuelve un usuario por su identificador.
 */
const getUsuario = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, nit, nombre, email, telefono, rol, activo, created_at FROM usuarios WHERE id = ?',
    [req.params.id]
  );
  if (rows.length === 0) {
    throw createHttpError(404, 'Usuario no encontrado.');
  }
  res.json({ success: true, usuario: mapUsuarioRow(rows[0]) });
});

/**
 * POST /api/usuarios
 * Crea un nuevo usuario. Body: { nit, nombre, email?, telefono?, rol?, password }.
 */
const createUsuario = asyncHandler(async (req, res) => {
  const { nit, nombre, email, telefono, rol, password } = req.body || {};

  if (!isRequiredString(nit)) {
    throw createHttpError(400, 'El NIT es obligatorio.');
  }
  if (!isRequiredString(nombre)) {
    throw createHttpError(400, 'El nombre es obligatorio.');
  }
  if (!password || password.length < MIN_PASSWORD) {
    throw createHttpError(400, `La contrasena debe tener al menos ${MIN_PASSWORD} caracteres.`);
  }

  // Evitar duplicados de NIT
  const [duplicados] = await pool.query(
    'SELECT id FROM usuarios WHERE nit = ?',
    [nit.trim()]
  );
  if (duplicados.length > 0) {
    throw createHttpError(409, 'Ya existe un usuario con ese NIT.');
  }

  const rolFinal = ROLES_VALIDOS.includes(rol) ? rol : 'vendedor';
  const passwordHash = await bcrypt.hash(password, 10);

  const [result] = await pool.query(
    `INSERT INTO usuarios (nit, nombre, email, telefono, rol, password_hash)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [nit.trim(), nombre.trim(), email?.trim() || null, telefono?.trim() || null, rolFinal, passwordHash]
  );

  await registrarAuditoria(req, `INSERT usuario id=${result.insertId} (${nit.trim()})`, 'usuarios', result.insertId);

  const [rows] = await pool.query(
    'SELECT id, nit, nombre, email, telefono, rol, activo, created_at FROM usuarios WHERE id = ?',
    [result.insertId]
  );

  res.status(201).json({
    success: true,
    message: 'Usuario creado correctamente.',
    usuario: mapUsuarioRow(rows[0]),
  });
});

/**
 * PUT /api/usuarios/:id
 * Actualiza los datos de un usuario (la contrasena es opcional).
 */
const updateUsuario = asyncHandler(async (req, res) => {
  const { nit, nombre, email, telefono, rol, password } = req.body || {};

  const [actual] = await pool.query(
    'SELECT id, nit, rol FROM usuarios WHERE id = ?',
    [req.params.id]
  );
  if (actual.length === 0) {
    throw createHttpError(404, 'Usuario no encontrado.');
  }

  if (nit && nit.trim()) {
    const [duplicados] = await pool.query(
      'SELECT id FROM usuarios WHERE nit = ? AND id <> ?',
      [nit.trim(), req.params.id]
    );
    if (duplicados.length > 0) {
      throw createHttpError(409, 'Ya existe un usuario con ese NIT.');
    }
  }

  let passwordSql = '';
  let passwordParam = null;
  if (password) {
    if (password.length < MIN_PASSWORD) {
      throw createHttpError(400, `La contrasena debe tener al menos ${MIN_PASSWORD} caracteres.`);
    }
    passwordSql = ', password_hash = ?';
    passwordParam = await bcrypt.hash(password, 10);
  }

  const rolFinal = rol && ROLES_VALIDOS.includes(rol) ? rol : actual[0].rol;

  await pool.query(
    `UPDATE usuarios
        SET nit    = COALESCE(?, nit),
            nombre = COALESCE(?, nombre),
            email  = COALESCE(?, email),
            telefono = COALESCE(?, telefono),
            rol    = ?
            ${passwordSql}
      WHERE id = ?`,
    [
      nit?.trim() || null,
      nombre?.trim() || null,
      email?.trim() || null,
      telefono?.trim() || null,
      rolFinal,
      ...(passwordParam !== null ? [passwordParam] : []),
      req.params.id,
    ]
  );

  await registrarAuditoria(req, `UPDATE usuario id=${req.params.id}`, 'usuarios', req.params.id);

  const [rows] = await pool.query(
    'SELECT id, nit, nombre, email, telefono, rol, activo, created_at FROM usuarios WHERE id = ?',
    [req.params.id]
  );

  res.json({
    success: true,
    message: 'Usuario actualizado correctamente.',
    usuario: mapUsuarioRow(rows[0]),
  });
});

/**
 * PATCH /api/usuarios/:id/activo
 * Activa o desactiva un usuario. Body: { activo: boolean }.
 */
const toggleActivo = asyncHandler(async (req, res) => {
  const { activo } = req.body || {};
  const activoFinal = Boolean(activo) ? 1 : 0;

  const [result] = await pool.query(
    'UPDATE usuarios SET activo = ? WHERE id = ?',
    [activoFinal, req.params.id]
  );
  if (result.affectedRows === 0) {
    throw createHttpError(404, 'Usuario no encontrado.');
  }

  await registrarAuditoria(req, `TOGGLE usuario id=${req.params.id} activo=${activoFinal}`, 'usuarios', req.params.id);

  const [rows] = await pool.query(
    'SELECT id, nit, nombre, email, telefono, rol, activo, created_at FROM usuarios WHERE id = ?',
    [req.params.id]
  );

  res.json({
    success: true,
    message: activoFinal ? 'Usuario activado.' : 'Usuario desactivado.',
    usuario: mapUsuarioRow(rows[0]),
  });
});

/**
 * DELETE /api/usuarios/:id
 * Elimina un usuario del sistema. No permite eliminar la propia
 * cuenta activa.
 */
const deleteUsuario = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);

  if (id === Number(req.usuario.id)) {
    throw createHttpError(400, 'No puede eliminar su propia cuenta.');
  }

  const [result] = await pool.query(
    'DELETE FROM usuarios WHERE id = ?',
    [id]
  );
  if (result.affectedRows === 0) {
    throw createHttpError(404, 'Usuario no encontrado.');
  }

  await registrarAuditoria(req, `DELETE usuario id=${id}`, 'usuarios', id);

  res.json({ success: true, message: 'Usuario eliminado correctamente.' });
});

module.exports = {
  listUsuarios,
  getUsuario,
  createUsuario,
  updateUsuario,
  toggleActivo,
  deleteUsuario,
};
