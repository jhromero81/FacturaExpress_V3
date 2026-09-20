/**
 * test/authorize.test.js
 * Pruebas del middleware de autorizacion por rol y verificacion estatica
 * de la matriz de permisos declarada en las rutas del backend.
 *
 * Modelo de autorizacion vigente:
 *  - Los modulos administrativos (usuarios, errores, logs, backup) y la
 *    escritura de configuracion exigen el rol admin.
 *  - Los modulos de operacion (clientes, productos, facturas, reportes)
 *    exigen autenticacion y delegan el detalle del permiso a la logica
 *    del controlador.
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
    assert.doesNotMatch(
      contenido,
      /authorize\(/,
      `${archivo} no restringe por rol: la autorizacion se resuelve en el controlador`
    );
  }
});

test('el login es la unica ruta publica del modulo de autenticacion', () => {
  const contenido = leerRuta('auth.routes.js');
  assert.match(contenido, /router\.post\(\s*'\/login',\s*loginLimiter/);
  assert.match(contenido, /router\.get\(\s*'\/me',\s*authenticate/);
});
