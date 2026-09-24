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

/** Intentos fallidos consecutivos antes de bloquear la cuenta */
const MAX_INTENTOS_LOGIN = 5;

/** Duracion del bloqueo temporal de la cuenta, en minutos */
const BLOQUEO_MINUTOS = 15;

/**
 * Hash de relleno con el que se compara cuando el NIT no existe. Sin el,
 * la respuesta para un usuario inexistente volvia mucho antes (no se
 * ejecutaba bcrypt) y ese diferencial de tiempo permitia enumerar cuentas.
 */
const HASH_SENUELO = bcrypt.hashSync('senuelo-para-igualar-tiempos', 10);

/**
 * Indica si el cliente pidio recibir el token en el cuerpo de la
 * respuesta. El frontend usa la cookie httpOnly y no lo necesita; los
 * clientes externos (Postman, pruebas de aceptacion) lo solicitan
 * explicitamente con el encabezado X-Token-Response: true.
 * @param {object} req - Objeto de peticion de Express.
 * @returns {boolean}
 */
function clientePideToken(req) {
  const valor = req.headers['x-token-response'];
  return String(valor || '').toLowerCase() === 'true';
}

/**
 * POST /api/auth/login
 * Inicia sesion validando NIT y contrasena contra la base de
 * datos. En caso de exito:
 *  - Establece una cookie httpOnly con el JWT (mecanismo del frontend,
 *    inmune a XSS porque el token no es legible por JavaScript).
 *  - Devuelve el token en el cuerpo SOLO si el cliente lo pide con el
 *    encabezado X-Token-Response: true.
 *
 * Body: { nit, password }
 */
const login = asyncHandler(async (req, res) => {
  const { nit, password } = req.body || {};

  // Validar que los campos obligatorios fueron enviados
  if (!nit || !password) {
    throw createHttpError(400, 'Debe enviar el NIT y la contrasena.');
  }

  // Buscar el usuario por su NIT. El estado de bloqueo se calcula en SQL
  // (bloqueado_hasta > NOW()) en lugar de compararlo en JavaScript: la
  // conexion interpreta los DATETIME como UTC y el reloj de MySQL puede
  // estar en otra zona, de modo que la comparacion en Node daba un
  // resultado incorrecto y la cuenta bloqueada podia iniciar sesion.
  const [rows] = await pool.query(
    `SELECT id, nit, nombre, email, telefono, rol, password_hash, activo,
            intentos_fallidos,
            (bloqueado_hasta IS NOT NULL AND bloqueado_hasta > NOW()) AS bloqueado
       FROM usuarios
      WHERE nit = ?`,
    [String(nit).trim()]
  );

  const usuario = rows[0] || null;

  // Cuenta bloqueada temporalmente por intentos fallidos
  if (usuario && Number(usuario.bloqueado) === 1) {
    throw createHttpError(
      423,
      `Cuenta bloqueada temporalmente por intentos fallidos. Intente de nuevo en ${BLOQUEO_MINUTOS} minutos.`
    );
  }

  // Comparar siempre (con un hash señuelo si el usuario no existe) para
  // no filtrar por tiempo de respuesta si la cuenta existe.
  // La contrasena se convierte a texto: bcrypt.compare lanza una excepcion
  // si recibe un numero, lo que devolvia 500 ante un cuerpo malformado.
  const passwordComparar = String(password);
  const hashComparar = usuario ? usuario.password_hash : HASH_SENUELO;
  const passwordValida = await bcrypt.compare(passwordComparar, hashComparar);

  // Mensaje unico para credenciales invalidas y cuentas inexistentes o
  // inactivas: evita enumerar usuarios validos.
  if (!usuario || !usuario.activo || !passwordValida) {
    if (usuario && passwordValida === false && usuario.activo) {
      // Registrar el intento fallido y bloquear la cuenta al llegar al tope
      const intentos = Number(usuario.intentos_fallidos || 0) + 1;
      if (intentos >= MAX_INTENTOS_LOGIN) {
        await pool.query(
          `UPDATE usuarios
              SET intentos_fallidos = 0,
                  bloqueado_hasta = DATE_ADD(NOW(), INTERVAL ? MINUTE)
            WHERE id = ?`,
          [BLOQUEO_MINUTOS, usuario.id]
        );
      } else {
        await pool.query('UPDATE usuarios SET intentos_fallidos = ? WHERE id = ?', [
          intentos,
          usuario.id,
        ]);
      }
    }
    throw createHttpError(401, 'Credenciales incorrectas.');
  }

  // Login correcto: reiniciar el contador de intentos fallidos
  if (Number(usuario.intentos_fallidos) > 0) {
    await pool.query(
      'UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?',
      [usuario.id]
    );
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

  const respuesta = {
    success: true,
    message: 'Inicio de sesion exitoso.',
    usuario: {
      id: usuario.id,
      nit: usuario.nit,
      nombre: usuario.nombre,
      email: usuario.email,
      telefono: usuario.telefono,
      rol: usuario.rol,
    },
  };

  // Solo se expone el token a quien lo solicita de forma explicita; el
  // token viaja en la cookie httpOnly y no debe quedar al alcance de
  // JavaScript en una aplicacion que no lo necesita.
  if (clientePideToken(req)) {
    respuesta.token = token;
  }

  res.json(respuesta);
});

/**
 * POST /api/auth/logout
 * Cierra la sesion invalidando la cookie httpOnly del cliente y
 * revocando el token JWT actual: su identificador unico (jti) se
 * registra en tokens_revocados hasta su fecha de expiracion, de
 * modo que reutilizarlo (cookie copiada o header Bearer) devuelve 401.
 *
 * La depuracion de tokens ya expirados no se hace aqui (es una escritura
 * global que un anonimo podia provocar en bucle); la ejecuta el servidor
 * al arrancar y cada hora.
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
    // INSERT IGNORE tolera logouts repetidos con el mismo token.
    await pool.query(
      `INSERT IGNORE INTO tokens_revocados (jti, expira_en)
       VALUES (?, FROM_UNIXTIME(?))`,
      [jti, exp]
    );
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
