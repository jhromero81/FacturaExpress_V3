/**
 * middleware/auth.js
 * Middleware de autenticacion mediante tokens JWT.
 * Protege las rutas de la API: acepta el token en la cookie
 * httpOnly "token" (usada por el frontend) o en el encabezado
 * "Authorization: Bearer <token>" (usado por clientes externos).
 *
 * Ademas de la firma del token se revalida contra la base de datos que
 * la cuenta siga existiendo, activa y con el mismo rol. El rol NO se
 * toma del token: un administrador degradado conservaba el rol 'admin'
 * durante toda la vigencia del token (hasta 8 h).
 */

const { verifyToken } = require('../config/jwt');
const { pool } = require('../config/db');

/**
 * Cache temporal del estado de la cuenta por usuario. Sin este guard, un
 * usuario desactivado por el admin seguiria usando un token vigente hasta
 * su expiracion (hasta 8h). Con TTL corto (60s) el bloqueo surte efecto
 * casi de inmediato sin agregar una consulta SQL en cada peticion.
 */
const CACHE_USUARIO_TTL_MS = 60 * 1000;
const CACHE_USUARIO_MAX = 1000;
// userId -> { existe, activo, rol, expira }
const usuarioCache = new Map();

/**
 * Devuelve el estado en cache o null si no existe o expiro.
 * @param {number} userId - Identificador del usuario.
 * @returns {{existe: boolean, activo: boolean, rol: string|null}|null}
 */
function leerUsuarioCache(userId) {
  const registro = usuarioCache.get(userId);
  if (registro && registro.expira > Date.now()) {
    return registro;
  }
  return null;
}

/**
 * Almacena el estado de un usuario con control de crecimiento del cache
 * (limpieza perezosa antes de descartar todo el cache).
 * @param {number} userId
 * @param {{existe: boolean, activo: boolean, rol: string|null}} estado
 */
function escribirUsuarioCache(userId, estado) {
  if (usuarioCache.size >= CACHE_USUARIO_MAX) {
    const ahora = Date.now();
    for (const [k, v] of usuarioCache) {
      if (v.expira <= ahora) usuarioCache.delete(k);
    }
    if (usuarioCache.size >= CACHE_USUARIO_MAX) usuarioCache.clear();
  }
  usuarioCache.set(userId, { ...estado, expira: Date.now() + CACHE_USUARIO_TTL_MS });
}

/**
 * Invalida el estado cacheado de un usuario. Se llama desde el modulo de
 * administracion al cambiar el rol, activar/desactivar o eliminar una
 * cuenta para que el cambio surta efecto de inmediato en lugar de
 * esperar al TTL.
 * @param {number|string} userId - Identificador del usuario.
 */
function invalidarCacheUsuario(userId) {
  usuarioCache.delete(Number(userId));
}

/**
 * Extrae el token JWT de la peticion.
 * Prioriza el encabezado Authorization y usa la cookie httpOnly
 * como respaldo (mecanismo principal del frontend).
 * @param {object} req - Objeto de peticion de Express.
 * @returns {string|null} Token JWT o null si no existe.
 */
function getToken(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return req.cookies?.token || null;
}

/**
 * Middleware de autenticacion.
 * Verifica la presencia y validez del token JWT en la peticion,
 * que no haya sido revocado (logout) consultando la tabla
 * tokens_revocados mediante su identificador unico (jti) y que la
 * cuenta siga existiendo, activa y con su rol vigente.
 * Si es valido, adjunta el usuario autenticado en req.usuario.
 * @param {object} req - Objeto de peticion de Express.
 * @param {object} res - Objeto de respuesta de Express.
 * @param {function} next - Funcion que continua al siguiente middleware.
 */
async function authenticate(req, res, next) {
  const token = getToken(req);

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Acceso no autorizado: se requiere un token de autenticacion.',
    });
  }

  try {
    // Verificar firma y vigencia del token
    const payload = verifyToken(token);

    // Verificar si el token fue revocado (cerrado sesion) por su jti
    if (payload.jti) {
      const [rows] = await pool.query(
        'SELECT 1 FROM tokens_revocados WHERE jti = ? LIMIT 1',
        [payload.jti]
      );
      if (rows.length > 0) {
        return res.status(401).json({
          success: false,
          message: 'Token invalido o expirado.',
        });
      }
    }

    // Revalidar la cuenta contra la base de datos (existencia, estado
    // activo y rol vigente), con cache de 60s para no penalizar la
    // latencia de cada peticion.
    if (!payload.id) {
      return res.status(401).json({
        success: false,
        message: 'Token invalido o expirado.',
      });
    }

    let estado = leerUsuarioCache(payload.id);
    if (estado === null) {
      try {
        const [filas] = await pool.query(
          'SELECT activo, rol FROM usuarios WHERE id = ?',
          [payload.id]
        );
        estado = filas.length > 0
          ? { existe: true, activo: Boolean(filas[0].activo), rol: filas[0].rol }
          : { existe: false, activo: false, rol: null };
      } catch (error) {
        // Ante una falla de conexion no bloquear sesiones criptograficamente
        // validas, pero dejar constancia para poder diagnosticarlo.
        console.warn(
          `[auth] No fue posible revalidar la cuenta ${payload.id}: ${error.message}. ` +
            'Se continua con la identidad del token.'
        );
        estado = { existe: true, activo: true, rol: payload.rol };
      }
      escribirUsuarioCache(payload.id, estado);
    }

    if (!estado.existe) {
      return res.status(401).json({
        success: false,
        message: 'La cuenta ya no existe. Inicie sesion de nuevo.',
      });
    }
    if (!estado.activo) {
      // 401 y no 403: la sesion dejo de ser valida, de modo que el
      // cliente limpia el estado local y vuelve al login (con 403 el
      // usuario quedaba "atrapado" con una sesion que fallaba siempre).
      return res.status(401).json({
        success: false,
        message: 'El usuario se encuentra inactivo o fue eliminado.',
      });
    }

    // Adjuntar la identidad del usuario a la peticion. El rol procede de
    // la base de datos, no del token.
    req.usuario = { id: payload.id, nit: payload.nit, rol: estado.rol };
    // Datos del token crudo para acciones como la revocacion en logout
    req.tokenPayload = payload;
    return next();
  } catch {
    return res.status(401).json({
      success: false,
      message: 'Token invalido o expirado.',
    });
  }
}

/**
 * Middleware de autorizacion por rol.
 * Restringe el acceso a un endpoint segun el perfil del usuario.
 * @param {string[]} roles - Lista de roles permitidos.
 * @returns {function} Middleware de Express.
 */
function authorize(...roles) {
  return (req, res, next) => {
    const { rol } = req.usuario || {};
    if (!rol || !roles.includes(rol)) {
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado: el rol del usuario no tiene permisos.',
      });
    }
    return next();
  };
}

module.exports = { authenticate, authorize, invalidarCacheUsuario };
