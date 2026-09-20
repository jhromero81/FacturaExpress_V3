/**
 * test/authorize.test.js
 * Pruebas del middleware de autorizacion por rol y verificacion estatica
 * de la matriz de permisos declarada en las rutas del backend.
 *
 * Modelo de autorizacion vigente (matriz de permisos por rol):
 *  - Los modulos administrativos (usuarios, errores, logs, backup) y la
 *    escritura de configuracion exigen el rol admin.
 *  - Clientes: lectura para todos; alta/edicion admin y vendedor;
 *    eliminacion solo admin.
 *  - Productos: lectura para todos; escritura solo admin.
 *  - Facturas: consulta y descargas para todos; emision admin y vendedor;
 *    cambio de estado DIAN admin y contador; eliminacion solo admin.
 *  - Reportes: todos los roles autenticados.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { authorize } = require('../middleware/auth');

/** Respuesta simulada de Express */
function respuestaSimulada() {
  return {
    statusCode: null,
    cuerpo: null,
    status(codigo) {
      this.statusCode = codigo;
      return this;
    },
    json(payload) {
      this.cuerpo = payload;
      return this;
    },
  };
}

test('authorize permite el acceso cuando el rol esta en la lista', () => {
  const middleware = authorize('admin', 'vendedor');
  const req = { usuario: { rol: 'vendedor' } };
  const res = respuestaSimulada();
  let continuo = false;

  middleware(req, res, () => {
    continuo = true;
  });

  assert.equal(continuo, true);
  assert.equal(res.statusCode, null);
});

test('authorize devuelve 403 cuando el rol no esta permitido', () => {
  const middleware = authorize('admin');
  const req = { usuario: { rol: 'vendedor' } };
  const res = respuestaSimulada();
  let continuo = false;

  middleware(req, res, () => {
    continuo = true;
  });

  assert.equal(continuo, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.cuerpo.success, false);
});

test('authorize devuelve 403 cuando falta el usuario o el rol', () => {
  const escenarios = [{}, { usuario: {} }, { usuario: null }];

  for (const req of escenarios) {
    const res = respuestaSimulada();
    let continuo = false;
    authorize('admin')(req, res, () => {
      continuo = true;
    });
    assert.equal(continuo, false);
    assert.equal(res.statusCode, 403);
  }
});

/**
 * Lee el contenido de un archivo de rutas del backend.
 * @param {string} nombre - Nombre del archivo (ej: clientes.routes.js).
 * @returns {string} Contenido del archivo.
 */
function leerRuta(nombre) {
  return fs.readFileSync(path.join(__dirname, '..', 'routes', nombre), 'utf8');
}

test('los modulos administrativos exigen el rol admin', () => {
  const archivos = ['usuarios.routes.js', 'errores.routes.js', 'logs.routes.js', 'backup.routes.js'];

  for (const archivo of archivos) {
    const contenido = leerRuta(archivo);
    assert.match(contenido, /authorize\('admin'\)/, `${archivo} debe exigir el rol admin`);
  }
});

test('configuracion restringe la escritura al rol admin', () => {
  const contenido = leerRuta('configuracion.routes.js');
  assert.match(contenido, /router\.put\(\s*'\/empresa',\s*authorize\('admin'\)/);
  assert.match(contenido, /router\.put\(\s*'\/fiscal',\s*authorize\('admin'\)/);
  assert.match(contenido, /router\.post\(\s*'\/dian\/sync',\s*authorize\('admin'\)/);
});

test('los modulos de operacion exigen autenticacion en todas sus rutas', () => {
  const archivos = ['clientes.routes.js', 'productos.routes.js', 'facturas.routes.js', 'reportes.routes.js'];

  for (const archivo of archivos) {
    const contenido = leerRuta(archivo);
    assert.match(
      contenido,
      /router\.use\(authenticate/,
      `${archivo} debe exigir autenticacion en todas sus rutas`
    );
  }
});

/**
 * Verifica que una ruta concreta declare el rol exigido.
 * @param {string} archivo - Archivo de rutas.
 * @param {RegExp} patron - Patron de la declaracion de la ruta.
 * @param {string} mensaje - Mensaje de fallo.
 */
function exigirRol(archivo, patron, mensaje) {
  assert.match(leerRuta(archivo), patron, mensaje);
}

test('la matriz de permisos por rol coincide con la documentada', () => {
  // Clientes: lectura para todos, alta/edicion admin y vendedor,
  // eliminacion solo admin.
  exigirRol('clientes.routes.js', /router\.post\(\s*'\/',\s*authorize\('admin',\s*'vendedor'\)/, 'clientes: el alta debe permitir admin y vendedor');
  exigirRol('clientes.routes.js', /router\.put\(\s*'\/:id',\s*authorize\('admin',\s*'vendedor'\)/, 'clientes: la edicion debe permitir admin y vendedor');
  exigirRol('clientes.routes.js', /router\.delete\(\s*'\/:id',\s*authorize\('admin'\)/, 'clientes: la eliminacion debe ser solo del admin');

  // Productos: catalogo de lectura para todos; escritura solo admin.
  exigirRol('productos.routes.js', /router\.post\(\s*'\/',\s*authorize\('admin'\)/, 'productos: el alta debe ser solo del admin');
  exigirRol('productos.routes.js', /router\.put\(\s*'\/:id',\s*authorize\('admin'\)/, 'productos: la edicion debe ser solo del admin');
  exigirRol('productos.routes.js', /router\.patch\(\s*'\/:id\/stock',\s*authorize\('admin'\)/, 'productos: el ajuste de stock debe ser solo del admin');
  exigirRol('productos.routes.js', /router\.delete\(\s*'\/:id',\s*authorize\('admin'\)/, 'productos: la baja debe ser solo del admin');

  // Facturas: emision admin y vendedor; estado DIAN admin y contador;
  // eliminacion solo admin.
  exigirRol('facturas.routes.js', /router\.post\(\s*'\/',\s*authorize\('admin',\s*'vendedor'\)/, 'facturas: la emision debe permitir admin y vendedor');
  exigirRol('facturas.routes.js', /router\.put\(\s*'\/:id\/estado',\s*authorize\('admin',\s*'contador'\)/, 'facturas: el estado DIAN debe permitir admin y contador');
  exigirRol('facturas.routes.js', /router\.delete\(\s*'\/:id',\s*authorize\('admin'\)/, 'facturas: la eliminacion debe ser solo del admin');

  // Reportes: disponibles para todos los roles autenticados.
  assert.doesNotMatch(
    leerRuta('reportes.routes.js'),
    /authorize\(/,
    'reportes: no debe restringirse por rol'
  );
});

test('las rutas de facturas no permiten emitir ni cambiar estado a cualquier rol', () => {
  const contenido = leerRuta('facturas.routes.js');
  // Defensa contra la regresion: la emision y la eliminacion no pueden
  // quedar sin restriccion de rol.
  assert.doesNotMatch(
    contenido,
    /router\.post\(\s*'\/',\s*createFacturaValidator/,
    'facturas: la emision debe declarar authorize() antes de los validadores'
  );
  assert.doesNotMatch(
    contenido,
    /router\.delete\(\s*'\/:id',\s*idValidator/,
    'facturas: la eliminacion debe declarar authorize() antes de los validadores'
  );
});

test('el login es la unica ruta publica del modulo de autenticacion', () => {
  const contenido = leerRuta('auth.routes.js');
  assert.match(contenido, /router\.post\(\s*'\/login',\s*loginLimiter/);
  assert.match(contenido, /router\.get\(\s*'\/me',\s*authenticate/);
});
