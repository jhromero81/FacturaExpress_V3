/**
 * test/validate.test.js
 * Pruebas unitarias del middleware de validacion centralizado
 * (middleware/validate.js): responde 400 con la lista de errores
 * cuando la peticion no cumple las reglas y continua cuando es valida.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { validate } = require('../middleware/validate');
const { loginValidator } = require('../validators');

/** Crea una respuesta Express falsa que captura status/json. */
function makeRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
}

/** Ejecuta las reglas del validador contra un req (valores por defecto). */
async function runRules(rules, body = {}) {
  const req = { body, query: {}, params: {} };
  for (const rule of rules) {
    await rule(req, {}, () => {});
  }
  return req;
}

test('validate responde 400 con los campos invalidos', async () => {
  const req = await runRules(loginValidator, { nit: '', password: '' });
  const res = makeRes();
  let nextCalled = false;

  validate(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.ok(Array.isArray(res.body.errors));
  assert.ok(res.body.errors.length >= 2);
  const campos = res.body.errors.map((e) => e.campo);
  assert.ok(campos.includes('nit'));
  assert.ok(campos.includes('password'));
  assert.equal(nextCalled, false);
});

test('validate continua al siguiente middleware cuando la peticion es valida', async () => {
  const req = await runRules(loginValidator, { nit: '900.123.456-7', password: 'admin123' });
  const res = makeRes();
  let nextCalled = false;

  validate(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});
