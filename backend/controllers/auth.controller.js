/**
 * controllers/auth.controller.js
 * Controlador del modulo de autenticacion.
 * Expone la logica de inicio de sesion y consulta del usuario
 * actual autenticado mediante JWT.
 */

const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { generateToken, verifyToken, COOKIE_MAX_AGE_MS } = require('../config/jwt');
const { asyncHandler, createHttpError } = require('../middleware/errorHandler');

/** La cookie de sesion solo viaja por HTTPS en produccion */
const COOKIE_SECURE = process.env.NODE_ENV === 'production';

/**
 * POST /api/auth/login
 * Inicia sesion validando NIT y contrasena contra la base de
 * datos. En caso de exito:
 *  - Establece una cookie httpOnly con el JWT (mecanismo del frontend,
 *    inmune a XSS porque el token no es legible por JavaScript).
 *  - Devuelve el token en el cuerpo para clientes externos/Postman.
 *
 * Body: { nit, password }
 */
const login = asyncHandler(async (req, res) => {
  const { nit, password } = req.body || {};

  // Validar que los campos obligatorios fueron enviados
  if (!nit || !password) {
    throw createHttpError(400, 'Debe enviar el NIT y la contrasena.');
  }

  // Buscar el usuario por su NIT
  const [rows] = await pool.query(
    'SELECT id, nit, nombre, email, telefono, rol, password_hash, activo FROM usuarios WHERE nit = ?',
    [nit.trim()]
  );

  if (rows.length === 0) {
    throw createHttpError(401, 'Credenciales incorrectas.');
  }

  const usuario = rows[0];

  // Verificar que el usuario este activo
  if (!usuario.activo) {
    throw createHttpError(403, 'El usuario se encuentra inactivo.');
  }

  // Comparar la contrasena enviada con el hash almacenado
  const passwordValida = await bcrypt.compare(password, usuario.password_hash);
  if (!passwordValida) {
    throw createHttpError(401, 'Credenciales incorrectas.');
  }

  // Generar el token JWT con los datos de identidad
  const token = generateToken({
    id: usuario.id,
    nit: usuario.nit,
    rol: usuario.rol,
  });

  // Cookie httpOnly: el token no es accesible desde JavaScript (anti-XSS)
  res.cookie('token', token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE_MS,
    path: '/',
  });

  // Respuesta sin informacion sensible
  res.json({
    success: true,
    message: 'Inicio de sesion exitoso.',
    token,
    usuario: {
      id: usuario.id,
      nit: usuario.nit,
      nombre: usuario.nombre,
      email: usuario.email,
      telefono: usuario.telefono,
      rol: usuario.rol,
    },
  });
});

/**
 * POST /api/auth/logout
 * Cierra la sesion invalidando la cookie httpOnly del cliente y
 * revocando el token JWT actual: su identificador unico (jti) se
 * registra en tokens_revocados hasta su fecha de expiracion, de
 * modo que reutilizarlo (cookie copiada o header Bearer) devuelve 401.
 */
const logout = asyncHandler(async (req, res) => {
  // La ruta logout es publica: el token llega por cookie o Bearer y se
  // verifica de forma tolerante (no falla si esta ausente o vencido).
  const authHeader = req.headers.authorization || '';
  const tokenCrudo = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : req.cookies?.token;

  let payload = null;
  if (tokenCrudo) {
    try {
      payload = verifyToken(tokenCrudo);
    } catch {
      payload = null; // token invalido/vencido: nada que revocar
    }
  }

  const { jti, exp } = payload || {};

  if (jti && exp) {
    // Limpiar entradas ya expiradas y revocar el token actual.
    // INSERT IGNORE tolera logouts repetidos con el mismo token.
    await pool.query(
      `INSERT IGNORE INTO tokens_revocados (jti, expira_en)
       VALUES (?, FROM_UNIXTIME(?))`,
      [jti, exp]
    );
    await pool.query('DELETE FROM tokens_revocados WHERE expira_en < NOW()');
  }

  res.clearCookie('token', {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
  });
  res.json({ success: true, message: 'Sesion cerrada correctamente.' });
});

/**
 * GET /api/auth/me
 * Devuelve los datos del usuario autenticado con el token.
 * La identidad se obtiene del payload del JWT (req.usuario).
 */
const getMe = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, nit, nombre, email, telefono, rol, activo, created_at FROM usuarios WHERE id = ?',
    [req.usuario.id]
  );

  if (rows.length === 0) {
    throw createHttpError(404, 'Usuario no encontrado.');
  }

  const { password_hash, ...usuarioSeguro } = rows[0];
  res.json({ success: true, usuario: usuarioSeguro });
});

module.exports = { login, logout, getMe };
