/**
 * test/login.test.js
 * Pruebas del controlador de autenticacion.
 *
 * Cubren los controles que antes fallaban:
 *  - El bloqueo temporal de la cuenta debe impedir el acceso incluso con
 *    la contrasena correcta (la comparacion de fechas se hacia en
 *    JavaScript contra un DATETIME interpretado como UTC y el bloqueo no
 *    surtia efecto).
 *  - El contador de intentos fallidos se incrementa y se reinicia.
 *  - El token NO viaja en el cuerpo salvo que el cliente lo pida con
 *    X-Token-Response: true.
 *  - Las cuentas inexistentes o inactivas responden igual que unas
 *    credenciales invalidas (no se enumeran usuarios).
 */

'use strict';

const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

/** Contrasena valida usada en las pruebas (hash de coste bajo, solo fixture) */
const PASSWORD_VALIDA = 'ClaveCorrecta123';
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD_VALIDA, 4);

/** Estado del escenario en curso */
let escenario = {};

/** Sentencias de escritura ejecutadas durante la prueba */
let escrituras = [];

/**
 * Simula la respuesta de mysql2 a las sentencias del login.
 * @param {string} sqlCrudo - Sentencia ejecutada.
 * @param {Array} params - Parametros.
 * @returns {Array} Respuesta estilo mysql2.
 */
function responder(sqlCrudo, params = []) {
  const sql = String(sqlCrudo).replace(/\s+/g, ' ').trim();

  if (sql.startsWith('SELECT id, nit, nombre')) {
    return [escenario.usuario ? [escenario.usuario] : []];
  }
  if (sql.startsWith('UPDATE usuarios')) {
    escrituras.push({ sql, params });
    return [{ affectedRows: 1 }];
  }
  if (sql.includes('INSERT IGNORE INTO tokens_revocados')) {
    escrituras.push({ sql, params });
    return [{ affectedRows: 1 }];
  }
  return [[]];
}

// El doble se inyecta ANTES de cargar el controlador.
const dbPath = require.resolve('../config/db');
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    pool: { query: async (sql, params) => responder(sql, params) },
    testConnection: async () => {},
  },
};

const { login } = require('../controllers/auth.controller');

/**
 * Construye un objeto de respuesta simulado.
 * @returns {object} Respuesta con status/json/cookie capturados.
 */
function respuestaSimulada() {
  return {
    statusCode: null,
    cuerpo: null,
    cookieFijada: null,
    status(codigo) {
      this.statusCode = codigo;
      return this;
    },
    json(payload) {
      this.cuerpo = payload;
      return this;
    },
    cookie(nombre, valor) {
      this.cookieFijada = { nombre, valor };
      return this;
    },
  };
}

/**
 * Ejecuta el controlador de login.
 * @param {object} body - Cuerpo de la peticion.
 * @param {object} [headers] - Encabezados de la peticion.
 * @returns {Promise<{res: object, error: Error|null}>} Resultado.
 */
async function ejecutarLogin(body, headers = {}) {
  const req = { body, headers, cookies: {} };
  const res = respuestaSimulada();
  let error = null;

  await login(req, res, (e) => {
    error = e;
  });

  return { res, error };
}

/** Reinicia el escenario con los valores indicados. */
function prepararUsuario(opciones = {}) {
  escrituras = [];
  escenario = {
    usuario: {
      id: 1,
      nit: '900.123.456-7',
      nombre: 'Admin',
      email: 'admin@facturaexpress.co',
      telefono: null,
      rol: 'admin',
      password_hash: PASSWORD_HASH,
      activo: 1,
      intentos_fallidos: 0,
      bloqueado: 0,
      ...opciones,
    },
  };
}

before(() => {
  prepararUsuario();
});

// ============================================================
// Exito
// ============================================================
test('el login correcto fija la cookie y no expone el token en el cuerpo', async () => {
  prepararUsuario();
  const { res, error } = await ejecutarLogin({
    nit: '900.123.456-7',
    password: PASSWORD_VALIDA,
  });

  assert.equal(error, null);
  assert.equal(res.cuerpo.success, true);
  assert.equal(res.cuerpo.usuario.rol, 'admin');
  assert.equal('token' in res.cuerpo, false, 'el token no debe viajar en el cuerpo');
  assert.equal(res.cookieFijada.nombre, 'token');
  assert.ok(res.cookieFijada.valor.length > 20);
});

test('el login devuelve el token solo si el cliente lo solicita', async () => {
  prepararUsuario();
  const { res } = await ejecutarLogin(
    { nit: '900.123.456-7', password: PASSWORD_VALIDA },
    { 'x-token-response': 'true' }
  );

  assert.equal(typeof res.cuerpo.token, 'string');
  assert.ok(res.cuerpo.token.length > 20);
});

test('el login correcto reinicia el contador de intentos fallidos', async () => {
  prepararUsuario({ intentos_fallidos: 3 });
  const { res } = await ejecutarLogin({ nit: '900.123.456-7', password: PASSWORD_VALIDA });

  assert.equal(res.cuerpo.success, true);
  const limpieza = escrituras.find((e) => e.sql.includes('intentos_fallidos = 0'));
  assert.ok(limpieza, 'debe reiniciar el contador tras un login correcto');
});

// ============================================================
// Bloqueo temporal
// ============================================================
test('una cuenta bloqueada no puede iniciar sesion ni con la clave correcta', async () => {
  prepararUsuario({ bloqueado: 1 });
  const { res, error } = await ejecutarLogin({ nit: '900.123.456-7', password: PASSWORD_VALIDA });

  assert.ok(error, 'debe rechazar el acceso');
  assert.equal(error.statusCode, 423);
  assert.match(error.message, /bloqueada temporalmente/i);
  assert.equal(res.cookieFijada, null, 'no debe fijar cookie de sesion');
});

test('el bloqueo se calcula en SQL y no con la fecha del proceso', async () => {
  prepararUsuario({ bloqueado: 1 });
  const sentencias = [];
  const dbStub = require('../config/db');
  const original = dbStub.pool.query;
  dbStub.pool.query = async (sql, params) => {
    sentencias.push(String(sql));
    return responder(sql, params);
  };

  try {
    await ejecutarLogin({ nit: '900.123.456-7', password: PASSWORD_VALIDA });
  } finally {
    dbStub.pool.query = original;
  }

  const consulta = sentencias.find((s) => s.includes('FROM usuarios'));
  assert.match(
    consulta,
    /bloqueado_hasta > NOW\(\)/,
    'el bloqueo debe compararse dentro de MySQL para evitar el desfase de zona horaria'
  );
});

// ============================================================
// Intentos fallidos
// ============================================================
test('los intentos fallidos se acumulan y bloquean la cuenta al llegar al tope', async () => {
  for (let intento = 1; intento <= 4; intento += 1) {
    prepararUsuario({ intentos_fallidos: intento - 1 });
    const { error } = await ejecutarLogin({ nit: '900.123.456-7', password: 'ClaveIncorrecta999' });

    assert.ok(error, `el intento ${intento} debe fallar`);
    assert.equal(error.statusCode, 401);
    assert.equal(error.message, 'Credenciales incorrectas.');
    const incremento = escrituras.find((e) => e.sql.includes('SET intentos_fallidos = ?'));
    assert.ok(incremento, `el intento ${intento} debe registrarse`);
    assert.equal(incremento.params[0], intento);
  }

  // Quinto intento fallido: se fija el bloqueo temporal
  prepararUsuario({ intentos_fallidos: 4 });
  const { error } = await ejecutarLogin({ nit: '900.123.456-7', password: 'ClaveIncorrecta999' });

  assert.ok(error);
  assert.equal(error.statusCode, 401);
  const bloqueo = escrituras.find((e) => e.sql.includes('bloqueado_hasta = DATE_ADD'));
  assert.ok(bloqueo, 'el quinto fallo debe fijar bloqueado_hasta');
  assert.equal(bloqueo.params[1], 1);
});

// ============================================================
// No enumeracion de usuarios
// ============================================================
test('un NIT inexistente responde igual que una contrasena incorrecta', async () => {
  escenario = { usuario: null };
  escrituras = [];
  const { res, error } = await ejecutarLogin({ nit: '1.111.111-1', password: 'LoQueSea123' });

  assert.ok(error);
  assert.equal(error.statusCode, 401);
  assert.equal(error.message, 'Credenciales incorrectas.');
  assert.equal(res.cookieFijada, null);
});

test('una cuenta inactiva responde igual que unas credenciales invalidas', async () => {
  prepararUsuario({ activo: 0 });
  const { res, error } = await ejecutarLogin({ nit: '900.123.456-7', password: PASSWORD_VALIDA });

  assert.ok(error);
  assert.equal(error.statusCode, 401);
  assert.equal(error.message, 'Credenciales incorrectas.');
  assert.equal(res.cookieFijada, null);
});

test('el login exige NIT y contrasena', async () => {
  prepararUsuario();
  const { error } = await ejecutarLogin({ nit: '', password: '' });

  assert.ok(error);
  assert.equal(error.statusCode, 400);
});

test('una contrasena no textual responde 401 y no 500', async () => {
  // bcrypt.compare lanza una excepcion si recibe un numero: el controlador
  // debe convertir el valor a texto antes de comparar.
  prepararUsuario();
  const { error } = await ejecutarLogin({ nit: '900.123.456-7', password: 12345678 });

  assert.ok(error);
  assert.equal(error.statusCode, 401);
  assert.equal(error.message, 'Credenciales incorrectas.');
});
