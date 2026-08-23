/**
 * test/jwt.test.js
 * Pruebas unitarias de las utilidades de JWT (config/jwt.js):
 * generacion, verificacion, rechazo de tokens invalidos/expirados
 * y conversion de duraciones a milisegundos.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const { generateToken, verifyToken, COOKIE_MAX_AGE_MS } = require('../config/jwt');

// Mismo secreto por defecto/entorno que usa config/jwt.js
const SECRET = process.env.JWT_SECRET || 'facturaexpress_secret_secreto';

const PAYLOAD = { id: 1, nit: '900.123.456-7', rol: 'admin' };

test('generateToken produce un token JWT valido', () => {
  const token = generateToken(PAYLOAD);
  assert.equal(typeof token, 'string');
  assert.ok(token.split('.').length === 3);
});

test('verifyToken recupera el payload del token', () => {
  const token = generateToken(PAYLOAD);
  const decoded = verifyToken(token);
  assert.equal(decoded.id, 1);
  assert.equal(decoded.nit, '900.123.456-7');
  assert.equal(decoded.rol, 'admin');
});

test('verifyToken rechaza un token manipulado', () => {
  const token = generateToken(PAYLOAD);
  const tampered = token.slice(0, -2) + (token.endsWith('ab') ? 'cd' : 'xx');
  assert.throws(() => verifyToken(tampered));
});

test('verifyToken rechaza un token firmado con otra clave', () => {
  const token = jwt.sign(PAYLOAD, 'otra_clave_diferente');
  assert.throws(() => verifyToken(token));
});

test('verifyToken rechaza un token expirado', () => {
  const expirado = jwt.sign(PAYLOAD, SECRET, { expiresIn: '-1h' });
  assert.throws(() => verifyToken(expirado));
});

test('verifyToken rechaza un token firmado con otro algoritmo', () => {
  const token = jwt.sign(PAYLOAD, 'otra_clave', { algorithm: 'HS512' });
  assert.throws(() => verifyToken(token));
});

test('COOKIE_MAX_AGE_MS es un entero positivo', () => {
  assert.equal(Number.isInteger(COOKIE_MAX_AGE_MS), true);
  assert.ok(COOKIE_MAX_AGE_MS > 0);
});
